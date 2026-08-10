import { queuePublicationReleaseBroadcast, runBroadcastMaintenanceWithLease } from './broadcast-runner';
import { authenticateMiniAppRequest, miniAppJson, miniAppJsonError } from './miniapp-auth';
import { escapeHtml, type TelegramClient, type TelegramMessage } from './telegram';

const MAX_BODY = 700;
const FILES_LINE = '📎 Files are in the comments.';

type PublicationRow = {
  id:number;
  status:string;
  internal_title:string;
  body_html:string;
  add_footer:number;
  add_donate:number;
  add_bot_comment:number;
  notify_users:number;
  image_key:string|null;
  image_mime:string|null;
  image_spoiler:number;
  channel_message_id:number|null;
  submission_id:number|null;
  requester_username_snapshot:string|null;
};

type Settings = {
  publish_channel_id:string;
  donation_url:string;
  bot_username:string;
};

type ChatInfo = { id:number; type:string; title?:string; username?:string; linked_chat_id?:number };
type ManagedBody = { body:string; requesterUsername:string|null };

/**
 * Telegram clients hide the native channel comment button when the channel post
 * itself has an inline keyboard. This handler deliberately sends channel posts
 * without reply_markup. CTA links live in the HTML footer; the discussion reply
 * may still use inline buttons because that no longer affects the channel post.
 */
export async function handlePublishingCommentsV3Request(
  request:Request,
  env:Env,
  telegram:TelegramClient,
  ctx:ExecutionContext,
):Promise<Response|null>{
  const url=new URL(request.url);
  const match=/^\/api\/app\/admin\/publications\/(\d+)\/(test|publish)$/.exec(url.pathname);
  if(request.method!=='POST'||!match)return null;

  const auth=await authenticateMiniAppRequest(request,env);
  if(auth instanceof Response)return auth;
  if(!auth.admin)return miniAppJsonError('forbidden','Admin access required.',403);

  const id=Number(match[1]);
  const action=match[2];
  const publication=await env.DB.prepare('SELECT * FROM publications WHERE id=?').bind(id).first<PublicationRow>();
  if(!publication)return miniAppJsonError('not_found','Publication not found.',404);

  const managed=await buildManagedBody(publication,env,telegram);
  if(managed.body.length>MAX_BODY){
    return miniAppJsonError(
      'publication_template_too_long',
      `С автоматическими строками текст занимает ${managed.body.length} / ${MAX_BODY} символов. Сократите основной текст.`,
      400,
    );
  }

  if(action==='test'){
    await writeLog(env,id,'info','test_started','Начата тестовая отправка без inline-кнопок под основным постом.');
    try{
      await sendPreview(publication,managed.body,env,telegram);
      await writeLog(env,id,'success','test_sent','Тестовая публикация отправлена. Основной пост не содержит inline keyboard.');
      return miniAppJson({ok:true});
    }catch(error){
      const message=friendly(error);
      await writeLog(env,id,'error','test_failed',message,String(error));
      return miniAppJsonError('test_failed',message,502);
    }
  }

  if(publication.status==='published')return miniAppJsonError('already_published','Пост уже опубликован.',409);
  const settings=await getSettings(env);
  if(!settings.publish_channel_id)return miniAppJsonError('channel_missing','Укажите канал публикации в Админ → Настройки.',409);

  let channel:ChatInfo;
  try{
    channel=await telegram.call<ChatInfo>('getChat',{chat_id:normalizeChatId(settings.publish_channel_id)});
  }catch(error){
    const message=`Не удалось открыть канал публикации: ${friendly(error)}`;
    await writeLog(env,id,'error','channel_invalid',message,String(error));
    return miniAppJsonError('channel_invalid',message,409);
  }
  if(channel.type!=='channel'){
    const message='В настройках публикации указан не Telegram-канал.';
    await writeLog(env,id,'error','channel_invalid',message,JSON.stringify(channel));
    return miniAppJsonError('channel_invalid',message,409);
  }

  const now=new Date().toISOString();
  const claimed=await env.DB.prepare(`
    UPDATE publications
    SET status='publishing',error_text=NULL,updated_at=?
    WHERE id=? AND status IN ('draft','failed')
  `).bind(now,id).run();
  if((claimed.meta.changes??0)===0){
    const current=await env.DB.prepare('SELECT status FROM publications WHERE id=?').bind(id).first<{status:string}>();
    if(current?.status==='published')return miniAppJsonError('already_published','Пост уже опубликован.',409);
    if(current?.status==='publishing')return miniAppJsonError('publish_in_progress','Публикация уже отправляется.',409);
    return miniAppJsonError('invalid_state','Публикацию нельзя отправить из текущего состояния.',409);
  }

  await writeLog(env,id,'info','publish_started','Начата публикация. Inline keyboard у основного channel post отключён, чтобы Telegram показал комментарии.');

  try{
    const text=composePost(managed.body,publication,settings);
    let sent:TelegramMessage;
    if(publication.image_key){
      const file=await r2File(env,publication.image_key,publication.image_mime||'image/jpeg','post.jpg');
      sent=await telegram.sendPhotoUpload(settings.publish_channel_id,file,text,{has_spoiler:publication.image_spoiler===1});
    }else{
      sent=await telegram.sendMessage(settings.publish_channel_id,text);
    }

    await env.DB.prepare(`UPDATE publications SET status='published',channel_message_id=?,published_at=?,updated_at=? WHERE id=?`)
      .bind(sent.message_id,now,now,id).run();
    await writeLog(env,id,'success','post_sent',`Пост опубликован без inline keyboard. Channel message ID: ${sent.message_id}.`);
    if(channel.linked_chat_id){
      await writeLog(env,id,'info','discussion_wait',`У канала есть linked discussion group ${channel.linked_chat_id}. Ожидаем автоматический форвард Telegram и появление комментариев.`);
    }else{
      await writeLog(env,id,'warning','discussion_unlinked','Telegram getChat не вернул linked_chat_id: нативные комментарии под этим постом не появятся.');
    }

    if(publication.notify_users){
      await queuePublicationReleaseBroadcast(env,id,publication.internal_title,managed.body);
      await writeLog(env,id,'success','broadcast_queued','Рассылка релиза поставлена в очередь с защитой от дублей.');
      ctx.waitUntil(runBroadcastMaintenanceWithLease(env,telegram,4));
    }

    return miniAppJson({ok:true,channel_message_id:sent.message_id,comments_expected:Boolean(channel.linked_chat_id)});
  }catch(error){
    const message=friendly(error);
    await env.DB.prepare("UPDATE publications SET status='failed',error_text=?,updated_at=? WHERE id=?")
      .bind(message,new Date().toISOString(),id).run();
    await writeLog(env,id,'error','publish_failed',message,String(error));
    return miniAppJsonError('publish_failed',message,502);
  }
}

async function buildManagedBody(p:PublicationRow,env:Env,telegram:TelegramClient):Promise<ManagedBody>{
  const raw=stripManagedTemplateLines(p.body_html);
  const count=await env.DB.prepare('SELECT COUNT(*) AS n FROM publication_assets WHERE publication_id=?')
    .bind(p.id).first<{n:number}>();
  const lines:string[]=[];
  if(Number(count?.n??0)>0)lines.push(FILES_LINE);

  let requesterUsername=cleanUsername(p.requester_username_snapshot);
  if(p.submission_id){
    const linked=await env.DB.prepare(`
      SELECT s.user_id,
             COALESCE(NULLIF(u.username,''),NULLIF(s.username_snapshot,''),NULLIF(?,'')) AS requester_username
      FROM submissions s
      LEFT JOIN users u ON u.telegram_id=s.user_id
      WHERE s.id=?
    `).bind(requesterUsername,p.submission_id).first<{user_id:number;requester_username:string|null}>();

    if(linked){
      requesterUsername=await resolveCurrentUsername(telegram,linked.user_id,linked.requester_username);
      if(requesterUsername){
        const stamp=new Date().toISOString();
        await env.DB.batch([
          env.DB.prepare('UPDATE publications SET requester_username_snapshot=?,updated_at=? WHERE id=?')
            .bind(requesterUsername,stamp,p.id),
          env.DB.prepare('UPDATE users SET username=?,updated_at=? WHERE telegram_id=?')
            .bind(requesterUsername,stamp,linked.user_id),
        ]).catch(()=>undefined);
      }
    }

    lines.push(requesterUsername
      ? `Requested by: @${requesterUsername}`
      : `Requested by: request #${p.submission_id}`);
  }

  return {
    body:[raw,lines.join('\n')].filter(Boolean).join('\n\n'),
    requesterUsername:requesterUsername||null,
  };
}

async function resolveCurrentUsername(telegram:TelegramClient,userId:number,fallback:string|null):Promise<string>{
  try{
    const chat=await telegram.call<{username?:string}>('getChat',{chat_id:userId});
    const current=cleanUsername(chat.username??null);
    if(current)return current;
  }catch{}
  return cleanUsername(fallback);
}

function stripManagedTemplateLines(value:string):string{
  return String(value||'')
    .split(/\r?\n/)
    .filter((line)=>{
      const text=line.trim();
      if(!text)return true;
      if(/^📎\s*(?:Файлы.*комментар|Files?.*comments?)/iu.test(text))return false;
      if(/^(?:Запрошено|Request|Requested(?:\s+by)?):\s*.+$/iu.test(text))return false;
      return true;
    })
    .join('\n')
    .replace(/\n{3,}/g,'\n\n')
    .trim();
}

async function sendPreview(p:PublicationRow,body:string,env:Env,telegram:TelegramClient):Promise<void>{
  const settings=await getSettings(env);
  const text=`<b>🧪 ТЕСТ ПУБЛИКАЦИИ</b>\n\n${composePost(body,p,settings)}\n\n<i>В реальном канале inline-кнопок под постом не будет — это сохраняет нативную кнопку комментариев.</i>`;
  if(p.image_key){
    const file=await r2File(env,p.image_key,p.image_mime||'image/jpeg','preview.jpg');
    await telegram.sendPhotoUpload(env.ADMIN_TELEGRAM_ID,file,text,{has_spoiler:p.image_spoiler===1});
  }else{
    await telegram.sendMessage(env.ADMIN_TELEGRAM_ID,text);
  }
}

function composePost(body:string,p:PublicationRow,s:Settings):string{
  const parts=[escapeHtml(body.trim())];
  const botUrl=`https://t.me/${s.bot_username||'dollartlbot'}?start=submit`;
  if(p.add_footer){
    parts.push(`<b>Need a translation?</b>\nOpen <a href="${escapeHtml(botUrl)}">Dollar TL Bot</a> and suggest a novel for translation.`);
  }
  if(p.add_donate&&s.donation_url){
    parts.push(`<b>Support Dollar TL:</b> <a href="${escapeHtml(s.donation_url)}">Donate</a>`);
  }
  return parts.filter(Boolean).join('\n\n');
}

async function getSettings(env:Env):Promise<Settings>{
  const rows=await env.DB.prepare(`SELECT key,value FROM app_settings WHERE key IN ('publish_channel_id','donation_url','bot_username')`).all<{key:string;value:string}>();
  const map=Object.fromEntries(rows.results.map(x=>[x.key,x.value]));
  return {
    publish_channel_id:map.publish_channel_id||'',
    donation_url:map.donation_url||'https://boosty.to/domnekromanta/single-payment/donation/818248/target?share=target_link',
    bot_username:map.bot_username||'dollartlbot',
  };
}

async function r2File(env:Env,key:string,mime:string,name:string):Promise<File>{
  const object=await env.COVERS.get(key);
  if(!object)throw new Error(`R2 object missing: ${key}`);
  return new File([await object.arrayBuffer()],name,{type:mime});
}

async function writeLog(env:Env,publicationId:number,level:'info'|'success'|'warning'|'error',event:string,message:string,details?:string):Promise<void>{
  await env.DB.prepare(`INSERT INTO publication_logs (publication_id,level,event,message,details,created_at) VALUES (?,?,?,?,?,?)`)
    .bind(publicationId,level,event,message,details||null,new Date().toISOString()).run().catch(()=>undefined);
}

function cleanUsername(value:string|null|undefined):string{
  const raw=String(value||'').trim().replace(/^@/,'');
  return /^[A-Za-z0-9_]{5,32}$/.test(raw)?raw:'';
}

function normalizeChatId(value:string):number|string{
  const s=String(value||'').trim();
  if(/^-?\d+$/.test(s)){
    const n=Number(s);
    if(Number.isSafeInteger(n))return n;
  }
  return s;
}

function friendly(error:unknown):string{
  const raw=error instanceof Error?error.message:String(error);
  return raw.replace(/^Telegram\s+\w+\s+failed:\s*/i,'').trim()||'Неизвестная ошибка Telegram.';
}

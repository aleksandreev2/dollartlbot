import { authenticateMiniAppRequest, miniAppJson, miniAppJsonError } from './miniapp-auth';
import { queueReleaseBroadcast, runBroadcastMaintenance } from './notifications';
import { escapeHtml, type TelegramClient, type TelegramMessage } from './telegram';

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
};

type Settings = {
  publish_channel_id:string;
  donation_url:string;
  bot_username:string;
};

type ChatInfo = { id:number; type:string; title?:string; linked_chat_id?:number };

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

  if(action==='test'){
    await writeLog(env,id,'info','test_started','Начата тестовая отправка без inline-кнопок под основным постом.');
    try{
      await sendPreview(publication,env,telegram);
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

  await writeLog(env,id,'info','publish_started','Начата публикация. Inline keyboard у основного channel post отключён, чтобы Telegram показал комментарии.');
  const now=new Date().toISOString();
  await env.DB.prepare("UPDATE publications SET status='publishing',error_text=NULL,updated_at=? WHERE id=?").bind(now,id).run();

  try{
    const text=composePost(publication,settings);
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
      await queueReleaseBroadcast(env,id,publication.internal_title,publication.body_html);
      await writeLog(env,id,'success','broadcast_queued','Рассылка релиза поставлена в очередь.');
      ctx.waitUntil(runBroadcastMaintenance(env,telegram,4));
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

async function sendPreview(p:PublicationRow,env:Env,telegram:TelegramClient):Promise<void>{
  const settings=await getSettings(env);
  const text=`<b>🧪 ТЕСТ ПУБЛИКАЦИИ</b>\n\n${composePost(p,settings)}\n\n<i>В реальном канале inline-кнопок под постом не будет — это сохраняет нативную кнопку комментариев.</i>`;
  if(p.image_key){
    const file=await r2File(env,p.image_key,p.image_mime||'image/jpeg','preview.jpg');
    await telegram.sendPhotoUpload(env.ADMIN_TELEGRAM_ID,file,text,{has_spoiler:p.image_spoiler===1});
  }else{
    await telegram.sendMessage(env.ADMIN_TELEGRAM_ID,text);
  }
}

function composePost(p:PublicationRow,s:Settings):string{
  const parts=[escapeHtml(p.body_html.trim())];
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

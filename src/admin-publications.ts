import { authenticateMiniAppRequest, miniAppJson, miniAppJsonError } from './miniapp-auth';
import { handlePublishingCenterRequest } from './publishing-center';
import { escapeHtml, TelegramApiError, type TelegramClient } from './telegram';

const FILES_LINE='📎 Files are in the comments.';
type Publication={id:number;status:string;body_html:string;add_footer:number;add_donate:number;image_key:string|null;channel_message_id:number|null;telegram_deleted_at:string|null;submission_id:number|null;requester_username_snapshot:string|null};

export async function handleAdminPublicationsRequest(request:Request,env:Env,telegram:TelegramClient):Promise<Response|null>{
  const center=await handlePublishingCenterRequest(request,env,telegram);
  if(center)return center;
  const url=new URL(request.url);
  const match=/^\/api\/app\/admin\/publications\/(\d+)\/(edit|delete-telegram)$/.exec(url.pathname);
  if(request.method!=='POST'||!match)return null;
  const auth=await authenticateMiniAppRequest(request,env);
  if(auth instanceof Response)return auth;
  if(!auth.admin)return miniAppJsonError('forbidden','Admin access required.',403);
  const id=Number(match[1]),action=match[2];
  const p=await env.DB.prepare(`SELECT id,status,body_html,add_footer,add_donate,image_key,channel_message_id,telegram_deleted_at,submission_id,requester_username_snapshot FROM publications WHERE id=?`).bind(id).first<Publication>();
  if(!p)return miniAppJsonError('not_found','Публикация не найдена.',404);
  const channel=await setting(env,'publish_channel_id');
  if(!channel)return miniAppJsonError('channel_missing','Канал публикации не настроен.',409);

  if(action==='edit'){
    const body=await readJson<{body?:string}>(request);const text=stripManagedTemplateLines(String(body.body||'')).trim();
    if(!text||text.length>700)return miniAppJsonError('invalid_body','Основной текст должен содержать от 1 до 700 символов.',400);
    const updated={...p,body_html:text};
    const caption=await composeManaged(updated,env,telegram);
    if(p.image_key&&caption.length>1024)return miniAppJsonError('caption_too_long',`После автоматических строк Telegram caption занимает ${caption.length} / 1024 символов. Сократите основной текст.`,400);

    if(p.status==='published'&&p.channel_message_id&&!p.telegram_deleted_at){
      try{
        if(p.image_key){
          await telegram.call('editMessageCaption',{chat_id:normalizeChatId(channel),message_id:p.channel_message_id,caption,parse_mode:'HTML'});
        }else{
          await telegram.call('editMessageText',{chat_id:normalizeChatId(channel),message_id:p.channel_message_id,text:caption,parse_mode:'HTML',link_preview_options:{is_disabled:true}});
        }
      }catch(error){
        await log(env,id,'error','post_edit_failed','Telegram не обновил опубликованный пост; основной текст Dollar TL оставлен без изменений.',String(error));
        return miniAppJsonError('telegram_edit_failed','Telegram не обновил пост, поэтому сохранение отменено: '+friendly(error),502);
      }
    }

    const now=new Date().toISOString();
    const saved=await env.DB.prepare('UPDATE publications SET body_html=?,updated_at=? WHERE id=?').bind(text,now,id).run();
    if(Number(saved.meta.changes??0)!==1){
      await log(env,id,'error','post_edit_persist_failed','Telegram был обновлён, но Dollar TL не подтвердил сохранение текста в D1. Требуется проверка.');
      return miniAppJsonError('publication_persist_failed','Telegram обновлён, но Dollar TL не подтвердил запись в базе. Проверьте публикацию перед повторным действием.',500);
    }
    await audit(env,auth.telegramUser.id,'publication_edit',id,{length:text.length,managed_caption_length:caption.length});
    await log(env,id,'success','post_edited','Текст публикации обновлён с сохранением служебных строк Files/Requested by.');
    return miniAppJson({ok:true,body_html:text});
  }

  if(p.telegram_deleted_at)return miniAppJson({ok:true,already_deleted:true,telegram_deleted_at:p.telegram_deleted_at});
  if(!p.channel_message_id)return miniAppJsonError('not_published','У публикации нет Telegram message ID.',409);

  let reconciled=false;
  try{
    await telegram.call('deleteMessage',{chat_id:normalizeChatId(channel),message_id:p.channel_message_id});
  }catch(error){
    if(!telegramMessageAlreadyGone(error)){
      await log(env,id,'error','post_delete_failed','Telegram не смог удалить пост.',String(error));
      return miniAppJsonError('telegram_delete_failed',friendly(error),502);
    }
    reconciled=true;
    await log(env,id,'info','post_delete_reconciled','Пост уже отсутствовал в Telegram. Dollar TL пометил публикацию удалённой.',String(error));
  }

  const now=new Date().toISOString();
  await env.DB.prepare('UPDATE publications SET telegram_deleted_at=?,updated_at=? WHERE id=?').bind(now,now,id).run();
  await audit(env,auth.telegramUser.id,reconciled?'publication_reconcile_telegram_delete':'publication_delete_telegram',id,reconciled?{already_missing:true}:null);
  if(!reconciled)await log(env,id,'success','post_deleted','Пост удалён из Telegram. Запись и журнал сохранены в Dollar TL.');
  return miniAppJson({ok:true,telegram_deleted_at:now,already_missing:reconciled});
}

async function composeManaged(p:Publication,env:Env,telegram:TelegramClient):Promise<string>{
  const raw=stripManagedTemplateLines(p.body_html);
  const count=await env.DB.prepare('SELECT COUNT(*) AS n FROM publication_assets WHERE publication_id=?').bind(p.id).first<{n:number}>();
  const managed:string[]=[];
  if(Number(count?.n||0)>0)managed.push(FILES_LINE);
  let username=cleanUsername(p.requester_username_snapshot);
  if(p.submission_id){
    const linked=await env.DB.prepare(`SELECT s.user_id,COALESCE(NULLIF(u.username,''),NULLIF(s.username_snapshot,''),NULLIF(?,'')) requester_username FROM submissions s LEFT JOIN users u ON u.telegram_id=s.user_id WHERE s.id=?`)
      .bind(username,p.submission_id).first<{user_id:number;requester_username:string|null}>();
    if(linked){
      username=await resolveUsername(telegram,linked.user_id,linked.requester_username);
      if(username)await env.DB.prepare('UPDATE publications SET requester_username_snapshot=?,updated_at=? WHERE id=?').bind(username,new Date().toISOString(),p.id).run().catch(()=>undefined);
    }
    managed.push(username?`Requested by: @${username}`:`Requested by: request #${p.submission_id}`);
  }
  const body=[raw,managed.join('\n')].filter(Boolean).join('\n\n');
  const parts=[escapeHtml(body)];
  const bot=(await setting(env,'bot_username'))||'dollartlbot',botUrl=`https://t.me/${bot}?start=submit`;
  if(p.add_footer)parts.push(`<b>Need a translation?</b>\nOpen <a href="${escapeHtml(botUrl)}">Dollar TL Bot</a> and suggest a novel for translation.`);
  const donate=await setting(env,'donation_url');
  if(p.add_donate&&donate)parts.push(`<b>Support Dollar TL:</b> <a href="${escapeHtml(donate)}">Donate</a>`);
  return parts.filter(Boolean).join('\n\n');
}

function stripManagedTemplateLines(value:string):string{return String(value||'').split(/\r?\n/).filter(line=>{const text=line.trim();if(!text)return true;if(/^📎\s*(?:Файлы.*комментар|Files?.*comments?)/iu.test(text))return false;if(/^(?:Запрошено|Request|Requested(?:\s+by)?):\s*.+$/iu.test(text))return false;return true;}).join('\n').replace(/\n{3,}/g,'\n\n').trim();}
async function resolveUsername(telegram:TelegramClient,userId:number,fallback:string|null):Promise<string>{try{const chat=await telegram.call<{username?:string}>('getChat',{chat_id:userId});const live=cleanUsername(chat.username);if(live)return live;}catch{}return cleanUsername(fallback);}
function cleanUsername(value:string|null|undefined):string{const raw=String(value||'').trim().replace(/^@/,'');return /^[A-Za-z0-9_]{5,32}$/.test(raw)?raw:'';}
async function setting(env:Env,key:string){return (await env.DB.prepare('SELECT value FROM app_settings WHERE key=?').bind(key).first<{value:string}>())?.value?.trim()||'';}
async function log(env:Env,id:number,level:string,event:string,message:string,details?:string){await env.DB.prepare('INSERT INTO publication_logs (publication_id,level,event,message,details,created_at) VALUES (?,?,?,?,?,?)').bind(id,level,event,message,details?.slice(0,1500)||null,new Date().toISOString()).run().catch(()=>undefined);}
async function audit(env:Env,admin:number,action:string,id:number,details:unknown){await env.DB.prepare('INSERT INTO admin_audit_log (admin_user_id,action,target_type,target_id,details,created_at) VALUES (?,?,?,?,?,?)').bind(admin,action,'publication',String(id),details?JSON.stringify(details):null,new Date().toISOString()).run().catch(()=>undefined);}
function normalizeChatId(v:string):number|string{const s=v.trim();if(/^-?\d+$/.test(s)){const n=Number(s);if(Number.isSafeInteger(n))return n;}return s.startsWith('@')?s:`@${s}`;}
function telegramMessageAlreadyGone(error:unknown):boolean{if(!(error instanceof TelegramApiError)||error.code!==400)return false;const text=error.message.toLowerCase();return text.includes('message to delete not found')||text.includes('message not found');}
function friendly(error:unknown){return (error instanceof Error?error.message:String(error)).replace(/^Telegram\s+\w+\s+failed:\s*/i,'').trim()||'Неизвестная ошибка Telegram.';}
async function readJson<T>(r:Request):Promise<T>{try{return await r.json() as T;}catch{return{} as T;}}

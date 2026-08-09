import { authenticateMiniAppRequest, miniAppJson, miniAppJsonError } from './miniapp-auth';
import { escapeHtml, type TelegramClient } from './telegram';

type Publication={id:number;status:string;body_html:string;add_footer:number;add_donate:number;image_key:string|null;channel_message_id:number|null;telegram_deleted_at:string|null};

export async function handleAdminPublicationsRequest(request:Request,env:Env,telegram:TelegramClient):Promise<Response|null>{
  const url=new URL(request.url);
  const match=/^\/api\/app\/admin\/publications\/(\d+)\/(edit|delete-telegram)$/.exec(url.pathname);
  if(request.method!=='POST'||!match)return null;
  const auth=await authenticateMiniAppRequest(request,env);
  if(auth instanceof Response)return auth;
  if(!auth.admin)return miniAppJsonError('forbidden','Admin access required.',403);
  const id=Number(match[1]),action=match[2];
  const p=await env.DB.prepare(`SELECT id,status,body_html,add_footer,add_donate,image_key,channel_message_id,telegram_deleted_at FROM publications WHERE id=?`).bind(id).first<Publication>();
  if(!p)return miniAppJsonError('not_found','Публикация не найдена.',404);
  const channel=await setting(env,'publish_channel_id');
  if(!channel)return miniAppJsonError('channel_missing','Канал публикации не настроен.',409);

  if(action==='edit'){
    const body=await readJson<{body?:string}>(request);const text=String(body.body||'').trim();
    if(!text||text.length>700)return miniAppJsonError('invalid_body','Текст должен содержать от 1 до 700 символов.',400);
    const now=new Date().toISOString();
    await env.DB.prepare('UPDATE publications SET body_html=?,updated_at=? WHERE id=?').bind(text,now,id).run();
    if(p.status==='published'&&p.channel_message_id&&!p.telegram_deleted_at){
      const updated={...p,body_html:text};const caption=await compose(updated,env);
      try{
        if(p.image_key){
          await telegram.call('editMessageCaption',{chat_id:normalizeChatId(channel),message_id:p.channel_message_id,caption,parse_mode:'HTML'});
        }else{
          await telegram.call('editMessageText',{chat_id:normalizeChatId(channel),message_id:p.channel_message_id,text:caption,parse_mode:'HTML',link_preview_options:{is_disabled:true}});
        }
      }catch(error){
        await log(env,id,'error','post_edit_failed','Текст сохранён в Dollar TL, но Telegram не смог обновить опубликованный пост.',String(error));
        return miniAppJsonError('telegram_edit_failed','Текст сохранён, но Telegram не обновил пост: '+friendly(error),502);
      }
    }
    await audit(env,auth.telegramUser.id,'publication_edit',id,{length:text.length});
    await log(env,id,'success','post_edited','Текст публикации обновлён.');
    return miniAppJson({ok:true,body_html:text});
  }

  if(p.telegram_deleted_at)return miniAppJson({ok:true,already_deleted:true,telegram_deleted_at:p.telegram_deleted_at});
  if(!p.channel_message_id)return miniAppJsonError('not_published','У публикации нет Telegram message ID.',409);
  try{await telegram.call('deleteMessage',{chat_id:normalizeChatId(channel),message_id:p.channel_message_id});}
  catch(error){await log(env,id,'error','post_delete_failed','Telegram не смог удалить пост.',String(error));return miniAppJsonError('telegram_delete_failed',friendly(error),502);}
  const now=new Date().toISOString();
  await env.DB.prepare('UPDATE publications SET telegram_deleted_at=?,updated_at=? WHERE id=?').bind(now,now,id).run();
  await audit(env,auth.telegramUser.id,'publication_delete_telegram',id,null);
  await log(env,id,'success','post_deleted','Пост удалён из Telegram. Запись и журнал сохранены в Dollar TL.');
  return miniAppJson({ok:true,telegram_deleted_at:now});
}

async function compose(p:Publication,env:Env){const parts=[escapeHtml(p.body_html)];const bot=(await setting(env,'bot_username'))||'dollartlbot',botUrl=`https://t.me/${bot}?start=submit`;if(p.add_footer)parts.push(`<b>Need a translation?</b>\nOpen <a href="${escapeHtml(botUrl)}">Dollar TL Bot</a> and suggest a novel for translation.`);const donate=await setting(env,'donation_url');if(p.add_donate&&donate)parts.push(`<b>Support Dollar TL:</b> <a href="${escapeHtml(donate)}">Donate</a>`);return parts.join('\n\n');}
async function setting(env:Env,key:string){return (await env.DB.prepare('SELECT value FROM app_settings WHERE key=?').bind(key).first<{value:string}>())?.value?.trim()||'';}
async function log(env:Env,id:number,level:string,event:string,message:string,details?:string){await env.DB.prepare('INSERT INTO publication_logs (publication_id,level,event,message,details,created_at) VALUES (?,?,?,?,?,?)').bind(id,level,event,message,details?.slice(0,1500)||null,new Date().toISOString()).run().catch(()=>undefined);}
async function audit(env:Env,admin:number,action:string,id:number,details:unknown){await env.DB.prepare('INSERT INTO admin_audit_log (admin_user_id,action,target_type,target_id,details,created_at) VALUES (?,?,?,?,?,?)').bind(admin,action,'publication',String(id),details?JSON.stringify(details):null,new Date().toISOString()).run().catch(()=>undefined);}
function normalizeChatId(v:string):number|string{const s=v.trim();if(/^-?\d+$/.test(s)){const n=Number(s);if(Number.isSafeInteger(n))return n;}return s.startsWith('@')?s:`@${s}`;}
function friendly(error:unknown){return (error instanceof Error?error.message:String(error)).replace(/^Telegram\s+\w+\s+failed:\s*/i,'').trim()||'Неизвестная ошибка Telegram.';}
async function readJson<T>(r:Request):Promise<T>{try{return await r.json() as T;}catch{return{} as T;}}

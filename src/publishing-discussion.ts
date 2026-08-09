import { deliverPublicationPayload } from './publication-delivery';
import type { TelegramClient, TelegramMessage } from './telegram';

type Publication={id:number};
type ChatInfo={id:number;type:string;linked_chat_id?:number};

export async function handleLinkedPublicationDiscussion(message:TelegramMessage,env:Env,telegram:TelegramClient,ctx:ExecutionContext):Promise<boolean>{
  if(!message.is_automatic_forward||message.forward_origin?.type!=='channel')return false;
  const origin=message.forward_origin;
  const publication=await env.DB.prepare(`SELECT id FROM publications WHERE channel_message_id=? AND status='published' ORDER BY id DESC LIMIT 1`).bind(origin.message_id).first<Publication>();
  if(!publication)return false;

  const channelSetting=await setting(env,'publish_channel_id');
  if(!channelSetting)return false;
  let channel:ChatInfo;
  try{channel=await telegram.call<ChatInfo>('getChat',{chat_id:normalizeChatId(channelSetting)});}catch{return false;}
  if(!channel.linked_chat_id||Number(channel.linked_chat_id)!==Number(message.chat.id))return false;

  const now=new Date().toISOString();
  await env.DB.prepare(`UPDATE publications SET discussion_message_id=?,comments_check_status='pending',comments_checked_at=?,updated_at=? WHERE id=?`)
    .bind(message.message_id,now,now,publication.id).run();
  await addLog(env,publication.id,'success','discussion_linked',`Telegram создал ветку комментариев в связанной группе ${message.chat.id}.`);
  ctx.waitUntil(deliverPublicationPayload(publication.id,message.message_id,String(message.chat.id),env,telegram));
  return true;
}

async function setting(env:Env,key:string){return (await env.DB.prepare('SELECT value FROM app_settings WHERE key=?').bind(key).first<{value:string}>())?.value?.trim()||'';}
async function addLog(env:Env,id:number,level:string,event:string,message:string,details?:string){try{await env.DB.prepare('INSERT INTO publication_logs (publication_id,level,event,message,details,created_at) VALUES (?,?,?,?,?,?)').bind(id,level,event,message,details?.slice(0,1500)||null,new Date().toISOString()).run();}catch{}}
function normalizeChatId(v:string):number|string{const s=v.trim();if(/^-?\d+$/.test(s)){const n=Number(s);if(Number.isSafeInteger(n))return n;}return s.startsWith('@')?s:`@${s}`;}

import { escapeHtml, type TelegramClient, type TelegramMessage } from './telegram';

type Publication={id:number;add_bot_comment:number};
type Asset={id:number;file_name:string;mime_type:string|null;r2_key:string;telegram_file_id:string|null};
type ChatInfo={id:number;type:string;linked_chat_id?:number};

export async function handleLinkedPublicationDiscussion(message:TelegramMessage,env:Env,telegram:TelegramClient,ctx:ExecutionContext):Promise<boolean>{
  if(!message.is_automatic_forward||message.forward_origin?.type!=='channel')return false;
  const origin=message.forward_origin;
  const publication=await env.DB.prepare(`SELECT id,add_bot_comment FROM publications WHERE channel_message_id=? AND status='published' ORDER BY id DESC LIMIT 1`).bind(origin.message_id).first<Publication>();
  if(!publication)return false;

  const channelSetting=await setting(env,'publish_channel_id');
  if(!channelSetting)return false;
  let channel:ChatInfo;
  try{channel=await telegram.call<ChatInfo>('getChat',{chat_id:normalizeChatId(channelSetting)});}catch{return false;}
  if(!channel.linked_chat_id||Number(channel.linked_chat_id)!==Number(message.chat.id))return false;

  await env.DB.prepare('UPDATE publications SET discussion_message_id=?,updated_at=? WHERE id=?').bind(message.message_id,new Date().toISOString(),publication.id).run();
  await addLog(env,publication.id,'success','discussion_linked',`Telegram создал ветку комментариев в связанной группе ${message.chat.id}.`);
  ctx.waitUntil(sendPayload(publication,message.message_id,String(message.chat.id),env,telegram));
  return true;
}

async function sendPayload(publication:Publication,replyTo:number,discussionId:string,env:Env,telegram:TelegramClient){
  const assets=(await env.DB.prepare('SELECT id,file_name,mime_type,r2_key,telegram_file_id FROM publication_assets WHERE publication_id=? ORDER BY sort_order,id').bind(publication.id).all<Asset>()).results;
  for(const asset of assets){
    try{
      let sent:TelegramMessage;
      if(asset.telegram_file_id)sent=await telegram.sendDocument(discussionId,asset.telegram_file_id,undefined,{reply_to_message_id:replyTo});
      else{
        const object=await env.COVERS.get(asset.r2_key);if(!object)throw new Error(`R2 object missing: ${asset.r2_key}`);
        const file=new File([await object.arrayBuffer()],asset.file_name,{type:asset.mime_type||'application/octet-stream'});
        sent=await telegram.sendDocumentUpload(discussionId,file,undefined,{reply_to_message_id:replyTo});
        if(sent.document?.file_id)await env.DB.prepare('UPDATE publication_assets SET telegram_file_id=? WHERE id=?').bind(sent.document.file_id,asset.id).run();
      }
      await addLog(env,publication.id,'success','comment_file_sent',`Файл отправлен под постом: ${asset.file_name}.`);
    }catch(error){await addLog(env,publication.id,'error','comment_file_failed',`Ошибка отправки файла ${asset.file_name}.`,String(error));}
  }
  if(publication.add_bot_comment){
    const username=(await setting(env,'bot_username'))||'dollartlbot',url=`https://t.me/${username}?start=submit`;
    try{
      await telegram.sendMessage(discussionId,`<b>Need another translation?</b>\nSuggest a novel through <a href="${escapeHtml(url)}">Dollar TL Bot</a>.`,{reply_to_message_id:replyTo,reply_markup:{inline_keyboard:[[{text:'Suggest a Novel',url}]]}});
      await addLog(env,publication.id,'success','bot_comment_sent','Рекламный комментарий Dollar TL Bot отправлен под постом.');
    }catch(error){await addLog(env,publication.id,'error','bot_comment_failed','Не удалось отправить рекламный комментарий.',String(error));}
  }
}

async function setting(env:Env,key:string){return (await env.DB.prepare('SELECT value FROM app_settings WHERE key=?').bind(key).first<{value:string}>())?.value?.trim()||'';}
async function addLog(env:Env,id:number,level:string,event:string,message:string,details?:string){try{await env.DB.prepare('INSERT INTO publication_logs (publication_id,level,event,message,details,created_at) VALUES (?,?,?,?,?,?)').bind(id,level,event,message,details?.slice(0,1500)||null,new Date().toISOString()).run();}catch{}}
function normalizeChatId(v:string):number|string{const s=v.trim();if(/^-?\d+$/.test(s)){const n=Number(s);if(Number.isSafeInteger(n))return n;}return s.startsWith('@')?s:`@${s}`;}

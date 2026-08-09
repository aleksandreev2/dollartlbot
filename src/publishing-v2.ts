import { authenticateMiniAppRequest, miniAppJson, miniAppJsonError } from './miniapp-auth';
import { queueReleaseBroadcast, runBroadcastMaintenance } from './notifications';
import { escapeHtml, type InlineKeyboardMarkup, type TelegramClient, type TelegramMessage, type TelegramUser } from './telegram';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_FILE_BYTES = 45 * 1024 * 1024;
const MAX_TOTAL_ASSET_BYTES = 80 * 1024 * 1024;
const MAX_FILES = 8;
const MAX_BODY = 700;
const MAX_INTERNAL_TITLE = 180;
const IMAGE_TYPES = new Set(['image/jpeg','image/png','image/webp','image/avif']);

type PublicationRow = {
  id:number; status:string; internal_title:string; body_html:string;
  add_footer:number; add_donate:number; add_bot_comment:number; notify_users:number;
  image_key:string|null; image_mime:string|null; image_spoiler:number;
  channel_message_id:number|null; discussion_message_id:number|null; error_text:string|null;
  created_at:string; updated_at:string; published_at:string|null;
};
type AssetRow = { id:number; publication_id:number; file_name:string; mime_type:string|null; r2_key:string; size_bytes:number; telegram_file_id:string|null; sort_order:number };
type Settings = { publish_channel_id:string; discussion_chat_id:string; donation_url:string; bot_username:string };
type ChatInfo = { id:number; type:string; title?:string; username?:string; linked_chat_id?:number };
type MemberInfo = { status:string; can_post_messages?:boolean };

export async function handlePublishingV2Request(request:Request, env:Env, telegram:TelegramClient, ctx:ExecutionContext):Promise<Response|null>{
  const url=new URL(request.url);
  const isCreate=request.method==='POST'&&url.pathname==='/api/app/admin/publications';
  const action=/^\/api\/app\/admin\/publications\/(\d+)\/(test|publish)$/.exec(url.pathname);
  const isDiagnostics=request.method==='GET'&&url.pathname==='/api/app/admin/publishing/diagnostics';
  const isLogs=request.method==='GET'&&url.pathname==='/api/app/admin/publishing/logs';
  if(!isCreate&&!action&&!isDiagnostics&&!isLogs)return null;

  const auth=await authenticateMiniAppRequest(request,env);
  if(auth instanceof Response)return auth;
  if(!auth.admin)return miniAppJsonError('forbidden','Admin access required.',403);

  if(isDiagnostics){
    return miniAppJson({ diagnostics:await publishingDiagnostics(env,telegram) });
  }
  if(isLogs){
    const publicationId=Number(url.searchParams.get('publication_id')||0);
    const where=publicationId>0?'WHERE publication_id=?':'';
    const stmt=env.DB.prepare(`SELECT id,publication_id,level,event,message,details,created_at FROM publication_logs ${where} ORDER BY id DESC LIMIT 120`);
    const rows=publicationId>0?await stmt.bind(publicationId).all():await stmt.all();
    return miniAppJson({ logs:rows.results });
  }
  if(isCreate)return createDraftV2(request,env);

  const id=Number(action![1]);
  const publication=await getPublication(env,id);
  if(!publication)return miniAppJsonError('not_found','Publication not found.',404);
  if(action![2]==='test'){
    await log(env,id,'info','test_started','Начата тестовая отправка.');
    try{
      await sendPreview(publication,env,telegram);
      await log(env,id,'success','test_sent','Тестовая публикация отправлена администратору.');
      return miniAppJson({ok:true});
    }catch(error){
      await log(env,id,'error','test_failed','Тестовая отправка не удалась.',String(error));
      return miniAppJsonError('test_failed',friendlyTelegramError(error),502);
    }
  }
  return publishV2(publication,env,telegram,ctx);
}

export async function handlePublicationDiscussionForwardV2(message:TelegramMessage,env:Env,telegram:TelegramClient,ctx:ExecutionContext):Promise<boolean>{
  if(!message.is_automatic_forward||message.forward_origin?.type!=='channel')return false;
  const settings=await settingsFor(env);
  if(!settings.discussion_chat_id)return false;
  const discussion=await resolveChat(settings.discussion_chat_id,telegram).catch(()=>null);
  if(!discussion||Number(message.chat.id)!==Number(discussion.id))return false;
  const origin=message.forward_origin;
  const publication=await env.DB.prepare(`SELECT * FROM publications WHERE channel_message_id=? AND status='published' ORDER BY id DESC LIMIT 1`).bind(origin.message_id).first<PublicationRow>();
  if(!publication)return false;
  await env.DB.prepare('UPDATE publications SET discussion_message_id=?,updated_at=? WHERE id=?').bind(message.message_id,new Date().toISOString(),publication.id).run();
  await log(env,publication.id,'success','discussion_linked',`Telegram создал ветку комментариев. Message ID: ${message.message_id}.`);
  ctx.waitUntil(sendDiscussion(publication,message.message_id,settings,env,telegram));
  return true;
}

async function createDraftV2(request:Request,env:Env):Promise<Response>{
  const form=await request.formData();
  const internalTitle=field(form,'internal_title').slice(0,MAX_INTERNAL_TITLE);
  const body=field(form,'body').slice(0,MAX_BODY);
  if(!internalTitle||!body)return miniAppJsonError('required','Заполните название и текст публикации.',400);
  const addFooter=flag(form,'add_footer',true),addDonate=flag(form,'add_donate',true),addBotComment=flag(form,'add_bot_comment',true),notifyUsers=flag(form,'notify_users',false);
  const image=form.get('image');
  const imageSpoiler=image instanceof File&&image.size>0?flag(form,'image_spoiler',false):0;
  const files=form.getAll('files').filter((x):x is File=>x instanceof File&&x.size>0);
  if(files.length>MAX_FILES)return miniAppJsonError('too_many_files',`Максимум ${MAX_FILES} файлов.`,400);
  const total=files.reduce((n,f)=>n+f.size,0)+(image instanceof File?image.size:0);
  if(total>MAX_TOTAL_ASSET_BYTES)return miniAppJsonError('assets_too_large','Суммарный размер вложений слишком большой.',413);
  for(const f of files)if(f.size>MAX_FILE_BYTES)return miniAppJsonError('file_too_large',`${f.name}: файл больше 45 МБ.`,413);
  if(image instanceof File&&image.size>MAX_IMAGE_BYTES)return miniAppJsonError('image_too_large','Изображение должно быть не больше 8 МБ.',413);
  if(image instanceof File&&image.size>0&&!IMAGE_TYPES.has(normalizeMime(image.type,image.name)))return miniAppJsonError('bad_image','Используйте JPEG, PNG, WebP или AVIF.',400);

  const now=new Date().toISOString();
  const inserted=await env.DB.prepare(`INSERT INTO publications (internal_title,body_html,add_footer,add_donate,add_bot_comment,notify_users,image_spoiler,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)`)
    .bind(internalTitle,body,addFooter,addDonate,addBotComment,notifyUsers,imageSpoiler,now,now).run();
  const id=Number(inserted.meta.last_row_id);
  await log(env,id,'info','draft_created','Черновик создан.');
  try{
    if(image instanceof File&&image.size>0){
      const mime=normalizeMime(image.type,image.name),key=`publications/${id}/image-${crypto.randomUUID()}.${extForMime(mime)}`;
      await env.COVERS.put(key,await image.arrayBuffer(),{httpMetadata:{contentType:mime,cacheControl:'public, max-age=31536000, immutable'}});
      await env.DB.prepare('UPDATE publications SET image_key=?,image_mime=?,updated_at=? WHERE id=?').bind(key,mime,now,id).run();
      await log(env,id,'success','image_saved',`Изображение сохранено${imageSpoiler?' и помечено спойлером':''}.`);
    }
    for(let i=0;i<files.length;i++){
      const f=files[i],key=`publications/${id}/files/${crypto.randomUUID()}-${safeName(f.name)}`;
      await env.COVERS.put(key,await f.arrayBuffer(),{httpMetadata:{contentType:f.type||'application/octet-stream'}});
      await env.DB.prepare(`INSERT INTO publication_assets (publication_id,kind,file_name,mime_type,r2_key,size_bytes,sort_order,created_at) VALUES (?,'file',?,?,?,?,?,?)`).bind(id,f.name,f.type||null,key,f.size,i,now).run();
    }
    if(files.length)await log(env,id,'success','files_saved',`Сохранено файлов для комментариев: ${files.length}.`);
  }catch(error){
    await log(env,id,'error','draft_assets_failed','Ошибка при сохранении вложений.',String(error));
    return miniAppJsonError('asset_upload_failed','Не удалось сохранить вложения. Черновик оставлен в журнале для диагностики.',500);
  }
  return miniAppJson({ok:true,publication:{publication:await getPublication(env,id),assets:await getAssets(env,id)}},201);
}

async function publishV2(publication:PublicationRow,env:Env,telegram:TelegramClient,ctx:ExecutionContext):Promise<Response>{
  if(publication.status==='published')return miniAppJsonError('already_published','Пост уже опубликован.',409);
  await log(env,publication.id,'info','publish_started','Начата публикация в Telegram.');
  const diagnostics=await publishingDiagnostics(env,telegram);
  if(!diagnostics.channel.ok){
    await log(env,publication.id,'error','channel_invalid',diagnostics.channel.message);
    return miniAppJsonError('channel_invalid',diagnostics.channel.message,409);
  }
  const assets=await getAssets(env,publication.id);
  const needsDiscussion=assets.length>0||publication.add_bot_comment===1;
  if(needsDiscussion&&!diagnostics.discussion.ok){
    await log(env,publication.id,'error','discussion_invalid',diagnostics.discussion.message);
    return miniAppJsonError('discussion_invalid',diagnostics.discussion.message,409);
  }
  const settings=await settingsFor(env),now=new Date().toISOString();
  await env.DB.prepare("UPDATE publications SET status='publishing',error_text=NULL,updated_at=? WHERE id=?").bind(now,publication.id).run();
  try{
    const text=composePost(publication,settings),keyboard=publicationKeyboard(publication,settings);
    let sent:TelegramMessage;
    if(publication.image_key){
      const file=await r2File(env,publication.image_key,publication.image_mime||'image/jpeg','post.jpg');
      sent=await telegram.sendPhotoUpload(settings.publish_channel_id,file,text,{reply_markup:keyboard,has_spoiler:publication.image_spoiler===1});
    }else sent=await telegram.sendMessage(settings.publish_channel_id,text,{reply_markup:keyboard});
    await env.DB.prepare(`UPDATE publications SET status='published',channel_message_id=?,published_at=?,updated_at=? WHERE id=?`).bind(sent.message_id,now,now,publication.id).run();
    await log(env,publication.id,'success','post_sent',`Пост опубликован. Channel message ID: ${sent.message_id}.`);
    if(diagnostics.channel.linked_chat_id)await log(env,publication.id,'info','discussion_wait','Ожидаем автоматический форвард Telegram в связанную discussion group.');
    if(publication.notify_users){
      await queueReleaseBroadcast(env,publication.id,publication.internal_title,publication.body_html);
      await log(env,publication.id,'success','broadcast_queued','Рассылка релиза поставлена в очередь.');
      ctx.waitUntil(runBroadcastMaintenance(env,telegram,4));
    }
    return miniAppJson({ok:true,channel_message_id:sent.message_id,diagnostics});
  }catch(error){
    const message=friendlyTelegramError(error);
    await env.DB.prepare("UPDATE publications SET status='failed',error_text=?,updated_at=? WHERE id=?").bind(message,new Date().toISOString(),publication.id).run();
    await log(env,publication.id,'error','publish_failed',message,String(error));
    return miniAppJsonError('publish_failed',message,502);
  }
}

async function sendPreview(p:PublicationRow,env:Env,telegram:TelegramClient):Promise<void>{
  const s=await settingsFor(env),text=`<b>🧪 ТЕСТ ПУБЛИКАЦИИ</b>\n\n${composePost(p,s)}`,keyboard=publicationKeyboard(p,s);
  if(p.image_key){const file=await r2File(env,p.image_key,p.image_mime||'image/jpeg','preview.jpg');await telegram.sendPhotoUpload(env.ADMIN_TELEGRAM_ID,file,text,{reply_markup:keyboard,has_spoiler:p.image_spoiler===1});}
  else await telegram.sendMessage(env.ADMIN_TELEGRAM_ID,text,{reply_markup:keyboard});
  for(const a of await getAssets(env,p.id)){const f=await r2File(env,a.r2_key,a.mime_type||'application/octet-stream',a.file_name);await telegram.sendDocumentUpload(env.ADMIN_TELEGRAM_ID,f,`🧪 Файл: ${escapeHtml(a.file_name)}`);}
}

async function sendDiscussion(p:PublicationRow,messageId:number,s:Settings,env:Env,telegram:TelegramClient):Promise<void>{
  for(const a of await getAssets(env,p.id)){
    try{
      let sent:TelegramMessage;
      if(a.telegram_file_id)sent=await telegram.sendDocument(s.discussion_chat_id,a.telegram_file_id,undefined,{reply_to_message_id:messageId});
      else{const f=await r2File(env,a.r2_key,a.mime_type||'application/octet-stream',a.file_name);sent=await telegram.sendDocumentUpload(s.discussion_chat_id,f,undefined,{reply_to_message_id:messageId});if(sent.document?.file_id)await env.DB.prepare('UPDATE publication_assets SET telegram_file_id=? WHERE id=?').bind(sent.document.file_id,a.id).run();}
      await log(env,p.id,'success','comment_file_sent',`Файл отправлен в комментарии: ${a.file_name}.`);
    }catch(error){await log(env,p.id,'error','comment_file_failed',`Не удалось отправить файл: ${a.file_name}.`,String(error));}
  }
  if(p.add_bot_comment){
    const url=`https://t.me/${s.bot_username||'dollartlbot'}?start=submit`;
    try{await telegram.sendMessage(s.discussion_chat_id,`<b>Need another translation?</b>\nSuggest a novel through <a href="${escapeHtml(url)}">Dollar TL Bot</a>.`,{reply_to_message_id:messageId,reply_markup:{inline_keyboard:[[{text:'Suggest a Novel',url}]]}});await log(env,p.id,'success','bot_comment_sent','Рекламный комментарий Dollar TL Bot отправлен.');}
    catch(error){await log(env,p.id,'error','bot_comment_failed','Не удалось отправить рекламный комментарий.',String(error));}
  }
}

async function publishingDiagnostics(env:Env,telegram:TelegramClient){
  const s=await settingsFor(env);
  const result:any={channel:{ok:false,message:'Канал публикации не настроен.'},discussion:{ok:true,message:'Комментарии для этой публикации не обязательны.'},settings:s};
  if(!s.publish_channel_id)return result;
  let channel:ChatInfo;
  try{channel=await resolveChat(s.publish_channel_id,telegram);}catch(error){result.channel={ok:false,message:`Не удалось открыть канал публикации: ${friendlyTelegramError(error)}`};return result;}
  if(channel.type!=='channel'){result.channel={ok:false,message:`В поле канала указан чат типа «${channel.type}», нужен Telegram-канал.`,id:channel.id,type:channel.type};return result;}
  let me:TelegramUser|null=null;try{me=await telegram.call<TelegramUser>('getMe',{});}catch{}
  let channelMember:MemberInfo|null=null;if(me)try{channelMember=await telegram.call<MemberInfo>('getChatMember',{chat_id:channel.id,user_id:me.id});}catch{}
  const channelAdmin=channelMember?.status==='administrator'||channelMember?.status==='creator';
  result.channel={ok:channelAdmin,message:channelAdmin?`Канал найден: ${channel.title||channel.username||channel.id}. Бот имеет права администратора.`:'Канал найден, но бот не является администратором.',id:channel.id,title:channel.title||'',linked_chat_id:channel.linked_chat_id||null,bot_status:channelMember?.status||'unknown'};

  if(!channel.linked_chat_id){
    result.discussion={ok:false,message:'У канала не привязана группа обсуждения. В Telegram откройте Управление каналом → Обсуждение и выберите группу.',configured:s.discussion_chat_id||''};
    return result;
  }
  let linked:ChatInfo;
  try{linked=await resolveChat(String(channel.linked_chat_id),telegram);}catch(error){result.discussion={ok:false,message:`Канал сообщает связанную группу ${channel.linked_chat_id}, но бот не может её открыть: ${friendlyTelegramError(error)}`};return result;}
  let groupMember:MemberInfo|null=null;if(me)try{groupMember=await telegram.call<MemberInfo>('getChatMember',{chat_id:linked.id,user_id:me.id});}catch{}
  const botInGroup=groupMember&&groupMember.status!=='left'&&groupMember.status!=='kicked';
  let configuredId:number|null=null;
  if(s.discussion_chat_id){try{configuredId=(await resolveChat(s.discussion_chat_id,telegram)).id;}catch{}}
  const matches=!s.discussion_chat_id||Number(configuredId)===Number(linked.id);
  result.discussion={ok:Boolean(botInGroup&&matches),message:!botInGroup?'Связанная discussion group найдена, но бот не состоит в ней.':!matches?`В настройках указан другой Discussion group (${s.discussion_chat_id}). Реально к каналу привязана группа ${linked.id}.`:`Discussion group подключена правильно: ${linked.title||linked.id}.`,id:linked.id,title:linked.title||'',bot_status:groupMember?.status||'unknown',configured:s.discussion_chat_id||'',matches};
  return result;
}

async function resolveChat(id:string,telegram:TelegramClient):Promise<ChatInfo>{return telegram.call<ChatInfo>('getChat',{chat_id:normalizeChatId(id)});}
async function settingsFor(env:Env):Promise<Settings>{const r=await env.DB.prepare(`SELECT key,value FROM app_settings WHERE key IN ('publish_channel_id','discussion_chat_id','donation_url','bot_username')`).all<{key:string;value:string}>();const m=Object.fromEntries(r.results.map(x=>[x.key,x.value]));return{publish_channel_id:m.publish_channel_id||'',discussion_chat_id:m.discussion_chat_id||'',donation_url:m.donation_url||'https://boosty.to/domnekromanta/single-payment/donation/818248/target?share=target_link',bot_username:m.bot_username||'dollartlbot'};}
async function getPublication(env:Env,id:number){return env.DB.prepare('SELECT * FROM publications WHERE id=?').bind(id).first<PublicationRow>();}
async function getAssets(env:Env,id:number){return (await env.DB.prepare('SELECT * FROM publication_assets WHERE publication_id=? ORDER BY sort_order,id').bind(id).all<AssetRow>()).results;}
async function r2File(env:Env,key:string,mime:string,name:string){const o=await env.COVERS.get(key);if(!o)throw new Error(`R2 object missing: ${key}`);return new File([await o.arrayBuffer()],name,{type:mime});}
async function log(env:Env,publicationId:number|null,level:'info'|'success'|'warning'|'error',event:string,message:string,details?:string){try{await env.DB.prepare(`INSERT INTO publication_logs (publication_id,level,event,message,details,created_at) VALUES (?,?,?,?,?,?)`).bind(publicationId,level,event,message,details?.slice(0,1500)||null,new Date().toISOString()).run();}catch(error){console.warn(JSON.stringify({event:'publication_log_failed',error:String(error)}));}}
function composePost(p:PublicationRow,s:Settings){const parts=[escapeHtml(p.body_html.trim())];if(p.add_footer){const u=`https://t.me/${s.bot_username||'dollartlbot'}?start=submit`;parts.push(`<b>Need a translation?</b>\nOpen <a href="${escapeHtml(u)}">Dollar TL Bot</a> and suggest a novel for translation.`);}return parts.filter(Boolean).join('\n\n');}
function publicationKeyboard(p:PublicationRow,s:Settings):InlineKeyboardMarkup{const u=`https://t.me/${s.bot_username||'dollartlbot'}?start=submit`,row=[{text:'Suggest a Novel',url:u}];if(p.add_donate&&s.donation_url)row.push({text:'Donate',url:s.donation_url});return{inline_keyboard:[row]};}
function friendlyTelegramError(error:unknown){const raw=String(error instanceof Error?error.message:error);return raw.replace(/^Telegram \w+ failed:\s*/,'Telegram: ').slice(0,700);}
function field(f:FormData,n:string){const v=f.get(n);return typeof v==='string'?v.trim():'';}
function flag(f:FormData,n:string,d:boolean){const v=f.get(n);if(v===null)return d?1:0;return v==='1'||v==='true'||v==='on'?1:0;}
function normalizeMime(mime:string,name:string){const m=(mime||'').split(';')[0].toLowerCase();if(IMAGE_TYPES.has(m))return m;const e=name.toLowerCase().split('.').pop();if(e==='jpg'||e==='jpeg')return'image/jpeg';if(e==='png')return'image/png';if(e==='webp')return'image/webp';if(e==='avif')return'image/avif';return m;}
function extForMime(m:string){if(m==='image/png')return'png';if(m==='image/webp')return'webp';if(m==='image/avif')return'avif';return'jpg';}
function safeName(n:string){return n.replace(/[^a-zA-Z0-9._-]+/g,'_').slice(-120)||'file.bin';}
function normalizeChatId(v:string):number|string{const s=String(v||'').trim();if(/^-?\d+$/.test(s)){const n=Number(s);if(Number.isSafeInteger(n))return n;}return s.startsWith('@')?s:`@${s}`;}

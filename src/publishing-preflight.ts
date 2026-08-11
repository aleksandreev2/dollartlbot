import { authenticateMiniAppRequest, miniAppJsonError } from './miniapp-auth';
import { isActiveChatMember, type TelegramClient, type TelegramChatMember } from './telegram';

type Publication={id:number;add_bot_comment:number;status:string};
type Chat={id:number;type:string;title?:string;username?:string;linked_chat_id?:number};
type BotMember=TelegramChatMember&{can_post_messages?:boolean};

export type PublishingEnvironmentCheck={
  id:string;
  label:string;
  status:'ok'|'error'|'info';
  message:string;
};

export type PublishingEnvironmentInspection={
  ok:boolean;
  checks:PublishingEnvironmentCheck[];
  channel_id:number|string|null;
  discussion_id:number|null;
};

export async function inspectPublishingEnvironment(
  env:Env,
  telegram:TelegramClient,
  needsDiscussion:boolean,
):Promise<PublishingEnvironmentInspection>{
  const checks:PublishingEnvironmentCheck[]=[];
  const channelSetting=await setting(env,'publish_channel_id');
  if(!channelSetting){
    checks.push({id:'channel_missing',label:'Канал',status:'error',message:'Укажите канал публикации в Админ → Настройки.'});
    return {ok:false,checks,channel_id:null,discussion_id:null};
  }

  let channel:Chat;
  try{channel=await telegram.call<Chat>('getChat',{chat_id:normalizeChatId(channelSetting)});}
  catch(error){checks.push({id:'channel_unavailable',label:'Канал',status:'error',message:`Не удалось открыть канал публикации: ${friendly(error)}`});return{ok:false,checks,channel_id:channelSetting,discussion_id:null};}
  if(channel.type!=='channel'){
    checks.push({id:'channel_invalid',label:'Канал',status:'error',message:'В настройках публикации указан не Telegram-канал.'});
    return {ok:false,checks,channel_id:channel.id,discussion_id:null};
  }
  checks.push({id:'channel',label:'Канал',status:'ok',message:channel.title||channel.username||String(channel.id)});

  let me:{id:number};
  try{me=await telegram.call<{id:number}>('getMe',{});}
  catch(error){checks.push({id:'bot_identity_failed',label:'Бот',status:'error',message:`Telegram не подтвердил аккаунт бота: ${friendly(error)}`});return{ok:false,checks,channel_id:channel.id,discussion_id:null};}

  let channelMember:BotMember;
  try{channelMember=await telegram.call<BotMember>('getChatMember',{chat_id:channel.id,user_id:me.id});}
  catch(error){checks.push({id:'channel_permission_check_failed',label:'Права бота',status:'error',message:`Не удалось проверить права бота в канале: ${friendly(error)}`});return{ok:false,checks,channel_id:channel.id,discussion_id:null};}
  const canPost=(channelMember.status==='creator')||(channelMember.status==='administrator'&&channelMember.can_post_messages!==false);
  if(!canPost){checks.push({id:'channel_permission_missing',label:'Права бота',status:'error',message:'Бот должен быть администратором канала с правом публиковать сообщения.'});return{ok:false,checks,channel_id:channel.id,discussion_id:null};}
  checks.push({id:'channel_permission',label:'Права бота',status:'ok',message:'Публикация сообщений разрешена.'});

  if(!needsDiscussion){
    checks.push({id:'discussion_optional',label:'Комментарии',status:'info',message:'Discussion group не требуется для этой публикации.'});
    return {ok:true,checks,channel_id:channel.id,discussion_id:channel.linked_chat_id??null};
  }
  if(!channel.linked_chat_id){checks.push({id:'discussion_unlinked',label:'Комментарии',status:'error',message:'У канала нет связанной discussion group. Файлы и комментарий бота отправить нельзя.'});return{ok:false,checks,channel_id:channel.id,discussion_id:null};}

  let discussion:Chat;
  try{discussion=await telegram.call<Chat>('getChat',{chat_id:channel.linked_chat_id});}
  catch(error){checks.push({id:'discussion_unavailable',label:'Комментарии',status:'error',message:`Связанная группа комментариев недоступна: ${friendly(error)}`});return{ok:false,checks,channel_id:channel.id,discussion_id:channel.linked_chat_id};}
  if(!['group','supergroup'].includes(discussion.type)){checks.push({id:'discussion_invalid',label:'Комментарии',status:'error',message:'Telegram linked_chat_id указывает не на группу комментариев.'});return{ok:false,checks,channel_id:channel.id,discussion_id:discussion.id};}

  let discussionMember:TelegramChatMember;
  try{discussionMember=await telegram.call<TelegramChatMember>('getChatMember',{chat_id:discussion.id,user_id:me.id});}
  catch(error){checks.push({id:'discussion_permission_check_failed',label:'Комментарии',status:'error',message:`Не удалось проверить доступ бота к discussion group: ${friendly(error)}`});return{ok:false,checks,channel_id:channel.id,discussion_id:discussion.id};}
  if(!isActiveChatMember(discussionMember)){checks.push({id:'discussion_permission_missing',label:'Комментарии',status:'error',message:'Бот не состоит в связанной discussion group и не сможет отправить файлы.'});return{ok:false,checks,channel_id:channel.id,discussion_id:discussion.id};}
  checks.push({id:'discussion',label:'Комментарии',status:'ok',message:discussion.title||String(discussion.id)});
  return {ok:true,checks,channel_id:channel.id,discussion_id:discussion.id};
}

export async function handlePublishingPreflight(
  request:Request,
  env:Env,
  telegram:TelegramClient,
):Promise<Response|null>{
  const url=new URL(request.url);
  const match=/^\/api\/app\/admin\/publications\/(\d+)\/publish$/.exec(url.pathname);
  if(request.method!=='POST'||!match)return null;

  const auth=await authenticateMiniAppRequest(request,env);
  if(auth instanceof Response)return auth;
  if(!auth.admin)return miniAppJsonError('forbidden','Admin access required.',403);

  const id=Number(match[1]);
  const publication=await env.DB.prepare(`SELECT id,add_bot_comment,status FROM publications WHERE id=?`).bind(id).first<Publication>();
  if(!publication)return miniAppJsonError('not_found','Публикация не найдена.',404);
  if(publication.status==='published')return null;

  const assets=await env.DB.prepare('SELECT COUNT(*) AS n FROM publication_assets WHERE publication_id=?').bind(id).first<{n:number}>();
  const needsDiscussion=Number(assets?.n||0)>0||publication.add_bot_comment===1;
  const inspection=await inspectPublishingEnvironment(env,telegram,needsDiscussion);
  const blocking=inspection.checks.find(item=>item.status==='error');
  if(blocking)return fail(env,id,blocking.id,blocking.message);

  if(inspection.discussion_id){
    const now=new Date().toISOString();
    await env.DB.prepare(`
      INSERT INTO app_settings (key,value,updated_at) VALUES ('discussion_chat_id',?,?)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at
    `).bind(String(inspection.discussion_id),now).run();
  }
  await log(env,id,'info','publish_preflight_ok',`Проверка пройдена: канал ${inspection.channel_id??'—'}, discussion group ${inspection.discussion_id??'не требуется'}, права бота подтверждены.`);
  return null;
}

async function fail(env:Env,id:number,code:string,message:string):Promise<Response>{await log(env,id,'error',`preflight_${code}`,message);return miniAppJsonError(code,message,409);}
async function setting(env:Env,key:string){return (await env.DB.prepare('SELECT value FROM app_settings WHERE key=?').bind(key).first<{value:string}>())?.value?.trim()||'';}
async function log(env:Env,id:number,level:string,event:string,message:string){await env.DB.prepare('INSERT INTO publication_logs (publication_id,level,event,message,created_at) VALUES (?,?,?,?,?)').bind(id,level,event,message,new Date().toISOString()).run().catch(()=>undefined);}
function normalizeChatId(v:string):number|string{const s=v.trim();if(/^-?\d+$/.test(s)){const n=Number(s);if(Number.isSafeInteger(n))return n;}return s.startsWith('@')?s:`@${s}`;}
function friendly(error:unknown){return (error instanceof Error?error.message:String(error)).replace(/^Telegram\s+\w+\s+failed:\s*/i,'').trim()||'Неизвестная ошибка Telegram.';}

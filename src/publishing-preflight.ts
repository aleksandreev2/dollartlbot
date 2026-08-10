import { authenticateMiniAppRequest, miniAppJsonError } from './miniapp-auth';
import { isActiveChatMember, type TelegramClient, type TelegramChatMember } from './telegram';

type Publication={id:number;add_bot_comment:number;status:string};
type Chat={id:number;type:string;title?:string;username?:string;linked_chat_id?:number};
type BotMember=TelegramChatMember&{can_post_messages?:boolean};

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

  const channelSetting=await setting(env,'publish_channel_id');
  if(!channelSetting)return miniAppJsonError('channel_missing','Укажите канал публикации в Админ → Настройки.',409);

  let channel:Chat;
  try{channel=await telegram.call<Chat>('getChat',{chat_id:normalizeChatId(channelSetting)});}catch(error){return fail(env,id,'channel_unavailable',`Не удалось открыть канал публикации: ${friendly(error)}`);}
  if(channel.type!=='channel')return fail(env,id,'channel_invalid','В настройках публикации указан не Telegram-канал.');

  let me:{id:number};
  try{me=await telegram.call<{id:number}>('getMe',{});}catch(error){return fail(env,id,'bot_identity_failed',`Telegram не подтвердил аккаунт бота: ${friendly(error)}`);}
  let channelMember:BotMember;
  try{channelMember=await telegram.call<BotMember>('getChatMember',{chat_id:channel.id,user_id:me.id});}catch(error){return fail(env,id,'channel_permission_check_failed',`Не удалось проверить права бота в канале: ${friendly(error)}`);}
  const canPost=(channelMember.status==='creator')||(channelMember.status==='administrator'&&channelMember.can_post_messages!==false);
  if(!canPost)return fail(env,id,'channel_permission_missing','Бот должен быть администратором канала с правом публиковать сообщения.');

  const assets=await env.DB.prepare('SELECT COUNT(*) AS n FROM publication_assets WHERE publication_id=?').bind(id).first<{n:number}>();
  const needsDiscussion=Number(assets?.n||0)>0||publication.add_bot_comment===1;
  if(!needsDiscussion)return null;
  if(!channel.linked_chat_id)return fail(env,id,'discussion_unlinked','У канала нет связанной discussion group. Файлы в комментариях и комментарий бота публиковать нельзя, пока группа не привязана к каналу.');

  let discussion:Chat;
  try{discussion=await telegram.call<Chat>('getChat',{chat_id:channel.linked_chat_id});}catch(error){return fail(env,id,'discussion_unavailable',`Связанная группа комментариев недоступна: ${friendly(error)}`);}
  if(!['group','supergroup'].includes(discussion.type))return fail(env,id,'discussion_invalid','Telegram linked_chat_id указывает не на группу комментариев.');
  let discussionMember:TelegramChatMember;
  try{discussionMember=await telegram.call<TelegramChatMember>('getChatMember',{chat_id:discussion.id,user_id:me.id});}catch(error){return fail(env,id,'discussion_permission_check_failed',`Не удалось проверить доступ бота к discussion group: ${friendly(error)}`);}
  if(!isActiveChatMember(discussionMember))return fail(env,id,'discussion_permission_missing','Бот не состоит в связанной discussion group и не сможет отправить файлы в комментарии.');

  const now=new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO app_settings (key,value,updated_at) VALUES ('discussion_chat_id',?,?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at
  `).bind(String(channel.linked_chat_id),now).run();
  await log(env,id,'info','publish_preflight_ok',`Проверка пройдена: канал ${channel.id}, discussion group ${channel.linked_chat_id}, права бота подтверждены.`);
  return null;
}

async function fail(env:Env,id:number,code:string,message:string):Promise<Response>{await log(env,id,'error',`preflight_${code}`,message);return miniAppJsonError(code,message,409);}
async function setting(env:Env,key:string){return (await env.DB.prepare('SELECT value FROM app_settings WHERE key=?').bind(key).first<{value:string}>())?.value?.trim()||'';}
async function log(env:Env,id:number,level:string,event:string,message:string){await env.DB.prepare('INSERT INTO publication_logs (publication_id,level,event,message,created_at) VALUES (?,?,?,?,?)').bind(id,level,event,message,new Date().toISOString()).run().catch(()=>undefined);}
function normalizeChatId(v:string):number|string{const s=v.trim();if(/^-?\d+$/.test(s)){const n=Number(s);if(Number.isSafeInteger(n))return n;}return s.startsWith('@')?s:`@${s}`;}
function friendly(error:unknown){return (error instanceof Error?error.message:String(error)).replace(/^Telegram\s+\w+\s+failed:\s*/i,'').trim()||'Неизвестная ошибка Telegram.';}

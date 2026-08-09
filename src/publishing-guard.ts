import { authenticateMiniAppRequest, miniAppJsonError } from './miniapp-auth';

export async function guardPublishingRequest(request:Request,env:Env):Promise<Response|null>{
  const url=new URL(request.url);const match=/^\/api\/app\/admin\/publications\/(\d+)\/publish$/.exec(url.pathname);
  if(request.method!=='POST'||!match)return null;
  const auth=await authenticateMiniAppRequest(request,env);if(auth instanceof Response)return auth;if(!auth.admin)return miniAppJsonError('forbidden','Admin access required.',403);
  const id=Number(match[1]);
  const row=await env.DB.prepare(`SELECT p.add_bot_comment,(SELECT COUNT(*) FROM publication_assets a WHERE a.publication_id=p.id) AS file_count,(SELECT value FROM app_settings WHERE key='discussion_chat_id') AS discussion_chat_id FROM publications p WHERE p.id=?`).bind(id).first<{add_bot_comment:number;file_count:number;discussion_chat_id:string|null}>();
  if(!row)return miniAppJsonError('not_found','Publication not found.',404);
  if((Number(row.file_count)>0||Number(row.add_bot_comment)===1)&&!String(row.discussion_chat_id||'').trim()){
    return miniAppJsonError('discussion_missing','Укажите Discussion group в настройках админки: без неё нельзя отправить файлы и комментарий под постом.',409);
  }
  return null;
}

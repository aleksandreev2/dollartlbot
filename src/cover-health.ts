import { authenticateMiniAppRequest, miniAppJson } from './miniapp-auth';

export async function handleCoverHealthRequest(request:Request,env:Env):Promise<Response|null>{
  const url=new URL(request.url);
  if(request.method!=='GET'||url.pathname!=='/api/app/cover-manifest')return null;
  const auth=await authenticateMiniAppRequest(request,env);
  if(auth instanceof Response)return auth;
  const rows=auth.admin
    ? await env.DB.prepare(`SELECT id,cover_updated_at,cover_version FROM submissions WHERE cover_key IS NOT NULL ORDER BY id DESC LIMIT 2000`).all<{id:number;cover_updated_at:string|null;cover_version:string|null}>()
    : await env.DB.prepare(`SELECT id,cover_updated_at,cover_version FROM submissions WHERE cover_key IS NOT NULL AND (status='accepted' OR user_id=?) ORDER BY id DESC LIMIT 500`).bind(auth.telegramUser.id).all<{id:number;cover_updated_at:string|null;cover_version:string|null}>();
  return miniAppJson({covers:rows.results});
}

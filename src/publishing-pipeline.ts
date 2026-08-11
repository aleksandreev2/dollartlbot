import { authenticateMiniAppRequest, miniAppJson, miniAppJsonError } from './miniapp-auth';

export async function handlePublishingPipelineRequest(request:Request,env:Env):Promise<Response|null>{
  const url=new URL(request.url);
  if(request.method!=='GET'||url.pathname!=='/api/app/admin/publishing-center/pipeline')return null;
  const auth=await authenticateMiniAppRequest(request,env);
  if(auth instanceof Response)return auth;
  if(!auth.admin)return miniAppJsonError('forbidden','Admin access required.',403);

  const rows=await env.DB.prepare(`
    SELECT p.id,p.status,p.channel_message_id,p.discussion_message_id,p.comments_check_status,p.notify_users,
           (SELECT COUNT(*) FROM publication_assets a WHERE a.publication_id=p.id) AS file_count,
           b.id AS release_broadcast_id,b.status AS release_broadcast_status,
           b.sent_count AS release_sent_count,b.failed_count AS release_failed_count,
           b.completed_at AS release_completed_at
    FROM publications p
    LEFT JOIN broadcasts b ON b.id=(
      SELECT rb.id FROM broadcasts rb
      WHERE rb.publication_id=p.id AND rb.kind='release'
      ORDER BY rb.id DESC LIMIT 1
    )
    ORDER BY p.id DESC
    LIMIT 60
  `).all<Record<string,unknown>>();
  return miniAppJson({pipelines:rows.results});
}

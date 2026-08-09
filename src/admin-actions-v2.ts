import { getSubmission } from './db';
import { authenticateMiniAppRequest, miniAppJson, miniAppJsonError } from './miniapp-auth';
import { notifySubmissionStatus } from './notifications';
import { normalizeQueuePositions } from './queue';
import type { TelegramClient } from './telegram';

export async function handleAdminActionV2(request:Request,env:Env,telegram:TelegramClient):Promise<Response|null>{
  const url=new URL(request.url); if(request.method!=='POST'||url.pathname!=='/api/app/admin/action')return null;
  const auth=await authenticateMiniAppRequest(request,env); if(auth instanceof Response)return auth; if(!auth.admin)return miniAppJsonError('forbidden','Admin access required.',403);
  const body=await readJson<{id?:number;action?:string;current_chapter?:number}>(request); const id=Number(body.id); if(!Number.isSafeInteger(id)||id<=0||!body.action)return miniAppJsonError('invalid_action','Invalid admin action.',400);
  const s=await getSubmission(env,id); if(!s)return miniAppJsonError('not_found','Request not found.',404); const now=new Date().toISOString();
  switch(body.action){
    case'accept':
      if(s.status!=='pending')return miniAppJsonError('invalid_state','Request is no longer pending.',409);
      await env.DB.prepare(`UPDATE submissions SET status='accepted',queue_status='queued',queue_position=(SELECT COALESCE(MAX(queue_position),0)+1 FROM submissions WHERE status='accepted' AND queue_status='queued'),queued_at=?,updated_at=? WHERE id=? AND status='pending'`).bind(now,now,id).run();
      await normalizeQueuePositions(env);
      await notifySubmissionStatus(env,telegram,id,'accepted'); break;
    case'reject':case'return':{
      if(s.status!=='pending')return miniAppJsonError('invalid_state','Request is no longer pending.',409);const returned=body.action==='return'?1:0;
      await env.DB.prepare("UPDATE submissions SET status='rejected',slot_returned=?,updated_at=? WHERE id=? AND status='pending'").bind(returned,now,id).run();
      await notifySubmissionStatus(env,telegram,id,returned?'rejected_returned':'rejected'); break;}
    case'start':
      if(s.status!=='accepted')return miniAppJsonError('invalid_state','Only accepted requests can be started.',409);
      await env.DB.prepare("UPDATE submissions SET queue_status='in_progress',queue_position=NULL,started_at=COALESCE(started_at,?),updated_at=? WHERE id=?").bind(now,now,id).run();
      await normalizeQueuePositions(env);
      await notifySubmissionStatus(env,telegram,id,'started'); break;
    case'complete':
      if(s.status!=='accepted')return miniAppJsonError('invalid_state','Only accepted requests can be completed.',409);
      await env.DB.prepare(`UPDATE submissions SET queue_status='completed',queue_position=NULL,completed_at=?,current_chapter=chapter_count,progress_updated_at=?,updated_at=? WHERE id=?`).bind(now,now,now,id).run();
      await normalizeQueuePositions(env);
      await notifySubmissionStatus(env,telegram,id,'completed'); break;
    case'backqueue':
      if(s.status!=='accepted')return miniAppJsonError('invalid_state','Only accepted requests can be returned to queue.',409);
      await env.DB.prepare("UPDATE submissions SET queue_status='queued',queue_position=(SELECT COALESCE(MAX(queue_position),0)+1 FROM submissions WHERE status='accepted' AND queue_status='queued'),started_at=NULL,updated_at=? WHERE id=?").bind(now,id).run();
      await normalizeQueuePositions(env);break;
    case'up':case'down':
      if(s.status!=='accepted'||s.queue_status!=='queued')return miniAppJsonError('invalid_state','Only queued requests can be reordered.',409);
      await move(id,body.action==='up'?-1:1,env);await normalizeQueuePositions(env);break;
    case'progress':{
      if(s.status!=='accepted'||s.queue_status!=='in_progress')return miniAppJsonError('invalid_state','Start the translation before setting progress.',409);const chapter=Number(body.current_chapter);
      if(!Number.isInteger(chapter)||chapter<0||chapter>s.chapter_count)return miniAppJsonError('invalid_progress',`Current chapter must be between 0 and ${s.chapter_count}.`,400);
      await env.DB.prepare('UPDATE submissions SET current_chapter=?,progress_updated_at=?,updated_at=? WHERE id=?').bind(chapter,now,now,id).run();break;}
    default:return miniAppJsonError('invalid_action','Unsupported admin action.',400);
  }
  return miniAppJson({ok:true,novel:await getSubmission(env,id),counts:await counts(env)});
}
async function counts(env:Env){const r=await env.DB.prepare(`SELECT SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) pending,SUM(CASE WHEN status='accepted' AND queue_status='queued' THEN 1 ELSE 0 END) queued,SUM(CASE WHEN status='accepted' AND queue_status='in_progress' THEN 1 ELSE 0 END) in_progress,SUM(CASE WHEN status='accepted' AND queue_status='completed' THEN 1 ELSE 0 END) completed,COUNT(*) total FROM submissions`).first<Record<string,number>>();return{pending:Number(r?.pending||0),queued:Number(r?.queued||0),in_progress:Number(r?.in_progress||0),completed:Number(r?.completed||0),total:Number(r?.total||0)};}
async function move(id:number,direction:-1|1,env:Env){const c=await env.DB.prepare("SELECT queue_position FROM submissions WHERE id=? AND queue_status='queued'").bind(id).first<{queue_position:number|null}>();if(!c?.queue_position)return;const op=direction<0?'<':'>',ord=direction<0?'DESC':'ASC';const a=await env.DB.prepare(`SELECT id,queue_position FROM submissions WHERE status='accepted' AND queue_status='queued' AND queue_position ${op} ? ORDER BY queue_position ${ord},id ${ord} LIMIT 1`).bind(c.queue_position).first<{id:number;queue_position:number}>();if(!a)return;const now=new Date().toISOString(),temp=-id;await env.DB.batch([env.DB.prepare('UPDATE submissions SET queue_position=?,updated_at=? WHERE id=?').bind(temp,now,id),env.DB.prepare('UPDATE submissions SET queue_position=?,updated_at=? WHERE id=?').bind(c.queue_position,now,a.id),env.DB.prepare('UPDATE submissions SET queue_position=?,updated_at=? WHERE id=?').bind(a.queue_position,now,id)]);}
async function readJson<T>(r:Request):Promise<T>{try{return await r.json() as T;}catch{return{} as T;}}

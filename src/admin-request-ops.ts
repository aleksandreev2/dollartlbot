import { MAX_LONG, MAX_REASONABLE_CHAPTERS, MAX_SHORT, MAX_SOURCE, MAX_TITLE } from './domain';
import { authenticateMiniAppRequest, miniAppJson, miniAppJsonError } from './miniapp-auth';
import { normalizeQueuePositions } from './queue';
import { escapeHtml, type TelegramClient } from './telegram';

type RequestRow = {
  id:number; user_id:number; language:string; title:string; original_language:string; chapter_count:number;
  publication_status:string; source_url:string|null; raw_file_id:string; raw_file_name:string|null; raw_file_mime:string|null;
  genres_tags:string; sexual_content:string; sensitive_content:string; notes:string|null; plan:string; status:string;
  slot_returned:number; queue_status:string|null; queue_position:number|null; queued_at:string|null; started_at:string|null;
  completed_at:string|null; current_chapter:number|null; progress_updated_at:string|null; created_at:string; updated_at:string;
  username:string|null; first_name:string|null;
};

type AdminMeta = {
  submission_id:number; notes:string; duplicate_of_submission_id:number|null; archived_at:string|null; archived_by:number|null; updated_at:string;
};

export async function handleAdminRequestOps(
  request:Request,
  env:Env,
  telegram:TelegramClient,
):Promise<Response|null>{
  const url=new URL(request.url);
  const match=/^\/api\/app\/admin\/requests\/(\d+)(?:\/(edit|queue-position|meta|restore-pending|raw))?$/.exec(url.pathname);
  if(!match)return null;

  const auth=await authenticateMiniAppRequest(request,env);
  if(auth instanceof Response)return auth;
  if(!auth.admin)return miniAppJsonError('forbidden','Admin access required.',403);

  const id=Number(match[1]);
  if(!Number.isSafeInteger(id)||id<=0)return miniAppJsonError('invalid_request','Некорректный ID заявки.',400);
  const action=match[2]||'';

  try{
    if(request.method==='GET'&&!action)return requestDetail(id,env);
    if(request.method!=='POST')return miniAppJsonError('method_not_allowed','Method not allowed.',405);

    if(action==='edit')return editRequest(request,id,auth.telegramUser.id,env);
    if(action==='queue-position')return moveToPosition(request,id,auth.telegramUser.id,env);
    if(action==='meta')return saveMeta(request,id,auth.telegramUser.id,env);
    if(action==='restore-pending')return restorePending(id,auth.telegramUser.id,env);
    if(action==='raw')return sendRaw(id,auth.telegramUser.id,env,telegram);
    return miniAppJsonError('not_found','Request operation not found.',404);
  }catch(error){
    if(error instanceof RequestValidationError){
      return miniAppJsonError('invalid_request_edit',error.message,400);
    }
    throw error;
  }
}

async function requestDetail(id:number,env:Env):Promise<Response>{
  const request=await requestRow(id,env);
  if(!request)return miniAppJsonError('not_found','Заявка не найдена.',404);

  const [meta,publications,audit]=await Promise.all([
    env.DB.prepare(`SELECT submission_id,notes,duplicate_of_submission_id,archived_at,archived_by,updated_at FROM submission_admin_meta WHERE submission_id=?`)
      .bind(id).first<AdminMeta>(),
    env.DB.prepare(`SELECT id,status,internal_title,channel_message_id,discussion_message_id,telegram_deleted_at,published_at,created_at FROM publications WHERE submission_id=? ORDER BY id DESC LIMIT 30`)
      .bind(id).all<Record<string,unknown>>(),
    env.DB.prepare(`SELECT id,admin_user_id,action,details,created_at FROM admin_audit_log WHERE target_type='submission' AND target_id=? ORDER BY id DESC LIMIT 80`)
      .bind(String(id)).all<Record<string,unknown>>(),
  ]);

  return miniAppJson({
    request,
    admin_meta:meta||{submission_id:id,notes:'',duplicate_of_submission_id:null,archived_at:null,archived_by:null,updated_at:null},
    publications:publications.results,
    audit:audit.results,
  });
}

async function editRequest(request:Request,id:number,adminId:number,env:Env):Promise<Response>{
  const before=await requestRow(id,env);
  if(!before)return miniAppJsonError('not_found','Заявка не найдена.',404);
  const body=await readJson<Record<string,unknown>>(request);

  const next={
    title:cleanRequired(body.title??before.title,MAX_TITLE,'Название'),
    original_language:cleanRequired(body.original_language??before.original_language,MAX_SHORT,'Язык оригинала'),
    chapter_count:integer(body.chapter_count??before.chapter_count,1,MAX_REASONABLE_CHAPTERS,'Количество глав'),
    publication_status:String(body.publication_status??before.publication_status),
    source_url:cleanOptional(body.source_url??before.source_url,MAX_SOURCE),
    genres_tags:cleanRequired(body.genres_tags??before.genres_tags,MAX_LONG,'Жанры и теги'),
    sexual_content:cleanRequired(body.sexual_content??before.sexual_content,MAX_LONG,'Sexual content'),
    sensitive_content:cleanRequired(body.sensitive_content??before.sensitive_content,MAX_LONG,'Sensitive content'),
  };
  if(!['ongoing','completed'].includes(next.publication_status))return miniAppJsonError('invalid_publication_status','Статус оригинала должен быть ongoing или completed.',400);
  if(before.queue_status==='in_progress'&&before.current_chapter!==null&&next.chapter_count<before.current_chapter){
    return miniAppJsonError('chapter_count_below_progress',`Нельзя уменьшить число глав ниже текущего прогресса ${before.current_chapter}.`,409);
  }

  const now=new Date().toISOString();
  const completed=before.status==='accepted'&&before.queue_status==='completed';
  const changed=await env.DB.prepare(`
    UPDATE submissions SET
      title=?,original_language=?,chapter_count=?,publication_status=?,source_url=?,genres_tags=?,sexual_content=?,sensitive_content=?,
      current_chapter=CASE WHEN ? THEN ? ELSE current_chapter END,
      progress_updated_at=CASE WHEN ? THEN ? ELSE progress_updated_at END,
      updated_at=?
    WHERE id=?
  `).bind(
    next.title,next.original_language,next.chapter_count,next.publication_status,next.source_url,next.genres_tags,next.sexual_content,next.sensitive_content,
    completed?1:0,next.chapter_count,completed?1:0,now,now,id,
  ).run();
  if(Number(changed.meta.changes??0)!==1)return miniAppJsonError('stale_state','Заявка изменилась. Обновите карточку.',409);
  const after=await requestRow(id,env);
  await audit(env,adminId,'submission_edit',id,{before:editableSnapshot(before),after:editableSnapshot(after!)});
  return requestDetail(id,env);
}

async function moveToPosition(request:Request,id:number,adminId:number,env:Env):Promise<Response>{
  const body=await readJson<{position?:number}>(request);
  const desired=Number(body.position);
  const [current,count]=await Promise.all([
    env.DB.prepare(`SELECT queue_position FROM submissions WHERE id=? AND status='accepted' AND queue_status='queued'`)
      .bind(id).first<{queue_position:number|null}>(),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM submissions WHERE status='accepted' AND queue_status='queued'`).first<{n:number}>(),
  ]);
  if(!current?.queue_position)return miniAppJsonError('invalid_state','Позицию можно менять только у заявки в очереди.',409);
  const max=Math.max(1,Number(count?.n||0));
  if(!Number.isInteger(desired)||desired<1||desired>max)return miniAppJsonError('invalid_position',`Позиция должна быть от 1 до ${max}.`,400);
  if(desired===current.queue_position)return requestDetail(id,env);

  const now=new Date().toISOString();
  const moved=await env.DB.prepare(`
    WITH ordered AS (
      SELECT id,ROW_NUMBER() OVER (ORDER BY COALESCE(queue_position,2147483647),id) AS rn
      FROM submissions
      WHERE status='accepted' AND queue_status='queued' AND id<>?
    ), desired_order AS (
      SELECT id,CASE WHEN rn>=? THEN rn+1 ELSE rn END AS next_position FROM ordered
      UNION ALL SELECT ?,?
    )
    UPDATE submissions
    SET queue_position=(SELECT next_position FROM desired_order WHERE desired_order.id=submissions.id),
        updated_at=?
    WHERE status='accepted' AND queue_status='queued'
      AND id IN (SELECT id FROM desired_order)
      AND EXISTS (
        SELECT 1 FROM submissions target
        WHERE target.id=? AND target.status='accepted' AND target.queue_status='queued'
      )
      AND (SELECT COUNT(*) FROM submissions q WHERE q.status='accepted' AND q.queue_status='queued')>=?
  `).bind(id,desired,id,desired,now,id,desired).run();
  if(Number(moved.meta.changes??0)<1)return miniAppJsonError('stale_state','Очередь изменилась. Повторите действие.',409);

  const after=await env.DB.prepare(`SELECT queue_position FROM submissions WHERE id=? AND status='accepted' AND queue_status='queued'`)
    .bind(id).first<{queue_position:number|null}>();
  if(Number(after?.queue_position)!==desired){
    await normalizeQueuePositions(env);
    return miniAppJsonError('stale_state','Очередь изменилась во время перестановки. Обновите экран.',409);
  }
  await audit(env,adminId,'submission_queue_position',id,{before:current.queue_position,requested:desired,after:desired,atomic:true});
  return requestDetail(id,env);
}

async function saveMeta(request:Request,id:number,adminId:number,env:Env):Promise<Response>{
  const existing=await requestRow(id,env);
  if(!existing)return miniAppJsonError('not_found','Заявка не найдена.',404);
  const current=await env.DB.prepare(`SELECT submission_id,notes,duplicate_of_submission_id,archived_at,archived_by,updated_at FROM submission_admin_meta WHERE submission_id=?`)
    .bind(id).first<AdminMeta>();
  const body=await readJson<{notes?:string;duplicate_of_submission_id?:number|null;archived?:boolean}>(request);
  const notes=String(body.notes??current?.notes??'').trim().slice(0,4000);
  let duplicate=current?.duplicate_of_submission_id??null;
  if(Object.prototype.hasOwnProperty.call(body,'duplicate_of_submission_id')){
    if(body.duplicate_of_submission_id===null||body.duplicate_of_submission_id===undefined||Number(body.duplicate_of_submission_id)===0)duplicate=null;
    else{
      duplicate=Number(body.duplicate_of_submission_id);
      if(!Number.isSafeInteger(duplicate)||duplicate<=0||duplicate===id)return miniAppJsonError('invalid_duplicate','Укажите другую существующую заявку.',400);
      const found=await env.DB.prepare('SELECT id FROM submissions WHERE id=?').bind(duplicate).first<{id:number}>();
      if(!found)return miniAppJsonError('duplicate_not_found','Указанная дублирующая заявка не найдена.',404);
    }
  }
  const archived=typeof body.archived==='boolean'?body.archived:Boolean(current?.archived_at);
  const now=new Date().toISOString();
  const archivedAt=archived?(current?.archived_at||now):null;
  const archivedBy=archived?(current?.archived_by||adminId):null;
  await env.DB.prepare(`
    INSERT INTO submission_admin_meta (submission_id,notes,duplicate_of_submission_id,archived_at,archived_by,updated_at)
    VALUES (?,?,?,?,?,?)
    ON CONFLICT(submission_id) DO UPDATE SET
      notes=excluded.notes,duplicate_of_submission_id=excluded.duplicate_of_submission_id,
      archived_at=excluded.archived_at,archived_by=excluded.archived_by,updated_at=excluded.updated_at
  `).bind(id,notes,duplicate,archivedAt,archivedBy,now).run();
  await audit(env,adminId,'submission_admin_meta',id,{before:current||null,after:{notes,duplicate_of_submission_id:duplicate,archived_at:archivedAt,archived_by:archivedBy}});
  return requestDetail(id,env);
}

async function restorePending(id:number,adminId:number,env:Env):Promise<Response>{
  const before=await requestRow(id,env);
  if(!before)return miniAppJsonError('not_found','Заявка не найдена.',404);
  if(before.status!=='rejected')return miniAppJsonError('invalid_state','В ожидание можно восстановить только отклонённую заявку.',409);
  const now=new Date().toISOString();
  const result=await env.DB.prepare(`
    UPDATE submissions SET status='pending',slot_returned=0,queue_status=NULL,queue_position=NULL,queued_at=NULL,started_at=NULL,completed_at=NULL,current_chapter=NULL,progress_updated_at=NULL,updated_at=?
    WHERE id=? AND status='rejected'
  `).bind(now,id).run();
  if(Number(result.meta.changes??0)!==1)return miniAppJsonError('stale_state','Заявка уже изменилась.',409);
  await audit(env,adminId,'submission_restore_pending',id,{previous_status:'rejected',slot_had_been_returned:Boolean(before.slot_returned)});
  return requestDetail(id,env);
}

async function sendRaw(id:number,adminId:number,env:Env,telegram:TelegramClient):Promise<Response>{
  const row=await requestRow(id,env);
  if(!row)return miniAppJsonError('not_found','Заявка не найдена.',404);
  try{
    const sent=await telegram.sendDocument(adminId,row.raw_file_id,`📎 Raw-файл заявки <b>#${id}</b>\n${escapeHtml(row.title)}`);
    await audit(env,adminId,'submission_raw_sent',id,{telegram_message_id:sent.message_id,file_name:row.raw_file_name});
    return miniAppJson({ok:true,telegram_message_id:sent.message_id});
  }catch(error){
    return miniAppJsonError('raw_send_failed',error instanceof Error?error.message:String(error),502);
  }
}

async function requestRow(id:number,env:Env):Promise<RequestRow|null>{
  return env.DB.prepare(`
    SELECT s.id,s.user_id,s.language,s.title,s.original_language,s.chapter_count,s.publication_status,s.source_url,
           s.raw_file_id,s.raw_file_name,s.raw_file_mime,s.genres_tags,s.sexual_content,s.sensitive_content,s.notes,s.plan,
           s.status,s.slot_returned,s.queue_status,s.queue_position,s.queued_at,s.started_at,s.completed_at,s.current_chapter,
           s.progress_updated_at,s.created_at,s.updated_at,u.username,u.first_name
    FROM submissions s LEFT JOIN users u ON u.telegram_id=s.user_id WHERE s.id=?
  `).bind(id).first<RequestRow>();
}

function editableSnapshot(row:RequestRow){return{
  title:row.title,original_language:row.original_language,chapter_count:row.chapter_count,publication_status:row.publication_status,
  source_url:row.source_url,genres_tags:row.genres_tags,sexual_content:row.sexual_content,sensitive_content:row.sensitive_content,
};}

async function audit(env:Env,adminId:number,action:string,id:number,details:unknown):Promise<void>{
  await env.DB.prepare(`INSERT INTO admin_audit_log (admin_user_id,action,target_type,target_id,details,created_at) VALUES (?,?,?,?,?,?)`)
    .bind(adminId,action,'submission',String(id),JSON.stringify(details),new Date().toISOString()).run();
}

function cleanRequired(value:unknown,max:number,label:string):string{
  const text=String(value??'').trim();
  if(!text)throw new RequestValidationError(`${label}: поле обязательно.`);
  if(text.length>max)throw new RequestValidationError(`${label}: максимум ${max} символов.`);
  return text;
}
function cleanOptional(value:unknown,max:number):string|null{
  const text=String(value??'').trim();
  if(!text)return null;
  if(text.length>max)throw new RequestValidationError(`Максимум ${max} символов.`);
  return text;
}
function integer(value:unknown,min:number,max:number,label:string):number{
  const n=Number(value);if(!Number.isInteger(n)||n<min||n>max)throw new RequestValidationError(`${label}: значение должно быть от ${min} до ${max}.`);return n;
}
class RequestValidationError extends Error{}
async function readJson<T>(request:Request):Promise<T>{try{return await request.json() as T;}catch{return{} as T;}}

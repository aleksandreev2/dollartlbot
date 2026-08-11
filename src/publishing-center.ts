import { authenticateMiniAppRequest, miniAppJson, miniAppJsonError } from './miniapp-auth';
import { inspectPublishingEnvironment, type PublishingEnvironmentCheck } from './publishing-preflight';
import type { TelegramClient } from './telegram';

const MAX_BODY=700;
const MAX_TITLE=180;
const MAX_FILES=8;
const MAX_IMAGE_BYTES=8*1024*1024;
const MAX_FILE_BYTES=45*1024*1024;
const MAX_TOTAL_ASSET_BYTES=80*1024*1024;

type EditorDraft={
  admin_user_id:number;
  internal_title:string;
  body_html:string;
  add_footer:number;
  add_donate:number;
  add_bot_comment:number;
  notify_users:number;
  submission_id:number|null;
  source_publication_id:number|null;
  updated_at:string;
};

type TemplateRow={
  id:number;
  name:string;
  internal_title:string;
  body_html:string;
  add_footer:number;
  add_donate:number;
  add_bot_comment:number;
  notify_users:number;
  created_at:string;
  updated_at:string;
};

type DraftPayload={
  internal_title?:unknown;
  body_html?:unknown;
  add_footer?:unknown;
  add_donate?:unknown;
  add_bot_comment?:unknown;
  notify_users?:unknown;
  submission_id?:unknown;
  source_publication_id?:unknown;
};

type PreflightPayload=DraftPayload&{
  file_sizes?:unknown;
  image_size?:unknown;
};

const BUILTIN_TEMPLATES=[
  {
    key:'chapter_release',name:'Релиз новых глав',description:'Короткий пост для очередной пачки переведённых глав.',internal_title:'',
    body_html:'New chapters are now available.\n\nEnjoy reading!',add_footer:1,add_donate:1,add_bot_comment:1,notify_users:1,
  },
  {
    key:'new_novel',name:'Новый тайтл',description:'Анонс нового перевода в Dollar TL.',internal_title:'',
    body_html:'A new translation has joined Dollar TL.\n\nThe first chapters are now available.',add_footer:1,add_donate:1,add_bot_comment:1,notify_users:1,
  },
  {
    key:'translation_complete',name:'Перевод завершён',description:'Финальный пост после завершения произведения.',internal_title:'',
    body_html:'The translation is now complete.\n\nThank you for reading with Dollar TL.',add_footer:1,add_donate:1,add_bot_comment:1,notify_users:1,
  },
  {
    key:'announcement',name:'Объявление',description:'Чистая заготовка для обычного поста.',internal_title:'',
    body_html:'',add_footer:1,add_donate:1,add_bot_comment:0,notify_users:0,
  },
] as const;

export async function handlePublishingCenterRequest(
  request:Request,
  env:Env,
  telegram:TelegramClient,
):Promise<Response|null>{
  const url=new URL(request.url);
  if(!url.pathname.startsWith('/api/app/admin/publishing-center'))return null;
  const auth=await authenticateMiniAppRequest(request,env);
  if(auth instanceof Response)return auth;
  if(!auth.admin)return miniAppJsonError('forbidden','Admin access required.',403);
  const adminId=auth.telegramUser.id;

  if(request.method==='GET'&&url.pathname==='/api/app/admin/publishing-center'){
    const [draft,templates]=await Promise.all([
      env.DB.prepare(`SELECT admin_user_id,internal_title,body_html,add_footer,add_donate,add_bot_comment,notify_users,submission_id,source_publication_id,updated_at FROM publication_editor_drafts WHERE admin_user_id=?`).bind(adminId).first<EditorDraft>(),
      env.DB.prepare(`SELECT id,name,internal_title,body_html,add_footer,add_donate,add_bot_comment,notify_users,created_at,updated_at FROM publication_templates ORDER BY updated_at DESC,id DESC LIMIT 50`).all<TemplateRow>(),
    ]);
    return miniAppJson({
      draft:draft||null,
      templates:[
        ...BUILTIN_TEMPLATES.map(item=>({...item,id:null,kind:'builtin',template_key:`builtin:${item.key}`})),
        ...templates.results.map(item=>({...item,kind:'custom',template_key:`custom:${item.id}`,description:'Сохранённый шаблон команды.'})),
      ],
      limits:{title:MAX_TITLE,body:MAX_BODY,files:MAX_FILES,image_bytes:MAX_IMAGE_BYTES,file_bytes:MAX_FILE_BYTES,total_asset_bytes:MAX_TOTAL_ASSET_BYTES},
    });
  }

  if(request.method==='POST'&&url.pathname==='/api/app/admin/publishing-center/draft'){
    const body=await readJson<DraftPayload>(request);
    const draft=normalizeDraft(body);
    await saveDraft(env,adminId,draft);
    return miniAppJson({ok:true,draft:{admin_user_id:adminId,...draft,updated_at:new Date().toISOString()}});
  }

  if(request.method==='DELETE'&&url.pathname==='/api/app/admin/publishing-center/draft'){
    await env.DB.prepare('DELETE FROM publication_editor_drafts WHERE admin_user_id=?').bind(adminId).run();
    return miniAppJson({ok:true});
  }

  if(request.method==='POST'&&url.pathname==='/api/app/admin/publishing-center/templates'){
    const body=await readJson<DraftPayload&{name?:unknown}>(request);
    const name=String(body.name??'').trim().slice(0,80);
    const draft=normalizeDraft(body);
    if(!name)return miniAppJsonError('template_name_required','Введите название шаблона.',400);
    if(!draft.body_html)return miniAppJsonError('template_body_required','Шаблон должен содержать текст публикации.',400);
    const now=new Date().toISOString();
    const result=await env.DB.prepare(`
      INSERT INTO publication_templates (name,internal_title,body_html,add_footer,add_donate,add_bot_comment,notify_users,created_by,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `).bind(name,draft.internal_title,draft.body_html,draft.add_footer,draft.add_donate,draft.add_bot_comment,draft.notify_users,adminId,now,now).run();
    return miniAppJson({ok:true,id:Number(result.meta.last_row_id)},201);
  }

  const templateDelete=/^\/api\/app\/admin\/publishing-center\/templates\/(\d+)$/.exec(url.pathname);
  if(request.method==='DELETE'&&templateDelete){
    await env.DB.prepare('DELETE FROM publication_templates WHERE id=?').bind(Number(templateDelete[1])).run();
    return miniAppJson({ok:true});
  }

  const fromPublication=/^\/api\/app\/admin\/publishing-center\/from-publication\/(\d+)$/.exec(url.pathname);
  if(request.method==='POST'&&fromPublication){
    const id=Number(fromPublication[1]);
    const row=await env.DB.prepare(`
      SELECT id,internal_title,body_html,add_footer,add_donate,add_bot_comment,notify_users,submission_id
      FROM publications WHERE id=?
    `).bind(id).first<Record<string,unknown>>();
    if(!row)return miniAppJsonError('not_found','Публикация не найдена.',404);
    const draft=normalizeDraft({
      internal_title:String(row.internal_title||''),body_html:String(row.body_html||''),
      add_footer:row.add_footer,add_donate:row.add_donate,add_bot_comment:row.add_bot_comment,notify_users:row.notify_users,
      submission_id:row.submission_id,source_publication_id:id,
    });
    await saveDraft(env,adminId,draft);
    return miniAppJson({ok:true,draft:{admin_user_id:adminId,...draft,updated_at:new Date().toISOString()}});
  }

  if(request.method==='POST'&&url.pathname==='/api/app/admin/publishing-center/preflight'){
    const body=await readJson<PreflightPayload>(request);
    const draft=normalizeDraft(body);
    const localChecks:PublishingEnvironmentCheck[]=[];
    localChecks.push(draft.internal_title?ok('title','Название',`${draft.internal_title.length} / ${MAX_TITLE}`):bad('title','Название','Заполните название для админки.'));
    localChecks.push(draft.body_html?ok('body','Текст',`${draft.body_html.length} / ${MAX_BODY}`):bad('body','Текст','Добавьте основной текст публикации.'));

    const fileSizes=Array.isArray(body.file_sizes)?body.file_sizes.map(Number).filter(Number.isFinite):[];
    const imageSize=Math.max(0,Number(body.image_size||0));
    const totalBytes=imageSize+fileSizes.reduce((sum,size)=>sum+Math.max(0,size),0);
    if(fileSizes.length>MAX_FILES)localChecks.push(bad('files','Вложения',`Можно прикрепить максимум ${MAX_FILES} файлов.`));
    else if(fileSizes.some(size=>size>MAX_FILE_BYTES))localChecks.push(bad('files','Вложения','Один из файлов больше 45 МБ.'));
    else if(imageSize>MAX_IMAGE_BYTES)localChecks.push(bad('files','Вложения','Изображение больше 8 МБ.'));
    else if(totalBytes>MAX_TOTAL_ASSET_BYTES)localChecks.push(bad('files','Вложения','Общий размер вложений больше 80 МБ.'));
    else localChecks.push(ok('files','Вложения',fileSizes.length||imageSize?`${fileSizes.length} файл(ов) · ${formatBytes(totalBytes)}`:'Без вложений'));

    const submissionId=draft.submission_id;
    if(submissionId){
      const submission=await env.DB.prepare('SELECT id,status,title FROM submissions WHERE id=?').bind(submissionId).first<{id:number;status:string;title:string}>();
      if(!submission)localChecks.push(bad('request','Связанная заявка','Заявка не найдена.'));
      else if(submission.status!=='accepted')localChecks.push(bad('request','Связанная заявка','Связывать публикацию можно только с принятой заявкой.'));
      else localChecks.push(ok('request','Связанная заявка',`#${submission.id} · ${submission.title}`));
    }else localChecks.push({id:'request',label:'Связанная заявка',status:'info',message:'Не выбрана — это допустимо.'});

    const captionEstimate=estimateTelegramLength(draft,fileSizes.length,imageSize>0);
    const captionMax=imageSize>0?1024:4096;
    localChecks.push(captionEstimate>captionMax?bad('telegram_length','Telegram length',`Оценка ${captionEstimate} / ${captionMax}. Сократите текст или служебные блоки.`):ok('telegram_length','Telegram length',`Оценка ${captionEstimate} / ${captionMax}`));

    const environment=await inspectPublishingEnvironment(env,telegram,fileSizes.length>0||draft.add_bot_comment===1);
    const checks=[...localChecks,...environment.checks];
    const ready=!checks.some(item=>item.status==='error');
    return miniAppJson({ok:ready,ready,checks,caption:{estimated:captionEstimate,max:captionMax},channel_id:environment.channel_id,discussion_id:environment.discussion_id});
  }

  return miniAppJsonError('not_found','Publishing Center route not found.',404);
}

async function saveDraft(env:Env,adminId:number,draft:ReturnType<typeof normalizeDraft>):Promise<void>{
  const now=new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO publication_editor_drafts (admin_user_id,internal_title,body_html,add_footer,add_donate,add_bot_comment,notify_users,submission_id,source_publication_id,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(admin_user_id) DO UPDATE SET
      internal_title=excluded.internal_title,body_html=excluded.body_html,add_footer=excluded.add_footer,
      add_donate=excluded.add_donate,add_bot_comment=excluded.add_bot_comment,notify_users=excluded.notify_users,
      submission_id=excluded.submission_id,source_publication_id=excluded.source_publication_id,updated_at=excluded.updated_at
  `).bind(adminId,draft.internal_title,draft.body_html,draft.add_footer,draft.add_donate,draft.add_bot_comment,draft.notify_users,draft.submission_id,draft.source_publication_id,now).run();
}

function normalizeDraft(body:DraftPayload){
  const internal_title=String(body.internal_title??'').trim().slice(0,MAX_TITLE);
  const body_html=String(body.body_html??'').trim().slice(0,MAX_BODY);
  return {
    internal_title,body_html,
    add_footer:flag(body.add_footer,true),add_donate:flag(body.add_donate,true),add_bot_comment:flag(body.add_bot_comment,true),notify_users:flag(body.notify_users,false),
    submission_id:positiveId(body.submission_id),source_publication_id:positiveId(body.source_publication_id),
  };
}
function positiveId(value:unknown):number|null{const n=Number(value);return Number.isSafeInteger(n)&&n>0?n:null;}
function flag(value:unknown,fallback:boolean):number{if(value===undefined||value===null)return fallback?1:0;return value===true||value===1||value==='1'?1:0;}
function ok(id:string,label:string,message:string):PublishingEnvironmentCheck{return{id,label,status:'ok',message};}
function bad(id:string,label:string,message:string):PublishingEnvironmentCheck{return{id,label,status:'error',message};}
function estimateTelegramLength(draft:ReturnType<typeof normalizeDraft>,fileCount:number,hasImage:boolean):number{
  let total=draft.body_html.length;
  if(fileCount>0)total+=34;
  if(draft.submission_id)total+=56;
  if(draft.add_footer)total+=106;
  if(draft.add_donate)total+=72;
  return total+(hasImage?0:0);
}
function formatBytes(value:number):string{if(value<1024*1024)return`${Math.max(0,value/1024).toFixed(1)} КБ`;return`${(value/(1024*1024)).toFixed(1)} МБ`;}
async function readJson<T>(request:Request):Promise<T>{try{return await request.json() as T;}catch{return{} as T;}}

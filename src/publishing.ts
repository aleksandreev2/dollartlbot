import { authenticateMiniAppRequest, miniAppJson, miniAppJsonError } from './miniapp-auth';
import { queueReleaseBroadcast, runBroadcastMaintenance } from './notifications';
import { escapeHtml, type InlineKeyboardMarkup, type TelegramClient, type TelegramMessage } from './telegram';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_FILE_BYTES = 45 * 1024 * 1024;
const MAX_TOTAL_ASSET_BYTES = 80 * 1024 * 1024;
const MAX_FILES = 8;
const MAX_BODY = 700;
const MAX_INTERNAL_TITLE = 180;
const IMAGE_TYPES = new Set(['image/jpeg','image/png','image/webp','image/avif']);

type PublishSettings = {
  publish_channel_id: string;
  discussion_chat_id: string;
  donation_url: string;
  bot_username: string;
};

type PublicationRow = {
  id:number;
  status:string;
  internal_title:string;
  body_html:string;
  add_footer:number;
  add_donate:number;
  add_bot_comment:number;
  notify_users:number;
  image_key:string|null;
  image_mime:string|null;
  channel_message_id:number|null;
  discussion_message_id:number|null;
  error_text:string|null;
  created_at:string;
  updated_at:string;
  published_at:string|null;
};

type AssetRow = {
  id:number;
  publication_id:number;
  file_name:string;
  mime_type:string|null;
  r2_key:string;
  size_bytes:number;
  telegram_file_id:string|null;
  sort_order:number;
};

export async function handlePublishingRequest(
  request: Request,
  env: Env,
  telegram: TelegramClient,
  ctx: ExecutionContext,
): Promise<Response | null> {
  const url = new URL(request.url);

  const imageMatch = /^\/media\/publications\/(\d+)\/image$/.exec(url.pathname);
  if (request.method === 'GET' && imageMatch) return publicationImage(Number(imageMatch[1]), env, request);

  if (!url.pathname.startsWith('/api/app/admin/publishing') && !url.pathname.startsWith('/api/app/admin/publications')) return null;
  const auth = await authenticateMiniAppRequest(request, env);
  if (auth instanceof Response) return auth;
  if (!auth.admin) return miniAppJsonError('forbidden', 'Admin access required.', 403);

  if (request.method === 'GET' && url.pathname === '/api/app/admin/publishing') {
    const [settings, rows] = await Promise.all([
      getPublishSettings(env),
      env.DB.prepare(`
        SELECT p.*, (SELECT COUNT(*) FROM publication_assets a WHERE a.publication_id=p.id) AS file_count
        FROM publications p ORDER BY p.id DESC LIMIT 30
      `).all<Record<string, unknown>>(),
    ]);
    return miniAppJson({ settings, publications: rows.results });
  }

  if (request.method === 'POST' && url.pathname === '/api/app/admin/publishing/settings') {
    const body = await readJson<Partial<PublishSettings>>(request);
    const current = await getPublishSettings(env);
    const next: PublishSettings = {
      publish_channel_id: cleanId(body.publish_channel_id ?? current.publish_channel_id),
      discussion_chat_id: cleanId(body.discussion_chat_id ?? current.discussion_chat_id),
      donation_url: cleanUrl(body.donation_url ?? current.donation_url),
      bot_username: cleanUsername(body.bot_username ?? current.bot_username),
    };
    const now = new Date().toISOString();
    await env.DB.batch(Object.entries(next).map(([key,value]) => env.DB.prepare(`
      INSERT INTO app_settings (key,value,updated_at) VALUES (?,?,?)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at
    `).bind(key, value, now)));
    return miniAppJson({ ok:true, settings:next });
  }

  if (request.method === 'POST' && url.pathname === '/api/app/admin/publications') {
    return createDraft(request, env);
  }

  const actionMatch = /^\/api\/app\/admin\/publications\/(\d+)\/(test|publish)$/.exec(url.pathname);
  if (request.method === 'POST' && actionMatch) {
    const id = Number(actionMatch[1]);
    const publication = await getPublication(env, id);
    if (!publication) return miniAppJsonError('not_found', 'Publication not found.', 404);
    if (actionMatch[2] === 'test') {
      await sendPublicationPreview(publication, env, telegram);
      return miniAppJson({ ok:true });
    }
    return publishPublication(publication, env, telegram, ctx);
  }

  const deleteMatch = /^\/api\/app\/admin\/publications\/(\d+)$/.exec(url.pathname);
  if (request.method === 'DELETE' && deleteMatch) {
    const id = Number(deleteMatch[1]);
    const publication = await getPublication(env, id);
    if (!publication) return miniAppJsonError('not_found', 'Publication not found.', 404);
    if (publication.status === 'published') return miniAppJsonError('already_published', 'Published posts cannot be deleted here.', 409);
    await removePublicationAssets(env, id, publication.image_key);
    await env.DB.prepare('DELETE FROM publications WHERE id=?').bind(id).run();
    return miniAppJson({ ok:true });
  }

  return miniAppJsonError('not_found', 'Publishing route not found.', 404);
}

export async function handlePublicationDiscussionForward(
  message: TelegramMessage,
  env: Env,
  telegram: TelegramClient,
  ctx: ExecutionContext,
): Promise<boolean> {
  if (!message.is_automatic_forward || message.forward_origin?.type !== 'channel') return false;
  const settings = await getPublishSettings(env);
  if (!settings.discussion_chat_id || String(message.chat.id) !== normalizeIdString(settings.discussion_chat_id)) return false;
  const origin = message.forward_origin;
  const publication = await env.DB.prepare(`
    SELECT * FROM publications WHERE channel_message_id=? AND status='published' ORDER BY id DESC LIMIT 1
  `).bind(origin.message_id).first<PublicationRow>();
  if (!publication) return false;
  await env.DB.prepare('UPDATE publications SET discussion_message_id=?, updated_at=? WHERE id=?')
    .bind(message.message_id, new Date().toISOString(), publication.id).run();
  ctx.waitUntil(sendDiscussionPayload(publication.id, message.message_id, settings, env, telegram));
  return true;
}

async function createDraft(request: Request, env: Env): Promise<Response> {
  const form = await request.formData();
  const internalTitle = field(form,'internal_title').slice(0, MAX_INTERNAL_TITLE);
  const body = field(form,'body').slice(0, MAX_BODY);
  if (!internalTitle || !body) return miniAppJsonError('required', 'Title and post text are required.', 400);
  const addFooter = flag(form,'add_footer',true);
  const addDonate = flag(form,'add_donate',true);
  const addBotComment = flag(form,'add_bot_comment',true);
  const notifyUsers = flag(form,'notify_users',false);
  const image = form.get('image');
  const files = form.getAll('files').filter((x): x is File => x instanceof File && x.size > 0);
  if (files.length > MAX_FILES) return miniAppJsonError('too_many_files', `Maximum ${MAX_FILES} files.`, 400);
  let total = files.reduce((n,f)=>n+f.size,0) + (image instanceof File ? image.size : 0);
  if (total > MAX_TOTAL_ASSET_BYTES) return miniAppJsonError('assets_too_large', 'Attachments are too large in total.', 413);
  for (const file of files) if (file.size > MAX_FILE_BYTES) return miniAppJsonError('file_too_large', `${file.name} is larger than 45 MB.`, 413);
  if (image instanceof File && image.size > MAX_IMAGE_BYTES) return miniAppJsonError('image_too_large', 'Post image must be 8 MB or smaller.', 413);
  if (image instanceof File && image.size > 0 && !IMAGE_TYPES.has(normalizeMime(image.type, image.name))) {
    return miniAppJsonError('bad_image', 'Use JPEG, PNG, WebP or AVIF.', 400);
  }

  const now = new Date().toISOString();
  const insert = await env.DB.prepare(`
    INSERT INTO publications (internal_title, body_html, add_footer, add_donate, add_bot_comment, notify_users, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?)
  `).bind(internalTitle, body, addFooter, addDonate, addBotComment, notifyUsers, now, now).run();
  const id = Number(insert.meta.last_row_id);
  try {
    if (image instanceof File && image.size > 0) {
      const mime = normalizeMime(image.type, image.name);
      const key = `publications/${id}/image-${crypto.randomUUID()}.${extForMime(mime)}`;
      await env.COVERS.put(key, await image.arrayBuffer(), { httpMetadata:{ contentType:mime, cacheControl:'public, max-age=31536000, immutable' } });
      await env.DB.prepare('UPDATE publications SET image_key=?, image_mime=?, updated_at=? WHERE id=?').bind(key,mime,now,id).run();
    }
    for (let i=0;i<files.length;i++) {
      const file = files[i];
      const key = `publications/${id}/files/${crypto.randomUUID()}-${safeName(file.name)}`;
      await env.COVERS.put(key, await file.arrayBuffer(), { httpMetadata:{ contentType:file.type || 'application/octet-stream' } });
      await env.DB.prepare(`
        INSERT INTO publication_assets (publication_id,kind,file_name,mime_type,r2_key,size_bytes,sort_order,created_at)
        VALUES (?,'file',?,?,?,?,?,?)
      `).bind(id,file.name,file.type||null,key,file.size,i,now).run();
    }
  } catch (error) {
    const row = await getPublication(env,id);
    await removePublicationAssets(env,id,row?.image_key ?? null).catch(()=>undefined);
    await env.DB.prepare('DELETE FROM publications WHERE id=?').bind(id).run().catch(()=>undefined);
    throw error;
  }
  return miniAppJson({ ok:true, publication:await getPublicationDetail(env,id) }, 201);
}

async function sendPublicationPreview(publication: PublicationRow, env: Env, telegram: TelegramClient): Promise<void> {
  const settings = await getPublishSettings(env);
  const text = `<b>🧪 ТЕСТ ПУБЛИКАЦИИ</b>\n\n${composePost(publication, settings)}`;
  const keyboard = publicationKeyboard(publication, settings);
  if (publication.image_key) {
    const file = await r2File(env, publication.image_key, publication.image_mime || 'image/jpeg', 'preview.jpg');
    await telegram.sendPhotoUpload(env.ADMIN_TELEGRAM_ID, file, text, { reply_markup:keyboard });
  } else {
    await telegram.sendMessage(env.ADMIN_TELEGRAM_ID, text, { reply_markup:keyboard });
  }
  const assets = await getAssets(env, publication.id);
  for (const asset of assets) {
    const file = await r2File(env, asset.r2_key, asset.mime_type || 'application/octet-stream', asset.file_name);
    await telegram.sendDocumentUpload(env.ADMIN_TELEGRAM_ID, file, `🧪 Файл: ${escapeHtml(asset.file_name)}`);
  }
}

async function publishPublication(publication: PublicationRow, env: Env, telegram: TelegramClient, ctx: ExecutionContext): Promise<Response> {
  if (publication.status === 'published') return miniAppJsonError('already_published', 'Post already published.', 409);
  const settings = await getPublishSettings(env);
  if (!settings.publish_channel_id) return miniAppJsonError('channel_missing', 'Set the publication channel in Admin → Settings.', 409);
  const now = new Date().toISOString();
  await env.DB.prepare("UPDATE publications SET status='publishing', error_text=NULL, updated_at=? WHERE id=?").bind(now,publication.id).run();
  try {
    const text = composePost(publication, settings);
    const keyboard = publicationKeyboard(publication, settings);
    let sent: TelegramMessage;
    if (publication.image_key) {
      const file = await r2File(env, publication.image_key, publication.image_mime || 'image/jpeg', 'post.jpg');
      sent = await telegram.sendPhotoUpload(settings.publish_channel_id, file, text, { reply_markup:keyboard });
    } else {
      sent = await telegram.sendMessage(settings.publish_channel_id, text, { reply_markup:keyboard });
    }
    await env.DB.prepare(`
      UPDATE publications SET status='published', channel_message_id=?, published_at=?, updated_at=? WHERE id=?
    `).bind(sent.message_id, now, now, publication.id).run();
    if (publication.notify_users) {
      await queueReleaseBroadcast(env, publication.id, publication.internal_title, publication.body_html);
      ctx.waitUntil(runBroadcastMaintenance(env, telegram, 4));
    }
    return miniAppJson({ ok:true, channel_message_id:sent.message_id });
  } catch (error) {
    await env.DB.prepare("UPDATE publications SET status='failed', error_text=?, updated_at=? WHERE id=?")
      .bind(String(error),new Date().toISOString(),publication.id).run();
    throw error;
  }
}

async function sendDiscussionPayload(publicationId:number, discussionMessageId:number, settings:PublishSettings, env:Env, telegram:TelegramClient): Promise<void> {
  const publication = await getPublication(env, publicationId);
  if (!publication || !settings.discussion_chat_id) return;
  const assets = await getAssets(env, publicationId);
  for (const asset of assets) {
    try {
      let sent: TelegramMessage;
      if (asset.telegram_file_id) {
        sent = await telegram.sendDocument(settings.discussion_chat_id, asset.telegram_file_id, undefined, { reply_to_message_id:discussionMessageId });
      } else {
        const file = await r2File(env, asset.r2_key, asset.mime_type || 'application/octet-stream', asset.file_name);
        sent = await telegram.sendDocumentUpload(settings.discussion_chat_id, file, undefined, { reply_to_message_id:discussionMessageId });
        if (sent.document?.file_id) {
          await env.DB.prepare('UPDATE publication_assets SET telegram_file_id=? WHERE id=?').bind(sent.document.file_id,asset.id).run();
        }
      }
    } catch (error) {
      console.warn(JSON.stringify({event:'publication_comment_file_failed',publication_id:publicationId,asset_id:asset.id,error:String(error)}));
    }
  }
  if (publication.add_bot_comment) {
    const botUrl = `https://t.me/${settings.bot_username || 'dollartlbot'}?start=submit`;
    await telegram.sendMessage(settings.discussion_chat_id,
      `<b>Need another translation?</b>\nSuggest a novel through <a href="${escapeHtml(botUrl)}">Dollar TL Bot</a>.`,
      { reply_to_message_id:discussionMessageId, reply_markup:{ inline_keyboard:[[ {text:'Suggest a Novel',url:botUrl} ]] } },
    ).catch(()=>undefined);
  }
}

function composePost(publication:PublicationRow, settings:PublishSettings): string {
  const parts = [escapeHtml(publication.body_html.trim())];
  if (publication.add_footer) {
    const botUrl = `https://t.me/${settings.bot_username || 'dollartlbot'}?start=submit`;
    parts.push(`<b>Need a translation?</b>\nOpen <a href="${escapeHtml(botUrl)}">Dollar TL Bot</a> and suggest a novel for translation.`);
  }
  return parts.filter(Boolean).join('\n\n');
}

function publicationKeyboard(publication:PublicationRow, settings:PublishSettings): InlineKeyboardMarkup {
  const botUrl = `https://t.me/${settings.bot_username || 'dollartlbot'}?start=submit`;
  const row = [{text:'Suggest a Novel',url:botUrl}];
  if (publication.add_donate && settings.donation_url) row.push({text:'Donate',url:settings.donation_url});
  return { inline_keyboard:[row] };
}

async function publicationImage(id:number, env:Env, request:Request): Promise<Response> {
  const row = await env.DB.prepare('SELECT image_key,image_mime FROM publications WHERE id=?').bind(id).first<{image_key:string|null;image_mime:string|null}>();
  if (!row?.image_key) return new Response('Not found',{status:404});
  const object = await env.COVERS.get(row.image_key,{onlyIf:request.headers});
  if (!object) return new Response('Not found',{status:404});
  const headers = new Headers(); object.writeHttpMetadata(headers); headers.set('etag',object.httpEtag); headers.set('cache-control','public,max-age=300,stale-while-revalidate=86400');
  if (row.image_mime) headers.set('content-type',row.image_mime);
  return new Response('body' in object ? object.body : undefined,{status:'body' in object?200:304,headers});
}

async function getPublishSettings(env:Env): Promise<PublishSettings> {
  const rows = await env.DB.prepare(`SELECT key,value FROM app_settings WHERE key IN ('publish_channel_id','discussion_chat_id','donation_url','bot_username')`).all<{key:string;value:string}>();
  const map = Object.fromEntries(rows.results.map(x=>[x.key,x.value]));
  return {
    publish_channel_id:map.publish_channel_id || '', discussion_chat_id:map.discussion_chat_id || '',
    donation_url:map.donation_url || 'https://boosty.to/domnekromanta/single-payment/donation/818248/target?share=target_link',
    bot_username:map.bot_username || 'dollartlbot',
  };
}
async function getPublication(env:Env,id:number): Promise<PublicationRow|null> { return env.DB.prepare('SELECT * FROM publications WHERE id=?').bind(id).first<PublicationRow>(); }
async function getAssets(env:Env,id:number): Promise<AssetRow[]> { return (await env.DB.prepare('SELECT * FROM publication_assets WHERE publication_id=? ORDER BY sort_order,id').bind(id).all<AssetRow>()).results; }
async function getPublicationDetail(env:Env,id:number) { return { publication:await getPublication(env,id), assets:await getAssets(env,id) }; }
async function removePublicationAssets(env:Env,id:number,imageKey:string|null): Promise<void> { const assets=await getAssets(env,id); await Promise.all([...assets.map(a=>env.COVERS.delete(a.r2_key)),...(imageKey?[env.COVERS.delete(imageKey)]:[])]); }
async function r2File(env:Env,key:string,mime:string,name:string): Promise<File> { const object=await env.COVERS.get(key); if(!object)throw new Error(`R2 object missing: ${key}`); return new File([await object.arrayBuffer()],name,{type:mime}); }
function field(form:FormData,name:string):string { const v=form.get(name); return typeof v==='string'?v.trim():''; }
function flag(form:FormData,name:string,fallback:boolean):number { const v=form.get(name); if(v===null)return fallback?1:0; return v==='1'||v==='true'||v==='on'?1:0; }
function cleanId(v:string):string { return String(v||'').trim().slice(0,120); }
function cleanUrl(v:string):string { const s=String(v||'').trim().slice(0,500); if(!s)return''; try{const u=new URL(s); return /^https?:$/.test(u.protocol)?s:'';}catch{return'';} }
function cleanUsername(v:string):string { return String(v||'').trim().replace(/^@/,'').replace(/[^a-zA-Z0-9_]/g,'').slice(0,32)||'dollartlbot'; }
function normalizeIdString(v:string):string { const s=String(v||'').trim(); return s.startsWith('@')?s:String(Number(s)); }
function normalizeMime(mime:string,name:string):string { const m=(mime||'').split(';')[0].toLowerCase(); if(IMAGE_TYPES.has(m))return m; const ext=name.toLowerCase().split('.').pop(); if(ext==='jpg'||ext==='jpeg')return'image/jpeg'; if(ext==='png')return'image/png'; if(ext==='webp')return'image/webp'; if(ext==='avif')return'image/avif'; return m; }
function extForMime(mime:string):string { if(mime==='image/png')return'png'; if(mime==='image/webp')return'webp'; if(mime==='image/avif')return'avif'; return'jpg'; }
function safeName(name:string):string { return name.replace(/[^a-zA-Z0-9._-]+/g,'_').slice(-120)||'file.bin'; }
async function readJson<T>(request:Request):Promise<T>{try{return await request.json() as T;}catch{return{} as T;}}

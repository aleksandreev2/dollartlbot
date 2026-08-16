import { buildPublicationGateMessage } from './download-gate';
import { authenticateMiniAppRequest, miniAppJson, miniAppJsonError } from './miniapp-auth';
import { getRuntimeSetting, runtimeFlag } from './runtime-settings';
import { escapeHtml, type TelegramClient, type TelegramMessage } from './telegram';

type Publication = {
  id:number; add_bot_comment:number; add_donate:number; discussion_message_id:number|null;
  bot_comment_status:string; published_at:string|null; comments_check_attempts:number;
  telegram_deleted_at:string|null; download_gate_status:string;
};
type Asset = { id:number;file_name:string;mime_type:string|null;r2_key:string;telegram_file_id:string|null;delivery_status:string };

export async function handlePublicationDeliveryAdminRequest(request:Request,env:Env,telegram:TelegramClient):Promise<Response|null>{
  const url=new URL(request.url);
  const match=/^\/api\/app\/admin\/publications\/(\d+)\/check-comments$/.exec(url.pathname);
  if(request.method!=='POST'||!match)return null;
  const auth=await authenticateMiniAppRequest(request,env);
  if(auth instanceof Response)return auth;
  if(!auth.admin)return miniAppJsonError('forbidden','Admin access required.',403);
  const id=Number(match[1]);
  const result=await checkPublicationDelivery(id,env,telegram,true);
  if(!result)return miniAppJsonError('not_found','Публикация не найдена.',404);
  return miniAppJson({ok:true,...result});
}

export async function runPublicationDeliveryMaintenance(env:Env,telegram:TelegramClient,limit=8):Promise<void>{
  const gateEnabled=await runtimeFlag(env,'download_gate_enabled',false);
  const rows=gateEnabled
    ? await env.DB.prepare(`
      SELECT DISTINCT p.id
      FROM publications p
      LEFT JOIN publication_assets a ON a.publication_id=p.id
      WHERE p.status='published'
        AND p.telegram_deleted_at IS NULL
        AND (
          p.comments_check_status IN ('pending','needs_attention')
          OR (p.download_gate_status='legacy' AND a.delivery_status IN ('pending','failed'))
          OR (
            p.download_gate_status<>'legacy'
            AND EXISTS (SELECT 1 FROM publication_assets ax WHERE ax.publication_id=p.id)
            AND p.download_gate_status IN ('disabled','pending','failed')
          )
          OR (
            NOT EXISTS (SELECT 1 FROM publication_assets ax WHERE ax.publication_id=p.id)
            AND p.add_bot_comment=1
            AND p.bot_comment_status IN ('pending','failed')
          )
        )
      ORDER BY COALESCE(p.comments_checked_at,p.published_at,p.created_at) ASC,p.id ASC
      LIMIT ?
    `).bind(limit).all<{id:number}>()
    : await env.DB.prepare(`
      SELECT DISTINCT p.id
      FROM publications p
      LEFT JOIN publication_assets a ON a.publication_id=p.id
      WHERE p.status='published'
        AND p.telegram_deleted_at IS NULL
        AND (
          p.comments_check_status IN ('pending','needs_attention')
          OR (p.add_bot_comment=1 AND p.bot_comment_status IN ('pending','failed'))
          OR a.delivery_status IN ('pending','failed')
        )
      ORDER BY COALESCE(p.comments_checked_at,p.published_at,p.created_at) ASC,p.id ASC
      LIMIT ?
    `).bind(limit).all<{id:number}>();
  for(const row of rows.results){
    try{await checkPublicationDelivery(row.id,env,telegram,false);}catch(error){console.warn(JSON.stringify({event:'publication_delivery_maintenance_failed',publication_id:row.id,error:String(error)}));}
  }
}

export async function deliverPublicationPayload(
  publicationId:number,
  discussionMessageId:number,
  discussionId:string,
  env:Env,
  telegram:TelegramClient,
):Promise<void>{
  const publication=await env.DB.prepare(`
    SELECT id,add_bot_comment,add_donate,discussion_message_id,bot_comment_status,published_at,
           comments_check_attempts,telegram_deleted_at,download_gate_status
    FROM publications WHERE id=?
  `).bind(publicationId).first<Publication>();
  if(!publication||publication.telegram_deleted_at)return;
  const assets=(await env.DB.prepare(`
    SELECT id,file_name,mime_type,r2_key,telegram_file_id,delivery_status
    FROM publication_assets WHERE publication_id=? ORDER BY sort_order,id
  `).bind(publicationId).all<Asset>()).results;

  const gateEnabled=await runtimeFlag(env,'download_gate_enabled',false);
  const useGate=gateEnabled&&assets.length>0&&publication.download_gate_status!=='legacy';
  if(useGate){
    await deliverGateComment(publication,discussionMessageId,discussionId,env,telegram);
    await finalize(publicationId,env,true);
    return;
  }

  for(const asset of assets){
    if(asset.delivery_status==='sent')continue;
    const attemptAt=new Date().toISOString();
    await env.DB.prepare(`UPDATE publication_assets SET delivery_attempts=delivery_attempts+1,last_delivery_attempt_at=?,delivery_error=NULL WHERE id=?`).bind(attemptAt,asset.id).run();
    try{
      let sent:TelegramMessage;
      if(asset.telegram_file_id){
        sent=await telegram.sendDocument(discussionId,asset.telegram_file_id,undefined,{reply_to_message_id:discussionMessageId});
      }else{
        const object=await env.COVERS.get(asset.r2_key);
        if(!object)throw new Error(`R2 object missing: ${asset.r2_key}`);
        const file=new File([await object.arrayBuffer()],asset.file_name,{type:asset.mime_type||'application/octet-stream'});
        sent=await telegram.sendDocumentUpload(discussionId,file,undefined,{reply_to_message_id:discussionMessageId});
      }
      await env.DB.prepare(`UPDATE publication_assets SET delivery_status='sent',delivered_message_id=?,telegram_file_id=COALESCE(?,telegram_file_id),delivery_error=NULL WHERE id=?`)
        .bind(sent.message_id,sent.document?.file_id||null,asset.id).run();
      await log(env,publicationId,'success','comment_file_sent',`Файл подтверждён в комментариях: ${asset.file_name}.`);
    }catch(error){
      const message=friendly(error);
      await env.DB.prepare(`UPDATE publication_assets SET delivery_status='failed',delivery_error=? WHERE id=?`).bind(message.slice(0,1000),asset.id).run();
      await log(env,publicationId,'error','comment_file_failed',`Не удалось доставить файл: ${asset.file_name}.`,String(error));
    }
  }

  await deliverLegacyPromo(publication,discussionMessageId,discussionId,env,telegram);
  await finalize(publicationId,env,false);
}

async function deliverGateComment(
  publication:Publication,
  discussionMessageId:number,
  discussionId:string,
  env:Env,
  telegram:TelegramClient,
):Promise<void>{
  if(publication.download_gate_status==='sent')return;
  await env.DB.prepare(`UPDATE publications SET download_gate_status='pending',download_gate_error=NULL WHERE id=?`)
    .bind(publication.id).run();
  const gate=await buildPublicationGateMessage(env,publication.id);
  if(!gate)return;
  const buttons:Array<{text:string;callback_data:string}>=[{text:'Thank you.',callback_data:`dl:${gate.token}`}];
  if(gate.donate)buttons.push({text:'❤️ Donate',callback_data:`dn:${gate.token}`});
  try{
    const sent=await telegram.sendMessage(discussionId,gate.text,{
      reply_to_message_id:discussionMessageId,
      reply_markup:{inline_keyboard:[buttons]},
    });
    const now=new Date().toISOString();
    const statements=[
      env.DB.prepare(`
        UPDATE publications
        SET download_gate_status='sent',download_gate_message_id=?,download_gate_error=NULL,comments_checked_at=?,updated_at=?
        WHERE id=?
      `).bind(sent.message_id,now,now,publication.id),
    ];
    if(publication.add_bot_comment===1){
      statements.push(env.DB.prepare(`
        UPDATE publications SET bot_comment_status='sent',bot_comment_message_id=?,bot_comment_error=NULL WHERE id=?
      `).bind(sent.message_id,publication.id));
    }else{
      statements.push(env.DB.prepare(`UPDATE publications SET bot_comment_status='disabled' WHERE id=?`).bind(publication.id));
    }
    await env.DB.batch(statements);
    await log(env,publication.id,'success','download_gate_sent','Download gate Dollar TL Bot подтверждён в комментариях.');
  }catch(error){
    const message=friendly(error);
    const statements=[
      env.DB.prepare(`UPDATE publications SET download_gate_status='failed',download_gate_error=? WHERE id=?`)
        .bind(message.slice(0,1000),publication.id),
    ];
    if(publication.add_bot_comment===1){
      statements.push(env.DB.prepare(`UPDATE publications SET bot_comment_status='failed',bot_comment_error=? WHERE id=?`)
        .bind(message.slice(0,1000),publication.id));
    }
    await env.DB.batch(statements).catch(()=>undefined);
    await log(env,publication.id,'error','download_gate_failed','Не удалось отправить download gate.',String(error));
  }
}

async function deliverLegacyPromo(
  publication:Publication,
  discussionMessageId:number,
  discussionId:string,
  env:Env,
  telegram:TelegramClient,
):Promise<void>{
  if(publication.add_bot_comment===1&&publication.bot_comment_status!=='sent'){
    const username=(await getRuntimeSetting(env,'bot_username','dollartlbot'))||'dollartlbot';
    const donation=(await getRuntimeSetting(env,'donation_url'));
    const botUrl=`https://t.me/${username.replace(/^@/,'')}?start=submit`;
    const buttons:Array<{text:string;url:string}>=[{text:'Suggest a Novel',url:botUrl}];
    if(publication.add_donate===1&&donation)buttons.push({text:'Donate',url:donation});
    try{
      const sent=await telegram.sendMessage(discussionId,
        `<b>Need another translation?</b>\nSuggest a novel through <a href="${escapeHtml(botUrl)}">Dollar TL Bot</a>.${publication.add_donate===1&&donation?`\n\n<a href="${escapeHtml(donation)}">Support Dollar TL</a>`:''}`,
        {reply_to_message_id:discussionMessageId,reply_markup:{inline_keyboard:[buttons]}},
      );
      await env.DB.prepare(`UPDATE publications SET bot_comment_status='sent',bot_comment_message_id=?,bot_comment_error=NULL WHERE id=?`).bind(sent.message_id,publication.id).run();
      await log(env,publication.id,'success','bot_comment_sent','Рекламный комментарий Dollar TL Bot подтверждён.');
    }catch(error){
      const message=friendly(error);
      await env.DB.prepare(`UPDATE publications SET bot_comment_status='failed',bot_comment_error=? WHERE id=?`).bind(message.slice(0,1000),publication.id).run();
      await log(env,publication.id,'error','bot_comment_failed','Не удалось отправить рекламный комментарий.',String(error));
    }
  }else if(publication.add_bot_comment===0){
    await env.DB.prepare(`UPDATE publications SET bot_comment_status='disabled' WHERE id=?`).bind(publication.id).run();
  }
}

async function checkPublicationDelivery(id:number,env:Env,telegram:TelegramClient,manual:boolean){
  const p=await env.DB.prepare(`
    SELECT id,add_bot_comment,add_donate,discussion_message_id,bot_comment_status,published_at,
           comments_check_attempts,telegram_deleted_at,download_gate_status
    FROM publications WHERE id=? AND status='published'
  `).bind(id).first<Publication>();
  if(!p)return null;
  if(p.telegram_deleted_at){
    await env.DB.prepare(`UPDATE publications SET comments_check_status='not_required',comments_checked_at=? WHERE id=?`).bind(new Date().toISOString(),id).run();
    return statusPayload(id,env);
  }
  const now=new Date();
  await env.DB.prepare(`UPDATE publications SET comments_check_attempts=comments_check_attempts+1,comments_checked_at=? WHERE id=?`).bind(now.toISOString(),id).run();

  const assetSummary=await env.DB.prepare(`SELECT COUNT(*) total FROM publication_assets WHERE publication_id=?`).bind(id).first<Record<string,number>>();
  const total=Number(assetSummary?.total||0);
  const needsDiscussion=total>0||p.add_bot_comment===1;
  if(!needsDiscussion){
    await env.DB.prepare(`UPDATE publications SET comments_check_status='not_required',comments_checked_at=? WHERE id=?`).bind(now.toISOString(),id).run();
    return statusPayload(id,env);
  }

  if(!p.discussion_message_id){
    const age=p.published_at?now.getTime()-new Date(p.published_at).getTime():0;
    const state=age>5*60_000?'needs_attention':'pending';
    await env.DB.prepare(`UPDATE publications SET comments_check_status=? WHERE id=?`).bind(state,id).run();
    if(manual||state==='needs_attention')await log(env,id,state==='needs_attention'?'warning':'info','discussion_missing',state==='needs_attention'?'Discussion thread не был зафиксирован спустя 5 минут после публикации. Проверьте webhook и linked group.':'Ждём automatic forward Telegram в discussion group.');
    return statusPayload(id,env);
  }

  const discussionId=await linkedDiscussionId(env,telegram);
  if(!discussionId){
    await env.DB.prepare(`UPDATE publications SET comments_check_status='needs_attention' WHERE id=?`).bind(id).run();
    await log(env,id,'warning','discussion_unavailable','Не удалось определить связанную discussion group через Telegram getChat.');
    return statusPayload(id,env);
  }

  await deliverPublicationPayload(id,p.discussion_message_id,String(discussionId),env,telegram);
  return statusPayload(id,env);
}

async function finalize(id:number,env:Env,gateMode:boolean){
  if(gateMode){
    const row=await env.DB.prepare(`
      SELECT add_bot_comment,bot_comment_status,download_gate_status
      FROM publications WHERE id=?
    `).bind(id).first<Record<string,number|string>>();
    if(!row)return;
    const gateOk=String(row.download_gate_status)==='sent';
    const botOk=Number(row.add_bot_comment)===0||String(row.bot_comment_status)==='sent'||String(row.bot_comment_status)==='disabled';
    const complete=gateOk&&botOk;
    await env.DB.prepare(`UPDATE publications SET comments_check_status=?,comments_checked_at=? WHERE id=?`)
      .bind(complete?'complete':'needs_attention',new Date().toISOString(),id).run();
    if(complete)await log(env,id,'success','comments_check_complete','Проверка завершена: download gate готов, публичная отправка файлов отключена.');
    return;
  }

  const row=await env.DB.prepare(`SELECT
    p.add_bot_comment,p.bot_comment_status,
    COUNT(a.id) total,
    SUM(CASE WHEN a.delivery_status='sent' THEN 1 ELSE 0 END) sent,
    SUM(CASE WHEN a.delivery_status='failed' THEN 1 ELSE 0 END) failed
    FROM publications p LEFT JOIN publication_assets a ON a.publication_id=p.id WHERE p.id=? GROUP BY p.id`).bind(id).first<Record<string,number|string>>();
  if(!row)return;
  const total=Number(row.total||0),sent=Number(row.sent||0),failed=Number(row.failed||0);
  const botOk=Number(row.add_bot_comment)===0||String(row.bot_comment_status)==='sent'||String(row.bot_comment_status)==='disabled';
  const complete=sent===total&&failed===0&&botOk;
  await env.DB.prepare(`UPDATE publications SET comments_check_status=?,comments_checked_at=? WHERE id=?`).bind(complete?'complete':'needs_attention',new Date().toISOString(),id).run();
  if(complete)await log(env,id,'success','comments_check_complete',`Проверка завершена: ${sent}/${total} файлов, promo-комментарий ${botOk?'готов':'не готов'}.`);
}

async function statusPayload(id:number,env:Env){
  const p=await env.DB.prepare(`
    SELECT id,status,discussion_message_id,comments_check_status,comments_checked_at,comments_check_attempts,
           bot_comment_status,bot_comment_message_id,bot_comment_error,download_gate_status,download_gate_message_id,
           download_gate_error,telegram_deleted_at
    FROM publications WHERE id=?
  `).bind(id).first<Record<string,unknown>>();
  const assets=await env.DB.prepare(`
    SELECT id,file_name,delivery_status,delivered_message_id,delivery_attempts,last_delivery_attempt_at,
           delivery_error,scan_status,scanned_at,scan_threat_name
    FROM publication_assets WHERE publication_id=? ORDER BY sort_order,id
  `).bind(id).all<Record<string,unknown>>();
  return {publication:p,assets:assets.results};
}

async function linkedDiscussionId(env:Env,telegram:TelegramClient):Promise<number|null>{
  const channel=await getRuntimeSetting(env,'publish_channel_id');if(!channel)return null;
  try{const chat=await telegram.call<{linked_chat_id?:number}>('getChat',{chat_id:normalizeChatId(channel)});return Number(chat.linked_chat_id)||null;}catch{return null;}
}
async function log(env:Env,id:number,level:string,event:string,message:string,details?:string){await env.DB.prepare(`INSERT INTO publication_logs (publication_id,level,event,message,details,created_at) VALUES (?,?,?,?,?,?)`).bind(id,level,event,message,details?.slice(0,1500)||null,new Date().toISOString()).run().catch(()=>undefined);}
function friendly(error:unknown){return (error instanceof Error?error.message:String(error)).replace(/^Telegram\s+\w+\s+failed:\s*/i,'').trim()||'Неизвестная ошибка.';}
function normalizeChatId(v:string):number|string{const s=v.trim();if(/^-?\d+$/.test(s)){const n=Number(s);if(Number.isSafeInteger(n))return n;}return s.startsWith('@')?s:`@${s}`;}

(() => {
  const runtime=window.DTL_RUNTIME;
  const admin=window.DTL_ADMIN;
  if(!runtime?.registerPatcher||!admin?.api)throw new Error('Publication pipeline requires canonical admin runtime.');

  let loading=false,cache=null,routeSeq=0;
  const esc=(value='')=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const ico=name=>`<i data-lucide="${name}" aria-hidden="true"></i>`;
  const isActive=()=>admin.activeRoute?.()==='tools:publications';

  async function install(){
    if(!isActive())return;
    const cards=[...document.querySelectorAll('.admin-publication-card')];if(!cards.length)return;
    if(cache){decorate(cards,cache);return;}
    if(loading)return;loading=true;const seq=++routeSeq;
    try{const data=await admin.api('/api/app/admin/publishing-center/pipeline');if(seq!==routeSeq||!isActive())return;cache=data.pipelines||[];decorate(cards,cache);}
    catch(error){if(error?.name!=='AbortError'&&isActive())admin.toast?.(`Не удалось загрузить цепочку доставки: ${error.message}`,true);}
    finally{loading=false;}
  }

  function decorate(cards,rows){
    const map=new Map(rows.map(row=>[Number(row.id),row]));
    for(const card of cards){
      if(card.querySelector('.publication-pipeline'))continue;
      const id=Number(card.querySelector('[data-check-pub]')?.dataset.checkPub),row=map.get(id);if(!id||!row)continue;
      const host=card.querySelector('.admin-publication-meta')||card.querySelector('.admin-publication-main');if(!host)continue;
      const box=document.createElement('div');box.className='publication-pipeline';box.innerHTML=`${postStep(row)}${commentsStep(row)}${broadcastStep(row)}`;host.after(box);
      box.querySelector('[data-open-broadcasts]')?.addEventListener('click',()=>void admin.open('section:broadcasts'));
    }
    admin.icons?.();
  }

  function postStep(row){
    const published=row.status==='published'&&row.channel_message_id,tone=published?'done':row.status==='failed'?'bad':'pending',text=published?`message #${row.channel_message_id}`:row.status==='failed'?'Ошибка публикации':row.status==='publishing'?'Отправляется':'Черновик';
    return step('send','Telegram post',text,tone);
  }
  function commentsStep(row){
    const files=Number(row.file_count||0),status=String(row.comments_check_status||'pending');
    if(!files&&status==='not_required')return step('message-circle','Comments / files','Не требуются','muted');
    const tone=status==='complete'?'done':status==='needs_attention'?'bad':'pending',text=status==='complete'?`${files} файл(ов) доставлено`:status==='needs_attention'?'Требует проверки':row.discussion_message_id?`thread #${row.discussion_message_id} · проверяем`:'Ждём discussion thread';
    return step('paperclip','Comments / files',text,tone);
  }
  function broadcastStep(row){
    if(Number(row.notify_users)!==1)return step('megaphone','Release broadcast','Отключена','muted');
    const status=String(row.release_broadcast_status||'queued'),sent=Number(row.release_sent_count||0),failed=Number(row.release_failed_count||0),tone=status==='completed'&&failed===0?'done':failed>0||status==='failed'?'bad':'pending';
    const text=row.release_broadcast_id?`#${row.release_broadcast_id} · ${sent} sent${failed?` · ${failed} failed`:''}`:'Ожидает создания';
    return `${step('megaphone','Release broadcast',text,tone)}${failed?'<button type="button" class="publication-pipeline-open" data-open-broadcasts>Открыть рассылки</button>':''}`;
  }
  function step(icon,label,text,tone){return `<div class="publication-pipeline-step ${tone}"><span>${ico(icon)}</span><div><strong>${esc(label)}</strong><small>${esc(text)}</small></div></div>`;}

  document.addEventListener('dtl:adminroutechange',event=>{routeSeq+=1;if(event.detail?.id!=='tools:publications'){cache=null;loading=false;}runtime.schedule();});
  runtime.registerPatcher(install);
  window.DTL_PUBLICATION_PIPELINE=Object.freeze({refresh:()=>{cache=null;return install();}});
})();

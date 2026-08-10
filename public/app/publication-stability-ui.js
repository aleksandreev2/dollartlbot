(() => {
  const runtime=window.DTL_RUNTIME;
  const tg=window.Telegram?.WebApp;
  if(!runtime?.registerPatcher)throw new Error('DTL runtime must load before publication-stability-ui.js');

  let loading=null,cache=null,loadedAt=0;
  const H=()=>({'x-telegram-init-data':tg?.initData||''});
  const esc=(v='')=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const ico=n=>`<i data-lucide="${n}" aria-hidden="true"></i>`;
  const icons=()=>{try{window.lucide?.createIcons?.({attrs:{'stroke-width':1.8,'aria-hidden':'true'}});}catch{}};
  async function api(path,options={}){const r=await fetch(path,{...options,headers:{...H(),...(options.headers||{})},cache:'no-store'});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d?.error?.message||d?.message||`HTTP ${r.status}`);return d;}
  function toast(text,error=false){const host=document.getElementById('toastRegion');if(!host)return;const node=document.createElement('div');node.className=`toast ${error?'error':'success'}`;node.textContent=text;host.append(node);setTimeout(()=>node.remove(),3600);}

  async function data(force=false){if(!force&&cache&&Date.now()-loadedAt<5000)return cache;if(loading)return loading;loading=api('/api/app/admin/publishing').then(d=>{cache=d;loadedAt=Date.now();return d;}).finally(()=>{loading=null;});return loading;}

  function removeDuplicateSection(){
    document.querySelectorAll('[data-admin-tools="publications"]').forEach(node=>node.remove());
  }

  async function install(){
    removeDuplicateSection();
    if(!document.querySelector('.publisher-editor'))return;
    const list=document.querySelector('.admin-publication-list');if(!list)return;
    const d=await data().catch(()=>null);if(!d)return;
    const pubs=d.publications||[],rows=[...list.querySelectorAll(':scope > .publication-row')];
    rows.forEach((row,index)=>decorateRow(row,pubs[index]));
    const buttons=document.querySelector('.publisher-preview .tg-preview-buttons');if(buttons)buttons.hidden=true;
    icons();
  }

  function decorateRow(row,p){
    if(!p)return;row.dataset.publicationId=String(p.id);
    const copy=row.querySelector('.publication-copy');
    if(copy&&!copy.querySelector('.publication-link-meta')&&p.submission_id){const meta=document.createElement('small');meta.className='publication-link-meta';meta.textContent=`Связано с заявкой #${p.submission_id}${p.requester_username_snapshot?` · @${p.requester_username_snapshot}`:''}`;copy.append(meta);}
    if(p.status!=='published')return;
    let actions=row.querySelector('.publication-actions');if(!actions){actions=document.createElement('div');actions.className='publication-actions';row.append(actions);}
    if(p.telegram_deleted_at){if(!actions.querySelector('.publication-deleted-state'))actions.innerHTML=`<span class="publication-deleted-state">${ico('trash-2')} Удалено из Telegram</span>`;return;}
    if(actions.querySelector('[data-stable-pub]'))return;
    actions.insertAdjacentHTML('beforeend',`<button type="button" data-stable-pub="check" title="Проверить комментарии">${ico('file-check-2')}</button><button type="button" data-stable-pub="edit" title="Редактировать текст">${ico('pencil-line')}</button><button type="button" data-stable-pub="delete" title="Удалить из Telegram">${ico('trash-2')}</button>`);
    actions.querySelector('[data-stable-pub="check"]')?.addEventListener('click',()=>check(row,p));
    actions.querySelector('[data-stable-pub="edit"]')?.addEventListener('click',()=>edit(row,p));
    actions.querySelector('[data-stable-pub="delete"]')?.addEventListener('click',()=>removeTelegram(row,p));
  }

  async function check(row,p){try{const d=await api(`/api/app/admin/publications/${p.id}/check-comments`,{method:'POST'});const state=d.publication?.comments_check_status||'unknown',assets=d.assets||[];let box=row.querySelector('.stable-publication-result');if(!box){box=document.createElement('div');box.className='stable-publication-result';row.append(box);}box.innerHTML=`<strong>${state==='complete'?'Файлы и комментарии готовы':state==='pending'?'Ожидаем Telegram discussion thread':'Требует внимания'}</strong>${assets.map(a=>`<span>${a.delivery_status==='sent'?'✓':a.delivery_status==='failed'?'×':'…'} ${esc(a.file_name)}${a.delivery_error?` · ${esc(a.delivery_error)}`:''}</span>`).join('')}`;toast('Проверка публикации выполнена.',state==='needs_attention');}catch(e){toast(e.message,true);}icons();}

  function edit(row,p){
    const existing=row.querySelector('.stable-publication-editor');if(existing){existing.remove();return;}
    const box=document.createElement('div');box.className='stable-publication-editor';box.innerHTML=`<div><strong>${ico('pencil-line')} Основной текст</strong><small>Files / Requested by / CTA добавляются сервером и не пропадут.</small></div><textarea maxlength="700" rows="7">${esc(p.body_html||'')}</textarea><div class="stable-editor-actions"><span>${String(p.body_html||'').length} / 700</span><button type="button" data-cancel>Отмена</button><button type="button" class="primary" data-save>${ico('save')} Сохранить</button></div>`;row.append(box);const ta=box.querySelector('textarea'),count=box.querySelector('.stable-editor-actions span');ta.addEventListener('input',()=>count.textContent=`${ta.value.length} / 700`);box.querySelector('[data-cancel]').addEventListener('click',()=>box.remove());box.querySelector('[data-save]').addEventListener('click',async e=>{const body=ta.value.trim();if(!body)return toast('Текст не может быть пустым.',true);const button=e.currentTarget;button.disabled=true;try{await api(`/api/app/admin/publications/${p.id}/edit`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({body})});p.body_html=body;cache=null;toast('Опубликованный пост обновлён.');box.remove();}catch(err){toast(err.message,true);}finally{button.disabled=false;}});icons();setTimeout(()=>ta.focus(),0);
  }

  async function removeTelegram(row,p){if(!confirm(`Удалить «${p.internal_title}» из Telegram?\n\nЗапись, файлы и журнал останутся в Dollar TL.`))return;try{const d=await api(`/api/app/admin/publications/${p.id}/delete-telegram`,{method:'POST'});p.telegram_deleted_at=d.telegram_deleted_at||new Date().toISOString();cache=null;const actions=row.querySelector('.publication-actions');if(actions)actions.innerHTML=`<span class="publication-deleted-state">${ico('trash-2')} Удалено из Telegram</span>`;toast('Пост удалён из Telegram.');icons();}catch(e){toast(e.message,true);}}

  document.addEventListener('dtl:adminrender',e=>{if(e.detail?.section==='publishing'){cache=null;runtime.schedule();}else removeDuplicateSection();});
  runtime.registerPatcher(()=>{removeDuplicateSection();void install();});
})();

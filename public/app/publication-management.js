(() => {
  const tg=window.Telegram?.WebApp;
  let cache=null,loading=false;
  const H=()=>({'x-telegram-init-data':tg?.initData||''});
  const esc=(v='')=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon=n=>`<i data-lucide="${n}" aria-hidden="true"></i>`;
  function icons(){try{window.lucide?.createIcons?.({attrs:{'stroke-width':1.8,'aria-hidden':'true'}});}catch{}}
  function toast(text,error=false){const r=document.getElementById('toastRegion');if(!r)return;const e=document.createElement('div');e.className=`toast ${error?'error':'success'}`;e.textContent=text;r.append(e);setTimeout(()=>e.remove(),3400);}
  async function api(path,options={}){const r=await fetch(path,{...options,headers:{...H(),...(options.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d?.error?.message||d?.message||`HTTP ${r.status}`);return d;}

  async function data(force=false){if(cache&&!force)return cache;if(loading)return cache||{};loading=true;try{cache=await api('/api/app/admin/publishing');return cache;}finally{loading=false;}}
  async function install(){
    if(!document.querySelector('.admin-publications-v3'))return;
    const d=await data().catch(()=>null);if(!d)return;
    const map=new Map((d.publications||[]).map(x=>[Number(x.id),x]));
    document.querySelectorAll('.admin-publication-card').forEach(card=>{
      const check=card.querySelector('[data-check-pub]'),id=Number(check?.dataset.checkPub),p=map.get(id);
      if(!id||!p||card.dataset.managementReady==='1')return;
      card.dataset.managementReady='1';
      if(p.status!=='published')return;
      const actions=card.querySelector('.admin-publication-actions');if(!actions)return;
      if(p.telegram_deleted_at){card.classList.add('telegram-deleted');actions.insertAdjacentHTML('beforeend',`<span class="telegram-deleted-label">${icon('trash-2')} Удалено из Telegram</span>`);icons();return;}
      const edit=document.createElement('button');edit.type='button';edit.className='publication-edit-button';edit.innerHTML=`${icon('pencil-line')} Редактировать текст`;
      const del=document.createElement('button');del.type='button';del.className='publication-delete-button';del.innerHTML=`${icon('trash-2')} Удалить из Telegram`;
      edit.addEventListener('click',()=>openEditor(card,p));del.addEventListener('click',()=>deleteTelegram(card,p));actions.append(edit,del);
    });icons();
  }
  function openEditor(card,p){
    let box=card.querySelector('.publication-inline-editor');if(box){box.remove();return;}
    box=document.createElement('div');box.className='publication-inline-editor';box.innerHTML=`<div class="publication-editor-head"><strong>${icon('pencil-line')} Редактирование опубликованного поста</strong><span>Изменится текст в Telegram. Изображение, spoiler и комментарии останутся на месте.</span></div><textarea maxlength="700">${esc(p.body_html||'')}</textarea><div class="publication-editor-count">${String(p.body_html||'').length} / 700</div><div class="publication-editor-actions"><button type="button" data-edit-cancel>Отмена</button><button type="button" class="primary" data-edit-save>${icon('save')} Сохранить в Telegram</button></div>`;
    card.querySelector('.admin-publication-main')?.append(box);const ta=box.querySelector('textarea'),count=box.querySelector('.publication-editor-count');ta?.addEventListener('input',()=>count.textContent=`${ta.value.length} / 700`);box.querySelector('[data-edit-cancel]')?.addEventListener('click',()=>box.remove());box.querySelector('[data-edit-save]')?.addEventListener('click',async e=>{const body=ta.value.trim();if(!body)return toast('Текст публикации не может быть пустым.',true);const b=e.currentTarget;b.disabled=true;try{await api(`/api/app/admin/publications/${p.id}/edit`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({body})});p.body_html=body;toast('Пост обновлён в Telegram.');box.remove();cache=null;}catch(err){toast(err.message,true);}finally{b.disabled=false;}});icons();setTimeout(()=>ta?.focus(),0);
  }
  async function deleteTelegram(card,p){
    if(!window.confirm(`Удалить публикацию «${p.internal_title}» из Telegram?\n\nЗапись, вложения и журнал останутся в Dollar TL.`))return;
    const b=card.querySelector('.publication-delete-button');if(b)b.disabled=true;
    try{const d=await api(`/api/app/admin/publications/${p.id}/delete-telegram`,{method:'POST'});p.telegram_deleted_at=d.telegram_deleted_at||new Date().toISOString();card.classList.add('telegram-deleted');card.querySelector('.publication-edit-button')?.remove();b?.remove();const actions=card.querySelector('.admin-publication-actions');actions?.insertAdjacentHTML('beforeend',`<span class="telegram-deleted-label">${icon('trash-2')} Удалено из Telegram</span>`);toast('Пост удалён из Telegram. История сохранена.');cache=null;icons();}catch(err){toast(err.message,true);if(b)b.disabled=false;}
  }
  const root=document.getElementById('viewRoot');if(root)new MutationObserver(()=>queueMicrotask(install)).observe(root,{childList:true,subtree:false});
  document.addEventListener('click',e=>{if(e.target.closest?.('[data-admin-v3="publications"]')){cache=null;setTimeout(install,0);}},true);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();

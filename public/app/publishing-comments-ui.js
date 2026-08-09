(() => {
  const root=document.getElementById('viewRoot');
  function install(){
    const editor=document.querySelector('.publisher-editor');
    if(!editor)return;
    const buttons=document.querySelector('.publisher-preview .tg-preview-buttons');
    if(buttons)buttons.style.display='none';
    let note=document.querySelector('.tg-preview-comments-note');
    if(!note){
      note=document.createElement('div');
      note.className='tg-preview-comments-note';
      note.innerHTML='<span>💬</span><div><strong>Комментарии останутся нативными</strong><small>Кнопки Suggest a Novel и Donate будут отправлены в первый комментарий, поэтому Telegram не скроет кнопку «Комментарии» у поста.</small></div>';
      document.querySelector('.publisher-preview .tg-preview')?.append(note);
    }
    let style=document.getElementById('publishingCommentsUiStyle');
    if(!style){
      style=document.createElement('style');
      style.id='publishingCommentsUiStyle';
      style.textContent='.tg-preview-comments-note{display:flex;gap:8px;align-items:flex-start;margin-top:8px;padding:10px 11px;border:1px solid #dceadd;border-radius:12px;background:#f5fbf6;color:#4c5f50}.tg-preview-comments-note>span{font-size:16px;line-height:1}.tg-preview-comments-note strong{display:block;font-size:10px}.tg-preview-comments-note small{display:block;margin-top:3px;font-size:9px;line-height:1.4;color:#7d897f}.publisher-preview .tg-preview-buttons{display:none!important}';
      document.head.append(style);
    }
  }
  if(root)new MutationObserver(()=>queueMicrotask(install)).observe(root,{childList:true,subtree:false});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();

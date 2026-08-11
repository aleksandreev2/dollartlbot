(() => {
  const app=window.DTL_APP;
  if(!app?.registerView)throw new Error('DTL app core must load before view-admin.js');
  app.registerView('admin',()=>{
    if(!app.state.bootstrap?.user?.is_admin){app.navigate('home',false);return;}
    if(app.state.preview){
      app.viewRoot.innerHTML=`<section class="page"><div class="empty-state surface-card"><div class="empty-icon">⚙</div><h2>${app.escapeHtml(app.tr('adminTitle'))}</h2><p>Admin preview requires Telegram authentication.</p></div></section>`;
      return;
    }
    if(window.DTL_ADMIN?.open)return window.DTL_ADMIN.open('section:overview');
    if(!window.DTL_ADMIN_CONSOLE?.open)throw new Error('Canonical admin console is unavailable.');
    return window.DTL_ADMIN_CONSOLE.open();
  });
})();

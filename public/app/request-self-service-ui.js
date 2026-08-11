(() => {
  const app=window.DTL_APP;
  if(!app?.api)return;
  const {state,escapeHtml}=app;
  const admin=window.DTL_ADMIN;
  const runtime=window.DTL_RUNTIME;
  let mountQueued=false;
  let adminLoadToken=0;
  const adminCache=new Map();

  const COPY={
    en:{manage:'Manage request',actionNeeded:'Action needed',needsInfo:'Dollar TL needs more information before this request can be reviewed.',userReplied:'Your reply is waiting for the team to review it.',ready:'Under review',withdrawn:'Withdrawn · quota returned',edit:'Edit details',replaceRaw:'Replace RAW',message:'Message the team',withdraw:'Withdraw request',thread:'Request conversation',noMessages:'No messages yet.',currentRaw:'Current RAW',save:'Save changes',send:'Send message',detailsUpdated:'Request details updated',rawUpdated:'RAW file replaced',messageSent:'Message sent',withdrawConfirm:'Withdraw this request? Your quota slot will be returned and this cannot be undone from the Mini App.',withdrawnDone:'Request withdrawn and quota returned.',close:'Close',loading:'Loading request…',failed:'Could not load this request.',reviewReply:'Reply from Dollar TL',replyPlaceholder:'Add the information the team asked for…',chooseRaw:'Choose TXT or EPUB',editableHint:'You can change these fields while the request is pending.'},
    ru:{manage:'Управлять заявкой',actionNeeded:'Нужно действие',needsInfo:'Dollar TL нужны дополнительные данные, прежде чем заявку можно будет проверить.',userReplied:'Ваш ответ отправлен и ждёт проверки команды.',ready:'На проверке',withdrawn:'Отозвана · лимит возвращён',edit:'Изменить данные',replaceRaw:'Заменить RAW',message:'Написать команде',withdraw:'Отозвать заявку',thread:'Переписка по заявке',noMessages:'Сообщений пока нет.',currentRaw:'Текущий RAW',save:'Сохранить изменения',send:'Отправить сообщение',detailsUpdated:'Данные заявки обновлены',rawUpdated:'RAW-файл заменён',messageSent:'Сообщение отправлено',withdrawConfirm:'Отозвать эту заявку? Лимит будет возвращён, а отменить действие из Mini App нельзя.',withdrawnDone:'Заявка отозвана, лимит возвращён.',close:'Закрыть',loading:'Загружаем заявку…',failed:'Не удалось загрузить заявку.',reviewReply:'Ответ Dollar TL',replyPlaceholder:'Добавьте данные, которые запросила команда…',chooseRaw:'Выбрать TXT или EPUB',editableHint:'Пока заявка ожидает решения, эти данные можно исправлять.'},
    es:{manage:'Gestionar solicitud',actionNeeded:'Acción necesaria',needsInfo:'Dollar TL necesita más información antes de revisar esta solicitud.',userReplied:'Tu respuesta está esperando revisión.',ready:'En revisión',withdrawn:'Retirada · cupo devuelto',edit:'Editar datos',replaceRaw:'Reemplazar RAW',message:'Escribir al equipo',withdraw:'Retirar solicitud',thread:'Conversación de la solicitud',noMessages:'Aún no hay mensajes.',currentRaw:'RAW actual',save:'Guardar cambios',send:'Enviar mensaje',detailsUpdated:'Solicitud actualizada',rawUpdated:'RAW reemplazado',messageSent:'Mensaje enviado',withdrawConfirm:'¿Retirar esta solicitud? El cupo se devolverá y no podrás deshacerlo desde la Mini App.',withdrawnDone:'Solicitud retirada y cupo devuelto.',close:'Cerrar',loading:'Cargando solicitud…',failed:'No se pudo cargar la solicitud.',reviewReply:'Respuesta de Dollar TL',replyPlaceholder:'Añade la información solicitada…',chooseRaw:'Elegir TXT o EPUB',editableHint:'Puedes corregir estos datos mientras la solicitud esté pendiente.'},
    fil:{manage:'Pamahalaan ang request',actionNeeded:'Kailangan ng aksyon',needsInfo:'Kailangan ng Dollar TL ng dagdag na impormasyon bago ma-review ang request.',userReplied:'Naghihintay ng review ang sagot mo.',ready:'Sinusuri',withdrawn:'Binawi · ibinalik ang quota',edit:'I-edit ang detalye',replaceRaw:'Palitan ang RAW',message:'Mensahe sa team',withdraw:'Bawiin ang request',thread:'Usapan ng request',noMessages:'Wala pang mensahe.',currentRaw:'Kasalukuyang RAW',save:'I-save',send:'Ipadala',detailsUpdated:'Na-update ang request',rawUpdated:'Napalitan ang RAW',messageSent:'Naipadala ang mensahe',withdrawConfirm:'Bawiin ang request? Ibabalik ang quota at hindi ito maibabalik sa Mini App.',withdrawnDone:'Binawi ang request at ibinalik ang quota.',close:'Isara',loading:'Nilo-load ang request…',failed:'Hindi ma-load ang request.',reviewReply:'Sagot ng Dollar TL',replyPlaceholder:'Idagdag ang impormasyong hinihingi…',chooseRaw:'Pumili ng TXT o EPUB',editableHint:'Maaari mong ayusin ang detalye habang pending ang request.'},
    hi:{manage:'अनुरोध प्रबंधित करें',actionNeeded:'कार्रवाई आवश्यक',needsInfo:'इस अनुरोध की समीक्षा से पहले Dollar TL को और जानकारी चाहिए।',userReplied:'आपका जवाब टीम की समीक्षा की प्रतीक्षा में है।',ready:'समीक्षा में',withdrawn:'वापस लिया · कोटा लौटा',edit:'विवरण संपादित करें',replaceRaw:'RAW बदलें',message:'टीम को संदेश',withdraw:'अनुरोध वापस लें',thread:'अनुरोध बातचीत',noMessages:'अभी कोई संदेश नहीं।',currentRaw:'मौजूदा RAW',save:'बदलाव सहेजें',send:'संदेश भेजें',detailsUpdated:'अनुरोध अपडेट हुआ',rawUpdated:'RAW बदला गया',messageSent:'संदेश भेजा गया',withdrawConfirm:'यह अनुरोध वापस लें? कोटा लौट जाएगा और Mini App से इसे पूर्ववत नहीं किया जा सकेगा।',withdrawnDone:'अनुरोध वापस लिया और कोटा लौटा दिया गया।',close:'बंद करें',loading:'अनुरोध लोड हो रहा है…',failed:'अनुरोध लोड नहीं हो सका।',reviewReply:'Dollar TL का जवाब',replyPlaceholder:'मांगी गई जानकारी जोड़ें…',chooseRaw:'TXT या EPUB चुनें',editableHint:'अनुरोध लंबित रहते हुए आप इन विवरणों को सुधार सकते हैं।'},
    pt:{manage:'Gerenciar pedido',actionNeeded:'Ação necessária',needsInfo:'A Dollar TL precisa de mais informações antes de revisar este pedido.',userReplied:'Sua resposta aguarda revisão da equipe.',ready:'Em análise',withdrawn:'Retirado · cota devolvida',edit:'Editar dados',replaceRaw:'Substituir RAW',message:'Falar com a equipe',withdraw:'Retirar pedido',thread:'Conversa do pedido',noMessages:'Ainda não há mensagens.',currentRaw:'RAW atual',save:'Salvar alterações',send:'Enviar mensagem',detailsUpdated:'Pedido atualizado',rawUpdated:'RAW substituído',messageSent:'Mensagem enviada',withdrawConfirm:'Retirar este pedido? A cota será devolvida e a ação não poderá ser desfeita no Mini App.',withdrawnDone:'Pedido retirado e cota devolvida.',close:'Fechar',loading:'Carregando pedido…',failed:'Não foi possível carregar o pedido.',reviewReply:'Resposta da Dollar TL',replyPlaceholder:'Adicione as informações solicitadas…',chooseRaw:'Escolher TXT ou EPUB',editableHint:'Você pode corrigir estes dados enquanto o pedido estiver pendente.'},
    id:{manage:'Kelola permintaan',actionNeeded:'Perlu tindakan',needsInfo:'Dollar TL memerlukan informasi tambahan sebelum permintaan ini ditinjau.',userReplied:'Balasanmu menunggu ditinjau tim.',ready:'Sedang ditinjau',withdrawn:'Ditarik · kuota dikembalikan',edit:'Edit detail',replaceRaw:'Ganti RAW',message:'Pesan ke tim',withdraw:'Tarik permintaan',thread:'Percakapan permintaan',noMessages:'Belum ada pesan.',currentRaw:'RAW saat ini',save:'Simpan perubahan',send:'Kirim pesan',detailsUpdated:'Permintaan diperbarui',rawUpdated:'RAW diganti',messageSent:'Pesan terkirim',withdrawConfirm:'Tarik permintaan ini? Kuota akan dikembalikan dan tindakan ini tidak bisa dibatalkan dari Mini App.',withdrawnDone:'Permintaan ditarik dan kuota dikembalikan.',close:'Tutup',loading:'Memuat permintaan…',failed:'Tidak dapat memuat permintaan.',reviewReply:'Balasan Dollar TL',replyPlaceholder:'Tambahkan informasi yang diminta…',chooseRaw:'Pilih TXT atau EPUB',editableHint:'Kamu bisa memperbaiki detail ini selama permintaan masih pending.'},
    vi:{manage:'Quản lý yêu cầu',actionNeeded:'Cần hành động',needsInfo:'Dollar TL cần thêm thông tin trước khi có thể duyệt yêu cầu này.',userReplied:'Phản hồi của bạn đang chờ đội ngũ xem xét.',ready:'Đang duyệt',withdrawn:'Đã rút · hoàn lượt',edit:'Sửa thông tin',replaceRaw:'Thay RAW',message:'Nhắn cho đội ngũ',withdraw:'Rút yêu cầu',thread:'Trao đổi về yêu cầu',noMessages:'Chưa có tin nhắn.',currentRaw:'RAW hiện tại',save:'Lưu thay đổi',send:'Gửi tin nhắn',detailsUpdated:'Đã cập nhật yêu cầu',rawUpdated:'Đã thay RAW',messageSent:'Đã gửi tin nhắn',withdrawConfirm:'Rút yêu cầu này? Lượt sẽ được hoàn và không thể hoàn tác trong Mini App.',withdrawnDone:'Đã rút yêu cầu và hoàn lượt.',close:'Đóng',loading:'Đang tải yêu cầu…',failed:'Không thể tải yêu cầu.',reviewReply:'Phản hồi từ Dollar TL',replyPlaceholder:'Thêm thông tin đội ngũ yêu cầu…',chooseRaw:'Chọn TXT hoặc EPUB',editableHint:'Bạn có thể sửa các thông tin này khi yêu cầu còn chờ duyệt.'},
    fr:{manage:'Gérer la demande',actionNeeded:'Action requise',needsInfo:'Dollar TL a besoin de précisions avant de pouvoir examiner cette demande.',userReplied:'Votre réponse attend la vérification de l’équipe.',ready:'En révision',withdrawn:'Retirée · quota rendu',edit:'Modifier les détails',replaceRaw:'Remplacer le RAW',message:'Écrire à l’équipe',withdraw:'Retirer la demande',thread:'Conversation de la demande',noMessages:'Aucun message pour le moment.',currentRaw:'RAW actuel',save:'Enregistrer',send:'Envoyer',detailsUpdated:'Demande mise à jour',rawUpdated:'RAW remplacé',messageSent:'Message envoyé',withdrawConfirm:'Retirer cette demande ? Le quota sera rendu et cette action ne pourra pas être annulée dans la Mini App.',withdrawnDone:'Demande retirée et quota rendu.',close:'Fermer',loading:'Chargement de la demande…',failed:'Impossible de charger la demande.',reviewReply:'Réponse de Dollar TL',replyPlaceholder:'Ajoutez les informations demandées…',chooseRaw:'Choisir TXT ou EPUB',editableHint:'Vous pouvez corriger ces informations tant que la demande est en attente.'},
    de:{manage:'Anfrage verwalten',actionNeeded:'Aktion erforderlich',needsInfo:'Dollar TL benötigt weitere Angaben, bevor diese Anfrage geprüft werden kann.',userReplied:'Deine Antwort wartet auf die Prüfung durch das Team.',ready:'In Prüfung',withdrawn:'Zurückgezogen · Kontingent zurück',edit:'Details bearbeiten',replaceRaw:'RAW ersetzen',message:'Team schreiben',withdraw:'Anfrage zurückziehen',thread:'Anfrage-Unterhaltung',noMessages:'Noch keine Nachrichten.',currentRaw:'Aktuelles RAW',save:'Änderungen speichern',send:'Nachricht senden',detailsUpdated:'Anfrage aktualisiert',rawUpdated:'RAW ersetzt',messageSent:'Nachricht gesendet',withdrawConfirm:'Diese Anfrage zurückziehen? Das Kontingent wird zurückgegeben und die Aktion kann in der Mini App nicht rückgängig gemacht werden.',withdrawnDone:'Anfrage zurückgezogen und Kontingent zurückgegeben.',close:'Schließen',loading:'Anfrage wird geladen…',failed:'Anfrage konnte nicht geladen werden.',reviewReply:'Antwort von Dollar TL',replyPlaceholder:'Füge die angeforderten Angaben hinzu…',chooseRaw:'TXT oder EPUB wählen',editableHint:'Solange die Anfrage aussteht, kannst du diese Angaben korrigieren.'},
  };
  const tx=key=>COPY[state.locale]?.[key]||COPY.en[key]||key;
  const icon=name=>`<i data-lucide="${name}" aria-hidden="true"></i>`;
  const icons=()=>{try{window.lucide?.createIcons?.({attrs:{'stroke-width':1.8,'aria-hidden':'true'}});}catch{}};

  function rowState(request){
    if(request?.withdrawn_at)return'withdrawn';
    if(request?.status==='pending'&&request?.review_state==='needs_info')return'needs_info';
    if(request?.status==='pending'&&request?.review_state==='user_replied')return'user_replied';
    return request?.state||request?.status||'pending';
  }

  function patchLocal(request){
    const list=state.bootstrap?.my_requests;
    if(!Array.isArray(list))return;
    const index=list.findIndex(item=>Number(item.id)===Number(request.id));
    if(index<0)return;
    list[index]={...list[index],...request,state:rowState(request)};
  }

  function mountUserActions(){
    if(state.view!=='requests')return;
    const rows=Array.isArray(state.bootstrap?.my_requests)?state.bootstrap.my_requests:[];
    document.querySelectorAll('.request-card[data-novel]').forEach(card=>{
      const id=Number(card.dataset.novel||0);
      const request=rows.find(row=>Number(row.id)===id);
      if(!request)return;
      card.parentElement?.querySelector(`.request-self-service-actions[data-request-id="${id}"]`)?.remove();
      card.querySelector('.request-review-banner')?.remove();
      const status=rowState(request);
      if(status==='needs_info'||status==='user_replied'){
        const target=card.querySelector('.timeline')||card.lastElementChild;
        const banner=document.createElement('div');
        banner.className=`request-review-banner ${status}`;
        banner.innerHTML=`${icon(status==='needs_info'?'circle-alert':'message-circle-reply')}<span><strong>${escapeHtml(status==='needs_info'?tx('actionNeeded'):tx('reviewReply'))}</strong><small>${escapeHtml(status==='needs_info'?tx('needsInfo'):tx('userReplied'))}</small></span>`;
        target?.before(banner);
      }
      if(status==='withdrawn'){
        const target=card.querySelector('.timeline')||card.lastElementChild;
        const label=document.createElement('div');
        label.className='request-review-banner withdrawn';
        label.innerHTML=`${icon('undo-2')}<span><strong>${escapeHtml(tx('withdrawn'))}</strong></span>`;
        target?.before(label);
        return;
      }
      if(!['pending','needs_info','user_replied'].includes(status))return;
      const actions=document.createElement('div');
      actions.className='request-self-service-actions';
      actions.dataset.requestId=String(id);
      actions.innerHTML=`<button type="button" data-manage-request="${id}">${icon('settings-2')}<span>${escapeHtml(tx('manage'))}</span></button>`;
      card.after(actions);
      actions.querySelector('[data-manage-request]')?.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();void openManage(id);});
    });
    icons();
  }

  async function openManage(id){
    if(state.preview){app.toast?.(tx('failed'),'error');return;}
    const show=app.components?.showSheet;
    if(!show)return;
    show(`<div class="request-manage-loading">${icon('loader-circle')}<span>${escapeHtml(tx('loading'))}</span></div>`);
    icons();
    try{
      const data=await app.api(`/api/app/requests/${id}/manage`);
      renderManage(data);
    }catch(error){
      show(`<div class="sheet-title">${escapeHtml(tx('manage'))}</div><div class="request-manage-error">${icon('triangle-alert')}<span>${escapeHtml(error?.message||tx('failed'))}</span></div><div class="sheet-actions"><button class="secondary-button wide-button" type="button" data-close-sheet>${escapeHtml(tx('close'))}</button></div>`);
      app.sheetRoot?.querySelector('[data-close-sheet]')?.addEventListener('click',app.components.closeSheet);
      icons();
    }
  }

  function renderManage(data){
    const request=data?.request||{};
    patchLocal(request);
    const permissions=data?.permissions||{};
    const conversation=Array.isArray(data?.conversation)?data.conversation:[];
    const status=rowState(request);
    const statusTitle=status==='needs_info'?tx('actionNeeded'):status==='user_replied'?tx('reviewReply'):status==='withdrawn'?tx('withdrawn'):tx('ready');
    const statusCopy=status==='needs_info'?tx('needsInfo'):status==='user_replied'?tx('userReplied'):'';
    const thread=conversation.length?conversation.map(message=>`<div class="request-thread-message ${escapeHtml(message.author_role||'system')}"><div><strong>${escapeHtml(message.author_role==='admin'?'Dollar TL':message.author_role==='user'?'You':'Update')}</strong><time>${escapeHtml(formatTime(message.created_at))}</time></div><p>${escapeHtml(message.text||'')}</p></div>`).join(''):`<div class="request-thread-empty">${escapeHtml(tx('noMessages'))}</div>`;
    const editable=Boolean(permissions.edit);
    app.components.showSheet(`<div class="request-manage" data-request-manage="${Number(request.id||0)}">
      <div class="request-manage-head"><div><span class="request-manage-kicker">REQUEST #${Number(request.id||0)}</span><div class="sheet-title">${escapeHtml(request.title||tx('manage'))}</div></div><span class="request-review-state ${status}">${icon(status==='needs_info'?'circle-alert':status==='user_replied'?'message-circle-reply':status==='withdrawn'?'undo-2':'clock-3')}${escapeHtml(statusTitle)}</span></div>
      ${statusCopy?`<div class="request-manage-notice ${status}"><strong>${escapeHtml(statusTitle)}</strong><p>${escapeHtml(statusCopy)}</p></div>`:''}
      <div class="request-manage-summary"><div><span>${escapeHtml(app.tr?.('originalLanguage')||'Original language')}</span><strong>${escapeHtml(request.original_language||'—')}</strong></div><div><span>${escapeHtml(app.tr?.('chapterCount')||'Chapters')}</span><strong>${Number(request.chapter_count||0)}</strong></div><div><span>${escapeHtml(tx('currentRaw'))}</span><strong>${escapeHtml(request.raw_file_name||'RAW')}</strong></div></div>
      ${editable?`<div class="request-manage-actions"><button type="button" data-self-edit>${icon('pencil-line')}<span>${escapeHtml(tx('edit'))}</span></button><button type="button" data-self-raw>${icon('file-up')}<span>${escapeHtml(tx('replaceRaw'))}</span></button><button type="button" data-self-message>${icon('message-square-more')}<span>${escapeHtml(tx('message'))}</span></button></div>`:''}
      ${editable?editForm(request):''}
      ${editable?messageForm():''}
      <section class="request-thread"><div class="request-thread-head">${icon('messages-square')}<strong>${escapeHtml(tx('thread'))}</strong></div>${thread}</section>
      <div class="sheet-actions request-manage-bottom">${permissions.withdraw?`<button class="request-withdraw-button" type="button" data-self-withdraw>${icon('archive-x')}<span>${escapeHtml(tx('withdraw'))}</span></button>`:''}<button class="secondary-button" type="button" data-close-self>${escapeHtml(tx('close'))}</button></div>
    </div>`);
    bindManage(data);
    icons();
  }

  function editForm(request){
    const val=value=>escapeHtml(value??'');
    return `<form class="request-edit-form" data-self-edit-form hidden><p>${escapeHtml(tx('editableHint'))}</p>
      <label><span>${escapeHtml(app.tr?.('novelTitle')||'Title')}</span><input name="title" maxlength="300" value="${val(request.title)}" required></label>
      <div class="request-edit-grid"><label><span>${escapeHtml(app.tr?.('originalLanguage')||'Language')}</span><input name="original_language" maxlength="120" value="${val(request.original_language)}" required></label><label><span>${escapeHtml(app.tr?.('chapterCount')||'Chapters')}</span><input name="chapter_count" type="number" min="1" max="10000000" value="${Number(request.chapter_count||0)}" required></label></div>
      <label><span>${escapeHtml(app.tr?.('publicationStatus')||'Publication status')}</span><select name="publication_status"><option value="ongoing" ${request.publication_status==='ongoing'?'selected':''}>${escapeHtml(app.tr?.('ongoing')||'Ongoing')}</option><option value="completed" ${request.publication_status==='completed'?'selected':''}>${escapeHtml(app.tr?.('completed')||'Completed')}</option></select></label>
      <label><span>${escapeHtml(app.tr?.('originalSourceOptional')||'Original source')}</span><input name="source_url" type="url" maxlength="500" value="${val(request.source_url)}"></label>
      <label><span>${escapeHtml(app.tr?.('genresTags')||'Genres & Tags')}</span><textarea name="genres_tags" maxlength="450" rows="3" required>${val(request.genres_tags)}</textarea></label>
      <label><span>${escapeHtml(app.tr?.('sexualContent')||'Sexual content')}</span><textarea name="sexual_content" maxlength="450" rows="3" required>${val(request.sexual_content)}</textarea></label>
      <label><span>${escapeHtml(app.tr?.('sensitiveContent')||'Sensitive content')}</span><textarea name="sensitive_content" maxlength="450" rows="3" required>${val(request.sensitive_content)}</textarea></label>
      <label><span>${escapeHtml(app.tr?.('additionalNotes')||'Notes')}</span><textarea name="notes" maxlength="450" rows="3">${val(request.notes)}</textarea></label>
      <div class="request-inline-actions"><button class="primary-button" type="submit">${icon('save')}<span>${escapeHtml(tx('save'))}</span></button><button class="secondary-button" type="button" data-self-edit-cancel>${escapeHtml(app.tr?.('cancel')||'Cancel')}</button></div>
    </form>`;
  }

  function messageForm(){return `<form class="request-message-form" data-self-message-form hidden><textarea name="text" maxlength="3000" rows="4" placeholder="${escapeHtml(tx('replyPlaceholder'))}" required></textarea><div class="request-inline-actions"><button class="primary-button" type="submit">${icon('send')}<span>${escapeHtml(tx('send'))}</span></button><button class="secondary-button" type="button" data-self-message-cancel>${escapeHtml(app.tr?.('cancel')||'Cancel')}</button></div></form>`;}

  function bindManage(data){
    const root=app.sheetRoot?.querySelector('[data-request-manage]');
    if(!root)return;
    const id=Number(root.dataset.requestManage||0);
    root.querySelector('[data-close-self]')?.addEventListener('click',app.components.closeSheet);
    const edit=root.querySelector('[data-self-edit-form]');
    const message=root.querySelector('[data-self-message-form]');
    root.querySelector('[data-self-edit]')?.addEventListener('click',()=>{if(edit)edit.hidden=!edit.hidden;if(message)message.hidden=true;});
    root.querySelector('[data-self-message]')?.addEventListener('click',()=>{if(message)message.hidden=!message.hidden;if(edit)edit.hidden=true;});
    root.querySelector('[data-self-edit-cancel]')?.addEventListener('click',()=>{if(edit)edit.hidden=true;});
    root.querySelector('[data-self-message-cancel]')?.addEventListener('click',()=>{if(message)message.hidden=true;});
    edit?.addEventListener('submit',event=>{event.preventDefault();void saveEdit(id,edit);});
    message?.addEventListener('submit',event=>{event.preventDefault();void sendMessage(id,message);});
    root.querySelector('[data-self-raw]')?.addEventListener('click',()=>replaceRaw(id));
    root.querySelector('[data-self-withdraw]')?.addEventListener('click',()=>void withdraw(id));
  }

  async function saveEdit(id,form){
    const submit=form.querySelector('[type="submit"]');if(submit)submit.disabled=true;
    try{
      const fd=new FormData(form);
      const body=Object.fromEntries(fd.entries());body.chapter_count=Number(body.chapter_count||0);
      const data=await app.api(`/api/app/requests/${id}/edit`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
      app.toast?.(tx('detailsUpdated'),'success');renderManage(data);mountUserActions();
    }catch(error){app.toast?.(error?.message||tx('failed'),'error');if(submit)submit.disabled=false;}
  }

  function replaceRaw(id){
    const input=document.createElement('input');input.type='file';input.accept='.txt,.epub,text/plain,application/epub+zip';input.hidden=true;document.body.append(input);
    input.addEventListener('change',async()=>{
      const file=input.files?.[0];if(!file){input.remove();return;}
      try{
        const form=new FormData();form.set('file',file,file.name);
        const data=await app.api(`/api/app/requests/${id}/raw`,{method:'POST',body:form});
        app.toast?.(tx('rawUpdated'),'success');renderManage(data);mountUserActions();
      }catch(error){app.toast?.(error?.message||tx('failed'),'error');}
      finally{input.remove();}
    },{once:true});input.click();
  }

  async function sendMessage(id,form){
    const text=form.querySelector('textarea[name="text"]')?.value.trim()||'';if(!text)return;
    const submit=form.querySelector('[type="submit"]');if(submit)submit.disabled=true;
    try{
      const data=await app.api(`/api/app/requests/${id}/message`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text})});
      app.toast?.(tx('messageSent'),'success');renderManage(data);mountUserActions();
    }catch(error){app.toast?.(error?.message||tx('failed'),'error');if(submit)submit.disabled=false;}
  }

  async function withdraw(id){
    if(!(await confirmAction(tx('withdrawConfirm'))))return;
    try{
      const data=await app.api(`/api/app/requests/${id}/withdraw`,{method:'POST'});patchLocal(data.request||{});app.components.closeSheet?.();app.toast?.(tx('withdrawnDone'),'success');app.render?.();queueMount();
    }catch(error){app.toast?.(error?.message||tx('failed'),'error');}
  }

  function confirmAction(text){
    const tg=app.tg;
    if(typeof tg?.showConfirm==='function')return new Promise(resolve=>{try{tg.showConfirm(text,value=>resolve(Boolean(value)));}catch{resolve(window.confirm(text));}});
    return Promise.resolve(window.confirm(text));
  }

  function formatTime(value){try{return new Intl.DateTimeFormat(state.locale||'en',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(value));}catch{return String(value||'');}}

  function adminRequestId(){return Number(document.querySelector('#adminInboxDetail [data-workflow-advanced]')?.dataset.workflowAdvanced||0);}

  function installAdminReview(){
    if(admin?.activeRoute?.()!=='section:requests')return;
    const id=adminRequestId();if(!id)return;
    const detail=document.getElementById('adminInboxDetail');if(!detail)return;
    let block=detail.querySelector('[data-admin-request-review]');
    if(block?.dataset.adminRequestReview===String(id))return;
    block?.remove();
    block=document.createElement('section');block.className='admin-request-review';block.dataset.adminRequestReview=String(id);block.innerHTML=`<div class="admin-request-review-loading">${icon('loader-circle')} Проверяем состояние…</div>`;
    const quick=detail.querySelector('[data-request-quick-editor]');
    if(quick)quick.after(block);else detail.querySelector('.admin-inbox-detail-head')?.after(block);
    icons();void loadAdminReview(id,block);
  }

  async function loadAdminReview(id,block,force=false){
    const token=++adminLoadToken;
    try{
      const data=!force&&adminCache.has(id)?adminCache.get(id):await admin.api(`/api/app/admin/requests/${id}/review`);
      if(token!==adminLoadToken||!block.isConnected||adminRequestId()!==id)return;
      adminCache.set(id,data);paintAdminReview(id,block,data);
    }catch(error){if(block.isConnected)block.innerHTML=`<div class="admin-request-review-error">${icon('triangle-alert')}<span>${escapeHtml(error?.message||'Не удалось загрузить review-state.')}</span></div>`;icons();}
  }

  function paintAdminReview(id,block,data){
    const request=data?.request||{};const status=request.review_state||'ready';const messages=(data?.conversation||[]).slice(-5);
    const title=status==='needs_info'?'Ждём данные от пользователя':status==='user_replied'?'Пользователь ответил':'Готова к решению';
    const copy=status==='needs_info'?'Accept заблокирован до ответа и проверки данных.':status==='user_replied'?'Проверьте новые данные/RAW/сообщение, затем отметьте информацию проверенной.':'Дополнительных вопросов к пользователю сейчас нет.';
    block.innerHTML=`<div class="admin-request-review-head"><div><span>REVIEW</span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(copy)}</small></div><span class="admin-request-review-state ${status}">${icon(status==='needs_info'?'clock-3':status==='user_replied'?'message-circle-reply':'circle-check')}${escapeHtml(status==='needs_info'?'Needs info':status==='user_replied'?'New reply':'Ready')}</span></div>
      ${messages.length?`<div class="admin-request-thread">${messages.map(item=>`<div class="${escapeHtml(item.author_role||'system')}"><strong>${escapeHtml(item.author_role==='admin'?'Вы':item.author_role==='user'?'Пользователь':'Система')}</strong><span>${escapeHtml(item.text||'')}</span></div>`).join('')}</div>`:''}
      <div class="admin-request-review-actions"><button type="button" data-admin-ask-info>${icon('message-square-plus')}<span>${escapeHtml(status==='needs_info'?'Уточнить ещё':'Запросить данные')}</span></button>${status!=='ready'?`<button type="button" class="ok" data-admin-resolve-info>${icon('check-check')}<span>Информация проверена</span></button>`:''}</div>
      <form data-admin-needs-form hidden><textarea maxlength="3000" rows="4" placeholder="Что именно нужно уточнить у пользователя?" required></textarea><div><button type="submit" class="ok">${icon('send')} Отправить запрос</button><button type="button" data-admin-needs-cancel>Отмена</button></div></form>`;
    const accept=detailAccept();if(accept){accept.disabled=status!=='ready';accept.title=status==='ready'?'':copy;accept.classList.toggle('review-blocked',status!=='ready');}
    const form=block.querySelector('[data-admin-needs-form]');
    block.querySelector('[data-admin-ask-info]')?.addEventListener('click',()=>{form.hidden=false;form.querySelector('textarea')?.focus();});
    block.querySelector('[data-admin-needs-cancel]')?.addEventListener('click',()=>{form.hidden=true;});
    form?.addEventListener('submit',event=>{event.preventDefault();void adminNeedsInfo(id,block,form);});
    block.querySelector('[data-admin-resolve-info]')?.addEventListener('click',()=>void adminResolve(id,block));
    icons();
  }

  function detailAccept(){return document.querySelector('#adminInboxDetail [data-workflow-action="accept"]');}

  async function adminNeedsInfo(id,block,form){
    const text=form.querySelector('textarea')?.value.trim()||'';if(!text)return;
    const submit=form.querySelector('[type="submit"]');if(submit)submit.disabled=true;
    try{const data=await admin.api(`/api/app/admin/requests/${id}/needs-info`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text})});adminCache.set(id,data);paintAdminReview(id,block,data);admin.toast?.('Запрос данных отправлен пользователю.');}
    catch(error){admin.toast?.(error?.message||'Не удалось отправить запрос.',true);if(submit)submit.disabled=false;}
  }

  async function adminResolve(id,block){
    try{const data=await admin.api(`/api/app/admin/requests/${id}/resolve-info`,{method:'POST'});adminCache.set(id,data);paintAdminReview(id,block,data);admin.toast?.('Информация отмечена как проверенная.');}
    catch(error){admin.toast?.(error?.message||'Не удалось обновить review-state.',true);}
  }

  function install(){mountUserActions();installAdminReview();}
  function queueMount(){if(mountQueued)return;mountQueued=true;queueMicrotask(()=>{mountQueued=false;install();});}
  document.addEventListener('dtl:viewrender',queueMount);
  document.addEventListener('dtl:requests',queueMount);
  document.addEventListener('dtl:adminroutechange',queueMount);
  document.addEventListener('click',event=>{if(event.target.closest?.('[data-workflow-request],[data-workflow-advanced]'))setTimeout(queueMount,0);},true);
  if(runtime?.registerPatcher)runtime.registerPatcher(install);
  const observer=new MutationObserver(queueMount);observer.observe(document.body,{childList:true,subtree:true});
  queueMount();
  window.DTL_REQUEST_SELF_SERVICE=Object.freeze({open:openManage,refresh:queueMount});
})();

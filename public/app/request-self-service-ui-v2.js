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
    en:{manage:'Manage request',actionNeeded:'Action needed',needsInfo:'Dollar TL needs more information before this request can be reviewed.',userReplied:'Your reply is waiting for the team to review it.',ready:'Under review',withdrawn:'Withdrawn · quota returned',edit:'Edit details',replaceRaw:'Replace RAW',message:'Message the team',withdraw:'Withdraw request',thread:'Request conversation',noMessages:'No messages yet.',currentRaw:'Current RAW',save:'Save changes',send:'Send message',detailsUpdated:'Request details updated',rawUpdated:'RAW file replaced',messageSent:'Message sent',withdrawConfirm:'Withdraw this request? Your quota slot will be returned and this cannot be undone from the Mini App.',withdrawnDone:'Request withdrawn and quota returned.',close:'Close',loading:'Loading request…',failed:'Could not load this request.',reviewReply:'Reply from Dollar TL',replyPlaceholder:'Add the information the team asked for…',editableHint:'You can change these fields while the request is pending.',you:'You',update:'Update',cancel:'Cancel'},
    ru:{manage:'Управлять заявкой',actionNeeded:'Нужно действие',needsInfo:'Dollar TL нужны дополнительные данные, прежде чем заявку можно будет проверить.',userReplied:'Ваш ответ отправлен и ждёт проверки команды.',ready:'На проверке',withdrawn:'Отозвана · лимит возвращён',edit:'Изменить данные',replaceRaw:'Заменить RAW',message:'Написать команде',withdraw:'Отозвать заявку',thread:'Переписка по заявке',noMessages:'Сообщений пока нет.',currentRaw:'Текущий RAW',save:'Сохранить изменения',send:'Отправить сообщение',detailsUpdated:'Данные заявки обновлены',rawUpdated:'RAW-файл заменён',messageSent:'Сообщение отправлено',withdrawConfirm:'Отозвать эту заявку? Лимит будет возвращён, а отменить действие из Mini App нельзя.',withdrawnDone:'Заявка отозвана, лимит возвращён.',close:'Закрыть',loading:'Загружаем заявку…',failed:'Не удалось загрузить заявку.',reviewReply:'Ответ Dollar TL',replyPlaceholder:'Добавьте данные, которые запросила команда…',editableHint:'Пока заявка ожидает решения, эти данные можно исправлять.',you:'Вы',update:'Обновление',cancel:'Отмена'},
    es:{manage:'Gestionar solicitud',actionNeeded:'Acción necesaria',needsInfo:'Dollar TL necesita más información antes de revisar esta solicitud.',userReplied:'Tu respuesta está esperando revisión.',ready:'En revisión',withdrawn:'Retirada · cupo devuelto',edit:'Editar datos',replaceRaw:'Reemplazar RAW',message:'Escribir al equipo',withdraw:'Retirar solicitud',thread:'Conversación de la solicitud',noMessages:'Aún no hay mensajes.',currentRaw:'RAW actual',save:'Guardar cambios',send:'Enviar mensaje',detailsUpdated:'Solicitud actualizada',rawUpdated:'RAW reemplazado',messageSent:'Mensaje enviado',withdrawConfirm:'¿Retirar esta solicitud? El cupo se devolverá y no podrás deshacerlo desde la Mini App.',withdrawnDone:'Solicitud retirada y cupo devuelto.',close:'Cerrar',loading:'Cargando solicitud…',failed:'No se pudo cargar la solicitud.',reviewReply:'Respuesta de Dollar TL',replyPlaceholder:'Añade la información solicitada…',editableHint:'Puedes corregir estos datos mientras la solicitud esté pendiente.',you:'Tú',update:'Actualización',cancel:'Cancelar'},
    fil:{manage:'Pamahalaan ang request',actionNeeded:'Kailangan ng aksyon',needsInfo:'Kailangan ng Dollar TL ng dagdag na impormasyon bago ma-review ang request.',userReplied:'Naghihintay ng review ang sagot mo.',ready:'Sinusuri',withdrawn:'Binawi · ibinalik ang quota',edit:'I-edit ang detalye',replaceRaw:'Palitan ang RAW',message:'Mensahe sa team',withdraw:'Bawiin ang request',thread:'Usapan ng request',noMessages:'Wala pang mensahe.',currentRaw:'Kasalukuyang RAW',save:'I-save',send:'Ipadala',detailsUpdated:'Na-update ang request',rawUpdated:'Napalitan ang RAW',messageSent:'Naipadala ang mensahe',withdrawConfirm:'Bawiin ang request? Ibabalik ang quota at hindi ito maibabalik sa Mini App.',withdrawnDone:'Binawi ang request at ibinalik ang quota.',close:'Isara',loading:'Nilo-load ang request…',failed:'Hindi ma-load ang request.',reviewReply:'Sagot ng Dollar TL',replyPlaceholder:'Idagdag ang impormasyong hinihingi…',editableHint:'Maaari mong ayusin ang detalye habang pending ang request.',you:'Ikaw',update:'Update',cancel:'Kanselahin'},
    hi:{manage:'अनुरोध प्रबंधित करें',actionNeeded:'कार्रवाई आवश्यक',needsInfo:'इस अनुरोध की समीक्षा से पहले Dollar TL को और जानकारी चाहिए।',userReplied:'आपका जवाब टीम की समीक्षा की प्रतीक्षा में है।',ready:'समीक्षा में',withdrawn:'वापस लिया · कोटा लौटा',edit:'विवरण संपादित करें',replaceRaw:'RAW बदलें',message:'टीम को संदेश',withdraw:'अनुरोध वापस लें',thread:'अनुरोध बातचीत',noMessages:'अभी कोई संदेश नहीं।',currentRaw:'मौजूदा RAW',save:'बदलाव सहेजें',send:'संदेश भेजें',detailsUpdated:'अनुरोध अपडेट हुआ',rawUpdated:'RAW बदला गया',messageSent:'संदेश भेजा गया',withdrawConfirm:'यह अनुरोध वापस लें? कोटा लौट जाएगा और Mini App से इसे पूर्ववत नहीं किया जा सकेगा।',withdrawnDone:'अनुरोध वापस लिया और कोटा लौटा दिया गया।',close:'बंद करें',loading:'अनुरोध लोड हो रहा है…',failed:'अनुरोध लोड नहीं हो सका।',reviewReply:'Dollar TL का जवाब',replyPlaceholder:'मांगी गई जानकारी जोड़ें…',editableHint:'अनुरोध लंबित रहते हुए आप इन विवरणों को सुधार सकते हैं।',you:'आप',update:'अपडेट',cancel:'रद्द करें'},
    pt:{manage:'Gerenciar pedido',actionNeeded:'Ação necessária',needsInfo:'A Dollar TL precisa de mais informações antes de revisar este pedido.',userReplied:'Sua resposta aguarda revisão da equipe.',ready:'Em análise',withdrawn:'Retirado · cota devolvida',edit:'Editar dados',replaceRaw:'Substituir RAW',message:'Falar com a equipe',withdraw:'Retirar pedido',thread:'Conversa do pedido',noMessages:'Ainda não há mensagens.',currentRaw:'RAW atual',save:'Salvar alterações',send:'Enviar mensagem',detailsUpdated:'Pedido atualizado',rawUpdated:'RAW substituído',messageSent:'Mensagem enviada',withdrawConfirm:'Retirar este pedido? A cota será devolvida e a ação não poderá ser desfeita no Mini App.',withdrawnDone:'Pedido retirado e cota devolvida.',close:'Fechar',loading:'Carregando pedido…',failed:'Não foi possível carregar o pedido.',reviewReply:'Resposta da Dollar TL',replyPlaceholder:'Adicione as informações solicitadas…',editableHint:'Você pode corrigir estes dados enquanto o pedido estiver pendente.',you:'Você',update:'Atualização',cancel:'Cancelar'},
    id:{manage:'Kelola permintaan',actionNeeded:'Perlu tindakan',needsInfo:'Dollar TL memerlukan informasi tambahan sebelum permintaan ini ditinjau.',userReplied:'Balasanmu menunggu ditinjau tim.',ready:'Sedang ditinjau',withdrawn:'Ditarik · kuota dikembalikan',edit:'Edit detail',replaceRaw:'Ganti RAW',message:'Pesan ke tim',withdraw:'Tarik permintaan',thread:'Percakapan permintaan',noMessages:'Belum ada pesan.',currentRaw:'RAW saat ini',save:'Simpan perubahan',send:'Kirim pesan',detailsUpdated:'Permintaan diperbarui',rawUpdated:'RAW diganti',messageSent:'Pesan terkirim',withdrawConfirm:'Tarik permintaan ini? Kuota akan dikembalikan dan tindakan ini tidak bisa dibatalkan dari Mini App.',withdrawnDone:'Permintaan ditarik dan kuota dikembalikan.',close:'Tutup',loading:'Memuat permintaan…',failed:'Tidak dapat memuat permintaan.',reviewReply:'Balasan Dollar TL',replyPlaceholder:'Tambahkan informasi yang diminta…',editableHint:'Kamu bisa memperbaiki detail ini selama permintaan masih pending.',you:'Kamu',update:'Pembaruan',cancel:'Batal'},
    vi:{manage:'Quản lý yêu cầu',actionNeeded:'Cần hành động',needsInfo:'Dollar TL cần thêm thông tin trước khi có thể duyệt yêu cầu này.',userReplied:'Phản hồi của bạn đang chờ đội ngũ xem xét.',ready:'Đang duyệt',withdrawn:'Đã rút · hoàn lượt',edit:'Sửa thông tin',replaceRaw:'Thay RAW',message:'Nhắn cho đội ngũ',withdraw:'Rút yêu cầu',thread:'Trao đổi về yêu cầu',noMessages:'Chưa có tin nhắn.',currentRaw:'RAW hiện tại',save:'Lưu thay đổi',send:'Gửi tin nhắn',detailsUpdated:'Đã cập nhật yêu cầu',rawUpdated:'Đã thay RAW',messageSent:'Đã gửi tin nhắn',withdrawConfirm:'Rút yêu cầu này? Lượt sẽ được hoàn và không thể hoàn tác trong Mini App.',withdrawnDone:'Đã rút yêu cầu và hoàn lượt.',close:'Đóng',loading:'Đang tải yêu cầu…',failed:'Không thể tải yêu cầu.',reviewReply:'Phản hồi từ Dollar TL',replyPlaceholder:'Thêm thông tin đội ngũ yêu cầu…',editableHint:'Bạn có thể sửa các thông tin này khi yêu cầu còn chờ duyệt.',you:'Bạn',update:'Cập nhật',cancel:'Hủy'},
    fr:{manage:'Gérer la demande',actionNeeded:'Action requise',needsInfo:'Dollar TL a besoin de précisions avant de pouvoir examiner cette demande.',userReplied:'Votre réponse attend la vérification de l’équipe.',ready:'En révision',withdrawn:'Retirée · quota rendu',edit:'Modifier les détails',replaceRaw:'Remplacer le RAW',message:'Écrire à l’équipe',withdraw:'Retirer la demande',thread:'Conversation de la demande',noMessages:'Aucun message pour le moment.',currentRaw:'RAW actuel',save:'Enregistrer',send:'Envoyer',detailsUpdated:'Demande mise à jour',rawUpdated:'RAW remplacé',messageSent:'Message envoyé',withdrawConfirm:'Retirer cette demande ? Le quota sera rendu et cette action ne pourra pas être annulée dans la Mini App.',withdrawnDone:'Demande retirée et quota rendu.',close:'Fermer',loading:'Chargement de la demande…',failed:'Impossible de charger la demande.',reviewReply:'Réponse de Dollar TL',replyPlaceholder:'Ajoutez les informations demandées…',editableHint:'Vous pouvez corriger ces informations tant que la demande est en attente.',you:'Vous',update:'Mise à jour',cancel:'Annuler'},
    de:{manage:'Anfrage verwalten',actionNeeded:'Aktion erforderlich',needsInfo:'Dollar TL benötigt weitere Angaben, bevor diese Anfrage geprüft werden kann.',userReplied:'Deine Antwort wartet auf die Prüfung durch das Team.',ready:'In Prüfung',withdrawn:'Zurückgezogen · Kontingent zurück',edit:'Details bearbeiten',replaceRaw:'RAW ersetzen',message:'Team schreiben',withdraw:'Anfrage zurückziehen',thread:'Anfrage-Unterhaltung',noMessages:'Noch keine Nachrichten.',currentRaw:'Aktuelles RAW',save:'Änderungen speichern',send:'Nachricht senden',detailsUpdated:'Anfrage aktualisiert',rawUpdated:'RAW ersetzt',messageSent:'Nachricht gesendet',withdrawConfirm:'Diese Anfrage zurückziehen? Das Kontingent wird zurückgegeben und die Aktion kann in der Mini App nicht rückgängig gemacht werden.',withdrawnDone:'Anfrage zurückgezogen und Kontingent zurückgegeben.',close:'Schließen',loading:'Anfrage wird geladen…',failed:'Anfrage konnte nicht geladen werden.',reviewReply:'Antwort von Dollar TL',replyPlaceholder:'Füge die angeforderten Angaben hinzu…',editableHint:'Solange die Anfrage aussteht, kannst du diese Angaben korrigieren.',you:'Du',update:'Update',cancel:'Abbrechen'},
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
    const index=list.findIndex(item=>Number(item.id)===Number(request?.id));
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
      const status=rowState(request);
      const stamp=`${id}:${status}:${request.review_requested_at||''}:${request.updated_at||''}:${state.locale||'en'}`;
      const parent=card.parentElement;
      if(!parent)return;
      const oldBanner=parent.querySelector(`.request-review-banner[data-self-review-for="${id}"]`);
      const oldActions=parent.querySelector(`.request-self-service-actions[data-request-id="${id}"]`);
      const wantsBanner=['needs_info','user_replied','withdrawn'].includes(status);
      const wantsManage=['pending','needs_info','user_replied'].includes(status);
      const stableBanner=!wantsBanner||oldBanner?.dataset.selfServiceStamp===stamp;
      const stableActions=!wantsManage||oldActions?.dataset.selfServiceStamp===stamp;
      if(card.dataset.selfServiceStamp===stamp&&stableBanner&&stableActions)return;
      oldBanner?.remove();oldActions?.remove();
      card.dataset.selfServiceStamp=stamp;
      let anchor=card;
      if(wantsBanner){
        const banner=document.createElement('div');
        banner.className=`request-review-banner ${status}`;
        banner.dataset.selfReviewFor=String(id);
        banner.dataset.selfServiceStamp=stamp;
        if(status==='needs_info')banner.innerHTML=`${icon('circle-alert')}<span><strong>${escapeHtml(tx('actionNeeded'))}</strong><small>${escapeHtml(tx('needsInfo'))}</small></span>`;
        else if(status==='user_replied')banner.innerHTML=`${icon('message-circle-reply')}<span><strong>${escapeHtml(tx('reviewReply'))}</strong><small>${escapeHtml(tx('userReplied'))}</small></span>`;
        else banner.innerHTML=`${icon('undo-2')}<span><strong>${escapeHtml(tx('withdrawn'))}</strong></span>`;
        anchor.insertAdjacentElement('afterend',banner);anchor=banner;
      }
      if(wantsManage){
        const actions=document.createElement('div');
        actions.className='request-self-service-actions';
        actions.dataset.requestId=String(id);
        actions.dataset.selfServiceStamp=stamp;
        actions.innerHTML=`<button type="button" data-manage-request="${id}">${icon('settings-2')}<span>${escapeHtml(tx('manage'))}</span></button>`;
        anchor.insertAdjacentElement('afterend',actions);
        actions.querySelector('[data-manage-request]')?.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();void openManage(id);});
      }
    });
    icons();
  }

  async function openManage(id){
    if(state.preview){app.toast?.(tx('failed'),'error');return;}
    if(!app.components?.showSheet)return;
    app.components.showSheet(`<div class="request-manage-loading">${icon('loader-circle')}<span>${escapeHtml(tx('loading'))}</span></div>`);icons();
    try{renderManage(await app.api(`/api/app/requests/${id}/manage`));}
    catch(error){
      app.components.showSheet(`<div class="sheet-title">${escapeHtml(tx('manage'))}</div><div class="request-manage-error">${icon('triangle-alert')}<span>${escapeHtml(error?.message||tx('failed'))}</span></div><div class="sheet-actions"><button class="secondary-button wide-button" type="button" data-close-self>${escapeHtml(tx('close'))}</button></div>`);
      app.sheetRoot?.querySelector('[data-close-self]')?.addEventListener('click',app.components.closeSheet);icons();
    }
  }

  function renderManage(data){
    const request=data?.request||{};patchLocal(request);
    const permissions=data?.permissions||{};
    const conversation=Array.isArray(data?.conversation)?data.conversation:[];
    const status=rowState(request);
    const statusTitle=status==='needs_info'?tx('actionNeeded'):status==='user_replied'?tx('reviewReply'):status==='withdrawn'?tx('withdrawn'):tx('ready');
    const statusCopy=status==='needs_info'?tx('needsInfo'):status==='user_replied'?tx('userReplied'):'';
    const thread=conversation.length?conversation.map(message=>threadMessage(message)).join(''):`<div class="request-thread-empty">${escapeHtml(tx('noMessages'))}</div>`;
    const editable=Boolean(permissions.edit);
    app.components.showSheet(`<div class="request-manage" data-request-manage="${Number(request.id||0)}">
      <div class="request-manage-head"><div><span class="request-manage-kicker">REQUEST #${Number(request.id||0)}</span><div class="sheet-title">${escapeHtml(request.title||tx('manage'))}</div></div><span class="request-review-state ${status}">${icon(status==='needs_info'?'circle-alert':status==='user_replied'?'message-circle-reply':status==='withdrawn'?'undo-2':'clock-3')}${escapeHtml(statusTitle)}</span></div>
      ${statusCopy?`<div class="request-manage-notice ${status}"><strong>${escapeHtml(statusTitle)}</strong><p>${escapeHtml(statusCopy)}</p></div>`:''}
      <div class="request-manage-summary"><div><span>${escapeHtml(app.tr?.('originalLanguage')||'Original language')}</span><strong>${escapeHtml(request.original_language||'—')}</strong></div><div><span>${escapeHtml(app.tr?.('chapterCount')||'Chapters')}</span><strong>${Number(request.chapter_count||0)}</strong></div><div><span>${escapeHtml(tx('currentRaw'))}</span><strong>${escapeHtml(request.raw_file_name||'RAW')}</strong></div></div>
      ${editable?`<div class="request-manage-actions"><button type="button" data-self-edit>${icon('pencil-line')}<span>${escapeHtml(tx('edit'))}</span></button><button type="button" data-self-raw>${icon('file-up')}<span>${escapeHtml(tx('replaceRaw'))}</span></button><button type="button" data-self-message>${icon('message-square-more')}<span>${escapeHtml(tx('message'))}</span></button></div>${editForm(request)}${messageForm()}`:''}
      <section class="request-thread"><div class="request-thread-head">${icon('messages-square')}<strong>${escapeHtml(tx('thread'))}</strong></div>${thread}</section>
      <div class="sheet-actions request-manage-bottom">${permissions.withdraw?`<button class="request-withdraw-button" type="button" data-self-withdraw>${icon('archive-x')}<span>${escapeHtml(tx('withdraw'))}</span></button>`:''}<button class="secondary-button" type="button" data-close-self>${escapeHtml(tx('close'))}</button></div>
    </div>`);
    bindManage();icons();
  }

  function threadMessage(message){
    const role=message?.author_role||'system';
    const who=role==='admin'?'Dollar TL':role==='user'?tx('you'):tx('update');
    return `<div class="request-thread-message ${escapeHtml(role)}"><div><strong>${escapeHtml(who)}</strong><time>${escapeHtml(formatTime(message?.created_at))}</time></div><p>${escapeHtml(message?.text||'')}</p></div>`;
  }

  function editForm(request){const v=x=>escapeHtml(x??'');return `<form class="request-edit-form" data-self-edit-form hidden><p>${escapeHtml(tx('editableHint'))}</p><label><span>${escapeHtml(app.tr?.('novelTitle')||'Title')}</span><input name="title" maxlength="300" value="${v(request.title)}" required></label><div class="request-edit-grid"><label><span>${escapeHtml(app.tr?.('originalLanguage')||'Language')}</span><input name="original_language" maxlength="120" value="${v(request.original_language)}" required></label><label><span>${escapeHtml(app.tr?.('chapterCount')||'Chapters')}</span><input name="chapter_count" type="number" min="1" max="10000000" value="${Number(request.chapter_count||0)}" required></label></div><label><span>${escapeHtml(app.tr?.('publicationStatus')||'Publication status')}</span><select name="publication_status"><option value="ongoing" ${request.publication_status==='ongoing'?'selected':''}>${escapeHtml(app.tr?.('ongoing')||'Ongoing')}</option><option value="completed" ${request.publication_status==='completed'?'selected':''}>${escapeHtml(app.tr?.('completed')||'Completed')}</option></select></label><label><span>${escapeHtml(app.tr?.('originalSourceOptional')||'Original source')}</span><input name="source_url" type="url" maxlength="500" value="${v(request.source_url)}"></label><label><span>${escapeHtml(app.tr?.('genresTags')||'Genres & Tags')}</span><textarea name="genres_tags" maxlength="450" rows="3" required>${v(request.genres_tags)}</textarea></label><label><span>${escapeHtml(app.tr?.('sexualContent')||'Sexual content')}</span><textarea name="sexual_content" maxlength="450" rows="3" required>${v(request.sexual_content)}</textarea></label><label><span>${escapeHtml(app.tr?.('sensitiveContent')||'Sensitive content')}</span><textarea name="sensitive_content" maxlength="450" rows="3" required>${v(request.sensitive_content)}</textarea></label><label><span>${escapeHtml(app.tr?.('additionalNotes')||'Notes')}</span><textarea name="notes" maxlength="450" rows="3">${v(request.notes)}</textarea></label><div class="request-inline-actions"><button class="primary-button" type="submit">${icon('save')}<span>${escapeHtml(tx('save'))}</span></button><button class="secondary-button" type="button" data-self-edit-cancel>${escapeHtml(tx('cancel'))}</button></div></form>`;}
  function messageForm(){return `<form class="request-message-form" data-self-message-form hidden><textarea name="text" maxlength="3000" rows="4" placeholder="${escapeHtml(tx('replyPlaceholder'))}" required></textarea><div class="request-inline-actions"><button class="primary-button" type="submit">${icon('send')}<span>${escapeHtml(tx('send'))}</span></button><button class="secondary-button" type="button" data-self-message-cancel>${escapeHtml(tx('cancel'))}</button></div></form>`;}

  function bindManage(){
    const root=app.sheetRoot?.querySelector('[data-request-manage]');if(!root)return;
    const id=Number(root.dataset.requestManage||0),edit=root.querySelector('[data-self-edit-form]'),message=root.querySelector('[data-self-message-form]');
    root.querySelector('[data-close-self]')?.addEventListener('click',app.components.closeSheet);
    root.querySelector('[data-self-edit]')?.addEventListener('click',()=>{if(edit)edit.hidden=!edit.hidden;if(message)message.hidden=true;});
    root.querySelector('[data-self-message]')?.addEventListener('click',()=>{if(message)message.hidden=!message.hidden;if(edit)edit.hidden=true;});
    root.querySelector('[data-self-edit-cancel]')?.addEventListener('click',()=>{if(edit)edit.hidden=true;});
    root.querySelector('[data-self-message-cancel]')?.addEventListener('click',()=>{if(message)message.hidden=true;});
    edit?.addEventListener('submit',event=>{event.preventDefault();void saveEdit(id,edit);});
    message?.addEventListener('submit',event=>{event.preventDefault();void sendMessage(id,message);});
    root.querySelector('[data-self-raw]')?.addEventListener('click',()=>replaceRaw(id));
    root.querySelector('[data-self-withdraw]')?.addEventListener('click',()=>void withdraw(id));
  }

  async function saveEdit(id,form){const submit=form.querySelector('[type="submit"]');if(submit)submit.disabled=true;try{const fd=new FormData(form),body=Object.fromEntries(fd.entries());body.chapter_count=Number(body.chapter_count||0);const data=await app.api(`/api/app/requests/${id}/edit`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});app.toast?.(tx('detailsUpdated'),'success');renderManage(data);refreshRequests();}catch(error){app.toast?.(error?.message||tx('failed'),'error');if(submit)submit.disabled=false;}}
  function replaceRaw(id){const input=document.createElement('input');input.type='file';input.accept='.txt,.epub,text/plain,application/epub+zip';input.hidden=true;document.body.append(input);input.addEventListener('change',async()=>{const file=input.files?.[0];if(!file){input.remove();return;}try{const form=new FormData();form.set('file',file,file.name);const data=await app.api(`/api/app/requests/${id}/raw`,{method:'POST',body:form});app.toast?.(tx('rawUpdated'),'success');renderManage(data);refreshRequests();}catch(error){app.toast?.(error?.message||tx('failed'),'error');}finally{input.remove();}},{once:true});input.click();}
  async function sendMessage(id,form){const text=form.querySelector('textarea[name="text"]')?.value.trim()||'';if(!text)return;const submit=form.querySelector('[type="submit"]');if(submit)submit.disabled=true;try{const data=await app.api(`/api/app/requests/${id}/message`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text})});app.toast?.(tx('messageSent'),'success');renderManage(data);refreshRequests();}catch(error){app.toast?.(error?.message||tx('failed'),'error');if(submit)submit.disabled=false;}}
  async function withdraw(id){if(!(await confirmAction(tx('withdrawConfirm'))))return;try{const data=await app.api(`/api/app/requests/${id}/withdraw`,{method:'POST'});patchLocal(data.request||{});app.components.closeSheet?.();app.toast?.(tx('withdrawnDone'),'success');refreshRequests();}catch(error){app.toast?.(error?.message||tx('failed'),'error');}}
  function refreshRequests(){if(state.view==='requests')app.render?.();queueMount();}
  function confirmAction(text){if(typeof app.tg?.showConfirm==='function')return new Promise(resolve=>{try{app.tg.showConfirm(text,value=>resolve(Boolean(value)));}catch{resolve(window.confirm(text));}});return Promise.resolve(window.confirm(text));}
  function formatTime(value){try{return new Intl.DateTimeFormat(state.locale||'en',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(value));}catch{return String(value||'');}}

  function adminRequestId(){return Number(document.querySelector('#adminInboxDetail [data-workflow-advanced]')?.dataset.workflowAdvanced||0);}
  function installAdminReview(){
    if(!admin||admin.activeRoute?.()!=='section:requests')return;
    const id=adminRequestId(),detail=document.getElementById('adminInboxDetail');if(!id||!detail)return;
    const old=detail.querySelector('[data-admin-request-review]');if(old?.dataset.adminRequestReview===String(id))return;old?.remove();
    const block=document.createElement('section');block.className='admin-request-review';block.dataset.adminRequestReview=String(id);block.innerHTML=`<div class="admin-request-review-loading">${icon('loader-circle')} Loading review state…</div>`;
    const quick=detail.querySelector('[data-request-quick-editor]');if(quick)quick.after(block);else detail.querySelector('.admin-inbox-detail-head')?.after(block);icons();void loadAdminReview(id,block);
  }
  async function loadAdminReview(id,block,force=false){const token=++adminLoadToken;try{const data=!force&&adminCache.has(id)?adminCache.get(id):await admin.api(`/api/app/admin/requests/${id}/review`);if(token!==adminLoadToken||!block.isConnected||adminRequestId()!==id)return;adminCache.set(id,data);paintAdminReview(id,block,data);}catch(error){if(block.isConnected)block.innerHTML=`<div class="admin-request-review-error">${icon('triangle-alert')}<span>${escapeHtml(error?.message||'Could not load review state.')}</span></div>`;icons();}}
  function paintAdminReview(id,block,data){
    const request=data?.request||{},status=request.review_state||'ready',messages=(data?.conversation||[]).slice(-5);
    const title=status==='needs_info'?'Waiting for requester':status==='user_replied'?'Requester replied':'Ready for decision';
    const copy=status==='needs_info'?'Accept is locked until the requester replies and the new information is reviewed.':status==='user_replied'?'Review the new details, RAW or message, then mark the information reviewed.':'No unresolved information request.';
    block.innerHTML=`<div class="admin-request-review-head"><div><span>REVIEW</span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(copy)}</small></div><span class="admin-request-review-state ${status}">${icon(status==='needs_info'?'clock-3':status==='user_replied'?'message-circle-reply':'circle-check')}${escapeHtml(status==='needs_info'?'Needs info':status==='user_replied'?'New reply':'Ready')}</span></div>${messages.length?`<div class="admin-request-thread">${messages.map(item=>`<div class="${escapeHtml(item.author_role||'system')}"><strong>${escapeHtml(item.author_role==='admin'?'Admin':item.author_role==='user'?'Requester':'System')}</strong><span>${escapeHtml(item.text||'')}</span></div>`).join('')}</div>`:''}<div class="admin-request-review-actions"><button type="button" data-admin-ask-info>${icon('message-square-plus')}<span>${escapeHtml(status==='needs_info'?'Ask again':'Request info')}</span></button>${status!=='ready'?`<button type="button" class="ok" data-admin-resolve-info>${icon('check-check')}<span>Information reviewed</span></button>`:''}</div><form data-admin-needs-form hidden><textarea maxlength="3000" rows="4" placeholder="What exactly does the requester need to clarify?" required></textarea><div><button type="submit" class="ok">${icon('send')} Send request</button><button type="button" data-admin-needs-cancel>Cancel</button></div></form>`;
    const accept=document.querySelector('#adminInboxDetail [data-workflow-action="accept"]');if(accept){accept.disabled=status!=='ready';accept.title=status==='ready'?'':copy;accept.classList.toggle('review-blocked',status!=='ready');}
    const form=block.querySelector('[data-admin-needs-form]');block.querySelector('[data-admin-ask-info]')?.addEventListener('click',()=>{form.hidden=false;form.querySelector('textarea')?.focus();});block.querySelector('[data-admin-needs-cancel]')?.addEventListener('click',()=>{form.hidden=true;});form?.addEventListener('submit',event=>{event.preventDefault();void adminNeedsInfo(id,block,form);});block.querySelector('[data-admin-resolve-info]')?.addEventListener('click',()=>void adminResolve(id,block));icons();
  }
  async function adminNeedsInfo(id,block,form){const text=form.querySelector('textarea')?.value.trim()||'';if(!text)return;const submit=form.querySelector('[type="submit"]');if(submit)submit.disabled=true;try{const data=await admin.api(`/api/app/admin/requests/${id}/needs-info`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text})});adminCache.set(id,data);paintAdminReview(id,block,data);admin.toast?.('Information request sent.');}catch(error){admin.toast?.(error?.message||'Could not request information.',true);if(submit)submit.disabled=false;}}
  async function adminResolve(id,block){try{const data=await admin.api(`/api/app/admin/requests/${id}/resolve-info`,{method:'POST'});adminCache.set(id,data);paintAdminReview(id,block,data);admin.toast?.('Information marked as reviewed.');}catch(error){admin.toast?.(error?.message||'Could not update review state.',true);}}

  function install(){mountUserActions();installAdminReview();}
  function queueMount(){if(mountQueued)return;mountQueued=true;queueMicrotask(()=>{mountQueued=false;install();});}
  document.addEventListener('dtl:viewrender',queueMount);
  document.addEventListener('dtl:requests',queueMount);
  document.addEventListener('dtl:adminroutechange',queueMount);
  document.addEventListener('click',event=>{if(event.target.closest?.('[data-workflow-request],[data-workflow-advanced]'))setTimeout(queueMount,0);},true);
  runtime?.registerPatcher?.(install);
  queueMount();
  window.DTL_REQUEST_SELF_SERVICE=Object.freeze({open:openManage,refresh:queueMount});
})();

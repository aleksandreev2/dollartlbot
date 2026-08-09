(() => {
  const tg = window.Telegram?.WebApp;
  let data = null;
  let loading = null;
  let pollTimer = null;

  const L = {
    en:{title:'Invite & Earn',sub:'Earn up to +3 bonus requests',hero:'Bring a friend to Dollar TL',copy:'Your link opens the Dollar TL bot first. From there, your friend joins our channel and stays for 7 days. Once verified, you receive +1 bonus novel request. Maximum: +3.',yourLink:'Your referral link',copyBtn:'Copy',share:'Share',copied:'Link copied',invited:'Invited',pending:'Pending',available:'Available',rewards:'Referral rewards',progress:'7-day progress',friend:'Friend joined',day:'Day',daysLeft:'days left',cap:'Maximum +3 referral slots. Referral bonuses add to your monthly allowance without replacing Boosty.',bonus:'Referral bonus',back:'Back',empty:'No active referrals yet. Share your link to invite your first friend.',refresh:'Updated automatically'},
    ru:{title:'Пригласить друзей',sub:'До +3 дополнительных заявок',hero:'Пригласите друга в Dollar TL',copy:'Ваша ссылка сначала открывает бота Dollar TL. Из бота друг вступает в наш канал и остаётся там 7 дней. После проверки вы получаете +1 дополнительную заявку. Максимум — +3.',yourLink:'Ваша реферальная ссылка',copyBtn:'Копировать',share:'Поделиться',copied:'Ссылка скопирована',invited:'Приглашено',pending:'Ожидают',available:'Доступно',rewards:'Реферальные бонусы',progress:'Прогресс 7 дней',friend:'Друг вступил',day:'День',daysLeft:'дн. осталось',cap:'Максимум +3 реферальных слота. Они увеличивают месячную квоту, но не заменяют Boosty.',bonus:'Реферальный бонус',back:'Назад',empty:'Активных приглашений пока нет. Отправьте ссылку первому другу.',refresh:'Обновляется автоматически'},
    es:{title:'Invita y gana',sub:'Hasta +3 solicitudes extra',hero:'Invita a un amigo a Dollar TL',copy:'Tu enlace abre primero el bot de Dollar TL. Desde allí, tu amigo entra en nuestro canal y permanece 7 días. Tras la verificación recibes +1 solicitud extra. Máximo: +3.',yourLink:'Tu enlace de referido',copyBtn:'Copiar',share:'Compartir',copied:'Enlace copiado',invited:'Invitados',pending:'Pendientes',available:'Disponibles',rewards:'Bonos por referidos',progress:'Progreso de 7 días',friend:'Amigo unido',day:'Día',daysLeft:'días restantes',cap:'Máximo +3 espacios de referido. Aumentan tu límite mensual sin sustituir Boosty.',bonus:'Bono por referidos',back:'Atrás',empty:'Todavía no hay referidos activos. Comparte tu enlace con tu primer amigo.',refresh:'Se actualiza automáticamente'},
    fil:{title:'Mag-imbita ng Kaibigan',sub:'Hanggang +3 dagdag na kahilingan',hero:'Mag-imbita ng kaibigan sa Dollar TL',copy:'Bubuksan muna ng link mo ang Dollar TL bot. Mula roon, sasali ang kaibigan mo sa channel at mananatili nang 7 araw. Kapag napatunayan, makakakuha ka ng +1 dagdag na kahilingan. Maximum: +3.',yourLink:'Referral link mo',copyBtn:'Kopyahin',share:'Ibahagi',copied:'Nakopya ang link',invited:'Naimbitahan',pending:'Naghihintay',available:'Magagamit',rewards:'Mga referral bonus',progress:'7-araw na progreso',friend:'Sumali ang kaibigan',day:'Araw',daysLeft:'araw pa',cap:'Maximum +3 referral slots. Dagdag ito sa buwanang quota at hindi kapalit ng Boosty.',bonus:'Referral bonus',back:'Bumalik',empty:'Wala pang aktibong referral. Ibahagi ang link mo sa unang kaibigan.',refresh:'Awtomatikong nag-a-update'},
    hi:{title:'दोस्त आमंत्रित करें',sub:'अधिकतम +3 अतिरिक्त अनुरोध',hero:'दोस्त को Dollar TL में बुलाएँ',copy:'आपका लिंक पहले Dollar TL बॉट खोलेगा। वहाँ से आपका दोस्त हमारे चैनल में जुड़ता है और 7 दिन सदस्य रहता है। सत्यापन के बाद आपको +1 अतिरिक्त उपन्यास अनुरोध मिलता है। अधिकतम: +3।',yourLink:'आपका रेफ़रल लिंक',copyBtn:'कॉपी करें',share:'शेयर करें',copied:'लिंक कॉपी हो गया',invited:'आमंत्रित',pending:'लंबित',available:'उपलब्ध',rewards:'रेफ़रल बोनस',progress:'7 दिन की प्रगति',friend:'दोस्त जुड़ा',day:'दिन',daysLeft:'दिन बाकी',cap:'अधिकतम +3 रेफ़रल स्लॉट। ये आपकी मासिक सीमा बढ़ाते हैं, Boosty की जगह नहीं लेते।',bonus:'रेफ़रल बोनस',back:'वापस',empty:'अभी कोई सक्रिय रेफ़रल नहीं है। अपना लिंक पहले दोस्त के साथ साझा करें।',refresh:'अपने आप अपडेट होता है'},
    pt:{title:'Convide amigos',sub:'Até +3 pedidos extras',hero:'Convide um amigo para o Dollar TL',copy:'Seu link abre primeiro o bot do Dollar TL. A partir dele, seu amigo entra no nosso canal e permanece por 7 dias. Após a verificação, você recebe +1 pedido extra. Máximo: +3.',yourLink:'Seu link de indicação',copyBtn:'Copiar',share:'Compartilhar',copied:'Link copiado',invited:'Convidados',pending:'Pendentes',available:'Disponíveis',rewards:'Bônus de indicação',progress:'Progresso de 7 dias',friend:'Amigo entrou',day:'Dia',daysLeft:'dias restantes',cap:'Máximo +3 bônus de indicação. Eles aumentam sua cota mensal sem substituir o Boosty.',bonus:'Bônus de indicação',back:'Voltar',empty:'Ainda não há indicações ativas. Compartilhe seu link com o primeiro amigo.',refresh:'Atualiza automaticamente'},
    id:{title:'Undang Teman',sub:'Hingga +3 permintaan tambahan',hero:'Undang teman ke Dollar TL',copy:'Tautanmu akan membuka bot Dollar TL terlebih dahulu. Dari sana, temanmu bergabung ke channel dan tetap menjadi anggota selama 7 hari. Setelah diverifikasi, kamu mendapat +1 permintaan tambahan. Maksimum: +3.',yourLink:'Tautan referralmu',copyBtn:'Salin',share:'Bagikan',copied:'Tautan disalin',invited:'Diundang',pending:'Menunggu',available:'Tersedia',rewards:'Bonus referral',progress:'Progres 7 hari',friend:'Teman bergabung',day:'Hari',daysLeft:'hari lagi',cap:'Maksimum +3 slot referral. Bonus menambah kuota bulanan dan tidak menggantikan Boosty.',bonus:'Bonus referral',back:'Kembali',empty:'Belum ada referral aktif. Bagikan tautanmu ke teman pertama.',refresh:'Diperbarui otomatis'},
    vi:{title:'Mời bạn bè',sub:'Tối đa +3 lượt yêu cầu thêm',hero:'Mời một người bạn vào Dollar TL',copy:'Liên kết của bạn sẽ mở bot Dollar TL trước. Từ đó, bạn của bạn tham gia kênh và ở lại 7 ngày. Sau khi xác minh, bạn nhận +1 lượt yêu cầu tiểu thuyết. Tối đa: +3.',yourLink:'Liên kết giới thiệu của bạn',copyBtn:'Sao chép',share:'Chia sẻ',copied:'Đã sao chép liên kết',invited:'Đã mời',pending:'Đang chờ',available:'Khả dụng',rewards:'Thưởng giới thiệu',progress:'Tiến độ 7 ngày',friend:'Bạn đã tham gia',day:'Ngày',daysLeft:'ngày còn lại',cap:'Tối đa +3 lượt giới thiệu. Phần thưởng cộng vào hạn mức tháng và không thay thế Boosty.',bonus:'Thưởng giới thiệu',back:'Quay lại',empty:'Chưa có lượt giới thiệu đang hoạt động. Hãy chia sẻ liên kết với người bạn đầu tiên.',refresh:'Tự động cập nhật'},
    fr:{title:'Inviter des amis',sub:'Jusqu’à +3 demandes bonus',hero:'Invitez un ami sur Dollar TL',copy:'Votre lien ouvre d’abord le bot Dollar TL. Votre ami rejoint ensuite notre canal et y reste 7 jours. Après vérification, vous recevez +1 demande de roman. Maximum : +3.',yourLink:'Votre lien de parrainage',copyBtn:'Copier',share:'Partager',copied:'Lien copié',invited:'Invités',pending:'En attente',available:'Disponibles',rewards:'Bonus de parrainage',progress:'Progression sur 7 jours',friend:'Ami inscrit',day:'Jour',daysLeft:'jours restants',cap:'Maximum +3 bonus de parrainage. Ils augmentent votre quota mensuel sans remplacer Boosty.',bonus:'Bonus de parrainage',back:'Retour',empty:'Aucun parrainage actif pour le moment. Partagez votre lien avec votre premier ami.',refresh:'Mise à jour automatique'},
    de:{title:'Freunde einladen',sub:'Bis zu +3 zusätzliche Anfragen',hero:'Lade einen Freund zu Dollar TL ein',copy:'Dein Link öffnet zuerst den Dollar TL Bot. Von dort tritt dein Freund unserem Kanal bei und bleibt 7 Tage Mitglied. Nach der Prüfung erhältst du +1 zusätzliche Roman-Anfrage. Maximum: +3.',yourLink:'Dein Empfehlungslink',copyBtn:'Kopieren',share:'Teilen',copied:'Link kopiert',invited:'Eingeladen',pending:'Ausstehend',available:'Verfügbar',rewards:'Empfehlungsbonus',progress:'7-Tage-Fortschritt',friend:'Freund beigetreten',day:'Tag',daysLeft:'Tage übrig',cap:'Maximum +3 Empfehlungs-Slots. Sie erhöhen dein Monatskontingent, ersetzen Boosty aber nicht.',bonus:'Empfehlungsbonus',back:'Zurück',empty:'Noch keine aktiven Empfehlungen. Teile deinen Link mit deinem ersten Freund.',refresh:'Wird automatisch aktualisiert'},
  };

  function locale() {
    const lang = (document.documentElement.lang || 'en').toLowerCase();
    if (lang.startsWith('ru')) return 'ru'; if (lang.startsWith('es')) return 'es';
    if (lang.startsWith('fil') || lang.startsWith('tl')) return 'fil'; if (lang.startsWith('hi')) return 'hi';
    if (lang.startsWith('pt')) return 'pt'; if (lang.startsWith('id')) return 'id'; if (lang.startsWith('vi')) return 'vi';
    if (lang.startsWith('fr')) return 'fr'; if (lang.startsWith('de')) return 'de'; return 'en';
  }
  const tr = (key) => L[locale()]?.[key] || L.en[key] || key;

  function makeIcon(name) {
    const i = document.createElement('i');
    i.setAttribute('data-lucide', name);
    i.setAttribute('aria-hidden', 'true');
    return i;
  }

  async function load(force=false) {
    if (force) data = null;
    if (data) return data;
    if (loading) return loading;
    loading = fetch('/api/app/referrals', {
      cache:'no-store',
      headers:{'x-telegram-init-data':tg?.initData || ''},
    })
      .then(async (r) => {
        if (!r.ok) throw new Error('referrals unavailable');
        return r.json();
      })
      .then((value) => { data = value; return value; })
      .catch(() => null)
      .finally(() => { loading = null; });
    return loading;
  }

  async function installAccountRow(root=document) {
    const languageRow = root.querySelector('#languageSetting');
    if (!languageRow || root.querySelector('#referralSetting')) return;
    const info = await load();
    if (!info?.enabled) return;

    const row = document.createElement('button');
    row.type = 'button';
    row.id = 'referralSetting';
    row.className = 'setting-row referral-setting-row';
    row.innerHTML = `<span class="round-icon"></span><span><span class="setting-title">${esc(tr('title'))}</span><span class="setting-sub">${esc(tr('sub'))}</span></span><span class="chevron">›</span>`;
    row.querySelector('.round-icon').appendChild(makeIcon('users-round'));
    languageRow.parentElement?.appendChild(row);
    row.addEventListener('click', openPage);
    refreshIcons();
  }

  async function installBonusStrip(root=document) {
    const card = root.querySelector('.premium-card');
    if (!card || card.querySelector('.referral-bonus-strip')) return;
    const info = await load();
    if (!info?.enabled || !info.quota?.bonus) return;
    const strip = document.createElement('div');
    strip.className = 'referral-bonus-strip';
    strip.innerHTML = `<div class="referral-bonus-copy"><div class="referral-bonus-label">${esc(tr('bonus'))}</div><div class="referral-bonus-caption">+${info.quota.bonus} / ${info.max_bonus}</div></div><div class="referral-quota-numbers"><span class="referral-quota-base">${info.quota.base_limit}</span><span class="referral-quota-new">${info.quota.effective_limit}</span></div>`;
    card.appendChild(strip);
  }

  async function openPage() {
    const info = await load(true);
    if (!info?.enabled) return;
    const root = document.getElementById('viewRoot');
    if (!root) return;
    renderPage(root, info);
    startPolling();
  }

  function renderPage(root, info) {
    const earned = Math.min(info.max_bonus, Number(info.grants_this_month || 0));
    const pending = Array.isArray(info.pending) ? info.pending : [];
    const qualified = Array.isArray(info.qualified) ? info.qualified : [];
    const invited = pending.length + qualified.length;
    const available = Number(info.quota?.available || 0);
    const nodes = Array.from({length:info.max_bonus}, (_,i) => `<div class="referral-reward-node ${i < earned ? 'earned' : ''}"><i data-lucide="${i < earned ? 'sparkles' : 'gift'}"></i><span>+1</span></div>`).join('');
    const progress = pending.length
      ? `<section class="referral-progress-list"><div class="referral-section-title">${esc(tr('progress'))}</div>${pending.map((p) => progressCard(p)).join('')}</section>`
      : `<div class="referral-empty"><i data-lucide="user-round-plus"></i><span>${esc(tr('empty'))}</span></div>`;

    root.innerHTML = `<section class="page referral-page" data-referral-page>
      <div class="referral-page-head">
        <button class="referral-page-back" type="button" id="referralBack" aria-label="${esc(tr('back'))}"><i data-lucide="arrow-left"></i></button>
        <div><h1>${esc(tr('title'))}</h1><p>${esc(tr('sub'))}</p></div>
      </div>

      <section class="referral-page-hero">
        <div class="referral-hero-icon"><i data-lucide="users-round"></i><span class="referral-hero-spark one"></span><span class="referral-hero-spark two"></span></div>
        <div class="referral-hero-title">${esc(tr('hero'))}</div>
        <div class="referral-hero-copy">${esc(tr('copy'))}</div>
        <div class="referral-link-box">
          <div class="referral-link-label">${esc(tr('yourLink'))}</div>
          <div class="referral-link-value">${esc(info.invite_link)}</div>
          <div class="referral-actions"><button class="secondary-button" type="button" id="copyReferral"><i data-lucide="copy"></i>${esc(tr('copyBtn'))}</button><button class="primary-button" type="button" id="shareReferral"><i data-lucide="send"></i>${esc(tr('share'))}</button></div>
        </div>
      </section>

      <section class="referral-quota-card">
        <div class="referral-quota-copy"><span>${esc(tr('bonus'))}</span><strong>+${Number(info.quota?.bonus || 0)} / ${info.max_bonus}</strong></div>
        <div class="referral-quota-numbers referral-page-quota"><span class="referral-quota-base">${Number(info.quota?.base_limit || 0)}</span><span class="referral-quota-new">${Number(info.quota?.effective_limit || 0)}</span></div>
      </section>

      <section class="referral-stats referral-page-stats">
        <div class="referral-stat"><strong data-ref-count="invited" data-value="${invited}">${invited}</strong><span>${esc(tr('invited'))}</span></div>
        <div class="referral-stat"><strong data-ref-count="pending" data-value="${pending.length}">${pending.length}</strong><span>${esc(tr('pending'))}</span></div>
        <div class="referral-stat"><strong data-ref-count="available" data-value="${available}">${available}</strong><span>${esc(tr('available'))}</span></div>
      </section>

      <section class="referral-rewards-section"><div class="referral-section-title">${esc(tr('rewards'))}</div><div class="referral-reward-track">${nodes}</div></section>
      ${progress}
      <div class="referral-page-note"><i data-lucide="shield-check"></i><span>${esc(tr('cap'))}<small>${esc(tr('refresh'))}</small></span></div>
    </section>`;

    root.querySelector('#referralBack')?.addEventListener('click', goBack);
    root.querySelector('#copyReferral')?.addEventListener('click', () => copyLink(info.invite_link));
    root.querySelector('#shareReferral')?.addEventListener('click', () => shareLink(info.invite_link));
    installSwipeBack(root.querySelector('[data-referral-page]'));
    refreshIcons();
    rememberSnapshot(info);
  }

  function updatePage(info) {
    const page = document.querySelector('[data-referral-page]');
    if (!page) return;
    const pending = Array.isArray(info.pending) ? info.pending : [];
    const qualified = Array.isArray(info.qualified) ? info.qualified : [];
    const values = {
      invited: pending.length + qualified.length,
      pending: pending.length,
      available: Number(info.quota?.available || 0),
    };
    for (const [key, value] of Object.entries(values)) {
      const el = page.querySelector(`[data-ref-count="${key}"]`);
      if (el) animateCount(el, value);
    }
    const quotaNew = page.querySelector('.referral-page-quota .referral-quota-new');
    if (quotaNew && Number(quotaNew.textContent) !== Number(info.quota?.effective_limit || 0)) {
      quotaNew.textContent = String(Number(info.quota?.effective_limit || 0));
      quotaNew.classList.remove('quota-bump'); void quotaNew.offsetWidth; quotaNew.classList.add('quota-bump');
    }
    rememberSnapshot(info);
  }

  function animateCount(el, next) {
    const previous = Number(el.dataset.value ?? el.textContent ?? 0);
    if (previous === next) return;
    el.dataset.value = String(next);
    el.innerHTML = `<span class="ref-count-old">${previous}</span><span class="ref-count-new">${next}</span><span class="ref-count-spark s1"></span><span class="ref-count-spark s2"></span>`;
    el.classList.remove('ref-count-changing'); void el.offsetWidth; el.classList.add('ref-count-changing');
    setTimeout(() => { el.textContent = String(next); el.classList.remove('ref-count-changing'); }, 620);
  }

  function rememberSnapshot(info) {
    try {
      localStorage.setItem('dtl-referral-snapshot', JSON.stringify({
        invited:(info.pending?.length || 0)+(info.qualified?.length || 0),
        pending:info.pending?.length || 0,
        bonus:Number(info.quota?.bonus || 0),
      }));
    } catch {}
  }

  function startPolling() {
    stopPolling();
    pollTimer = setInterval(async () => {
      if (!document.querySelector('[data-referral-page]')) { stopPolling(); return; }
      const fresh = await load(true);
      if (fresh?.enabled) updatePage(fresh);
    }, 15000);
  }
  function stopPolling() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }

  function progressCard(p) {
    const progress = Math.max(0, Math.min(1, Number(p.progress || 0)));
    const day = Math.min(7, Math.max(1, Math.floor(progress * 7) + 1));
    const daysLeft = Math.ceil(Number(p.remaining_seconds || 0) / 86400);
    return `<div class="referral-progress-card"><div class="referral-progress-head"><strong>${esc(tr('friend'))}</strong><span>${esc(tr('day'))} ${day} / 7</span></div><div class="referral-mini-track"><div class="referral-mini-fill" style="width:${Math.round(progress*100)}%"></div></div><div class="referral-footnote">${daysLeft} ${esc(tr('daysLeft'))}</div></div>`;
  }

  function goBack() {
    stopPolling();
    const account = document.querySelector('[data-nav="account"]');
    if (account instanceof HTMLElement) account.click();
  }

  function installSwipeBack(page) {
    if (!page) return;
    let sx=0, sy=0, active=false;
    page.addEventListener('pointerdown',(e)=>{ if(e.clientX>34)return; sx=e.clientX; sy=e.clientY; active=true; },{passive:true});
    page.addEventListener('pointerup',(e)=>{ if(!active)return; active=false; const dx=e.clientX-sx, dy=Math.abs(e.clientY-sy); if(dx>72&&dy<55)goBack(); },{passive:true});
  }

  async function copyLink(link) {
    try { await navigator.clipboard.writeText(link); toast(tr('copied')); }
    catch {
      const area = document.createElement('textarea'); area.value=link; document.body.appendChild(area); area.select(); document.execCommand('copy'); area.remove(); toast(tr('copied'));
    }
  }

  function shareLink(link) {
    const url = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent('Dollar TL')}`;
    try { tg?.openTelegramLink(url); } catch { location.href = url; }
  }

  function toast(message) {
    const region = document.getElementById('toastRegion'); if (!region) return;
    const el=document.createElement('div'); el.className='toast success'; el.textContent=message; region.appendChild(el); setTimeout(()=>el.remove(),2400);
  }

  function refreshIcons() { if (window.lucide?.createIcons) window.lucide.createIcons({attrs:{'stroke-width':1.8,'aria-hidden':'true'}}); }
  function esc(v='') { return String(v).replace(/[&<>'"]/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }

  async function patch(root=document) { await Promise.all([installAccountRow(root), installBonusStrip(root)]); }
  let raf=0;
  const schedule=()=>{ if(raf)return; raf=requestAnimationFrame(()=>{raf=0;patch(document);}); };
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true}); else schedule();
})();

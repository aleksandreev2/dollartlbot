(() => {
  const tg = window.Telegram?.WebApp;
  let data = null;
  let loading = null;

  const L = {
    en:{title:'Invite & Earn',sub:'Earn up to +3 bonus requests',hero:'Invite friends to Dollar TL',copy:'When a friend joins through your link and stays in the channel for 7 days, you earn +1 novel request. Maximum: +3 referral slots.',yourLink:'Your invite link',copyBtn:'Copy',share:'Share',copied:'Link copied',earned:'Earned',pending:'Pending',available:'Available',rewards:'Referral rewards',progress:'Referral progress',friend:'Friend joined',day:'Day',daysLeft:'days left',cap:'Maximum +3 referral slots. Bonus requests do not replace Boosty.',bonus:'Referral bonus'},
    ru:{title:'Пригласить и получить бонус',sub:'До +3 дополнительных заявок',hero:'Приглашайте друзей в Dollar TL',copy:'Если друг вступит по вашей ссылке и останется в канале 7 дней, вы получите +1 заявку на новеллу. Максимум — 3 реферальных слота.',yourLink:'Ваша ссылка',copyBtn:'Копировать',share:'Поделиться',copied:'Ссылка скопирована',earned:'Получено',pending:'Ожидают',available:'Доступно',rewards:'Реферальные бонусы',progress:'Прогресс приглашений',friend:'Друг вступил',day:'День',daysLeft:'дн. осталось',cap:'Максимум +3 реферальных слота. Бонусы не заменяют Boosty.',bonus:'Реферальный бонус'},
    es:{title:'Invita y gana',sub:'Hasta +3 solicitudes extra',hero:'Invita amigos a Dollar TL',copy:'Si un amigo entra con tu enlace y permanece 7 días en el canal, ganas +1 solicitud de novela. Máximo: +3 espacios de referido.',yourLink:'Tu enlace',copyBtn:'Copiar',share:'Compartir',copied:'Enlace copiado',earned:'Ganadas',pending:'Pendientes',available:'Disponibles',rewards:'Bonos por referidos',progress:'Progreso',friend:'Amigo unido',day:'Día',daysLeft:'días restantes',cap:'Máximo +3 espacios de referido. No sustituyen Boosty.',bonus:'Bono por referidos'},
    fil:{title:'Mag-imbita at Kumita',sub:'Hanggang +3 bonus requests',hero:'Mag-imbita ng kaibigan sa Dollar TL',copy:'Kapag sumali ang kaibigan gamit ang link mo at nanatili sa channel nang 7 araw, makakakuha ka ng +1 nobela request. Maximum: +3 referral slots.',yourLink:'Invite link mo',copyBtn:'Kopyahin',share:'I-share',copied:'Nakopya ang link',earned:'Nakuha',pending:'Naghihintay',available:'Available',rewards:'Referral rewards',progress:'Referral progress',friend:'Sumali ang kaibigan',day:'Araw',daysLeft:'araw pa',cap:'Maximum +3 referral slots. Hindi nito pinapalitan ang Boosty.',bonus:'Referral bonus'},
    hi:{title:'दोस्त बुलाएँ और बोनस पाएँ',sub:'अधिकतम +3 अतिरिक्त अनुरोध',hero:'दोस्तों को Dollar TL में आमंत्रित करें',copy:'यदि कोई दोस्त आपके लिंक से जुड़कर चैनल में 7 दिन रहता है, तो आपको +1 उपन्यास अनुरोध मिलता है। अधिकतम: +3 रेफ़रल स्लॉट।',yourLink:'आपका आमंत्रण लिंक',copyBtn:'कॉपी करें',share:'शेयर करें',copied:'लिंक कॉपी हो गया',earned:'मिले',pending:'लंबित',available:'उपलब्ध',rewards:'रेफ़रल बोनस',progress:'रेफ़रल प्रगति',friend:'दोस्त जुड़ा',day:'दिन',daysLeft:'दिन बाकी',cap:'अधिकतम +3 रेफ़रल स्लॉट। यह Boosty की जगह नहीं लेता।',bonus:'रेफ़रल बोनस'},
    pt:{title:'Convide e ganhe',sub:'Até +3 pedidos extras',hero:'Convide amigos para o Dollar TL',copy:'Quando um amigo entra pelo seu link e permanece 7 dias no canal, você ganha +1 pedido de novel. Máximo: +3 slots de indicação.',yourLink:'Seu link',copyBtn:'Copiar',share:'Compartilhar',copied:'Link copiado',earned:'Ganhos',pending:'Pendentes',available:'Disponíveis',rewards:'Bônus de indicação',progress:'Progresso',friend:'Amigo entrou',day:'Dia',daysLeft:'dias restantes',cap:'Máximo +3 slots de indicação. Eles não substituem o Boosty.',bonus:'Bônus de indicação'},
    id:{title:'Undang & Dapatkan Bonus',sub:'Hingga +3 permintaan bonus',hero:'Undang teman ke Dollar TL',copy:'Jika teman bergabung lewat tautanmu dan tetap di channel selama 7 hari, kamu mendapat +1 permintaan novel. Maksimum: +3 slot referral.',yourLink:'Tautan undanganmu',copyBtn:'Salin',share:'Bagikan',copied:'Tautan disalin',earned:'Didapat',pending:'Menunggu',available:'Tersedia',rewards:'Bonus referral',progress:'Progres referral',friend:'Teman bergabung',day:'Hari',daysLeft:'hari lagi',cap:'Maksimum +3 slot referral. Bonus ini tidak menggantikan Boosty.',bonus:'Bonus referral'},
    vi:{title:'Mời bạn & Nhận thưởng',sub:'Tối đa +3 lượt yêu cầu',hero:'Mời bạn bè vào Dollar TL',copy:'Khi một người bạn tham gia bằng liên kết của bạn và ở lại kênh 7 ngày, bạn nhận +1 lượt yêu cầu tiểu thuyết. Tối đa: +3 lượt giới thiệu.',yourLink:'Liên kết mời của bạn',copyBtn:'Sao chép',share:'Chia sẻ',copied:'Đã sao chép liên kết',earned:'Đã nhận',pending:'Đang chờ',available:'Khả dụng',rewards:'Thưởng giới thiệu',progress:'Tiến độ giới thiệu',friend:'Bạn đã tham gia',day:'Ngày',daysLeft:'ngày còn lại',cap:'Tối đa +3 lượt giới thiệu. Thưởng này không thay thế Boosty.',bonus:'Thưởng giới thiệu'},
    fr:{title:'Invitez et gagnez',sub:'Jusqu’à +3 demandes bonus',hero:'Invitez des amis sur Dollar TL',copy:'Lorsqu’un ami rejoint via votre lien et reste 7 jours dans le canal, vous gagnez +1 demande de roman. Maximum : +3 bonus de parrainage.',yourLink:'Votre lien',copyBtn:'Copier',share:'Partager',copied:'Lien copié',earned:'Gagnés',pending:'En attente',available:'Disponibles',rewards:'Bonus de parrainage',progress:'Progression',friend:'Ami inscrit',day:'Jour',daysLeft:'jours restants',cap:'Maximum +3 bonus de parrainage. Ils ne remplacent pas Boosty.',bonus:'Bonus de parrainage'},
    de:{title:'Einladen & Bonus erhalten',sub:'Bis zu +3 Bonus-Anfragen',hero:'Freunde zu Dollar TL einladen',copy:'Wenn ein Freund über deinen Link beitritt und 7 Tage im Kanal bleibt, erhältst du +1 Roman-Anfrage. Maximum: +3 Empfehlungs-Slots.',yourLink:'Dein Einladungslink',copyBtn:'Kopieren',share:'Teilen',copied:'Link kopiert',earned:'Verdient',pending:'Ausstehend',available:'Verfügbar',rewards:'Empfehlungsbonus',progress:'Empfehlungsfortschritt',friend:'Freund beigetreten',day:'Tag',daysLeft:'Tage übrig',cap:'Maximum +3 Empfehlungs-Slots. Sie ersetzen Boosty nicht.',bonus:'Empfehlungsbonus'},
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

  async function load() {
    if (data) return data;
    if (loading) return loading;
    loading = fetch('/api/app/referrals', { headers:{'x-telegram-init-data':tg?.initData || ''} })
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
    row.addEventListener('click', openSheet);
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

  async function openSheet() {
    const info = await load();
    if (!info?.enabled) return;
    const root = document.getElementById('sheetRoot');
    if (!root) return;
    const earned = Math.min(info.max_bonus, Number(info.grants_this_month || 0));
    const pending = Array.isArray(info.pending) ? info.pending : [];
    const available = Number(info.quota?.available || 0);
    const nodes = Array.from({length:info.max_bonus}, (_,i) => `<div class="referral-reward-node ${i < earned ? 'earned' : ''}"><i data-lucide="${i < earned ? 'sparkles' : 'gift'}"></i></div>`).join('');
    const progress = pending.length ? `<div class="referral-progress-list"><strong>${esc(tr('progress'))}</strong>${pending.map((p) => progressCard(p)).join('')}</div>` : '';
    root.innerHTML = `<div class="sheet-backdrop" id="referralBackdrop"><div class="bottom-sheet referral-sheet" role="dialog" aria-modal="true"><div class="sheet-handle"></div><div class="sheet-title-row"><i data-lucide="users-round"></i><div class="sheet-title">${esc(tr('title'))}</div></div><div class="referral-hero"><div class="referral-hero-title">${esc(tr('hero'))}</div><div class="referral-hero-copy">${esc(tr('copy'))}</div><div class="referral-link-box"><div class="referral-link-value">${esc(info.invite_link)}</div><div class="referral-actions"><button class="secondary-button" type="button" id="copyReferral"><i data-lucide="copy"></i>${esc(tr('copyBtn'))}</button><button class="primary-button" type="button" id="shareReferral"><i data-lucide="send"></i>${esc(tr('share'))}</button></div></div></div><div class="referral-stats"><div class="referral-stat"><strong>${earned}</strong><span>${esc(tr('earned'))}</span></div><div class="referral-stat"><strong>${pending.length}</strong><span>${esc(tr('pending'))}</span></div><div class="referral-stat"><strong>${available}</strong><span>${esc(tr('available'))}</span></div></div><div class="referral-reward-track">${nodes}</div>${progress}<div class="referral-footnote">${esc(tr('cap'))}</div></div></div>`;
    root.querySelector('#referralBackdrop')?.addEventListener('click', (e) => { if (e.target.id === 'referralBackdrop') root.innerHTML=''; });
    root.querySelector('#copyReferral')?.addEventListener('click', () => copyLink(info.invite_link));
    root.querySelector('#shareReferral')?.addEventListener('click', () => shareLink(info.invite_link));
    refreshIcons();
  }

  function progressCard(p) {
    const progress = Math.max(0, Math.min(1, Number(p.progress || 0)));
    const day = Math.min(7, Math.max(1, Math.floor(progress * 7) + 1));
    const daysLeft = Math.ceil(Number(p.remaining_seconds || 0) / 86400);
    return `<div class="referral-progress-card"><div class="referral-progress-head"><strong>${esc(tr('friend'))}</strong><span>${esc(tr('day'))} ${day} / 7</span></div><div class="referral-mini-track"><div class="referral-mini-fill" style="width:${Math.round(progress*100)}%"></div></div><div class="referral-footnote">${daysLeft} ${esc(tr('daysLeft'))}</div></div>`;
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

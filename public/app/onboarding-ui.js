(() => {
  const tg = window.Telegram?.WebApp;
  if (!tg?.initData) return;

  const COPY = {
    en:{
      next:'Next',back:'Back',enter:'Enter Dollar TL',notAdult:'I am not of legal age',loading:'Preparing Dollar TL…',error:'Could not load the welcome guide. Tap to retry.',retry:'Try again',
      s1t:'Welcome to Dollar TL',s1b:'A clean place to suggest novels, follow the public translation queue and keep every request in one place.',
      s2t:'Smarter submissions',s2b:'Upload TXT or EPUB. We can analyze the file, suggest the original language and chapter count, and use an EPUB cover when available.',
      s3t:'Stay in the loop',s3b:'Track review and translation progress, receive Telegram updates, and invite friends for up to +3 bonus requests.',
      s4t:'Before you continue',s4b:'Dollar TL may contain or discuss adult, sexual, fetish, violent or otherwise sensitive fictional content.',adult:'I confirm that I am of legal age in my country or jurisdiction.',adultHelp:'This is a self-confirmation. Dollar TL does not determine your age or local legal requirements for you.',
    },
    ru:{
      next:'Далее',back:'Назад',enter:'Войти в Dollar TL',notAdult:'Я не достиг(ла) совершеннолетия',loading:'Готовим Dollar TL…',error:'Не удалось загрузить приветствие. Нажмите, чтобы повторить.',retry:'Повторить',
      s1t:'Добро пожаловать в Dollar TL',s1b:'Здесь удобно предлагать новеллы, следить за публичной очередью переводов и хранить все свои заявки в одном месте.',
      s2t:'Умная подача заявки',s2b:'Загрузите TXT или EPUB. Мы попробуем определить язык оригинала и количество глав, а при наличии используем обложку из EPUB.',
      s3t:'Всегда в курсе',s3b:'Следите за проверкой и переводом, получайте уведомления в Telegram и приглашайте друзей — до +3 дополнительных заявок.',
      s4t:'Перед продолжением',s4b:'В Dollar TL могут встречаться или обсуждаться взрослые, сексуальные, фетишистские, жестокие и другие чувствительные темы в художественных произведениях.',adult:'Я подтверждаю, что достиг(ла) возраста совершеннолетия в своей стране или юрисдикции.',adultHelp:'Это самостоятельное подтверждение. Dollar TL не определяет ваш возраст и применимые к вам местные требования.',
    },
    es:{next:'Siguiente',back:'Atrás',enter:'Entrar a Dollar TL',notAdult:'No soy mayor de edad',loading:'Preparando Dollar TL…',error:'No se pudo cargar la bienvenida. Toca para reintentar.',retry:'Reintentar',s1t:'Bienvenido a Dollar TL',s1b:'Un espacio claro para proponer novelas, seguir la cola pública de traducción y tener todas tus solicitudes en un solo lugar.',s2t:'Solicitudes más inteligentes',s2b:'Sube TXT o EPUB. Podemos analizar el archivo, sugerir el idioma original y el número de capítulos y usar la portada del EPUB si existe.',s3t:'Mantente al día',s3b:'Sigue la revisión y la traducción, recibe avisos en Telegram e invita amigos para conseguir hasta +3 solicitudes extra.',s4t:'Antes de continuar',s4b:'Dollar TL puede contener o tratar contenido ficticio adulto, sexual, fetichista, violento u otros temas sensibles.',adult:'Confirmo que soy mayor de edad según las leyes de mi país o jurisdicción.',adultHelp:'Es una confirmación personal. Dollar TL no determina tu edad ni los requisitos legales locales por ti.'},
    fil:{next:'Susunod',back:'Bumalik',enter:'Pumasok sa Dollar TL',notAdult:'Hindi pa ako legal na nasa hustong gulang',loading:'Inihahanda ang Dollar TL…',error:'Hindi ma-load ang welcome guide. I-tap para subukan muli.',retry:'Subukan muli',s1t:'Welcome sa Dollar TL',s1b:'Isang malinaw na lugar para magmungkahi ng nobela, sundan ang public translation queue, at tingnan ang lahat ng kahilingan mo.',s2t:'Mas matalinong pagsusumite',s2b:'Mag-upload ng TXT o EPUB. Maaari naming suriin ang file, imungkahi ang orihinal na wika at dami ng kabanata, at gamitin ang EPUB cover kapag mayroon.',s3t:'Laging updated',s3b:'Sundan ang review at translation progress, tumanggap ng Telegram updates, at mag-imbita ng kaibigan para sa hanggang +3 bonus requests.',s4t:'Bago magpatuloy',s4b:'Maaaring may talakayan ang Dollar TL tungkol sa adult, sexual, fetish, violent, o iba pang sensitibong fictional content.',adult:'Kinukumpirma kong nasa legal na edad ako sa aking bansa o hurisdiksiyon.',adultHelp:'Sariling kumpirmasyon ito. Hindi tinutukoy ng Dollar TL ang edad mo o ang lokal na legal na mga requirement para sa iyo.'},
    hi:{next:'आगे',back:'वापस',enter:'Dollar TL में प्रवेश करें',notAdult:'मैं कानूनी रूप से वयस्क नहीं हूँ',loading:'Dollar TL तैयार हो रहा है…',error:'स्वागत मार्गदर्शिका लोड नहीं हो सकी। फिर प्रयास करने के लिए टैप करें।',retry:'फिर प्रयास करें',s1t:'Dollar TL में आपका स्वागत है',s1b:'उपन्यास सुझाने, सार्वजनिक अनुवाद कतार देखने और अपने सभी अनुरोध एक जगह रखने के लिए साफ और आसान स्थान।',s2t:'स्मार्ट अनुरोध',s2b:'TXT या EPUB अपलोड करें। हम फ़ाइल का विश्लेषण करके मूल भाषा और अध्याय संख्या सुझा सकते हैं तथा उपलब्ध EPUB कवर का उपयोग कर सकते हैं।',s3t:'हमेशा अपडेट रहें',s3b:'समीक्षा और अनुवाद की प्रगति देखें, Telegram सूचनाएँ पाएँ और दोस्तों को आमंत्रित करके अधिकतम +3 अतिरिक्त अनुरोध प्राप्त करें।',s4t:'आगे बढ़ने से पहले',s4b:'Dollar TL में वयस्क, यौन, फेटिश, हिंसक या अन्य संवेदनशील काल्पनिक सामग्री का उल्लेख या चर्चा हो सकती है।',adult:'मैं पुष्टि करता/करती हूँ कि अपने देश या अधिकार-क्षेत्र के अनुसार मैं कानूनी रूप से वयस्क हूँ।',adultHelp:'यह आपकी स्वयं की पुष्टि है। Dollar TL आपकी उम्र या स्थानीय कानूनी आवश्यकताओं का निर्धारण नहीं करता।'},
    pt:{next:'Continuar',back:'Voltar',enter:'Entrar no Dollar TL',notAdult:'Não sou maior de idade',loading:'Preparando o Dollar TL…',error:'Não foi possível carregar a introdução. Toque para tentar novamente.',retry:'Tentar novamente',s1t:'Bem-vindo ao Dollar TL',s1b:'Um lugar simples para sugerir novels, acompanhar a fila pública de tradução e manter todos os seus pedidos juntos.',s2t:'Pedidos mais inteligentes',s2b:'Envie TXT ou EPUB. Podemos analisar o arquivo, sugerir o idioma original e o número de capítulos e usar a capa do EPUB quando houver.',s3t:'Acompanhe tudo',s3b:'Veja o andamento da revisão e da tradução, receba avisos no Telegram e convide amigos para ganhar até +3 pedidos extras.',s4t:'Antes de continuar',s4b:'O Dollar TL pode conter ou discutir conteúdo fictício adulto, sexual, fetichista, violento ou outros temas sensíveis.',adult:'Confirmo que sou maior de idade no meu país ou jurisdição.',adultHelp:'Esta é uma autodeclaração. O Dollar TL não determina sua idade nem as exigências legais locais por você.'},
    id:{next:'Lanjut',back:'Kembali',enter:'Masuk ke Dollar TL',notAdult:'Saya belum cukup umur secara hukum',loading:'Menyiapkan Dollar TL…',error:'Panduan sambutan tidak dapat dimuat. Ketuk untuk mencoba lagi.',retry:'Coba lagi',s1t:'Selamat datang di Dollar TL',s1b:'Tempat yang rapi untuk mengusulkan novel, mengikuti antrean terjemahan publik, dan menyimpan semua permintaanmu dalam satu tempat.',s2t:'Pengajuan yang lebih pintar',s2b:'Unggah TXT atau EPUB. Kami dapat menganalisis file, menyarankan bahasa asli dan jumlah bab, serta memakai sampul EPUB jika tersedia.',s3t:'Selalu terbarui',s3b:'Pantau proses review dan terjemahan, terima notifikasi Telegram, dan undang teman untuk mendapat hingga +3 permintaan bonus.',s4t:'Sebelum melanjutkan',s4b:'Dollar TL dapat memuat atau membahas konten fiksi dewasa, seksual, fetish, kekerasan, atau tema sensitif lainnya.',adult:'Saya mengonfirmasi bahwa saya telah mencapai usia dewasa secara hukum di negara atau yurisdiksi saya.',adultHelp:'Ini adalah konfirmasi mandiri. Dollar TL tidak menentukan usia atau persyaratan hukum lokal untukmu.'},
    vi:{next:'Tiếp tục',back:'Quay lại',enter:'Vào Dollar TL',notAdult:'Tôi chưa đủ tuổi thành niên hợp pháp',loading:'Đang chuẩn bị Dollar TL…',error:'Không thể tải phần hướng dẫn chào mừng. Nhấn để thử lại.',retry:'Thử lại',s1t:'Chào mừng đến Dollar TL',s1b:'Một nơi gọn gàng để đề xuất tiểu thuyết, theo dõi hàng đợi dịch công khai và quản lý mọi yêu cầu của bạn.',s2t:'Gửi yêu cầu thông minh hơn',s2b:'Tải TXT hoặc EPUB. Chúng tôi có thể phân tích tệp, gợi ý ngôn ngữ gốc và số chương, đồng thời dùng bìa EPUB nếu có.',s3t:'Luôn được cập nhật',s3b:'Theo dõi quá trình duyệt và dịch, nhận thông báo Telegram và mời bạn bè để nhận tối đa +3 lượt yêu cầu bổ sung.',s4t:'Trước khi tiếp tục',s4b:'Dollar TL có thể chứa hoặc thảo luận nội dung hư cấu dành cho người lớn, tình dục, fetish, bạo lực hoặc các chủ đề nhạy cảm khác.',adult:'Tôi xác nhận rằng tôi đã đủ tuổi thành niên theo luật tại quốc gia hoặc khu vực pháp lý của mình.',adultHelp:'Đây là xác nhận do bạn tự thực hiện. Dollar TL không xác định tuổi hoặc yêu cầu pháp lý địa phương thay cho bạn.'},
    fr:{next:'Suivant',back:'Retour',enter:'Entrer dans Dollar TL',notAdult:'Je ne suis pas majeur',loading:'Préparation de Dollar TL…',error:'Impossible de charger le guide de bienvenue. Touchez pour réessayer.',retry:'Réessayer',s1t:'Bienvenue sur Dollar TL',s1b:'Un espace clair pour proposer des romans, suivre la file publique de traduction et retrouver toutes vos demandes.',s2t:'Des demandes plus intelligentes',s2b:'Importez un TXT ou un EPUB. Nous pouvons analyser le fichier, suggérer la langue originale et le nombre de chapitres, et utiliser la couverture EPUB si elle existe.',s3t:'Restez informé',s3b:'Suivez la validation et la traduction, recevez des notifications Telegram et invitez des amis pour obtenir jusqu’à +3 demandes bonus.',s4t:'Avant de continuer',s4b:'Dollar TL peut contenir ou évoquer des contenus fictifs adultes, sexuels, fétichistes, violents ou d’autres thèmes sensibles.',adult:'Je confirme être majeur selon les lois de mon pays ou de ma juridiction.',adultHelp:'Il s’agit d’une auto-déclaration. Dollar TL ne détermine pas votre âge ni les exigences légales locales à votre place.'},
    de:{next:'Weiter',back:'Zurück',enter:'Dollar TL öffnen',notAdult:'Ich bin noch nicht volljährig',loading:'Dollar TL wird vorbereitet…',error:'Der Willkommensleitfaden konnte nicht geladen werden. Tippe zum Wiederholen.',retry:'Erneut versuchen',s1t:'Willkommen bei Dollar TL',s1b:'Ein übersichtlicher Ort, um Romane vorzuschlagen, die öffentliche Übersetzungswarteschlange zu verfolgen und alle Anfragen zusammenzuhalten.',s2t:'Intelligentere Einreichungen',s2b:'Lade TXT oder EPUB hoch. Wir können die Datei analysieren, Originalsprache und Kapitelzahl vorschlagen und vorhandene EPUB-Cover verwenden.',s3t:'Immer auf dem Laufenden',s3b:'Verfolge Prüfung und Übersetzung, erhalte Telegram-Benachrichtigungen und lade Freunde für bis zu +3 Bonus-Anfragen ein.',s4t:'Bevor du fortfährst',s4b:'Dollar TL kann fiktionale Inhalte für Erwachsene, sexuelle oder fetischbezogene Inhalte, Gewalt oder andere sensible Themen enthalten oder besprechen.',adult:'Ich bestätige, dass ich in meinem Land oder in meiner Rechtsordnung volljährig bin.',adultHelp:'Dies ist eine Selbstauskunft. Dollar TL bestimmt weder dein Alter noch die für dich geltenden lokalen rechtlichen Anforderungen.'},
  };

  const icons = ['book-open','wand-sparkles','bell-ring','shield-check'];
  const ACCESS_CODES = new Set(['membership_required','access_check_unavailable']);
  const TAP_SELECTOR = '#onboardNext,#onboardBack,[data-onboard-dot],#underageButton,#onboardingRetry,.adult-confirm';
  let current = 0;
  let locale = inferLocale();
  let overlay = null;
  let touchX = 0;
  let touchY = 0;
  let touchTarget = null;
  let initPromise = null;
  let onboardingResolved = false;

  function inferLocale() {
    const raw = String(tg?.initDataUnsafe?.user?.language_code || 'en').toLowerCase();
    const base = raw.split(/[-_]/)[0];
    if (base === 'tl') return 'fil';
    return COPY[base] ? base : 'en';
  }
  const tr = (key) => COPY[locale]?.[key] || COPY.en[key] || key;

  async function init() {
    if (onboardingResolved) return;
    if (window.DTL_APP?.state?.accessLocked) {
      removeOverlay();
      return;
    }
    if (initPromise) return initPromise;
    initPromise = loadOnboarding();
    try {
      await initPromise;
    } finally {
      initPromise = null;
    }
  }

  async function loadOnboarding() {
    showLoading();
    try {
      const response = await fetch('/api/app/onboarding', {cache:'no-store', headers:{'x-telegram-init-data':tg.initData}});
      const info = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (ACCESS_CODES.has(info?.error?.code)) {
          removeOverlay();
          return;
        }
        throw new Error('onboarding unavailable');
      }
      locale = COPY[info.locale] ? info.locale : locale;
      document.documentElement.lang = locale;
      if (!info.required) {
        onboardingResolved = true;
        removeOverlay();
        return;
      }
      current = 0;
      render();
    } catch {
      if (window.DTL_APP?.state?.accessLocked) {
        removeOverlay();
        return;
      }
      showError();
    }
  }

  function ensureOverlay() {
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'dtlOnboarding';
    overlay.className = 'onboarding-overlay';
    overlay.addEventListener('touchstart',onTouchStart,{passive:true,capture:true});
    overlay.addEventListener('touchend',onTouchEnd,{passive:false,capture:true});
    document.body.appendChild(overlay);
    document.body.classList.add('onboarding-active');
    return overlay;
  }

  function showLoading() {
    const el = ensureOverlay();
    el.innerHTML = `<div class="onboarding-loading"><div class="onboarding-loading-mark"><img src="/app/logo.png" alt=""></div><div>${esc(tr('loading'))}</div><span></span></div>`;
  }

  function showError() {
    const el = ensureOverlay();
    el.innerHTML = `<button class="onboarding-error" type="button" id="onboardingRetry"><i data-lucide="refresh-cw"></i><strong>${esc(tr('error'))}</strong><span>${esc(tr('retry'))}</span></button>`;
    el.querySelector('#onboardingRetry')?.addEventListener('click', init);
    refreshIcons();
  }

  function render(direction=1) {
    const el = ensureOverlay();
    const slide = current + 1;
    const final = current === 3;
    const titles = [tr('s1t'),tr('s2t'),tr('s3t'),tr('s4t')];
    const bodies = [tr('s1b'),tr('s2b'),tr('s3b'),tr('s4b')];
    const dots = Array.from({length:4},(_,i)=>`<button type="button" class="onboarding-dot ${i===current?'active':''} ${i<current?'done':''}" data-onboard-dot="${i}" aria-label="${i+1}"></button>`).join('');

    el.innerHTML = `<div class="onboarding-shell">
      <div class="onboarding-brand"><img src="/app/logo.png" alt=""><span>Dollar TL</span></div>
      <div class="onboarding-card onboarding-slide ${direction<0?'from-left':'from-right'}" id="onboardingSlide">
        <div class="onboarding-visual visual-${slide}"><div class="onboarding-orbit"></div><i data-lucide="${icons[current]}"></i><span class="onboarding-spark spark-a"></span><span class="onboarding-spark spark-b"></span></div>
        <div class="onboarding-step">${slide} / 4</div>
        <h1>${esc(titles[current])}</h1>
        <p>${esc(bodies[current])}</p>
        ${final ? `<label class="adult-confirm"><input type="checkbox" id="adultConfirm"><span class="adult-check"><i data-lucide="check"></i></span><span><strong>${esc(tr('adult'))}</strong><small>${esc(tr('adultHelp'))}</small></span></label><button class="onboarding-underage" type="button" id="underageButton">${esc(tr('notAdult'))}</button>` : ''}
      </div>
      <div class="onboarding-controls">
        <button class="onboarding-arrow" type="button" id="onboardBack" ${current===0?'disabled':''} aria-label="${esc(tr('back'))}"><i data-lucide="arrow-left"></i></button>
        <div class="onboarding-dots">${dots}</div>
        <button class="onboarding-arrow primary" type="button" id="onboardNext" ${final?'disabled':''} aria-label="${esc(final?tr('enter'):tr('next'))}"><i data-lucide="${final?'check':'arrow-right'}"></i></button>
      </div>
      <div class="onboarding-action-label">${esc(final?tr('enter'):tr('next'))}</div>
    </div>`;

    el.querySelector('#onboardBack')?.addEventListener('click',()=>move(-1));
    el.querySelector('#onboardNext')?.addEventListener('click',()=> final ? complete() : move(1));
    el.querySelectorAll('[data-onboard-dot]').forEach((dot)=>dot.addEventListener('click',()=>goTo(Number(dot.dataset.onboardDot))));
    const checkbox = el.querySelector('#adultConfirm');
    if (checkbox) checkbox.addEventListener('change',()=>{ const next=el.querySelector('#onboardNext'); if(next) next.disabled=!checkbox.checked; });
    el.querySelector('#underageButton')?.addEventListener('click',()=>{ try { tg.close(); } catch {} });
    refreshIcons();
  }

  function move(delta) { goTo(Math.max(0,Math.min(3,current+delta)),delta); }
  function goTo(index,direction=index>=current?1:-1) {
    if (!Number.isInteger(index) || index<0 || index>3 || index===current) return;
    current=index; render(direction);
  }

  function onTouchStart(e) {
    const t=e.changedTouches?.[0];
    if(!t)return;
    touchX=t.clientX;
    touchY=t.clientY;
    touchTarget=e.target;
  }

  function onTouchEnd(e) {
    const t=e.changedTouches?.[0];
    if(!t)return;
    const dx=t.clientX-touchX;
    const dy=t.clientY-touchY;
    if(Math.abs(dx)>58&&Math.abs(dy)<70){
      if(dx<0&&current<3)move(1);
      else if(dx>0&&current>0)move(-1);
      return;
    }
    if(Math.hypot(dx,dy)>18)return;
    const rawTarget=touchTarget instanceof Element?touchTarget:e.target;
    const control=rawTarget?.closest?.(TAP_SELECTOR);
    if(!control||control.hasAttribute?.('disabled'))return;
    e.preventDefault();
    e.stopPropagation();
    if(control.classList.contains('adult-confirm')){
      const checkbox=control.querySelector('input[type="checkbox"]');
      if(checkbox)checkbox.click();
      return;
    }
    control.click?.();
  }

  async function complete() {
    const check = overlay?.querySelector('#adultConfirm');
    if (!check?.checked) return;
    const button = overlay.querySelector('#onboardNext');
    if (button) { button.disabled=true; button.classList.add('loading'); }
    try {
      const response = await fetch('/api/app/onboarding', {
        method:'POST', cache:'no-store',
        headers:{'content-type':'application/json','x-telegram-init-data':tg.initData},
        body:JSON.stringify({adult_confirmed:true}),
      });
      const info = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (ACCESS_CODES.has(info?.error?.code)) {
          removeOverlay();
          return;
        }
        throw new Error('confirmation failed');
      }
      onboardingResolved = true;
      overlay.classList.add('onboarding-leave');
      setTimeout(removeOverlay,420);
    } catch {
      if (window.DTL_APP?.state?.accessLocked) {
        removeOverlay();
        return;
      }
      if (button) { button.disabled=false; button.classList.remove('loading'); }
      const card=overlay?.querySelector('.onboarding-card');
      if(card){card.classList.remove('shake');void card.offsetWidth;card.classList.add('shake');}
    }
  }

  function removeOverlay() {
    overlay?.remove(); overlay=null; document.body.classList.remove('onboarding-active');
  }
  function refreshIcons(){ if(window.lucide?.createIcons)window.lucide.createIcons({attrs:{'stroke-width':1.75,'aria-hidden':'true'}}); }
  function esc(v=''){return String(v).replace(/[&<>'"]/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}

  document.addEventListener('dtl:accesslocked', removeOverlay);
  document.addEventListener('dtl:accessready', () => void init());
})();

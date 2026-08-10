(() => {
  const tg = window.Telegram?.WebApp;
  if (tg) {
    tg.ready();
    tg.expand();
    try { tg.setHeaderColor('#fcfbf8'); } catch {}
    try { tg.setBackgroundColor('#fcfbf8'); } catch {}
  }

  const root = document.getElementById('app');
  const viewRoot = document.getElementById('viewRoot');
  const bottomNav = document.getElementById('bottomNav');
  const toastRegion = document.getElementById('toastRegion');
  const sheetRoot = document.getElementById('sheetRoot');
  const filePicker = document.getElementById('novelFilePicker');
  const previewBanner = document.getElementById('previewBanner');

  const state = {
    bootstrap: null,
    ui: {},
    locale: 'en',
    view: 'home',
    previousView: null,
    queueSegment: 'active',
    queueLanguage: 'all',
    requestFilter: 'all',
    detailNovel: null,
    file: null,
    fileAnalysis: null,
    wizardStep: 1,
    draft: {
      title: '', original_language: '', chapter_count: '', publication_status: 'ongoing',
      source_url: '', genres_tags: '', sexual_level: 'none', sexual_content: 'None',
      sensitive_content: 'None', notes: '', rules_accepted: false,
    },
    preview: !(tg?.initData),
  };

  const BASE_UI = {
    home:'Home',queue:'Queue',suggest:'Suggest',requests:'My Requests',account:'Account',admin:'Admin',greeting:'Good to see you',tagline:"Let’s bring more amazing stories to life.",premiumAccount:'Premium account',regularAccount:'Regular account',boostySubscriber:'Boosty Subscriber',regularStatus:'Regular',thisMonthUsage:"This month's usage",remainingRequests:'Remaining requests',requestsUsed:'requests used',requestsLeft:'requests left',suggestNovel:'Suggest a Novel',currentlyTranslating:'Currently Translating',currentlyTranslatingDesc:"The novel we’re actively working on right now.",viewQueue:'View Queue',myRequests:'My Requests',viewAll:'View All',qualityLine:'Quality translations. Community powered.',translationQueue:'Translation Queue',queueSubtitle:"See what’s being translated and what’s coming next.",all:'All',korean:'Korean',japanese:'Japanese',chinese:'Chinese',upNext:'Up Next',queueEmpty:'No novels are waiting in the queue yet.',noActive:'No novel is currently being translated.',queueAuto:"Queue updates automatically. We’ll notify you when your novel starts.",originalLanguage:'Original Language',totalChapters:'Total Chapters',queuePosition:'Queue Position',status:'Status',lastUpdated:'Last Updated',openOriginal:'Open Original Source',translationActive:'Actively translating',chapters:'chapters',position:'Position',step:'Step',upload:'Upload',details:'Details',tagsContent:'Tags & Content',review:'Review',uploadNovelFile:'Upload your novel file',uploadCopy:'We support .txt and .epub files. Tap to browse.',uploadButton:'Upload TXT or EPUB',filePrivate:'Your file is transferred securely to the Dollar TL bot.',originalSourceOptional:'Original Source (Optional)',sourceHelp:'Add a link to the original novel page or another public source.',autoFillHint:'We’ll auto-fill key details after analysis',autoFillCopy:'Language, chapter count and other details can be suggested to save you time.',continue:'Continue',back:'Back',analyzing:'Analyzing file…',readingFile:'Reading file',detectingLanguage:'Detecting language',findingChapters:'Finding chapters',readingStructure:'Reading structure',fileAnalyzed:'File analyzed successfully',autoDetected:'Auto-detected',detectedDetails:'Detected Novel Details',novelTitle:'Novel Title',chapterCount:'Chapter Count',publicationStatus:'Publication Status',ongoing:'Ongoing',completed:'Completed',chapterLimit:'Chapter Suggestion Limit',regularLimitCopy:'Regular users can suggest novels with up to 250 chapters. Boosty subscribers are not limited by that restriction.',boostyNoLimit:'No 250-chapter restriction',couldNotDetect:'Could not detect reliably',genresTags:'Genres & Tags',genresHelp:'Add the main genres and relevant tags.',addTags:'Add genres or tags…',popularTags:'Popular tags',sexualContent:'Sexual Content / Fetishes',sexualHelp:'Be clear—this helps us review the request correctly.',noSexual:'No sexual content',suggestive:'Suggestive',explicit:'Explicit (18+)',sexualDetails:'Describe sexual content, fetishes or kinks',sensitiveContent:'Sensitive / Controversial Content',sensitiveHelp:'Describe any extreme, disturbing, controversial or sensitive themes.',whyMatters:'Why this matters',contentWhy:'Accurate content notes help us review the novel and keep submissions within Dollar TL rules.',additionalNotes:'Additional Notes (Optional)',notesPlaceholder:'Anything else we should know?',reviewYourRequest:'Review Your Request',reviewCopy:'Please review all details before submitting.',uploadedSource:'Uploaded Source',detectedInfo:'Novel Details',disclosure:'Content Disclosure',afterSubmission:'After submission',rulesAgree:'I confirm that I have read the Dollar TL rules and disclosed important tags, sexual/fetish content and sensitive content honestly.',submitRequest:'Submit Request',submitting:'Submitting…',requestSubmitted:'Request submitted',requestSubmittedCopy:'Your novel request was sent for manual review.',backHome:'Back Home',requestsSubtitle:'Track the status and progress of all your novel requests.',active:'Active',rejected:'Rejected',pending:'Pending',inQueue:'In Queue',inProgress:'In Progress',rejectedReturned:'Rejected · quota returned',requested:'Requested',accountTitle:'Account',accountSubtitle:'Manage your account and preferences.',currentPlan:'Current Plan',preferences:'Preferences',language:'Language',supportResources:'Support & Resources',helpGuide:'Help / Guide',rules:'Rules',openTelegramChat:'Open Telegram Chat',subscription:'Boosty Subscription',adminTitle:'Admin',adminSubtitle:'Manage translation requests and the public queue.',pendingRequests:'Pending Requests',queued:'Queued',adminInProgress:'In Progress',adminCompleted:'Completed',requiresAction:'Requires action',accept:'Accept',reject:'Reject',returnSlot:'Return Slot',start:'Start',complete:'Complete',backToQueue:'Back to Queue',moveUp:'Move Up',moveDown:'Move Down',currentChapter:'Current chapter',update:'Update',openRawInTelegram:'Raw file is already available in the admin Telegram chat.',previewMode:'Preview mode',openFromTelegram:'Open this Mini App from Telegram to use real data.',retry:'Try Again',verificationUnavailable:'Boosty verification is temporarily unavailable.',fileTooLarge:'The file is too large. Maximum Mini App upload size is 45 MB.',unsupportedFile:'Only TXT and EPUB files are supported.',regularTooLong:'This novel is over the 250-chapter limit for Regular users.',quotaReached:'Your monthly request limit has been reached.',genericError:'Something went wrong. Please try again.',save:'Save',close:'Close',confirm:'Confirm',cancel:'Cancel'
  };

  const UI_OVERRIDES = {
    ru:{home:'Главная',queue:'Очередь',suggest:'Предложить',requests:'Мои заявки',account:'Профиль',admin:'Админ',greeting:'Рады вас видеть',tagline:'Давайте найдём ещё больше отличных историй для перевода.',premiumAccount:'Премиум-статус',regularAccount:'Обычный статус',boostySubscriber:'Подписчик Boosty',regularStatus:'Обычный',thisMonthUsage:'Заявки в этом месяце',remainingRequests:'Осталось заявок',requestsUsed:'использовано',requestsLeft:'осталось',suggestNovel:'Предложить новеллу',currentlyTranslating:'Сейчас переводим',currentlyTranslatingDesc:'Новелла, над которой команда работает сейчас.',viewQueue:'Открыть очередь',myRequests:'Мои заявки',viewAll:'Все',qualityLine:'Качественные переводы. Вместе с сообществом.',translationQueue:'Очередь переводов',queueSubtitle:'Посмотрите, что переводится сейчас и что будет дальше.',all:'Все',korean:'Корейский',japanese:'Японский',chinese:'Китайский',upNext:'Дальше в очереди',queueEmpty:'В очереди пока нет новелл.',noActive:'Сейчас нет активного перевода.',queueAuto:'Очередь обновляется автоматически. Мы уведомим вас, когда начнётся перевод вашей новеллы.',originalLanguage:'Язык оригинала',totalChapters:'Всего глав',queuePosition:'Позиция в очереди',status:'Статус',lastUpdated:'Обновлено',openOriginal:'Открыть оригинал',translationActive:'Перевод идёт',chapters:'глав',position:'Позиция',step:'Шаг',upload:'Файл',details:'Данные',tagsContent:'Теги и контент',review:'Проверка',uploadNovelFile:'Загрузите файл новеллы',uploadCopy:'Поддерживаются .txt и .epub. Нажмите, чтобы выбрать файл.',uploadButton:'Загрузить TXT или EPUB',filePrivate:'Файл безопасно передаётся боту Dollar TL.',originalSourceOptional:'Ссылка на оригинал (необязательно)',sourceHelp:'Добавьте ссылку на страницу оригинальной новеллы или другой публичный источник.',autoFillHint:'После анализа мы заполним часть данных автоматически',autoFillCopy:'Язык, количество глав и другие поля можно определить автоматически.',continue:'Продолжить',back:'Назад',analyzing:'Анализируем файл…',readingFile:'Читаем файл',detectingLanguage:'Определяем язык',findingChapters:'Ищем главы',readingStructure:'Читаем структуру',fileAnalyzed:'Файл успешно проанализирован',autoDetected:'Определено автоматически',detectedDetails:'Данные новеллы',novelTitle:'Название новеллы',chapterCount:'Количество глав',publicationStatus:'Статус публикации',ongoing:'Продолжается',completed:'Завершена',chapterLimit:'Ограничение по главам',regularLimitCopy:'Пользователи с обычным статусом могут предлагать новеллы до 250 глав. На подписчиков Boosty это ограничение не распространяется.',boostyNoLimit:'Ограничение в 250 глав не действует',couldNotDetect:'Не удалось определить надёжно',genresTags:'Жанры и теги',genresHelp:'Укажите основные жанры и важные теги.',addTags:'Добавить жанры или теги…',popularTags:'Популярные теги',sexualContent:'Сексуальный контент / фетиши',sexualHelp:'Укажите всё важное — это нужно для корректной проверки.',noSexual:'Нет сексуального контента',suggestive:'Намеки / неявный',explicit:'Откровенный (18+)',sexualDetails:'Опишите сексуальный контент, фетиши или кинки',sensitiveContent:'Чувствительный / спорный контент',sensitiveHelp:'Опишите экстремальные, тревожные, спорные или чувствительные темы.',whyMatters:'Почему это важно',contentWhy:'Точные предупреждения помогают проверить новеллу и убедиться, что она соответствует правилам Dollar TL.',additionalNotes:'Дополнительные заметки (необязательно)',notesPlaceholder:'Что ещё нам стоит знать?',reviewYourRequest:'Проверьте заявку',reviewCopy:'Проверьте данные перед отправкой.',uploadedSource:'Исходный файл',detectedInfo:'Данные новеллы',disclosure:'Информация о контенте',afterSubmission:'После отправки',rulesAgree:'Я подтверждаю, что прочитал правила Dollar TL и честно указал важные теги, сексуальный/фетиш-контент и чувствительный контент.',submitRequest:'Отправить заявку',submitting:'Отправляем…',requestSubmitted:'Заявка отправлена',requestSubmittedCopy:'Новелла отправлена на ручную проверку.',backHome:'На главную',requestsSubtitle:'Отслеживайте статус и прогресс всех своих заявок.',active:'Активные',rejected:'Отклонённые',pending:'На проверке',inQueue:'В очереди',inProgress:'В работе',rejectedReturned:'Отклонена · лимит возвращён',requested:'Отправлена',accountTitle:'Профиль',accountSubtitle:'Статус, язык и полезные разделы.',currentPlan:'Текущий статус',preferences:'Настройки',language:'Язык',supportResources:'Помощь',helpGuide:'Как это работает',rules:'Правила',openTelegramChat:'Открыть чат с ботом',subscription:'Подписка Boosty',adminTitle:'Админ',adminSubtitle:'Управление заявками и очередью переводов.',pendingRequests:'Новые заявки',queued:'В очереди',adminInProgress:'В работе',adminCompleted:'Завершено',requiresAction:'Требует решения',accept:'Принять',reject:'Отклонить',returnSlot:'Вернуть лимит',start:'Начать',complete:'Завершить',backToQueue:'Вернуть в очередь',moveUp:'Выше',moveDown:'Ниже',currentChapter:'Текущая глава',update:'Обновить',openRawInTelegram:'Raw-файл уже доступен в админском чате Telegram.',previewMode:'Режим предпросмотра',openFromTelegram:'Откройте Mini App из Telegram, чтобы загрузить реальные данные.',retry:'Повторить',verificationUnavailable:'Проверка Boosty временно недоступна.',fileTooLarge:'Файл слишком большой. Максимальный размер в Mini App — 45 МБ.',unsupportedFile:'В Mini App поддерживаются только TXT и EPUB.',regularTooLong:'Новелла превышает лимит 250 глав для обычного статуса.',quotaReached:'Месячный лимит заявок исчерпан.',genericError:'Что-то пошло не так. Попробуйте ещё раз.',save:'Сохранить',close:'Закрыть',confirm:'Подтвердить',cancel:'Отмена'},
    es:{home:'Inicio',queue:'Cola',suggest:'Proponer',requests:'Mis solicitudes',account:'Cuenta',admin:'Admin',suggestNovel:'Proponer una novela',currentlyTranslating:'Traduciendo ahora',viewQueue:'Ver cola',translationQueue:'Cola de traducción',upNext:'A continuación',upload:'Archivo',details:'Detalles',tagsContent:'Etiquetas y contenido',review:'Revisión',continue:'Continuar',back:'Atrás',novelTitle:'Título de la novela',chapterCount:'Número de capítulos',publicationStatus:'Estado de publicación',ongoing:'En publicación',completed:'Completada',pending:'Pendiente',inQueue:'En cola',inProgress:'En curso',rejected:'Rechazada',accept:'Aceptar',reject:'Rechazar',returnSlot:'Devolver cupo'},
    fil:{home:'Home',queue:'Pila',suggest:'Magmungkahi',requests:'Mga Kahilingan Ko',account:'Account',admin:'Admin',suggestNovel:'Magmungkahi ng Nobela',currentlyTranslating:'Kasalukuyang Isinasalin',viewQueue:'Tingnan ang Pila',translationQueue:'Pila ng mga Isasalin',upNext:'Susunod',upload:'File',details:'Detalye',tagsContent:'Mga Tag at Nilalaman',review:'Suriin',continue:'Magpatuloy',back:'Bumalik',novelTitle:'Pamagat ng Nobela',chapterCount:'Bilang ng Kabanata',publicationStatus:'Kalagayan ng Publikasyon',ongoing:'Patuloy',completed:'Kumpleto',pending:'Sinusuri',inQueue:'Nasa Pila',inProgress:'Isinasalin',rejected:'Tinanggihan',accept:'Tanggapin',reject:'Tanggihan',returnSlot:'Ibalik ang quota'},
    hi:{home:'मुख्य',queue:'कतार',suggest:'उपन्यास सुझाएँ',requests:'मेरे अनुरोध',account:'खाता',admin:'एडमिन',suggestNovel:'उपन्यास सुझाएँ',currentlyTranslating:'अभी अनुवाद जारी',viewQueue:'कतार देखें',translationQueue:'अनुवाद कतार',upNext:'आगे',upload:'फ़ाइल',details:'जानकारी',tagsContent:'टैग और सामग्री',review:'जाँच',continue:'आगे बढ़ें',back:'वापस',novelTitle:'उपन्यास का नाम',chapterCount:'अध्यायों की संख्या',publicationStatus:'प्रकाशन स्थिति',ongoing:'जारी',completed:'पूर्ण',pending:'समीक्षा बाकी',inQueue:'कतार में',inProgress:'अनुवाद जारी',rejected:'अस्वीकृत',accept:'स्वीकार करें',reject:'अस्वीकार करें',returnSlot:'सीमा वापस करें'},
    pt:{home:'Início',queue:'Fila',suggest:'Sugerir',requests:'Meus pedidos',account:'Conta',admin:'Admin',suggestNovel:'Sugerir uma Novel',currentlyTranslating:'Em tradução agora',viewQueue:'Ver fila',translationQueue:'Fila de tradução',upNext:'A seguir',upload:'Arquivo',details:'Detalhes',tagsContent:'Tags e conteúdo',review:'Revisão',continue:'Continuar',back:'Voltar',novelTitle:'Título da novel',chapterCount:'Número de capítulos',publicationStatus:'Status de publicação',ongoing:'Em andamento',completed:'Concluída',pending:'Pendente',inQueue:'Na fila',inProgress:'Em andamento',rejected:'Rejeitado',accept:'Aceitar',reject:'Rejeitar',returnSlot:'Devolver cota'},
    id:{home:'Beranda',queue:'Antrean',suggest:'Ajukan',requests:'Permintaan Saya',account:'Akun',admin:'Admin',suggestNovel:'Ajukan Novel',currentlyTranslating:'Sedang Diterjemahkan',viewQueue:'Lihat Antrean',translationQueue:'Antrean Terjemahan',upNext:'Berikutnya',upload:'Berkas',details:'Detail',tagsContent:'Tag & Konten',review:'Tinjau',continue:'Lanjutkan',back:'Kembali',novelTitle:'Judul novel',chapterCount:'Jumlah bab',publicationStatus:'Status publikasi',ongoing:'Berjalan',completed:'Selesai',pending:'Menunggu tinjauan',inQueue:'Dalam antrean',inProgress:'Sedang diterjemahkan',rejected:'Ditolak',accept:'Terima',reject:'Tolak',returnSlot:'Kembalikan kuota'},
    vi:{home:'Trang chủ',queue:'Hàng đợi',suggest:'Đề xuất',requests:'Đề xuất của tôi',account:'Tài khoản',admin:'Quản trị',suggestNovel:'Đề xuất tiểu thuyết',currentlyTranslating:'Đang dịch',viewQueue:'Xem hàng đợi',translationQueue:'Hàng đợi dịch',upNext:'Tiếp theo',upload:'Tệp',details:'Thông tin',tagsContent:'Thẻ & Nội dung',review:'Kiểm tra',continue:'Tiếp tục',back:'Quay lại',novelTitle:'Tên tiểu thuyết',chapterCount:'Số chương',publicationStatus:'Trạng thái xuất bản',ongoing:'Đang phát hành',completed:'Đã hoàn thành',pending:'Chờ duyệt',inQueue:'Trong hàng đợi',inProgress:'Đang dịch',rejected:'Bị từ chối',accept:'Chấp nhận',reject:'Từ chối',returnSlot:'Hoàn lượt gửi'},
    fr:{home:'Accueil',queue:'File',suggest:'Proposer',requests:'Mes demandes',account:'Compte',admin:'Admin',suggestNovel:'Proposer un roman',currentlyTranslating:'En cours de traduction',viewQueue:'Voir la file',translationQueue:'File de traduction',upNext:'À suivre',upload:'Fichier',details:'Détails',tagsContent:'Tags et contenu',review:'Vérification',continue:'Continuer',back:'Retour',novelTitle:'Titre du roman',chapterCount:'Nombre de chapitres',publicationStatus:'Statut de publication',ongoing:'En cours',completed:'Terminé',pending:'En attente',inQueue:'Dans la file',inProgress:'En cours',rejected:'Refusée',accept:'Accepter',reject:'Refuser',returnSlot:'Rendre le quota'},
    de:{home:'Start',queue:'Warteschlange',suggest:'Vorschlagen',requests:'Meine Anfragen',account:'Konto',admin:'Admin',suggestNovel:'Roman vorschlagen',currentlyTranslating:'Aktuell in Übersetzung',viewQueue:'Warteschlange öffnen',translationQueue:'Übersetzungswarteschlange',upNext:'Als Nächstes',upload:'Datei',details:'Details',tagsContent:'Tags & Inhalte',review:'Prüfen',continue:'Weiter',back:'Zurück',novelTitle:'Romantitel',chapterCount:'Kapitelzahl',publicationStatus:'Veröffentlichungsstatus',ongoing:'Laufend',completed:'Abgeschlossen',pending:'Wird geprüft',inQueue:'In der Warteschlange',inProgress:'In Arbeit',rejected:'Abgelehnt',accept:'Annehmen',reject:'Ablehnen',returnSlot:'Kontingent zurückgeben'}
  };

  const LANGUAGE_NAMES = { en:'English', es:'Español', fil:'Filipino', hi:'हिन्दी', pt:'Português', id:'Bahasa Indonesia', vi:'Tiếng Việt', fr:'Français', de:'Deutsch', ru:'Русский' };
  const POPULAR_TAGS = ['Fantasy','Romance','Adventure','Academy','Isekai','Reincarnation','Magic','Strong MC','Harem','Slice of Life','Time Travel','System','Villainess','Slow Burn'];
  const views = new Map();
  const components = Object.create(null);
  let renderGeneration = 0;

  function applyLocale(locale) {
    state.locale = locale || state.locale || 'en';
    state.ui = { ...BASE_UI, ...(UI_OVERRIDES[state.locale] || {}) };
    if (state.bootstrap?.user) state.bootstrap.user.locale = state.locale;
  }
  function tr(key) { return state.ui[key] ?? BASE_UI[key] ?? key; }
  function escapeHtml(value='') { return String(value).replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch])); }
  function languageFlag(value='') { const v=value.toLowerCase(); if(v.includes('korean')||v.includes('корей')||v.includes('한국'))return'🇰🇷'; if(v.includes('japanese')||v.includes('япон')||v.includes('日本'))return'🇯🇵'; if(v.includes('chinese')||v.includes('китай')||v.includes('中文'))return'🇨🇳'; if(v.includes('english')||v.includes('англ'))return'🇬🇧'; return'🌐'; }
  function initials(title='DTL') { return title.split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase(); }
  function cover(title, small=false) { return `<div class="novel-cover${small?' small':''}" aria-hidden="true">${escapeHtml(initials(title))}</div>`; }
  function formatDate(value) { if(!value)return'—'; try{return new Intl.DateTimeFormat(state.locale,{dateStyle:'medium'}).format(new Date(value));}catch{return value;} }
  function relativeTime(value) { if(!value)return'—'; const ms=Date.now()-new Date(value).getTime(); if(ms<0)return formatDate(value); const min=Math.floor(ms/60000); if(min<1)return'just now'; if(min<60)return`${min} min ago`; const h=Math.floor(min/60); if(h<24)return`${h} h ago`; const d=Math.floor(h/24); if(d<8)return`${d} d ago`; return formatDate(value); }

  async function api(path, options={}) {
    if (state.preview) throw new Error('preview');
    const headers = new Headers(options.headers || {});
    headers.set('x-telegram-init-data', tg.initData);
    const response = await fetch(path, { ...options, headers });
    const data = await response.json().catch(()=>({}));
    if (!response.ok) {
      const error = new Error(data?.error?.message || tr('genericError'));
      error.code = data?.error?.code;
      error.status = response.status;
      throw error;
    }
    return data;
  }

  function previewBootstrap() {
    return {
      user:{id:1,first_name:'Alex',username:'alex',locale:'en',is_admin:true},
      account:{plan:'subscriber',verification_error:false,used:1,limit:5,remaining:4,regular_max_chapters:250,boosty_url:'https://boosty.to/domnekromanta'},
      queue:{active:[{id:1,title:'The Pure Love of the Humiliation Academy',original_language:'Korean',chapter_count:258,queue_status:'in_progress',queue_position:1,current_chapter:78,progress_percent:30,progress_updated_at:new Date(Date.now()-7200000).toISOString(),updated_at:new Date().toISOString()}],upcoming:[{id:2,title:'Pokémon Master of Tactics',original_language:'Korean',chapter_count:196,queue_status:'queued',queue_position:2,progress_percent:null,updated_at:new Date().toISOString()},{id:3,title:'Reborn as the Villainess’ Guard Dog',original_language:'Japanese',chapter_count:96,queue_status:'queued',queue_position:3,progress_percent:null,updated_at:new Date().toISOString()},{id:4,title:'The Saint’s Secret Wedding',original_language:'Korean',chapter_count:112,queue_status:'queued',queue_position:4,progress_percent:null,updated_at:new Date().toISOString()}],completed:[]},
      my_requests:[{id:2,title:'Pokémon Master of Tactics',original_language:'Korean',chapter_count:196,status:'accepted',slot_returned:0,queue_status:'queued',queue_position:2,state:'queued',created_at:new Date(Date.now()-86400000).toISOString()},{id:5,title:'The Saint’s Secret Wedding',original_language:'Korean',chapter_count:120,status:'accepted',slot_returned:0,queue_status:'in_progress',queue_position:5,current_chapter:78,progress_percent:65,state:'in_progress',created_at:new Date(Date.now()-4*86400000).toISOString()}],
      admin:{pending:3,queued:8,in_progress:1,completed:56,total:68}
    };
  }

  function registerView(name, renderer) {
    if (!name || typeof renderer !== 'function') throw new Error('DTL_APP.registerView requires a view name and renderer.');
    views.set(name, renderer);
  }
  function navItems() {
    return state.bootstrap?.user?.is_admin
      ? [['home','⌂'],['queue','▱'],['requests','▤'],['account','♙'],['admin','⚙']]
      : [['home','⌂'],['queue','▱'],['suggest','＋'],['requests','▤'],['account','♙']];
  }
  function renderNav() {
    bottomNav.innerHTML = navItems().map(([id,icon])=>`<button class="nav-item${state.view===id?' active':''}" type="button" data-nav="${id}"><span class="nav-icon">${icon}</span><span>${escapeHtml(tr(id))}</span></button>`).join('');
    bottomNav.querySelectorAll('[data-nav]').forEach(btn=>btn.addEventListener('click',()=>navigate(btn.dataset.nav)));
  }
  function emit(name, detail) { document.dispatchEvent(new CustomEvent(name,{detail})); }
  function navigate(view, push=true) {
    if (!views.has(view)) return;
    const previous = state.view;
    if (push && previous !== view) state.previousView = previous;
    state.view = view;
    if (view !== 'admin') window.DTL_ADMIN_CONSOLE?.close?.();
    emit('dtl:viewchange',{view,previous,push});
    renderNav();
    renderView();
    viewRoot.focus({preventScroll:true});
    window.scrollTo({top:0,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
    try { tg?.HapticFeedback?.selectionChanged(); } catch {}
  }
  function renderView() {
    const view = state.view;
    const renderer = views.get(view);
    if (!renderer) return;
    const generation = ++renderGeneration;
    let result;
    try { result = renderer(); }
    catch (error) { console.error(`[DTL app] view ${view} failed`,error); throw error; }
    Promise.resolve(result).finally(()=>{
      if(generation!==renderGeneration||state.view!==view)return;
      const detail={view,generation};
      emit('dtl:viewrender',detail);
      emit(`dtl:${view}`,detail);
      window.DTL_RUNTIME?.schedule?.();
    });
    return result;
  }

  async function refreshBootstrap(render=true) {
    if(state.preview)return;
    state.bootstrap=await api('/api/app/bootstrap');
    applyLocale(state.bootstrap.user.locale||state.locale);
    renderNav();
    if(render)renderView();
  }
  function toast(message,type='') {
    const el=document.createElement('div');el.className=`toast ${type}`;el.textContent=message;toastRegion.appendChild(el);
    setTimeout(()=>{el.style.opacity='0';el.style.transform='translateY(6px)';setTimeout(()=>el.remove(),180);},3200);
  }
  function renderFatal(error) {
    root.setAttribute('aria-busy','false');
    viewRoot.innerHTML = `<section class="page"><div class="empty-state surface-card"><div class="empty-icon">!</div><h2>${escapeHtml(tr('openFromTelegram'))}</h2><p>${escapeHtml(error?.message || tr('genericError'))}</p><button class="primary-button wide-button" id="fatalRetry" type="button" style="margin-top:18px">${escapeHtml(tr('retry'))}</button></div></section>`;
    document.getElementById('fatalRetry')?.addEventListener('click',()=>location.reload());
  }
  async function init() {
    if (!views.has('home')) throw new Error('DTL app views must load before app.js bootstrap.');
    if (state.preview) {
      state.bootstrap = previewBootstrap();
      previewBanner.hidden = false;
    } else {
      try { state.bootstrap = await api('/api/app/bootstrap'); }
      catch (error) { renderFatal(error); return; }
    }
    applyLocale(state.bootstrap.user.locale || 'en');
    root.setAttribute('aria-busy','false');
    renderNav();
    navigate('home', false);
  }

  const app = {
    tg, root, viewRoot, bottomNav, toastRegion, sheetRoot, filePicker, previewBanner,
    state, components, LANGUAGE_NAMES, POPULAR_TAGS,
    tr, escapeHtml, languageFlag, cover, formatDate, relativeTime, api, toast,
    registerView, render:renderView, renderNav, navigate, refreshBootstrap, applyLocale, init,
  };
  window.DTL_APP = app;

  root.addEventListener('click',event=>{const nav=event.target.closest?.('[data-nav]');if(nav&&nav.closest('.brand'))navigate(nav.dataset.nav);});
  document.getElementById('notificationButton')?.addEventListener('click',()=>toast('Telegram bot notifications are enabled for request status updates.'));
})();

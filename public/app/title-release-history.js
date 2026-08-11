(() => {
  const app = window.DTL_APP;
  const runtime = window.DTL_RUNTIME;
  if (!app?.api || !runtime?.locale) throw new Error('Title release history requires DTL app/runtime.');

  const cache = new Map();
  const COPY = {
    en:{title:'Latest releases',sub:'Published chapter batches for this title.',current:'In translation',published:'Published',open:'Open in Telegram',empty:'No linked releases yet.',loading:'Loading release history…',failed:'Release history is temporarily unavailable.',chapter:'Chapter',chapters:'Chapters',latest:'Latest release'},
    es:{title:'Últimos lanzamientos',sub:'Lotes de capítulos publicados para este título.',current:'En traducción',published:'Publicado',open:'Abrir en Telegram',empty:'Aún no hay lanzamientos vinculados.',loading:'Cargando historial…',failed:'El historial no está disponible temporalmente.',chapter:'Capítulo',chapters:'Capítulos',latest:'Último lanzamiento'},
    fil:{title:'Pinakabagong releases',sub:'Mga na-publish na batch ng kabanata para sa title na ito.',current:'Isinasalin',published:'Na-publish',open:'Buksan sa Telegram',empty:'Wala pang naka-link na release.',loading:'Nilo-load ang release history…',failed:'Pansamantalang hindi available ang release history.',chapter:'Kabanata',chapters:'Mga kabanata',latest:'Pinakabagong release'},
    hi:{title:'नवीनतम रिलीज़',sub:'इस शीर्षक के प्रकाशित अध्याय बैच।',current:'अनुवाद जारी',published:'प्रकाशित',open:'Telegram में खोलें',empty:'अभी कोई लिंक किया गया रिलीज़ नहीं है।',loading:'रिलीज़ इतिहास लोड हो रहा है…',failed:'रिलीज़ इतिहास अभी उपलब्ध नहीं है।',chapter:'अध्याय',chapters:'अध्याय',latest:'नवीनतम रिलीज़'},
    pt:{title:'Últimos lançamentos',sub:'Lotes de capítulos publicados para este título.',current:'Em tradução',published:'Publicado',open:'Abrir no Telegram',empty:'Ainda não há lançamentos vinculados.',loading:'A carregar histórico…',failed:'O histórico está temporariamente indisponível.',chapter:'Capítulo',chapters:'Capítulos',latest:'Último lançamento'},
    id:{title:'Rilis terbaru',sub:'Batch bab yang sudah dipublikasikan untuk judul ini.',current:'Sedang diterjemahkan',published:'Dipublikasikan',open:'Buka di Telegram',empty:'Belum ada rilis yang ditautkan.',loading:'Memuat riwayat rilis…',failed:'Riwayat rilis sementara tidak tersedia.',chapter:'Bab',chapters:'Bab',latest:'Rilis terbaru'},
    vi:{title:'Bản phát hành mới nhất',sub:'Các đợt chương đã xuất bản của tác phẩm này.',current:'Đang dịch',published:'Đã xuất bản',open:'Mở trong Telegram',empty:'Chưa có bản phát hành được liên kết.',loading:'Đang tải lịch sử phát hành…',failed:'Lịch sử phát hành tạm thời không khả dụng.',chapter:'Chương',chapters:'Chương',latest:'Bản mới nhất'},
    fr:{title:'Dernières sorties',sub:'Lots de chapitres publiés pour ce titre.',current:'En traduction',published:'Publié',open:'Ouvrir dans Telegram',empty:'Aucune sortie liée pour le moment.',loading:'Chargement de l’historique…',failed:'L’historique est temporairement indisponible.',chapter:'Chapitre',chapters:'Chapitres',latest:'Dernière sortie'},
    de:{title:'Neueste Releases',sub:'Veröffentlichte Kapitelpakete für diesen Titel.',current:'In Übersetzung',published:'Veröffentlicht',open:'In Telegram öffnen',empty:'Noch keine verknüpften Releases.',loading:'Release-Verlauf wird geladen…',failed:'Der Release-Verlauf ist vorübergehend nicht verfügbar.',chapter:'Kapitel',chapters:'Kapitel',latest:'Neuester Release'},
    ru:{title:'Последние релизы',sub:'Опубликованные пачки глав этого тайтла.',current:'Сейчас переводится',published:'Опубликовано',open:'Открыть в Telegram',empty:'Связанных релизов пока нет.',loading:'Загружаем историю релизов…',failed:'История релизов временно недоступна.',chapter:'Глава',chapters:'Главы',latest:'Последний релиз'},
  };

  const esc = (value = '') => String(value).replace(/[&<>"']/g, char => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;',
  }[char]));
  const icon = name => `<i data-lucide="${name}" aria-hidden="true"></i>`;
  const locale = () => COPY[runtime.locale()] ? runtime.locale() : 'en';
  const tr = key => COPY[locale()]?.[key] || COPY.en[key] || key;

  function currentNovel() {
    const novel = app.state?.detailNovel;
    return novel && Number.isSafeInteger(Number(novel.id)) ? novel : null;
  }

  function ensureHost() {
    if (app.state?.view !== 'detail') return null;
    const page = document.querySelector('.live-detail');
    const novel = currentNovel();
    if (!page || !novel) return null;
    let host = page.querySelector('[data-title-release-history]');
    if (!host) {
      host = document.createElement('section');
      host.className = 'title-release-history';
      host.dataset.titleReleaseHistory = String(novel.id);
      const actions = page.querySelector('.live-detail-actions');
      if (actions) actions.before(host); else page.append(host);
    }
    return host;
  }

  function mount() {
    const host = ensureHost();
    const novel = currentNovel();
    if (!host || !novel) return;
    const id = Number(novel.id);
    const entry = cache.get(id);
    render(host, novel, entry);
    if (!entry && !app.state.preview) void load(id);
  }

  async function load(id) {
    if (cache.get(id)?.status === 'loading') return;
    cache.set(id, { status:'loading', releases:[] });
    mount();
    try {
      const data = await app.api(`/api/app/releases?submission_id=${encodeURIComponent(id)}&limit=12`);
      cache.set(id, { status:'ready', releases:Array.isArray(data?.releases) ? data.releases : [] });
    } catch (error) {
      cache.set(id, { status:'error', releases:[], error:error?.message || String(error) });
    }
    if (Number(currentNovel()?.id) === id) mount();
  }

  function render(host, novel, entry) {
    const releases = entry?.releases || [];
    const state = entry?.status || (app.state.preview ? 'ready' : 'loading');
    const current = Math.max(0, Number(novel.current_chapter) || 0);
    const isLive = novel.queue_status === 'in_progress';
    const lastStructuredEnd = releases.reduce((max, release) => Math.max(max, positive(release.chapter_end) || 0), 0);
    const currentLabel = current ? rangeLabel(lastStructuredEnd && current > lastStructuredEnd ? lastStructuredEnd + 1 : current, current) : '';

    host.innerHTML = `
      <div class="title-release-history-head">
        <div><h2>${esc(tr('title'))}</h2><p>${esc(tr('sub'))}</p></div>
        ${releases.length ? `<span>${releases.length}</span>` : ''}
      </div>
      <div class="title-release-timeline">
        ${isLive && current ? currentRow(currentLabel, novel) : ''}
        ${state === 'loading' ? statusRow('loader-circle', tr('loading'), 'loading') : ''}
        ${state === 'error' ? statusRow('triangle-alert', tr('failed'), 'error') : ''}
        ${state === 'ready' && releases.length ? releases.map((release, index) => releaseRow(release, index === 0)).join('') : ''}
        ${state === 'ready' && !releases.length ? statusRow('archive', tr('empty'), 'empty') : ''}
      </div>`;
    try { window.lucide?.createIcons?.({ attrs:{ 'stroke-width':1.8, 'aria-hidden':'true' } }); } catch {}
  }

  function currentRow(label, novel) {
    const updated = app.relativeTime?.(novel.progress_updated_at || novel.updated_at) || '';
    return `<article class="title-release-row current">
      <div class="title-release-dot">${icon('languages')}</div>
      <div class="title-release-copy"><div><strong>${esc(label)}</strong><span class="title-release-badge current">${esc(tr('current'))}</span></div><small>${esc(updated)}</small></div>
    </article>`;
  }

  function releaseRow(release, latest) {
    const start = positive(release.chapter_start);
    const end = positive(release.chapter_end);
    const label = start && end ? rangeLabel(start, end) : String(release.title || tr('published'));
    const date = formatDate(release.published_at);
    return `<article class="title-release-row published">
      <div class="title-release-dot">${icon('circle-check')}</div>
      <div class="title-release-copy">
        <div><strong>${esc(label)}</strong>${latest ? `<span class="title-release-badge">${esc(tr('latest'))}</span>` : ''}</div>
        <small>${esc(tr('published'))}${date ? ` · ${esc(date)}` : ''}</small>
      </div>
      ${release.telegram_url ? `<a class="title-release-open" href="${esc(release.telegram_url)}" target="_blank" rel="noopener">${icon('send')}<span>${esc(tr('open'))}</span></a>` : ''}
    </article>`;
  }

  function statusRow(iconName, text, tone) {
    return `<div class="title-release-state ${tone}">${icon(iconName)}<span>${esc(text)}</span></div>`;
  }

  function rangeLabel(start, end) {
    if (!start || !end) return '';
    return start === end ? `${tr('chapter')} ${start}` : `${tr('chapters')} ${start}–${end}`;
  }

  function positive(value) {
    const number = Number(value);
    return Number.isSafeInteger(number) && number > 0 ? number : null;
  }

  function formatDate(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const locales = {en:'en-US',es:'es-ES',fil:'fil-PH',hi:'hi-IN',pt:'pt-PT',id:'id-ID',vi:'vi-VN',fr:'fr-FR',de:'de-DE',ru:'ru-RU'};
    try { return new Intl.DateTimeFormat(locales[locale()] || 'en-US', { day:'numeric', month:'short', year:'numeric' }).format(date); }
    catch { return date.toLocaleDateString(); }
  }

  document.addEventListener('dtl:detail', mount);
  document.addEventListener('dtl:localechange', () => { if (app.state?.view === 'detail') mount(); });
  document.addEventListener('dtl:viewchange', event => {
    if (event.detail?.view === 'detail') queueMicrotask(mount);
  });

  window.DTL_TITLE_RELEASE_HISTORY = Object.freeze({ mount, cache });
})();

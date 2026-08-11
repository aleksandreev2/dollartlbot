type PublicTitleRow = {
  id: number;
  title: string;
  original_language: string;
  chapter_count: number;
  publication_status: string;
  genres_tags: string;
  request_status: string;
  queue_status: string | null;
  queue_position: number | null;
  current_chapter: number | null;
  cover_key: string | null;
  demand_count: number;
  raw_available: number;
  updated_at: string;
};

type LatestReleaseRow = {
  chapter_start: number | null;
  chapter_end: number | null;
  published_at: string | null;
  internal_title: string;
};

type PublicTitle = ReturnType<typeof presentTitle>;

export async function handlePublicTitleRequest(request: Request, env: Env): Promise<Response | null> {
  if (request.method !== 'GET' && request.method !== 'HEAD') return null;
  const url = new URL(request.url);
  const titleMatch = /^\/title\/(\d+)(?:\/([^/?#]+))?\/?$/.exec(url.pathname);
  const shareMatch = /^\/share\/title\/(\d+)\/?$/.exec(url.pathname);
  const cardMatch = /^\/share\/title\/(\d+)\/card\.svg$/.exec(url.pathname);
  if (!titleMatch && !shareMatch && !cardMatch) return null;

  const id = Number((titleMatch || shareMatch || cardMatch)?.[1]);
  if (!Number.isSafeInteger(id) || id <= 0) return publicNotFound();

  const title = await loadPublicTitle(env, id);
  if (!title) return publicNotFound();

  if (cardMatch) {
    const kind = normalizeShareKind(url.searchParams.get('kind'), title);
    return svgResponse(renderShareCardSvg(title, url.origin, kind), request.method === 'HEAD');
  }

  if (shareMatch) {
    const kind = normalizeShareKind(url.searchParams.get('kind'), title);
    return htmlResponse(renderSharePage(title, url.origin, env, kind), request.method === 'HEAD', title.indexable);
  }

  return htmlResponse(renderTitlePage(title, url.origin, env), request.method === 'HEAD', title.indexable);
}

async function loadPublicTitle(env: Env, id: number): Promise<PublicTitle | null> {
  const row = await env.DB.prepare(`
    SELECT
      s.id,
      s.title,
      s.original_language,
      s.chapter_count,
      s.publication_status,
      s.genres_tags,
      s.status AS request_status,
      s.queue_status,
      s.queue_position,
      s.current_chapter,
      s.cover_key,
      s.updated_at,
      1 + (SELECT COUNT(*) FROM discovery_interests di WHERE di.submission_id = s.id) AS demand_count,
      COALESCE((
        SELECT MAX(es.raw_available)
        FROM submission_external_sources es
        WHERE es.submission_id = s.id
      ), 0) AS raw_available
    FROM submissions s
    WHERE s.id = ? AND s.status <> 'rejected'
    LIMIT 1
  `).bind(id).first<PublicTitleRow>();
  if (!row) return null;

  const latestRelease = await env.DB.prepare(`
    SELECT chapter_start, chapter_end, published_at, internal_title
    FROM publications
    WHERE submission_id = ? AND status = 'published'
    ORDER BY published_at DESC, id DESC
    LIMIT 1
  `).bind(id).first<LatestReleaseRow>();

  return presentTitle(row, latestRelease || null);
}

function presentTitle(row: PublicTitleRow, latestRelease: LatestReleaseRow | null) {
  const chapterCount = Math.max(1, Number(row.chapter_count) || 1);
  const current = row.queue_status === 'completed'
    ? chapterCount
    : Math.max(0, Math.min(chapterCount, Number(row.current_chapter) || 0));
  const progress = row.queue_status === 'completed' ? 100 : Math.max(0, Math.min(100, Math.round((current / chapterCount) * 100)));
  const status = row.queue_status === 'in_progress'
    ? 'Currently translating'
    : row.queue_status === 'queued'
      ? 'In translation queue'
      : row.queue_status === 'completed'
        ? 'Translation completed'
        : row.request_status === 'accepted'
          ? 'Accepted'
          : 'Under review';
  return {
    id: Number(row.id),
    title: String(row.title || 'Untitled novel'),
    original_language: String(row.original_language || ''),
    chapter_count: chapterCount,
    publication_status: String(row.publication_status || ''),
    genres: String(row.genres_tags || '').split(',').map((tag) => tag.trim()).filter(Boolean).slice(0, 8),
    request_status: row.request_status,
    queue_status: row.queue_status,
    queue_position: row.queue_position == null ? null : Number(row.queue_position),
    current_chapter: current,
    progress_percent: progress,
    demand_count: Math.max(1, Number(row.demand_count) || 1),
    raw_available: Boolean(row.raw_available),
    has_cover: Boolean(row.cover_key),
    status,
    latest_release: latestRelease ? {
      chapter_start: latestRelease.chapter_start == null ? null : Number(latestRelease.chapter_start),
      chapter_end: latestRelease.chapter_end == null ? null : Number(latestRelease.chapter_end),
      published_at: latestRelease.published_at,
      title: latestRelease.internal_title || '',
    } : null,
    updated_at: row.updated_at,
    indexable: row.request_status === 'accepted',
  };
}

function renderTitlePage(title: PublicTitle, origin: string, env: Env): string {
  const canonical = `${origin}/title/${title.id}/${slugify(title.title)}`;
  const botUrl = telegramTitleUrl(env, title.id);
  const miniAppUrl = miniAppTitleUrl(env, title.id);
  const shareKind = normalizeShareKind(null, title);
  const shareUrl = `${origin}/share/title/${title.id}?kind=${shareKind}`;
  const cardUrl = `${origin}/share/title/${title.id}/card.svg?kind=${shareKind}`;
  const cover = title.has_cover ? `${origin}/media/covers/${title.id}` : cardUrl;
  const description = title.queue_status === 'in_progress'
    ? `${title.title} — chapter ${title.current_chapter} of ${title.chapter_count} translated by Dollar TL.`
    : `${title.demand_count} readers want ${title.title} translated by Dollar TL.`;
  const release = latestReleaseText(title);
  const tags = title.genres.length
    ? `<div class="tags">${title.genres.map((tag) => `<span>${escapeHtml(tag)}</span>`).join('')}</div>`
    : '';
  const queueLine = title.queue_status === 'queued' && title.queue_position
    ? `<span>Queue position <strong>#${title.queue_position}</strong></span>`
    : '';
  const progress = title.queue_status === 'in_progress' || title.queue_status === 'completed'
    ? `<section class="progress-card"><div class="progress-head"><span>Translation progress</span><strong>${title.progress_percent}%</strong></div><div class="track"><div class="fill" style="width:${title.progress_percent}%"></div></div><div class="progress-foot"><span>Chapter ${title.current_chapter} / ${title.chapter_count}</span>${release ? `<span>${escapeHtml(release)}</span>` : ''}</div></section>`
    : '';
  const demandCta = title.queue_status === 'in_progress' || title.queue_status === 'completed'
    ? 'Follow translation'
    : 'I want this translated';

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${escapeHtml(title.title)} — Dollar TL</title>
<meta name="description" content="${escapeAttr(description)}"><meta name="theme-color" content="#fcfbf8">
<link rel="canonical" href="${escapeAttr(canonical)}">
<meta property="og:type" content="website"><meta property="og:site_name" content="Dollar TL"><meta property="og:title" content="${escapeAttr(title.title)}"><meta property="og:description" content="${escapeAttr(description)}"><meta property="og:url" content="${escapeAttr(canonical)}"><meta property="og:image" content="${escapeAttr(cover)}">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escapeAttr(title.title)}"><meta name="twitter:description" content="${escapeAttr(description)}"><meta name="twitter:image" content="${escapeAttr(cover)}">
${publicStyles()}</head><body>
<header class="site-head"><a class="brand" href="${escapeAttr(origin)}/app/"><span class="brand-mark">D</span><span><strong>Dollar TL</strong><small>Novel translations</small></span></a><a class="head-link" href="${escapeAttr(botUrl)}">Open Telegram</a></header>
<main class="shell">
  <div class="crumb">PUBLIC TITLE PAGE <span>·</span> UPDATED ${escapeHtml(formatShortDate(title.updated_at))}</div>
  <section class="hero">
    <div class="cover-wrap">${coverMarkup(title, origin)}</div>
    <div class="hero-copy">
      <div class="status-line"><span class="live-dot${title.queue_status === 'in_progress' ? ' active' : ''}"></span>${escapeHtml(title.status)}${title.raw_available ? '<span class="raw">RAW available</span>' : ''}</div>
      <h1>${escapeHtml(title.title)}</h1>
      <div class="meta"><span>${escapeHtml(title.original_language || 'Original language')}</span><span>·</span><span>${title.chapter_count} chapters</span><span>·</span><span>${escapeHtml(title.publication_status || 'Unknown status')}</span>${queueLine}</div>
      ${tags}
      <div class="demand"><strong>${title.demand_count}</strong><span>reader${title.demand_count === 1 ? '' : 's'} want this translation</span></div>
      <div class="actions"><a class="button primary" href="${escapeAttr(botUrl)}">${escapeHtml(demandCta)}</a><a class="button secondary" href="${escapeAttr(miniAppUrl)}">Open Mini App</a><button class="button ghost" type="button" data-share-url="${escapeAttr(shareUrl)}" data-share-text="${escapeAttr(description)}">Share ${shareKind === 'progress' ? 'progress' : 'request'}</button></div>
    </div>
  </section>
  ${progress}
  <section class="info-grid">
    <article><small>COMMUNITY DEMAND</small><strong>${title.demand_count}</strong><p>Unique Dollar TL readers interested in this title, including the original request.</p></article>
    <article><small>SOURCE STATUS</small><strong>${title.raw_available ? 'RAW ready' : 'Source tracked'}</strong><p>${title.raw_available ? 'A RAW source is linked to the title and ready for the translation workflow.' : 'The title is in Dollar TL and can gain demand before translation starts.'}</p></article>
    <article><small>LATEST RELEASE</small><strong>${escapeHtml(release || 'No release yet')}</strong><p>${title.latest_release?.published_at ? `Published ${escapeHtml(formatShortDate(title.latest_release.published_at))}.` : 'Release history will appear here when chapters are published.'}</p></article>
  </section>
  <section class="conversion"><div><small>READ IN TELEGRAM</small><h2>Follow this title without checking manually.</h2><p>Open Dollar TL in Telegram to vote for the translation, follow progress and receive release notifications.</p></div><a class="button primary large" href="${escapeAttr(botUrl)}">Open Dollar TL</a></section>
</main>
<footer>Dollar TL · Community-powered novel translations</footer>
${shareScript()}</body></html>`;
}

function renderSharePage(title: PublicTitle, origin: string, env: Env, kind: 'progress' | 'demand'): string {
  const titleUrl = `${origin}/title/${title.id}/${slugify(title.title)}`;
  const cardUrl = `${origin}/share/title/${title.id}/card.svg?kind=${kind}`;
  const description = kind === 'progress'
    ? `${title.title}: chapter ${title.current_chapter} / ${title.chapter_count} translated.`
    : `${title.demand_count} readers want ${title.title} translated.`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>${escapeHtml(title.title)} — Share · Dollar TL</title><meta name="description" content="${escapeAttr(description)}"><meta name="theme-color" content="#fcfbf8"><meta property="og:title" content="${escapeAttr(title.title)}"><meta property="og:description" content="${escapeAttr(description)}"><meta property="og:image" content="${escapeAttr(cardUrl)}"><meta property="og:url" content="${escapeAttr(titleUrl)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${escapeAttr(cardUrl)}">${sharePageStyles()}</head><body><main class="share-shell"><a class="share-brand" href="${escapeAttr(origin)}/app/">Dollar TL</a><img class="share-card" src="${escapeAttr(cardUrl)}" alt="Share card for ${escapeAttr(title.title)}"><div class="share-actions"><button type="button" data-share-url="${escapeAttr(titleUrl)}" data-share-text="${escapeAttr(description)}">Share</button><a href="${escapeAttr(telegramTitleUrl(env, title.id))}">Open in Telegram</a><a class="quiet" href="${escapeAttr(titleUrl)}">View title page</a></div></main>${shareScript()}</body></html>`;
}

function renderShareCardSvg(title: PublicTitle, origin: string, kind: 'progress' | 'demand'): string {
  const titleLines = wrapText(title.title, 34, 3);
  const cover = title.has_cover
    ? `<image href="${escapeAttr(`${origin}/media/covers/${title.id}`)}" x="72" y="74" width="260" height="390" preserveAspectRatio="xMidYMid slice" clip-path="url(#coverClip)"/>`
    : `<rect x="72" y="74" width="260" height="390" rx="26" fill="#f3eee5"/><text x="202" y="285" text-anchor="middle" font-family="Arial,sans-serif" font-size="84" font-weight="800" fill="#b58a42">${escapeXml(initials(title.title))}</text>`;
  const progressWidth = Math.round(630 * (title.progress_percent / 100));
  const headline = kind === 'progress'
    ? `Translation progress · ${title.progress_percent}%`
    : `${title.demand_count} reader${title.demand_count === 1 ? '' : 's'} want this translated`;
  const sub = kind === 'progress'
    ? `Chapter ${title.current_chapter} / ${title.chapter_count}`
    : 'Help move it up the Dollar TL queue';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="${escapeAttr(title.title)}"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#fbf6eb"/></linearGradient><clipPath id="coverClip"><rect x="72" y="74" width="260" height="390" rx="26"/></clipPath></defs><rect width="1200" height="630" fill="url(#bg)"/><circle cx="1110" cy="80" r="230" fill="#d19a3d" opacity=".07"/><rect x="42" y="42" width="1116" height="546" rx="38" fill="none" stroke="#e7dfd2" stroke-width="2"/>${cover}<g transform="translate(390 92)"><text x="0" y="0" font-family="Arial,sans-serif" font-size="22" font-weight="800" letter-spacing="3" fill="#ad792b">DOLLAR TL</text>${titleLines.map((line, index) => `<text x="0" y="${58 + index * 58}" font-family="Georgia,serif" font-size="48" font-weight="700" fill="#1f1d19">${escapeXml(line)}</text>`).join('')}<text x="0" y="252" font-family="Arial,sans-serif" font-size="26" font-weight="700" fill="#6f675d">${escapeXml(headline)}</text><text x="0" y="294" font-family="Arial,sans-serif" font-size="20" fill="#8b8277">${escapeXml(sub)}</text>${kind === 'progress' ? `<rect x="0" y="336" width="630" height="18" rx="9" fill="#ebe6de"/><rect x="0" y="336" width="${progressWidth}" height="18" rx="9" fill="#29251f"/>` : `<rect x="0" y="330" width="300" height="62" rx="18" fill="#29251f"/><text x="150" y="369" text-anchor="middle" font-family="Arial,sans-serif" font-size="20" font-weight="800" fill="#ffffff">REQUEST THIS TRANSLATION</text>`}<text x="0" y="438" font-family="Arial,sans-serif" font-size="19" fill="#8b8277">${escapeXml(title.original_language)} · ${title.chapter_count} chapters${title.raw_available ? ' · RAW available' : ''}</text></g><text x="72" y="544" font-family="Arial,sans-serif" font-size="18" fill="#9a9186">Community-powered novel translations</text></svg>`;
}

function coverMarkup(title: PublicTitle, origin: string): string {
  if (title.has_cover) return `<img src="${escapeAttr(`${origin}/media/covers/${title.id}`)}" alt="Cover of ${escapeAttr(title.title)}" loading="eager" decoding="async">`;
  return `<div class="cover-fallback" aria-hidden="true">${escapeHtml(initials(title.title))}</div>`;
}

function normalizeShareKind(value: string | null, title: PublicTitle): 'progress' | 'demand' {
  if (value === 'progress' && (title.queue_status === 'in_progress' || title.queue_status === 'completed')) return 'progress';
  if (value === 'demand') return 'demand';
  return title.queue_status === 'in_progress' || title.queue_status === 'completed' ? 'progress' : 'demand';
}

function latestReleaseText(title: PublicTitle): string {
  const release = title.latest_release;
  if (!release) return '';
  if (release.chapter_start && release.chapter_end) return release.chapter_start === release.chapter_end ? `Chapter ${release.chapter_start}` : `Chapters ${release.chapter_start}–${release.chapter_end}`;
  if (release.chapter_end) return `Through chapter ${release.chapter_end}`;
  return release.title || '';
}

function telegramTitleUrl(env: Env, id: number): string {
  const username = String(env.BOT_USERNAME || 'dollartlbot').replace(/^@/, '').trim() || 'dollartlbot';
  return `https://t.me/${encodeURIComponent(username)}?startapp=title_${id}`;
}

function miniAppTitleUrl(env: Env, id: number): string {
  try {
    const url = new URL(env.MINI_APP_URL || '/app/', 'https://placeholder.invalid');
    url.searchParams.set('title', String(id));
    if (url.origin === 'https://placeholder.invalid') return `${url.pathname}${url.search}`;
    return url.toString();
  } catch {
    return `/app/?title=${id}`;
  }
}

function htmlResponse(html: string, headOnly: boolean, indexable: boolean): Response {
  const headers = new Headers({
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'public, max-age=60, stale-while-revalidate=300',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'content-security-policy': "default-src 'self'; img-src 'self' data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self' https://t.me",
    'x-robots-tag': indexable ? 'index, follow, max-image-preview:large' : 'noindex, follow',
  });
  return new Response(headOnly ? null : html, { status: 200, headers });
}

function svgResponse(svg: string, headOnly: boolean): Response {
  return new Response(headOnly ? null : svg, { status: 200, headers: {
    'content-type': 'image/svg+xml; charset=utf-8',
    'cache-control': 'public, max-age=120, stale-while-revalidate=600',
    'x-content-type-options': 'nosniff',
  } });
}

function publicNotFound(): Response {
  return new Response('<!doctype html><title>Title not found · Dollar TL</title><meta name="robots" content="noindex"><body style="font-family:system-ui;padding:48px;background:#fcfbf8;color:#24211d"><h1>Title not found</h1><p>This Dollar TL title is unavailable.</p><a href="/app/">Open Dollar TL</a></body>', { status: 404, headers: { 'content-type':'text/html; charset=utf-8', 'x-robots-tag':'noindex' } });
}

function shareScript(): string {
  return `<script>(()=>{document.querySelectorAll('[data-share-url]').forEach(button=>button.addEventListener('click',async()=>{const url=button.dataset.shareUrl;const text=button.dataset.shareText||document.title;try{if(navigator.share){await navigator.share({title:document.title,text,url});return;}}catch(error){if(error&&error.name==='AbortError')return;}const telegram='https://t.me/share/url?url='+encodeURIComponent(url)+'&text='+encodeURIComponent(text);window.open(telegram,'_blank','noopener,noreferrer');}));})();</script>`;
}

function publicStyles(): string {
  return `<style>:root{color-scheme:light;--bg:#fcfbf8;--surface:#fff;--text:#1f1d19;--muted:#746d64;--line:#e7e1d8;--gold:#b77b2c}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 80% 0,rgba(209,154,61,.08),transparent 26rem),var(--bg);color:var(--text);font-family:Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.site-head{height:74px;max-width:1120px;margin:auto;padding:0 24px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(231,225,216,.8)}.brand{display:flex;gap:10px;align-items:center;color:inherit;text-decoration:none}.brand-mark{width:40px;height:40px;border-radius:50%;background:#201e1a;color:#fff;display:grid;place-items:center;font-family:Georgia,serif;font-size:22px}.brand strong,.brand small{display:block}.brand strong{font-family:Georgia,serif;font-size:21px}.brand small{margin-top:2px;color:#8a8278;font-size:10px}.head-link{font-size:12px;font-weight:800;color:#514a42;text-decoration:none}.shell{max-width:1060px;margin:auto;padding:38px 24px 70px}.crumb{font-size:10px;font-weight:800;letter-spacing:.09em;color:#a0712f}.crumb span{padding:0 5px}.hero{display:grid;grid-template-columns:240px minmax(0,1fr);gap:38px;align-items:center;margin-top:20px}.cover-wrap{aspect-ratio:2/3;border-radius:22px;overflow:hidden;border:1px solid var(--line);box-shadow:0 18px 45px rgba(48,38,22,.12);background:#f3eee5}.cover-wrap img{width:100%;height:100%;object-fit:cover}.cover-fallback{width:100%;height:100%;display:grid;place-items:center;font:800 68px Georgia,serif;color:#b58a42;background:linear-gradient(145deg,#f7f1e7,#eee5d6)}.status-line{display:flex;align-items:center;gap:8px;color:#746d64;font-size:11px;font-weight:800}.live-dot{width:8px;height:8px;border-radius:50%;background:#b7b0a6}.live-dot.active{background:#27a65b;box-shadow:0 0 0 4px rgba(39,166,91,.1)}.raw{margin-left:4px;padding:4px 7px;border:1px solid #e3cfaa;border-radius:999px;background:#fff8e9;color:#845d22;font-size:9px}.hero h1{max-width:720px;margin:14px 0 10px;font:600 clamp(34px,5vw,58px)/1.02 Georgia,serif;letter-spacing:-.035em}.meta{display:flex;gap:7px;flex-wrap:wrap;color:#7d756c;font-size:12px}.tags{display:flex;gap:6px;flex-wrap:wrap;margin-top:14px}.tags span{padding:5px 8px;border:1px solid var(--line);border-radius:999px;background:#fff;font-size:10px;color:#6c645b}.demand{display:flex;align-items:baseline;gap:8px;margin-top:24px}.demand strong{font:700 34px Georgia,serif}.demand span{font-size:12px;color:#766e65}.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:18px}.button{min-height:42px;padding:10px 14px;border-radius:12px;border:1px solid #dcd5ca;background:#fff;color:#332e28;text-decoration:none;font:800 11px/1.2 inherit;cursor:pointer;display:inline-flex;align-items:center;justify-content:center}.button.primary{border-color:#24211d;background:#24211d;color:#fff}.button.ghost{background:transparent}.button.large{min-height:48px;padding:13px 20px}.progress-card{margin-top:34px;padding:22px;border:1px solid var(--line);border-radius:20px;background:rgba(255,255,255,.88);box-shadow:0 12px 34px rgba(52,39,21,.05)}.progress-head,.progress-foot{display:flex;justify-content:space-between;gap:12px}.progress-head{font-size:12px}.progress-head strong{font:700 21px Georgia,serif}.track{height:12px;margin:14px 0;border-radius:999px;background:#ebe6de;overflow:hidden}.fill{height:100%;border-radius:inherit;background:#29251f}.progress-foot{color:#81796f;font-size:10px}.info-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:26px}.info-grid article{padding:20px;border-top:2px solid #29251f;background:#fff}.info-grid small,.conversion small{font-size:9px;font-weight:900;letter-spacing:.08em;color:#a2722c}.info-grid strong{display:block;margin-top:9px;font:600 25px Georgia,serif}.info-grid p,.conversion p{margin:7px 0 0;color:#7a7269;font-size:11px;line-height:1.55}.conversion{margin-top:42px;padding:28px 30px;border-radius:24px;background:#f5efe4;display:flex;align-items:center;justify-content:space-between;gap:24px}.conversion h2{margin:7px 0 0;font:600 28px/1.1 Georgia,serif}.conversion p{max-width:620px}footer{padding:24px;text-align:center;border-top:1px solid var(--line);color:#958c81;font-size:10px}@media(max-width:700px){.site-head{height:66px;padding:0 18px}.shell{padding:25px 18px 54px}.hero{grid-template-columns:104px minmax(0,1fr);gap:18px;align-items:start}.cover-wrap{border-radius:14px}.hero h1{font-size:30px;margin-top:10px}.status-line{flex-wrap:wrap}.demand{margin-top:16px}.demand strong{font-size:27px}.actions{grid-column:1/-1}.button{flex:1}.info-grid{grid-template-columns:1fr}.conversion{display:block;padding:23px}.conversion .button{margin-top:18px;width:100%}}@media(max-width:430px){.hero{grid-template-columns:86px minmax(0,1fr);gap:14px}.hero h1{font-size:27px}.meta{font-size:10px}.actions{display:grid;grid-template-columns:1fr 1fr}.actions .button:first-child{grid-column:1/-1}.progress-foot{display:block}.progress-foot span{display:block;margin-top:3px}}</style>`;
}

function sharePageStyles(): string {
  return `<style>*{box-sizing:border-box}body{margin:0;min-height:100vh;background:#f3efe7;color:#26221d;font-family:Inter,system-ui,sans-serif}.share-shell{width:min(100% - 32px,900px);margin:auto;padding:36px 0 60px}.share-brand{display:block;margin-bottom:18px;color:#26221d;text-decoration:none;font:600 24px Georgia,serif}.share-card{display:block;width:100%;border-radius:24px;box-shadow:0 20px 60px rgba(41,33,21,.16)}.share-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:18px}.share-actions button,.share-actions a{min-height:44px;padding:11px 15px;border:1px solid #25211c;border-radius:12px;background:#25211c;color:#fff;text-decoration:none;font:800 11px inherit;cursor:pointer;display:inline-flex;align-items:center}.share-actions a.quiet{background:#fff;color:#453e36;border-color:#dcd4c9}@media(max-width:520px){.share-shell{padding-top:20px}.share-actions{display:grid}.share-actions>*{justify-content:center}}</style>`;
}

function formatShortDate(value: string | null | undefined): string {
  if (!value) return 'recently';
  try { return new Intl.DateTimeFormat('en', { month:'short', day:'numeric', year:'numeric' }).format(new Date(value)); }
  catch { return value.slice(0, 10); }
}

function slugify(value: string): string {
  const slug = value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  return slug || 'novel';
}

function initials(value: string): string {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'DT';
}

function wrapText(value: string, max: number, lines: number): string[] {
  const words = value.trim().split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= max || !current) current = candidate;
    else { out.push(current); current = word; }
    if (out.length === lines - 1) break;
  }
  if (current && out.length < lines) out.push(current);
  const consumed = out.join(' ').split(/\s+/).length;
  if (consumed < words.length && out.length) out[out.length - 1] = `${out[out.length - 1].replace(/[.…]+$/, '')}…`;
  return out;
}

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char] || char));
}
function escapeAttr(value: unknown): string { return escapeHtml(value); }
function escapeXml(value: unknown): string { return escapeHtml(value); }

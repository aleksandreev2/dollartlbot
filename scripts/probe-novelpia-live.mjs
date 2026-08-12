const sources = [
  ['plus_new', 'https://novelpia.com/plus/entry/date?main_genre=', 48],
  ['free_new', 'https://novelpia.com/freestory/new/date/1?main_genre=', 40],
  ['new_rank', 'https://novelpia.com/top100/plus/today/view/all/all?main_genre=', 50],
];

const headers = {
  accept: 'text/html,application/xhtml+xml',
  'accept-language': 'ko-KR,ko;q=0.9,en;q=0.6',
  'user-agent': 'DollarTL-Discovery/2.0',
};

function collect(html, pattern) {
  const out = [];
  for (const match of html.matchAll(pattern)) {
    const id = match[1];
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

function exactExtractNovelIds(html, limit) {
  const positions = new Map();
  const patterns = [
    /(?:https?:\/\/(?:www\.)?novelpia\.com)?\/novel\/(\d{2,9})/gi,
    /(?:novel_no|novelNo)["']?\s*[:=]\s*["']?(\d{2,9})/gi,
    /_(\d{2,9})_(?:ori|thumb|cover)\b/gi,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(html))) {
      const id = match[1];
      const prior = positions.get(id);
      if (prior == null || match.index < prior) positions.set(id, match.index);
      if (positions.size >= limit * 4) break;
    }
  }
  return [...positions.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([id]) => id)
    .slice(0, limit);
}

function meta(html, property) {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const pattern of [
    new RegExp(`<meta\\b[^>]*(?:property|name)=["']${escaped}["'][^>]*content=["']([^"']*)["'][^>]*>`, 'i'),
    new RegExp(`<meta\\b[^>]*content=["']([^"']*)["'][^>]*(?:property|name)=["']${escaped}["'][^>]*>`, 'i'),
  ]) {
    const match = pattern.exec(html);
    if (match?.[1]) return match[1];
  }
  return null;
}

async function get(url) {
  const response = await fetch(url, { headers, redirect: 'follow' });
  const text = await response.text();
  return { response, text };
}

for (const [name, url, limit] of sources) {
  console.log(`\n=== ${name} ===`);
  try {
    const { response, text } = await get(url);
    console.log(JSON.stringify({ status: response.status, final_url: response.url, content_type: response.headers.get('content-type'), bytes: text.length }));

    const pathIds = collect(text, /(?:https?:\/\/(?:www\.)?novelpia\.com)?\/novel\/(\d{2,9})/gi);
    const coverIds = collect(text, /_(\d{2,9})_(?:ori|thumb|cover)\b/gi);
    const exact = exactExtractNovelIds(text.slice(0, 3_000_000), limit);
    const strongSet = new Set(pathIds);
    const exactStrong = exact.filter(id => strongSet.has(id));
    const exactCoverOnly = exact.filter(id => !strongSet.has(id) && coverIds.includes(id));

    console.log(JSON.stringify({
      path_count: pathIds.length,
      cover_count: coverIds.length,
      exact_count: exact.length,
      exact_strong_count: exactStrong.length,
      exact_cover_only_count: exactCoverOnly.length,
      exact_first_24: exact.slice(0, 24),
      exact_cover_only_first: exactCoverOnly.slice(0, 12),
    }, null, 2));

    let validDetail = 0;
    let invalidDetail = 0;
    for (const id of exact.slice(0, 24)) {
      try {
        const detail = await get(`https://novelpia.com/novel/${id}`);
        const ogUrl = meta(detail.text, 'og:url');
        const ogTitle = meta(detail.text, 'og:title');
        const canonicalId = /novelpia\.com\/novel\/(\d{2,9})/i.exec(ogUrl || '')?.[1] || id;
        const titleOk = Boolean(ogTitle && !/^novelpia\s*#?\d+$/i.test(ogTitle));
        const ok = detail.response.status === 200 && canonicalId === id && titleOk;
        if (ok) validDetail += 1; else invalidDetail += 1;
        console.log(JSON.stringify({ id, strong: strongSet.has(id), detail_status: detail.response.status, canonicalId, ogTitle, valid_for_current_parser: ok }));
      } catch (error) {
        invalidDetail += 1;
        console.log(JSON.stringify({ id, strong: strongSet.has(id), detail_error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) }));
      }
    }
    console.log(JSON.stringify({ exact_first_24_valid_detail: validDetail, exact_first_24_invalid_detail: invalidDetail }));
  } catch (error) {
    console.log(JSON.stringify({ source_error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) }));
  }
}

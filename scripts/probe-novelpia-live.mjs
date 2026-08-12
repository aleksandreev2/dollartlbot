const sources = [
  ['plus_new', 'https://novelpia.com/plus/entry/date?main_genre='],
  ['free_new', 'https://novelpia.com/freestory/new/date/1?main_genre='],
  ['new_rank', 'https://novelpia.com/top100/plus/today/view/all/all?main_genre='],
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

for (const [name, url] of sources) {
  console.log(`\n=== ${name} ===`);
  try {
    const { response, text } = await get(url);
    console.log(JSON.stringify({ status: response.status, final_url: response.url, content_type: response.headers.get('content-type'), bytes: text.length }));

    const pathIds = collect(text, /(?:https?:\/\/(?:www\.)?novelpia\.com)?\/novel\/(\d{2,9})/gi);
    const fieldIds = collect(text, /(?:novel_no|novelNo)["']?\s*[:=]\s*["']?(\d{2,9})/gi);
    const coverIds = collect(text, /_(\d{2,9})_(?:ori|thumb|cover)\b/gi);
    const onclickIds = collect(text, /(?:novel_view|goNovel|novelView|location\.href)[^\n]{0,180}?(\d{2,9})/gi);

    console.log(JSON.stringify({
      path_count: pathIds.length,
      field_count: fieldIds.length,
      onclick_count: onclickIds.length,
      cover_count: coverIds.length,
      path_first: pathIds.slice(0, 12),
      field_first: fieldIds.slice(0, 12),
      onclick_first: onclickIds.slice(0, 12),
      cover_first: coverIds.slice(0, 12),
    }, null, 2));

    const candidates = [...new Set([...pathIds, ...fieldIds, ...onclickIds])].slice(0, 5);
    if (!candidates.length) {
      console.log('NO STRONG IDS; probing first two cover ids to prove whether cover ids are novel ids');
      candidates.push(...coverIds.slice(0, 2));
    }

    for (const id of candidates) {
      try {
        const detail = await get(`https://novelpia.com/novel/${id}`);
        const body = detail.text.replace(/\s+/g, ' ');
        const chapter = /([\d,]{1,8})\s*회차/u.exec(body)?.[1] ?? null;
        console.log(JSON.stringify({
          id,
          detail_status: detail.response.status,
          detail_final_url: detail.response.url,
          detail_bytes: detail.text.length,
          og_url: meta(detail.text, 'og:url'),
          og_title: meta(detail.text, 'og:title'),
          chapter,
          has_login_redirect_copy: /로그인|login/i.test(body.slice(0, 12000)),
        }));
      } catch (error) {
        console.log(JSON.stringify({ id, detail_error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) }));
      }
    }
  } catch (error) {
    console.log(JSON.stringify({ source_error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) }));
  }
}

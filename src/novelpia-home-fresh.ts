const NOVELPIA_ORIGIN = 'https://novelpia.com';
const HOMEPAGE_FRESH_PATH = '/proc/main_v2';
const FETCH_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 512_000;
const MAX_ITEMS = 7;

export type NovelpiaHomepageFreshItem = {
  externalId: string;
  title: string;
  author: string | null;
  coverUrl: string | null;
  rank: number;
};

type HomepageFreshPayload = {
  status?: unknown;
  list?: unknown;
};

export async function fetchNovelpiaHomepageFresh(): Promise<NovelpiaHomepageFreshItem[]> {
  const url = new URL(HOMEPAGE_FRESH_PATH, NOVELPIA_ORIGIN);
  url.searchParams.set('cmd', 'new_novel_curation');
  url.searchParams.set('novel_category', 'entry');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url.toString(), {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        accept: 'application/json,text/plain,*/*',
        'accept-language': 'ko-KR,ko;q=0.9,en;q=0.6',
        referer: `${NOVELPIA_ORIGIN}/`,
        'user-agent': 'DollarTL-Discovery/2.0',
      },
    });
    if (!response.ok) throw new Error(`novelpia_home_fresh_http_${response.status}`);

    const finalUrl = new URL(response.url);
    if (!isNovelpiaHost(finalUrl.hostname)) throw new Error('novelpia_home_fresh_redirect_host');
    if (finalUrl.pathname !== HOMEPAGE_FRESH_PATH) throw new Error('novelpia_home_fresh_redirect_path');

    const text = await readResponseTextLimited(response, MAX_RESPONSE_BYTES);
    let payload: HomepageFreshPayload;
    try {
      payload = JSON.parse(text) as HomepageFreshPayload;
    } catch {
      throw new Error('novelpia_home_fresh_invalid_json');
    }
    if (Number(payload?.status) !== 200) throw new Error('novelpia_home_fresh_bad_status');
    if (!Array.isArray(payload?.list)) throw new Error('novelpia_home_fresh_missing_list');

    const out: NovelpiaHomepageFreshItem[] = [];
    const seen = new Set<string>();
    for (const value of payload.list) {
      if (!isRecord(value)) continue;
      const link = typeof value.link_url === 'string' ? value.link_url.trim() : '';
      const externalId = extractOfficialNovelLinkId(link);
      if (!externalId) continue;

      // NovelPia currently supplies both link_url and novel_no. Require them to agree so
      // a malformed curation row can never point Dollar TL at an unrelated novel.
      const declaredId = String(value.novel_no ?? '').trim();
      if (!/^\d{2,9}$/.test(declaredId) || declaredId !== externalId) continue;
      if (seen.has(externalId)) continue;

      const title = typeof value.novel_name === 'string' ? collapse(value.novel_name).slice(0, 240) : '';
      if (!title) continue;
      const author = typeof value.writer_nick === 'string'
        ? collapse(value.writer_nick).slice(0, 120) || null
        : null;
      const coverUrl = typeof value.novel_thumb === 'string'
        ? normalizeOfficialAssetUrl(value.novel_thumb)
        : null;

      seen.add(externalId);
      out.push({
        externalId,
        title,
        author,
        coverUrl,
        rank: out.length + 1,
      });
      if (out.length >= MAX_ITEMS) break;
    }

    if (!out.length) throw new Error('novelpia_home_fresh_empty');
    return out;
  } finally {
    clearTimeout(timer);
  }
}

function extractOfficialNovelLinkId(value: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value, NOVELPIA_ORIGIN);
    if (url.protocol !== 'https:' || !isNovelpiaHost(url.hostname)) return null;
    const match = /^\/novel\/(\d{2,9})\/?$/i.exec(url.pathname);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

function normalizeOfficialAssetUrl(value: string): string | null {
  try {
    const url = new URL(value, NOVELPIA_ORIGIN);
    if (url.protocol !== 'https:') return null;
    if (url.hostname !== 'images.novelpia.com') return null;
    return url.toString();
  } catch {
    return null;
  }
}

async function readResponseTextLimited(response: Response, maxBytes: number): Promise<string> {
  const declared = Number(response.headers.get('content-length') ?? 0);
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new Error('novelpia_home_fresh_response_too_large');
  }
  if (!response.body) {
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > maxBytes) {
      throw new Error('novelpia_home_fresh_response_too_large');
    }
    return text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new Error('novelpia_home_fresh_response_too_large');
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  return text;
}

function isNovelpiaHost(hostname: string): boolean {
  return hostname === 'novelpia.com' || hostname === 'www.novelpia.com';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function collapse(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

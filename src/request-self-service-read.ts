export async function enhanceRequestSelfServiceRead(
  request: Request,
  response: Response,
  env: Env,
): Promise<Response> {
  const url = new URL(request.url);
  if (request.method !== 'GET' || !response.ok || !['/api/app/bootstrap', '/api/app/requests'].includes(url.pathname)) {
    return response;
  }

  let data: any;
  try {
    data = await response.json();
  } catch {
    return response;
  }
  const list: any[] = url.pathname === '/api/app/bootstrap'
    ? (Array.isArray(data?.my_requests) ? data.my_requests : [])
    : (Array.isArray(data?.requests) ? data.requests : []);
  const ids = [...new Set(list.map(row => Number(row?.id)).filter(id => Number.isSafeInteger(id) && id > 0))].slice(0, 100);
  if (!ids.length) return jsonLike(response, data);

  const placeholders = ids.map(() => '?').join(',');
  const rows = await env.DB.prepare(`
    SELECT id,COALESCE(review_state,'ready') AS review_state,review_requested_at,review_resolved_at,withdrawn_at
    FROM submissions WHERE id IN (${placeholders})
  `).bind(...ids).all<{
    id: number;
    review_state: string;
    review_requested_at: string | null;
    review_resolved_at: string | null;
    withdrawn_at: string | null;
  }>();
  const review = new Map(rows.results.map(row => [Number(row.id), row]));
  const enriched = list.map(row => {
    const meta = review.get(Number(row.id));
    if (!meta) return row;
    const state = meta.withdrawn_at
      ? 'withdrawn'
      : row.status === 'pending' && meta.review_state === 'needs_info'
        ? 'needs_info'
        : row.status === 'pending' && meta.review_state === 'user_replied'
          ? 'user_replied'
          : row.state;
    return { ...row, ...meta, state };
  });

  if (url.pathname === '/api/app/bootstrap') data.my_requests = enriched;
  else data.requests = enriched;
  return jsonLike(response, data);
}

function jsonLike(response: Response, data: unknown): Response {
  const headers = new Headers(response.headers);
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.delete('content-length');
  return new Response(JSON.stringify(data), { status: response.status, statusText: response.statusText, headers });
}

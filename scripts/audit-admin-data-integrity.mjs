import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const need = (source, token, label = token) => { if (!source.includes(token)) throw new Error(`Missing ${label}: ${token}`); };
const forbid = (source, token, label = token) => { if (source.includes(token)) throw new Error(`Forbidden ${label}: ${token}`); };

const ops = read('src/admin-request-ops.ts');
const queue = read('src/queue.ts');
const core = read('src/miniapp-core.ts');
const adapter = read('public/app/admin-data-v2.js');
const index = read('public/app/index.html');

for (const token of [
  'WITH ordered AS (',
  'ROW_NUMBER() OVER (ORDER BY COALESCE(queue_position,2147483647),id) AS rn',
  'desired_order AS (',
  'UNION ALL SELECT ?,?',
  'atomic:true',
]) need(ops, token, 'atomic exact queue reorder');

for (const token of [
  'WITH ranked AS (',
  'ROW_NUMBER() OVER (ORDER BY COALESCE(queue_position, 2147483647), id) AS next_position',
  'changed AS (',
  'UPDATE submissions',
]) need(queue, token, 'atomic queue normalization');
forbid(queue, 'if (updates.length) await env.DB.batch(updates)', 'stale read-then-batch queue normalization');

for (const token of [
  "'/api/app/admin/list'",
  "['pending', 'active', 'completed', 'rejected', 'all', 'queue'].includes(kind)",
  "boundedInt(url.searchParams.get('limit'), 30, 1, 50)",
  "url.searchParams.get('cursor')",
  "url.searchParams.get('q')",
  "LIKE ? ESCAPE '!'",
  'next_cursor',
  'has_more',
  "kind === 'active'",
  "kind === 'completed'",
  "kind === 'rejected'",
  'const limit = 500;',
]) need(core, token, 'server-side admin request list');

for (const token of [
  'runtime.registerFetchMiddleware',
  "url.pathname !== '/api/app/admin/list'",
  "adminRuntime.activeRoute?.() !== 'section:requests'",
  'DTL_ADMIN_WORKFLOW?.state?.()',
  "params.set('kind', state.requestFilter || 'pending')",
  "params.set('q', q)",
  "params.set('cursor', String(nextCursor))",
  'PAGE_SIZE = 30',
  'data-admin-data-load-more',
  'adminRuntime.refresh()',
  'window.DTL_ADMIN_DATA_V2',
  "reset('')",
]) need(adapter, token, 'server-backed Requests pagination adapter');
forbid(adapter, 'new MutationObserver', 'extra DOM observer');
forbid(adapter, 'window.fetch =', 'direct fetch ownership');
forbid(adapter, "if (event.detail?.id === 'section:requests') {\n      reset();", 'route-mount cursor reset');

need(index, '/app/admin-data-v2.js?v=20260811-data2', 'Admin 4.2 adapter asset');
const workflowAt = index.indexOf('/app/admin-workflow.js?v=20260811-workflow1');
const adapterAt = index.indexOf('/app/admin-data-v2.js?v=20260811-data2');
if (!(workflowAt >= 0 && adapterAt > workflowAt)) throw new Error('Admin data adapter must load after admin-workflow.js.');

new Function(adapter);
console.log('Admin data integrity audit passed: atomic queue reorder/normalization and server-side request filters/search/cursor pagination are wired through canonical runtimes without resetting the first page after route mount.');

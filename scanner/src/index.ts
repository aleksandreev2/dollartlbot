import { Container, getContainer } from '@cloudflare/containers';

type ScannerEnv = {
  CLAMAV: DurableObjectNamespace<ClamAVContainer>;
  ASSET_SCANNER_TOKEN?: string;
  MAIN_WORKER_ORIGIN: string;
  SCANNER_ID: string;
};

export class ClamAVContainer extends Container {
  defaultPort = 8080;
  sleepAfter = '30s';
}

async function runScanner(env: ScannerEnv): Promise<void> {
  const token = String(env.ASSET_SCANNER_TOKEN || '').trim();
  if (!token) throw new Error('ASSET_SCANNER_TOKEN is not configured for scanner worker');

  const mainOrigin = new URL(env.MAIN_WORKER_ORIGIN).origin;
  const scannerId = String(env.SCANNER_ID || 'clamav-primary').trim() || 'clamav-primary';
  const container = getContainer(env.CLAMAV, 'primary');
  const response = await container.fetch(new Request('http://container/run', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'x-main-origin': mainOrigin,
      'x-scanner-id': scannerId,
      'content-type': 'application/json',
    },
    body: '{}',
  }));
  if (!response.ok) {
    const body = (await response.text().catch(() => '')).slice(0, 1000);
    throw new Error(`ClamAV scanner run failed: HTTP ${response.status} ${body}`);
  }
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health') {
      return new Response(JSON.stringify({ ok: true, service: 'dollartlbot-clamav-scanner' }), {
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
        },
      });
    }
    return new Response('Not found', { status: 404 });
  },

  async scheduled(_controller: ScheduledController, env: ScannerEnv, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runScanner(env));
  },
} satisfies ExportedHandler<ScannerEnv>;

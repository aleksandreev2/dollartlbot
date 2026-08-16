import { isAdmin } from './db';
import { getRuntimeSettings, runtimeNumber } from './runtime-settings';
import type { TelegramUpdate, TelegramUser } from './telegram';

type GuardKind = 'command' | 'callback' | 'message';
type GuardMode = 'off' | 'monitor' | 'enforce';

type GuardConfig = {
  global10: number;
  global60: number;
  commands10: number;
  commands60: number;
  callbacks10: number;
  callbacks60: number;
  sameActionCooldownMs: number;
  tempBlockMs: number;
};

type GuardRequest = {
  now: number;
  action: string;
  kind: GuardKind;
  mode: GuardMode;
  config: GuardConfig;
};

type GuardResponse = {
  allowed: boolean;
  wouldBlock: boolean;
  reason: string | null;
  score: number;
  hits: number;
  windowSeconds: number | null;
  notify: boolean;
};

export type AntiAbuseDecision = GuardResponse & {
  user: TelegramUser | null;
  action: string | null;
  mode: GuardMode;
};

type StoredGuardState = {
  globalEvents: number[];
  commandEvents: number[];
  callbackEvents: number[];
  lastActions: Record<string, number>;
  blockedUntil: number;
  abuseScore: number;
  lastNoticeAt: number;
};

const CONFIG_KEYS = [
  'anti_abuse_mode',
  'anti_abuse_global_limit_10s',
  'anti_abuse_global_limit_60s',
  'anti_abuse_commands_limit_10s',
  'anti_abuse_commands_limit_60s',
  'anti_abuse_callbacks_limit_10s',
  'anti_abuse_callbacks_limit_60s',
  'anti_abuse_same_action_cooldown_ms',
  'anti_abuse_temp_block_seconds',
] as const;

const NOTICE_COOLDOWN_MS = 25_000;
const PERSIST_INTERVAL_MS = 5_000;

export async function guardTelegramUpdate(
  update: TelegramUpdate,
  env: Env,
  ctx: ExecutionContext,
): Promise<AntiAbuseDecision> {
  const user = updateActor(update);
  if (!user || isAdmin(user.id, env)) return allow(user, null, 'off');

  const action = updateAction(update);
  if (!action) return allow(user, null, 'off');

  if (user.is_bot) {
    const decision: AntiAbuseDecision = {
      allowed: false,
      wouldBlock: true,
      reason: 'telegram_bot_account',
      score: 100,
      hits: 1,
      windowSeconds: null,
      notify: false,
      user,
      action,
      mode: 'enforce',
    };
    ctx.waitUntil(recordAntiAbuseEvent(env, decision));
    return decision;
  }

  const values = await getRuntimeSettings(env, CONFIG_KEYS);
  const mode = normalizeMode(values.anti_abuse_mode);
  if (mode === 'off') return allow(user, action, mode);

  const config: GuardConfig = {
    global10: runtimeNumber(values, 'anti_abuse_global_limit_10s', 12, 4, 500),
    global60: runtimeNumber(values, 'anti_abuse_global_limit_60s', 60, 10, 2_000),
    commands10: runtimeNumber(values, 'anti_abuse_commands_limit_10s', 5, 2, 200),
    commands60: runtimeNumber(values, 'anti_abuse_commands_limit_60s', 20, 5, 1_000),
    callbacks10: runtimeNumber(values, 'anti_abuse_callbacks_limit_10s', 8, 2, 300),
    callbacks60: runtimeNumber(values, 'anti_abuse_callbacks_limit_60s', 30, 5, 1_500),
    sameActionCooldownMs: runtimeNumber(values, 'anti_abuse_same_action_cooldown_ms', 1_500, 100, 30_000),
    tempBlockMs: runtimeNumber(values, 'anti_abuse_temp_block_seconds', 900, 10, 86_400) * 1_000,
  };

  const id = env.USER_GUARD.idFromName(String(user.id));
  const stub = env.USER_GUARD.get(id);
  const response = await stub.fetch('https://user-guard.internal/check', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ now: Date.now(), action, kind: updateKind(update), mode, config } satisfies GuardRequest),
  });
  if (!response.ok) return allow(user, action, mode);

  const guarded = await response.json<GuardResponse>();
  const decision: AntiAbuseDecision = { ...guarded, user, action, mode };
  if (decision.wouldBlock) ctx.waitUntil(recordAntiAbuseEvent(env, decision));
  return decision;
}

export class UserGuard {
  private state: StoredGuardState = emptyState();
  private loaded = false;
  private lastPersistAt = 0;

  constructor(private readonly ctx: DurableObjectState, _env: Env) {
    this.ctx.blockConcurrencyWhile(async () => {
      const stored = await this.ctx.storage.get<StoredGuardState>('guard');
      if (stored) this.state = sanitizeStoredState(stored);
      this.loaded = true;
    });
  }

  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
    let input: GuardRequest;
    try {
      input = await request.json<GuardRequest>();
    } catch {
      return Response.json({ error: 'invalid_request' }, { status: 400 });
    }
    if (!this.loaded) return Response.json({ error: 'not_ready' }, { status: 503 });

    const result = await this.evaluate(input);
    return Response.json(result);
  }

  private async evaluate(input: GuardRequest): Promise<GuardResponse> {
    const now = finiteTime(input.now);
    const config = input.config;
    prune(this.state.globalEvents, now - 60_000);
    prune(this.state.commandEvents, now - 60_000);
    prune(this.state.callbackEvents, now - 60_000);
    pruneActions(this.state.lastActions, now - 60_000);

    if (this.state.blockedUntil > now) {
      const notify = this.consumeNotice(now);
      await this.persist(now, true);
      return {
        allowed: input.mode !== 'enforce',
        wouldBlock: true,
        reason: 'temporary_block',
        score: this.state.abuseScore,
        hits: 1,
        windowSeconds: Math.max(1, Math.ceil((this.state.blockedUntil - now) / 1_000)),
        notify,
      };
    }

    const previousActionAt = this.state.lastActions[input.action] || 0;
    this.state.lastActions[input.action] = now;
    this.state.globalEvents.push(now);
    if (input.kind === 'command') this.state.commandEvents.push(now);
    if (input.kind === 'callback') this.state.callbackEvents.push(now);

    const global10 = countSince(this.state.globalEvents, now - 10_000);
    const global60 = this.state.globalEvents.length;
    const commands10 = countSince(this.state.commandEvents, now - 10_000);
    const commands60 = this.state.commandEvents.length;
    const callbacks10 = countSince(this.state.callbackEvents, now - 10_000);
    const callbacks60 = this.state.callbackEvents.length;

    let reason: string | null = null;
    let hits = 1;
    let windowSeconds: number | null = null;
    let severity = 0;

    if (previousActionAt && now - previousActionAt < config.sameActionCooldownMs) {
      reason = 'same_action_cooldown';
      hits = 2;
      windowSeconds = Math.max(1, Math.ceil(config.sameActionCooldownMs / 1_000));
      severity = 1;
    }
    if (global10 > config.global10) {
      reason = 'global_10s_limit'; hits = global10; windowSeconds = 10; severity = Math.max(severity, 2);
    } else if (global60 > config.global60) {
      reason = 'global_60s_limit'; hits = global60; windowSeconds = 60; severity = Math.max(severity, 2);
    }
    if (input.kind === 'command' && commands10 > config.commands10) {
      reason = 'commands_10s_limit'; hits = commands10; windowSeconds = 10; severity = Math.max(severity, 2);
    } else if (input.kind === 'command' && commands60 > config.commands60) {
      reason = 'commands_60s_limit'; hits = commands60; windowSeconds = 60; severity = Math.max(severity, 2);
    }
    if (input.kind === 'callback' && callbacks10 > config.callbacks10) {
      reason = 'callbacks_10s_limit'; hits = callbacks10; windowSeconds = 10; severity = Math.max(severity, 2);
    } else if (input.kind === 'callback' && callbacks60 > config.callbacks60) {
      reason = 'callbacks_60s_limit'; hits = callbacks60; windowSeconds = 60; severity = Math.max(severity, 2);
    }

    const wouldBlock = Boolean(reason);
    if (wouldBlock) {
      this.state.abuseScore = Math.min(100, this.state.abuseScore + severity);
      const severeBurst = global10 > config.global10 * 2
        || commands10 > config.commands10 * 2
        || callbacks10 > config.callbacks10 * 2;
      if (input.mode === 'enforce' && (severeBurst || this.state.abuseScore >= 10)) {
        this.state.blockedUntil = now + config.tempBlockMs;
        reason = 'temporary_block';
        windowSeconds = Math.ceil(config.tempBlockMs / 1_000);
      }
    } else if (this.state.abuseScore > 0 && this.state.globalEvents.length <= 2) {
      this.state.abuseScore -= 1;
    }

    const notify = wouldBlock ? this.consumeNotice(now) : false;
    await this.persist(now, this.state.blockedUntil > now);
    return {
      allowed: input.mode !== 'enforce' || !wouldBlock,
      wouldBlock,
      reason,
      score: this.state.abuseScore,
      hits,
      windowSeconds,
      notify,
    };
  }

  private consumeNotice(now: number): boolean {
    if (now - this.state.lastNoticeAt < NOTICE_COOLDOWN_MS) return false;
    this.state.lastNoticeAt = now;
    return true;
  }

  private async persist(now: number, force: boolean): Promise<void> {
    if (!force && now - this.lastPersistAt < PERSIST_INTERVAL_MS) return;
    this.lastPersistAt = now;
    await this.ctx.storage.put('guard', this.state);
  }
}

async function recordAntiAbuseEvent(env: Env, decision: AntiAbuseDecision): Promise<void> {
  if (!decision.user || !decision.action || !decision.reason) return;
  const now = new Date().toISOString();
  const limited = decision.mode === 'enforce' && !decision.allowed ? 1 : 0;
  const tempBlock = decision.reason === 'temporary_block' ? 1 : 0;
  const metadata = JSON.stringify({
    mode: decision.mode,
    username: decision.user.username || null,
    first_name: decision.user.first_name || null,
  });
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO anti_abuse_events(user_id,action,decision,reason,hits,window_seconds,metadata_json,created_at)
      VALUES (?,?,?,?,?,?,?,?)
    `).bind(
      decision.user.id,
      decision.action,
      decision.mode === 'monitor' ? 'monitor' : (decision.allowed ? 'allow' : 'limited'),
      decision.reason,
      decision.hits,
      decision.windowSeconds,
      metadata,
      now,
    ),
    env.DB.prepare(`
      INSERT INTO anti_abuse_user_stats(
        user_id,total_limited,total_temp_blocks,abuse_score,last_action,last_decision,last_reason,last_event_at,updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?)
      ON CONFLICT(user_id) DO UPDATE SET
        total_limited=anti_abuse_user_stats.total_limited+excluded.total_limited,
        total_temp_blocks=anti_abuse_user_stats.total_temp_blocks+excluded.total_temp_blocks,
        abuse_score=MAX(anti_abuse_user_stats.abuse_score,excluded.abuse_score),
        last_action=excluded.last_action,
        last_decision=excluded.last_decision,
        last_reason=excluded.last_reason,
        last_event_at=excluded.last_event_at,
        updated_at=excluded.updated_at
    `).bind(
      decision.user.id,
      limited,
      tempBlock,
      decision.score,
      decision.action,
      decision.mode === 'monitor' ? 'monitor' : (decision.allowed ? 'allow' : 'limited'),
      decision.reason,
      now,
      now,
    ),
  ]).catch(() => undefined);
}

function updateActor(update: TelegramUpdate): TelegramUser | null {
  if (update.callback_query?.from) return update.callback_query.from;
  if (update.message?.chat.type === 'private' && update.message.from) return update.message.from;
  return null;
}

function updateKind(update: TelegramUpdate): GuardKind {
  if (update.callback_query) return 'callback';
  const text = update.message?.text?.trim() || '';
  return text.startsWith('/') ? 'command' : 'message';
}

function updateAction(update: TelegramUpdate): string | null {
  if (update.callback_query) {
    const data = String(update.callback_query.data || 'unknown');
    const family = data.split(':', 1)[0].replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 40) || 'unknown';
    return `callback:${family}`;
  }
  const message = update.message;
  if (!message || message.chat.type !== 'private') return null;
  const text = message.text?.trim() || '';
  if (text.startsWith('/')) {
    const command = (text.split(/\s+/, 1)[0] || '/unknown').split('@', 1)[0].toLowerCase().slice(0, 48);
    return `command:${command}`;
  }
  if (message.document) return 'message:document';
  if (message.photo?.length) return 'message:photo';
  return 'message:text';
}

function normalizeMode(value: string): GuardMode {
  const mode = value.trim().toLowerCase();
  return mode === 'enforce' || mode === 'off' ? mode : 'monitor';
}

function allow(user: TelegramUser | null, action: string | null, mode: GuardMode): AntiAbuseDecision {
  return { allowed: true, wouldBlock: false, reason: null, score: 0, hits: 0, windowSeconds: null, notify: false, user, action, mode };
}

function emptyState(): StoredGuardState {
  return { globalEvents: [], commandEvents: [], callbackEvents: [], lastActions: {}, blockedUntil: 0, abuseScore: 0, lastNoticeAt: 0 };
}

function sanitizeStoredState(value: StoredGuardState): StoredGuardState {
  return {
    globalEvents: Array.isArray(value.globalEvents) ? value.globalEvents.filter(Number.isFinite).slice(-100) : [],
    commandEvents: Array.isArray(value.commandEvents) ? value.commandEvents.filter(Number.isFinite).slice(-100) : [],
    callbackEvents: Array.isArray(value.callbackEvents) ? value.callbackEvents.filter(Number.isFinite).slice(-100) : [],
    lastActions: value.lastActions && typeof value.lastActions === 'object' ? value.lastActions : {},
    blockedUntil: Number(value.blockedUntil || 0),
    abuseScore: Math.max(0, Math.min(100, Number(value.abuseScore || 0))),
    lastNoticeAt: Number(value.lastNoticeAt || 0),
  };
}

function finiteTime(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : Date.now();
}

function prune(values: number[], cutoff: number): void {
  let remove = 0;
  while (remove < values.length && values[remove] < cutoff) remove += 1;
  if (remove) values.splice(0, remove);
}

function pruneActions(values: Record<string, number>, cutoff: number): void {
  for (const [key, value] of Object.entries(values)) if (value < cutoff) delete values[key];
}

function countSince(values: number[], cutoff: number): number {
  let index = 0;
  while (index < values.length && values[index] < cutoff) index += 1;
  return values.length - index;
}

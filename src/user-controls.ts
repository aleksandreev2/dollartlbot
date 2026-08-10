import { errorText, getUser, isAdmin } from './db';
import { normalizeLocale, t } from './i18n/index';
import type { TelegramClient, TelegramUpdate } from './telegram';

export type UserAdminControl = {
  user_id: number;
  notes: string;
  tags_json: string;
  blocked_at: string | null;
  blocked_by: number | null;
  blocked_reason: string | null;
  updated_at: string;
};

export async function getUserAdminControl(env: Env, userId: number): Promise<UserAdminControl | null> {
  try {
    return await env.DB.prepare(`
      SELECT user_id,notes,tags_json,blocked_at,blocked_by,blocked_reason,updated_at
      FROM user_admin_controls WHERE user_id=?
    `).bind(userId).first<UserAdminControl>();
  } catch (error) {
    if (isMissingControlSchema(error)) return null;
    throw error;
  }
}

export async function isUserAdministrativelyBlocked(env: Env, userId: number): Promise<boolean> {
  const control = await getUserAdminControl(env, userId);
  return Boolean(control?.blocked_at);
}

export async function denyBlockedPrivateBotUpdate(
  update: TelegramUpdate,
  env: Env,
  telegram: TelegramClient,
): Promise<boolean> {
  const actor = privateActor(update);
  if (!actor || isAdmin(actor.id, env)) return false;
  if (!(await isUserAdministrativelyBlocked(env, actor.id))) return false;

  const user = await getUser(env, actor.id).catch(() => null);
  const locale = normalizeLocale(user?.language);
  await telegram.sendMessage(actor.id, `<b>${t(locale, 'accessRestrictedTitle')}</b>\n\n${t(locale, 'accessRestrictedText')}`)
    .catch((error) => console.warn(JSON.stringify({
      event: 'blocked_user_notice_failed',
      user_id: actor.id,
      error: errorText(error),
    })));
  return true;
}

export function parseAdminTags(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 12);
  } catch {
    return [];
  }
}

export function normalizeAdminTags(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const raw of values) {
    const tag = String(raw || '').trim().replace(/\s+/g, ' ').slice(0, 32);
    if (!tag) continue;
    const key = tag.toLocaleLowerCase('en-US');
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
    if (tags.length >= 12) break;
  }
  return tags;
}

function privateActor(update: TelegramUpdate) {
  if (update.message?.chat.type === 'private' && update.message.from) return update.message.from;
  if (update.callback_query?.message?.chat.type === 'private') return update.callback_query.from;
  return null;
}

function isMissingControlSchema(error: unknown): boolean {
  const text = errorText(error).toLowerCase();
  return text.includes('no such table: user_admin_controls') || text.includes('no such table: user_admin_messages');
}

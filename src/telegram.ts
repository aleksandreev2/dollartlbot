export interface TelegramUser {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  photo_url?: string;
}

export interface TelegramChat {
  id: number;
  type: 'private' | 'group' | 'supergroup' | 'channel';
  title?: string;
  username?: string;
}

export interface TelegramDocument {
  file_id: string;
  file_unique_id: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

export interface TelegramPhotoSize {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
}

export type TelegramMessageOrigin =
  | { type: 'channel'; date?: number; chat: TelegramChat; message_id: number; author_signature?: string }
  | { type: string; date?: number; [key: string]: unknown };

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  text?: string;
  caption?: string;
  document?: TelegramDocument;
  photo?: TelegramPhotoSize[];
  is_automatic_forward?: boolean;
  forward_origin?: TelegramMessageOrigin;
  reply_to_message?: TelegramMessage;
}

export interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
}

export interface TelegramChatInviteLink {
  invite_link: string;
  name?: string;
  creator?: TelegramUser;
  creates_join_request?: boolean;
  is_primary?: boolean;
  is_revoked?: boolean;
}

export interface TelegramChatMember {
  status: 'creator' | 'administrator' | 'member' | 'restricted' | 'left' | 'kicked' | string;
  user: TelegramUser;
  is_member?: boolean;
}

export function isActiveChatMember(member: Pick<TelegramChatMember, 'status' | 'is_member'>): boolean {
  return member.status === 'creator'
    || member.status === 'administrator'
    || member.status === 'member'
    || (member.status === 'restricted' && member.is_member === true);
}

export interface TelegramChatMemberUpdated {
  chat: TelegramChat;
  from: TelegramUser;
  date: number;
  old_chat_member: TelegramChatMember;
  new_chat_member: TelegramChatMember;
  invite_link?: TelegramChatInviteLink;
  via_join_request?: boolean;
  via_chat_folder_invite_link?: boolean;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  channel_post?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
  chat_member?: TelegramChatMemberUpdated;
}

export interface InlineKeyboardButton {
  text: string;
  callback_data?: string;
  url?: string;
  web_app?: { url: string };
}

export interface InlineKeyboardMarkup {
  inline_keyboard: InlineKeyboardButton[][];
}

type TelegramResponseParameters = {
  retry_after?: number;
  migrate_to_chat_id?: number;
};

interface TelegramApiEnvelope<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
  parameters?: TelegramResponseParameters;
}

export class TelegramApiError extends Error {
  readonly method: string;
  readonly code?: number;
  readonly httpStatus?: number;
  readonly retryAfter?: number;

  constructor(
    method: string,
    description: string,
    code?: number,
    options: { httpStatus?: number; retryAfter?: number } = {},
  ) {
    super(`Telegram ${method} failed: ${description}`);
    this.name = 'TelegramApiError';
    this.method = method;
    this.code = code;
    this.httpStatus = options.httpStatus;
    this.retryAfter = options.retryAfter;
  }
}

const JSON_REQUEST_TIMEOUT_MS = 20_000;
const UPLOAD_REQUEST_TIMEOUT_MS = 120_000;
const MAX_INLINE_RATE_LIMIT_RETRIES = 1;
const MAX_INLINE_RETRY_AFTER_SECONDS = 5;
const SAFE_SERVER_RETRY_METHODS = new Set([
  'getChatMember',
  'editMessageText',
  'editMessageReplyMarkup',
  'answerCallbackQuery',
]);

function normalizeHtml(text: string): string {
  return text.replace(/&(?!lt;|gt;|amp;|quot;|#\d+;)/g, '&amp;');
}

function normalizeChatId(chatId: number | string): number | string {
  if (typeof chatId === 'string' && /^-?\d+$/.test(chatId)) {
    const numeric = Number(chatId);
    if (Number.isSafeInteger(numeric)) return numeric;
  }
  return chatId;
}

type SendOptions = {
  reply_markup?: InlineKeyboardMarkup;
  disable_web_page_preview?: boolean;
  disable_notification?: boolean;
  reply_to_message_id?: number;
  has_spoiler?: boolean;
};

export class TelegramClient {
  private readonly baseUrl: string;

  constructor(token: string, readonly env?: Env) {
    this.baseUrl = `https://api.telegram.org/bot${token}`;
  }

  async call<T>(method: string, payload: Record<string, unknown>): Promise<T> {
    const url = `${this.baseUrl}/${method}`;
    const bodyText = JSON.stringify(payload);
    const retryServerErrors = SAFE_SERVER_RETRY_METHODS.has(method);
    let rateLimitRetries = 0;
    let serverRetries = 0;

    for (;;) {
      let response: Response;
      try {
        response = await fetchWithTimeout(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: bodyText,
        }, JSON_REQUEST_TIMEOUT_MS);
      } catch (error) {
        if (retryServerErrors && serverRetries < 1) {
          serverRetries += 1;
          await sleep(250);
          continue;
        }
        throw transportError(method, error);
      }

      const body = await readTelegramEnvelope<T>(response);
      if (response.ok && body.ok && body.result !== undefined) return body.result;

      const retryAfter = positiveInteger(body.parameters?.retry_after);
      if (
        (response.status === 429 || body.error_code === 429)
        && retryAfter !== undefined
        && retryAfter <= MAX_INLINE_RETRY_AFTER_SECONDS
        && rateLimitRetries < MAX_INLINE_RATE_LIMIT_RETRIES
      ) {
        rateLimitRetries += 1;
        await sleep(retryAfter * 1000);
        continue;
      }

      if (response.status >= 500 && retryServerErrors && serverRetries < 1) {
        serverRetries += 1;
        await sleep(250);
        continue;
      }

      throw telegramApiError(method, response, body);
    }
  }

  sendMessage(chatId: number | string, text: string, options: SendOptions = {}): Promise<TelegramMessage> {
    return this.call<TelegramMessage>('sendMessage', {
      chat_id: normalizeChatId(chatId),
      text: normalizeHtml(text),
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: options.disable_web_page_preview ?? true },
      ...(options.disable_notification ? { disable_notification: true } : {}),
      ...(options.reply_to_message_id ? { reply_parameters: { message_id: options.reply_to_message_id } } : {}),
      ...(options.reply_markup ? { reply_markup: options.reply_markup } : {}),
    });
  }

  editMessageText(
    chatId: number | string,
    messageId: number,
    text: string,
    options: { reply_markup?: InlineKeyboardMarkup; disable_web_page_preview?: boolean } = {},
  ): Promise<TelegramMessage | boolean> {
    return this.call<TelegramMessage | boolean>('editMessageText', {
      chat_id: normalizeChatId(chatId),
      message_id: messageId,
      text: normalizeHtml(text),
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: options.disable_web_page_preview ?? true },
      ...(options.reply_markup ? { reply_markup: options.reply_markup } : {}),
    });
  }

  sendDocument(
    chatId: number | string,
    fileId: string,
    caption?: string,
    options: SendOptions = {},
  ): Promise<TelegramMessage> {
    return this.call<TelegramMessage>('sendDocument', {
      chat_id: normalizeChatId(chatId),
      document: fileId,
      ...(caption ? { caption: normalizeHtml(caption), parse_mode: 'HTML' } : {}),
      ...(options.disable_notification ? { disable_notification: true } : {}),
      ...(options.reply_to_message_id ? { reply_parameters: { message_id: options.reply_to_message_id } } : {}),
      ...(options.reply_markup ? { reply_markup: options.reply_markup } : {}),
    });
  }

  async sendDocumentUpload(
    chatId: number | string,
    file: File,
    caption?: string,
    options: SendOptions = {},
  ): Promise<TelegramMessage> {
    return this.uploadFile<TelegramMessage>('sendDocument', chatId, 'document', file, caption, options);
  }

  async sendPhotoUpload(
    chatId: number | string,
    file: File,
    caption?: string,
    options: SendOptions = {},
  ): Promise<TelegramMessage> {
    return this.uploadFile<TelegramMessage>('sendPhoto', chatId, 'photo', file, caption, options);
  }

  private async uploadFile<T>(
    method: 'sendDocument' | 'sendPhoto',
    chatId: number | string,
    fieldName: 'document' | 'photo',
    file: File,
    caption?: string,
    options: SendOptions = {},
  ): Promise<T> {
    let rateLimitRetries = 0;

    for (;;) {
      const form = new FormData();
      form.set('chat_id', String(normalizeChatId(chatId)));
      form.set(fieldName, file, file.name || (fieldName === 'photo' ? 'image.jpg' : 'document.bin'));
      if (caption) {
        form.set('caption', normalizeHtml(caption));
        form.set('parse_mode', 'HTML');
      }
      if (options.disable_notification) form.set('disable_notification', 'true');
      if (method === 'sendPhoto' && options.has_spoiler) form.set('has_spoiler', 'true');
      if (options.reply_to_message_id) {
        form.set('reply_parameters', JSON.stringify({ message_id: options.reply_to_message_id }));
      }
      if (options.reply_markup) form.set('reply_markup', JSON.stringify(options.reply_markup));

      let response: Response;
      try {
        response = await fetchWithTimeout(
          `${this.baseUrl}/${method}`,
          { method: 'POST', body: form },
          UPLOAD_REQUEST_TIMEOUT_MS,
        );
      } catch (error) {
        // Upload/send methods are not safely idempotent after an ambiguous network
        // failure. Let the caller resume from persisted state instead of risking a
        // duplicate Telegram message by retrying blindly here.
        throw transportError(method, error);
      }

      const body = await readTelegramEnvelope<T>(response);
      if (response.ok && body.ok && body.result !== undefined) return body.result;

      const retryAfter = positiveInteger(body.parameters?.retry_after);
      if (
        (response.status === 429 || body.error_code === 429)
        && retryAfter !== undefined
        && retryAfter <= MAX_INLINE_RETRY_AFTER_SECONDS
        && rateLimitRetries < MAX_INLINE_RATE_LIMIT_RETRIES
      ) {
        rateLimitRetries += 1;
        await sleep(retryAfter * 1000);
        continue;
      }

      throw telegramApiError(method, response, body);
    }
  }

  answerCallbackQuery(callbackQueryId: string, text?: string): Promise<boolean> {
    return this.call<boolean>('answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      ...(text ? { text } : {}),
    });
  }

  editMessageReplyMarkup(
    chatId: number | string,
    messageId: number,
    replyMarkup: InlineKeyboardMarkup = { inline_keyboard: [] },
  ): Promise<TelegramMessage | boolean> {
    return this.call<TelegramMessage | boolean>('editMessageReplyMarkup', {
      chat_id: normalizeChatId(chatId),
      message_id: messageId,
      reply_markup: replyMarkup,
    });
  }

  getChatMember(chatId: number | string, userId: number): Promise<TelegramChatMember> {
    return this.call<TelegramChatMember>('getChatMember', {
      chat_id: normalizeChatId(chatId),
      user_id: userId,
    });
  }

  createChatInviteLink(chatId: number | string, name?: string): Promise<TelegramChatInviteLink> {
    return this.call<TelegramChatInviteLink>('createChatInviteLink', {
      chat_id: normalizeChatId(chatId),
      ...(name ? { name: name.slice(0, 32) } : {}),
    });
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function readTelegramEnvelope<T>(response: Response): Promise<TelegramApiEnvelope<T>> {
  const text = await response.text();
  if (!text) return { ok: false, description: `HTTP ${response.status}` };
  try {
    return JSON.parse(text) as TelegramApiEnvelope<T>;
  } catch {
    return { ok: false, description: `HTTP ${response.status}: ${text.slice(0, 300)}` };
  }
}

function telegramApiError<T>(
  method: string,
  response: Response,
  body: TelegramApiEnvelope<T>,
): TelegramApiError {
  return new TelegramApiError(
    method,
    body.description ?? `HTTP ${response.status}`,
    body.error_code ?? response.status,
    {
      httpStatus: response.status,
      retryAfter: positiveInteger(body.parameters?.retry_after),
    },
  );
}

function transportError(method: string, error: unknown): TelegramApiError {
  const timedOut = error instanceof DOMException && error.name === 'AbortError';
  const description = timedOut
    ? 'request timed out'
    : error instanceof Error
      ? `${error.name}: ${error.message}`
      : String(error);
  return new TelegramApiError(method, description);
}

function positiveInteger(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

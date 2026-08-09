export interface TelegramUser {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
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

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  text?: string;
  document?: TelegramDocument;
}

export interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
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

interface TelegramApiEnvelope<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

export class TelegramApiError extends Error {
  readonly method: string;
  readonly code?: number;

  constructor(method: string, description: string, code?: number) {
    super(`Telegram ${method} failed: ${description}`);
    this.name = 'TelegramApiError';
    this.method = method;
    this.code = code;
  }
}

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

export class TelegramClient {
  private readonly baseUrl: string;

  constructor(token: string, readonly env?: Env) {
    this.baseUrl = `https://api.telegram.org/bot${token}`;
  }

  async call<T>(method: string, payload: Record<string, unknown>): Promise<T> {
    const response = await fetch(`${this.baseUrl}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const body = (await response.json()) as TelegramApiEnvelope<T>;
    if (!response.ok || !body.ok || body.result === undefined) {
      throw new TelegramApiError(
        method,
        body.description ?? `HTTP ${response.status}`,
        body.error_code ?? response.status,
      );
    }

    return body.result;
  }

  sendMessage(
    chatId: number | string,
    text: string,
    options: {
      reply_markup?: InlineKeyboardMarkup;
      disable_web_page_preview?: boolean;
    } = {},
  ): Promise<TelegramMessage> {
    return this.call<TelegramMessage>('sendMessage', {
      chat_id: normalizeChatId(chatId),
      text: normalizeHtml(text),
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: options.disable_web_page_preview ?? true },
      ...(options.reply_markup ? { reply_markup: options.reply_markup } : {}),
    });
  }

  editMessageText(
    chatId: number | string,
    messageId: number,
    text: string,
    options: {
      reply_markup?: InlineKeyboardMarkup;
      disable_web_page_preview?: boolean;
    } = {},
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
  ): Promise<TelegramMessage> {
    return this.call<TelegramMessage>('sendDocument', {
      chat_id: normalizeChatId(chatId),
      document: fileId,
      ...(caption ? { caption: normalizeHtml(caption), parse_mode: 'HTML' } : {}),
    });
  }

  async sendDocumentUpload(
    chatId: number | string,
    file: File,
    caption?: string,
  ): Promise<TelegramMessage> {
    const form = new FormData();
    form.set('chat_id', String(normalizeChatId(chatId)));
    form.set('document', file, file.name || 'document.bin');
    if (caption) {
      form.set('caption', normalizeHtml(caption));
      form.set('parse_mode', 'HTML');
    }

    const response = await fetch(`${this.baseUrl}/sendDocument`, {
      method: 'POST',
      body: form,
    });
    const body = (await response.json()) as TelegramApiEnvelope<TelegramMessage>;
    if (!response.ok || !body.ok || body.result === undefined) {
      throw new TelegramApiError(
        'sendDocument',
        body.description ?? `HTTP ${response.status}`,
        body.error_code ?? response.status,
      );
    }
    return body.result;
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

  getChatMember(chatId: number | string, userId: number): Promise<Record<string, unknown>> {
    return this.call<Record<string, unknown>>('getChatMember', {
      chat_id: normalizeChatId(chatId),
      user_id: userId,
    });
  }
}

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

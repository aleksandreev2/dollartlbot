import { currentMonthKey } from './db';
import { authenticateMiniAppRequest, miniAppJson, miniAppJsonError } from './miniapp-auth';
import { SUPPORTED_LANGUAGES } from './i18n/index';
import { runBroadcastCenterMaintenanceWithLease, type BroadcastAudience } from './broadcast-center';
import { escapeHtml, type TelegramClient } from './telegram';

type LocaleMessage = {
  title: string;
  body: string;
  action_label?: string | null;
};

type BroadcastDraft = {
  template_key?: string | null;
  audience?: BroadcastAudience;
  action_url?: string | null;
  localizations?: Record<string, LocaleMessage>;
};

const AUDIENCES: Record<Exclude<BroadcastAudience, 'release_followers'>, string> = {
  all: 'Все пользователи',
  unused_quota: 'Не использовали квоту в этом месяце',
  has_requests: 'Уже отправляли заявки',
  no_requests: 'Ещё не отправляли заявок',
};

const TEMPLATE_DEFINITIONS = [
  {
    key: 'unused_quota',
    label: 'Неиспользованная квота',
    description: 'Мягко напоминает пользователям, которые ещё не отправляли заявку в этом месяце.',
    audience: 'unused_quota' as const,
    action_url: '/app/?view=suggest',
    localizations: {
      en: { title: 'Your translation quota is still waiting', body: "You haven't used your translation request quota this month yet. Have a novel in mind? Send a request and we'll review it.", action_label: 'Suggest a novel' },
      es: { title: 'Tu cuota de traducción sigue disponible', body: 'Todavía no has usado tu cuota de solicitudes de traducción este mes. ¿Tienes una novela en mente? Envíanos una solicitud y la revisaremos.', action_label: 'Sugerir una novela' },
      fil: { title: 'Available pa ang translation quota mo', body: 'Hindi mo pa nagagamit ang quota mo para sa translation request ngayong buwan. May novel ka bang gustong ipasalin? Magpadala ng request at rerepasuhin namin ito.', action_label: 'Mag-suggest ng novel' },
      hi: { title: 'आपका अनुवाद कोटा अभी भी उपलब्ध है', body: 'आपने इस महीने अभी तक अपनी अनुवाद अनुरोध सीमा का उपयोग नहीं किया है। कोई नॉवेल सुझाना चाहते हैं? अनुरोध भेजें, हम उसकी समीक्षा करेंगे।', action_label: 'नॉवेल सुझाएँ' },
      pt: { title: 'Sua cota de tradução ainda está disponível', body: 'Você ainda não usou sua cota de pedidos de tradução neste mês. Tem alguma novel em mente? Envie um pedido e nós vamos analisá-lo.', action_label: 'Sugerir uma novel' },
      id: { title: 'Kuota terjemahanmu masih tersedia', body: 'Kamu belum memakai kuota permintaan terjemahan bulan ini. Ada novel yang ingin kamu usulkan? Kirim permintaan dan kami akan meninjaunya.', action_label: 'Sarankan novel' },
      vi: { title: 'Hạn mức yêu cầu dịch của bạn vẫn còn', body: 'Tháng này bạn vẫn chưa dùng hạn mức yêu cầu dịch. Có tiểu thuyết nào muốn đề xuất không? Gửi yêu cầu và chúng tôi sẽ xem xét.', action_label: 'Đề xuất tiểu thuyết' },
      fr: { title: 'Votre quota de traduction est toujours disponible', body: "Vous n'avez pas encore utilisé votre quota de demandes de traduction ce mois-ci. Un roman en tête ? Envoyez une demande et nous l'examinerons.", action_label: 'Proposer un roman' },
      de: { title: 'Dein Übersetzungskontingent ist noch verfügbar', body: 'Du hast dein Kontingent für Übersetzungsanfragen in diesem Monat noch nicht genutzt. Hast du einen Roman im Kopf? Sende eine Anfrage und wir prüfen sie.', action_label: 'Roman vorschlagen' },
      ru: { title: 'Ваша квота на перевод ещё не использована', body: 'В этом месяце вы ещё не использовали квоту на заявку перевода. Есть новелла на примете? Отправьте заявку — мы её рассмотрим.', action_label: 'Предложить новеллу' },
    },
  },
  {
    key: 'suggest_novel',
    label: 'Предложить новеллу',
    description: 'Универсальный призыв отправить новую заявку на перевод.',
    audience: 'all' as const,
    action_url: '/app/?view=suggest',
    localizations: {
      en: { title: 'What should Dollar TL translate next?', body: 'Found a web novel you would love to read in translation? Suggest it to Dollar TL. We review requests manually and accepted titles enter the public queue.', action_label: 'Suggest a novel' },
      es: { title: '¿Qué debería traducir Dollar TL después?', body: '¿Encontraste una web novel que te gustaría leer traducida? Sugíerela a Dollar TL. Revisamos las solicitudes manualmente y los títulos aceptados entran en la cola pública.', action_label: 'Sugerir una novela' },
      fil: { title: 'Ano ang susunod na dapat isalin ng Dollar TL?', body: 'May nakita kang web novel na gusto mong mabasa sa translation? I-suggest ito sa Dollar TL. Mano-mano naming nire-review ang requests at ang accepted titles ay napupunta sa public queue.', action_label: 'Mag-suggest ng novel' },
      hi: { title: 'Dollar TL को अगला क्या अनुवाद करना चाहिए?', body: 'कोई वेब नॉवेल मिला जिसे आप अनुवाद में पढ़ना चाहेंगे? उसे Dollar TL को सुझाएँ। हम अनुरोधों की मैन्युअल समीक्षा करते हैं और स्वीकृत शीर्षक सार्वजनिक कतार में जाते हैं।', action_label: 'नॉवेल सुझाएँ' },
      pt: { title: 'O que a Dollar TL deve traduzir a seguir?', body: 'Encontrou uma web novel que gostaria de ler traduzida? Sugira para a Dollar TL. Revisamos os pedidos manualmente e os títulos aceitos entram na fila pública.', action_label: 'Sugerir uma novel' },
      id: { title: 'Apa yang harus Dollar TL terjemahkan berikutnya?', body: 'Menemukan web novel yang ingin kamu baca dalam terjemahan? Sarankan ke Dollar TL. Kami meninjau permintaan secara manual dan judul yang diterima masuk antrean publik.', action_label: 'Sarankan novel' },
      vi: { title: 'Dollar TL nên dịch gì tiếp theo?', body: 'Bạn tìm thấy web novel muốn đọc bản dịch? Hãy đề xuất cho Dollar TL. Chúng tôi duyệt yêu cầu thủ công và các tựa được chấp nhận sẽ vào hàng đợi công khai.', action_label: 'Đề xuất tiểu thuyết' },
      fr: { title: 'Que devrait traduire Dollar TL ensuite ?', body: 'Vous avez trouvé un web novel que vous aimeriez lire traduit ? Proposez-le à Dollar TL. Nous examinons les demandes manuellement et les titres acceptés rejoignent la file publique.', action_label: 'Proposer un roman' },
      de: { title: 'Was soll Dollar TL als Nächstes übersetzen?', body: 'Hast du einen Webroman gefunden, den du gern übersetzt lesen würdest? Schlage ihn Dollar TL vor. Wir prüfen Anfragen manuell; angenommene Titel kommen in die öffentliche Warteschlange.', action_label: 'Roman vorschlagen' },
      ru: { title: 'Что Dollar TL перевести следующим?', body: 'Нашли веб-новеллу, которую хотелось бы прочитать в переводе? Предложите её Dollar TL. Мы вручную проверяем заявки, а принятые тайтлы попадают в публичную очередь.', action_label: 'Предложить новеллу' },
    },
  },
  {
    key: 'requests_open',
    label: 'Приём заявок открыт',
    description: 'Короткое объявление о том, что заявки на перевод можно отправлять прямо сейчас.',
    audience: 'all' as const,
    action_url: '/app/?view=suggest',
    localizations: {
      en: { title: 'Translation requests are open', body: 'You can send a translation request to Dollar TL right now. Add the original link, novel details and the source file — we will review the submission manually.', action_label: 'Create a request' },
      es: { title: 'Las solicitudes de traducción están abiertas', body: 'Ya puedes enviar una solicitud de traducción a Dollar TL. Añade el enlace original, los datos de la novela y el archivo fuente; revisaremos la solicitud manualmente.', action_label: 'Crear solicitud' },
      fil: { title: 'Bukas ang translation requests', body: 'Maaari ka nang magpadala ng translation request sa Dollar TL. Ilagay ang original link, detalye ng novel at source file — mano-mano namin itong rerepasuhin.', action_label: 'Gumawa ng request' },
      hi: { title: 'अनुवाद अनुरोध खुले हैं', body: 'आप अभी Dollar TL को अनुवाद अनुरोध भेज सकते हैं। मूल लिंक, नॉवेल की जानकारी और स्रोत फ़ाइल जोड़ें — हम सबमिशन की मैन्युअल समीक्षा करेंगे।', action_label: 'अनुरोध बनाएँ' },
      pt: { title: 'Pedidos de tradução estão abertos', body: 'Você já pode enviar um pedido de tradução para a Dollar TL. Adicione o link original, os dados da novel e o arquivo-fonte — vamos revisar manualmente.', action_label: 'Criar pedido' },
      id: { title: 'Permintaan terjemahan sedang dibuka', body: 'Kamu bisa mengirim permintaan terjemahan ke Dollar TL sekarang. Tambahkan tautan asli, detail novel, dan file sumber — kami akan meninjaunya secara manual.', action_label: 'Buat permintaan' },
      vi: { title: 'Đang mở nhận yêu cầu dịch', body: 'Bạn có thể gửi yêu cầu dịch cho Dollar TL ngay bây giờ. Thêm liên kết gốc, thông tin tiểu thuyết và tệp nguồn — chúng tôi sẽ duyệt thủ công.', action_label: 'Tạo yêu cầu' },
      fr: { title: 'Les demandes de traduction sont ouvertes', body: "Vous pouvez envoyer une demande de traduction à Dollar TL dès maintenant. Ajoutez le lien original, les informations du roman et le fichier source — nous l'examinerons manuellement.", action_label: 'Créer une demande' },
      de: { title: 'Übersetzungsanfragen sind geöffnet', body: 'Du kannst jetzt eine Übersetzungsanfrage an Dollar TL senden. Füge Originallink, Romaninformationen und Quelldatei hinzu — wir prüfen die Anfrage manuell.', action_label: 'Anfrage erstellen' },
      ru: { title: 'Приём заявок на перевод открыт', body: 'Сейчас можно отправить заявку на перевод в Dollar TL. Добавьте ссылку на оригинал, данные новеллы и исходный файл — мы вручную проверим заявку.', action_label: 'Создать заявку' },
    },
  },
] as const;

const LOCALES = new Set(SUPPORTED_LANGUAGES.map(item => item.code));

export async function handleAdminBroadcastRequest(
  request: Request,
  env: Env,
  telegram: TelegramClient,
  ctx: ExecutionContext,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/app/admin/broadcasts')) return null;

  const auth = await authenticateMiniAppRequest(request, env);
  if (auth instanceof Response) return auth;
  if (!auth.admin) return miniAppJsonError('forbidden', 'Admin access required.', 403);

  if (request.method === 'GET' && url.pathname === '/api/app/admin/broadcasts') {
    const history = await broadcastHistory(env);
    return miniAppJson({
      templates: TEMPLATE_DEFINITIONS,
      audiences: Object.entries(AUDIENCES).map(([id, label]) => ({ id, label })),
      locales: SUPPORTED_LANGUAGES,
      broadcasts: history,
    });
  }

  if (request.method === 'POST' && url.pathname === '/api/app/admin/broadcasts/estimate') {
    const body = await readJson<{ audience?: BroadcastAudience }>(request);
    const audience = validAudience(body.audience);
    if (!audience) return miniAppJsonError('invalid_audience', 'Неизвестный сегмент получателей.', 400);
    return miniAppJson(await estimateAudience(env, audience));
  }

  if (request.method === 'POST' && url.pathname === '/api/app/admin/broadcasts/test') {
    const body = await readJson<BroadcastDraft & { locale?: string }>(request);
    const draft = validateDraft(body);
    if (draft instanceof Response) return draft;
    const locale = LOCALES.has(body.locale as never) ? String(body.locale) : 'en';
    const copy = draft.localizations[locale] || draft.localizations.en;
    await sendAdminTest(env, telegram, auth.telegramUser.id, copy, draft.action_url);
    return miniAppJson({ ok: true, locale });
  }

  if (request.method === 'POST' && url.pathname === '/api/app/admin/broadcasts') {
    const body = await readJson<BroadcastDraft>(request);
    const draft = validateDraft(body);
    if (draft instanceof Response) return draft;

    const now = new Date().toISOString();
    const english = draft.localizations.en;
    const inserted = await env.DB.prepare(`
      INSERT INTO broadcasts (
        publication_id, kind, status, title, body, created_at,
        audience, preference_key, action_url, template_key, created_by
      ) VALUES (NULL, 'announcement', 'queued', ?, ?, ?, ?, 'notify_announcements', ?, ?, ?)
    `).bind(
      english.title,
      english.body,
      now,
      draft.audience,
      draft.action_url,
      draft.template_key,
      auth.telegramUser.id,
    ).run();
    const id = Number(inserted.meta.last_row_id);
    if (!Number.isSafeInteger(id) || id <= 0) {
      return miniAppJsonError('broadcast_create_failed', 'Не удалось создать рассылку.', 500);
    }

    const statements = Object.entries(draft.localizations).map(([locale, copy]) =>
      env.DB.prepare(`
        INSERT INTO broadcast_localizations (
          broadcast_id, locale, title, body, action_label, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(id, locale, copy.title, copy.body, copy.action_label || null, now, now)
    );
    if (statements.length) await env.DB.batch(statements);
    await audit(env, auth.telegramUser.id, 'broadcast_create', id, {
      template_key: draft.template_key,
      audience: draft.audience,
      locales: Object.keys(draft.localizations),
    });

    ctx.waitUntil(runBroadcastCenterMaintenanceWithLease(env, telegram, 2));
    return miniAppJson({ ok: true, broadcast_id: id, status: 'queued' });
  }

  const retry = /^\/api\/app\/admin\/broadcasts\/(\d+)\/retry$/.exec(url.pathname);
  if (request.method === 'POST' && retry) {
    const id = Number(retry[1]);
    const found = await env.DB.prepare(`
      SELECT id, kind FROM broadcasts WHERE id = ?
    `).bind(id).first<{ id: number; kind: string }>();
    if (!found) return miniAppJsonError('not_found', 'Рассылка не найдена.', 404);
    const now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare(`
        UPDATE broadcast_recipients
        SET status='retry', next_attempt_at=?, last_error=NULL, updated_at=?
        WHERE broadcast_id=? AND status='failed'
      `).bind(now, now, id),
      env.DB.prepare(`
        UPDATE broadcasts
        SET status='running', completed_at=NULL
        WHERE id=?
      `).bind(id),
    ]);
    await audit(env, auth.telegramUser.id, 'broadcast_retry', id, null);
    ctx.waitUntil(runBroadcastCenterMaintenanceWithLease(env, telegram, 2));
    return miniAppJson({ ok: true });
  }

  return miniAppJsonError('not_found', 'Broadcast route not found.', 404);
}

function validateDraft(body: BroadcastDraft): {
  template_key: string | null;
  audience: Exclude<BroadcastAudience, 'release_followers'>;
  action_url: string;
  localizations: Record<string, LocaleMessage>;
} | Response {
  const audience = validAudience(body.audience);
  if (!audience) return miniAppJsonError('invalid_audience', 'Выберите корректный сегмент получателей.', 400);
  const raw = body.localizations && typeof body.localizations === 'object' ? body.localizations : {};
  const localizations: Record<string, LocaleMessage> = {};

  for (const [locale, value] of Object.entries(raw)) {
    if (!LOCALES.has(locale as never) || !value || typeof value !== 'object') continue;
    const title = String(value.title || '').trim();
    const message = String(value.body || '').trim();
    const actionLabel = String(value.action_label || '').trim();
    if (!title && !message && !actionLabel) continue;
    if (!title || !message) {
      return miniAppJsonError('incomplete_locale', `Для языка ${locale} заполните и заголовок, и текст.`, 400);
    }
    if (title.length > 180) return miniAppJsonError('title_too_long', `Заголовок ${locale}: максимум 180 символов.`, 400);
    if (message.length > 3000) return miniAppJsonError('body_too_long', `Текст ${locale}: максимум 3000 символов.`, 400);
    if (actionLabel.length > 64) return miniAppJsonError('action_too_long', `Кнопка ${locale}: максимум 64 символа.`, 400);
    localizations[locale] = { title, body: message, action_label: actionLabel || undefined };
  }

  if (!localizations.en) {
    return miniAppJsonError('english_required', 'Английская версия обязательна и используется как fallback.', 400);
  }

  const actionUrl = normalizeActionUrl(body.action_url);
  if (!actionUrl) return miniAppJsonError('invalid_action_url', 'Ссылка кнопки должна быть HTTPS или путём /app/.', 400);

  return {
    template_key: String(body.template_key || '').trim().slice(0, 80) || null,
    audience,
    action_url: actionUrl,
    localizations,
  };
}

function validAudience(value: BroadcastAudience | undefined): Exclude<BroadcastAudience, 'release_followers'> | null {
  const audience = String(value || '');
  return Object.prototype.hasOwnProperty.call(AUDIENCES, audience)
    ? audience as Exclude<BroadcastAudience, 'release_followers'>
    : null;
}

function normalizeActionUrl(value: string | null | undefined): string | null {
  const raw = String(value || '/app/?view=suggest').trim();
  if (/^https:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw);
      return parsed.protocol === 'https:' ? parsed.toString() : null;
    } catch {
      return null;
    }
  }
  return raw.startsWith('/app/') || raw === '/app/' ? raw : null;
}

async function estimateAudience(env: Env, audience: Exclude<BroadcastAudience, 'release_followers'>) {
  const monthKey = currentMonthKey();
  const audienceSql = audience === 'unused_quota'
    ? `NOT EXISTS (
        SELECT 1 FROM submissions s
        WHERE s.user_id=u.telegram_id AND s.month_key=? AND s.slot_returned=0
      )`
    : audience === 'has_requests'
      ? 'EXISTS (SELECT 1 FROM submissions s WHERE s.user_id=u.telegram_id)'
      : audience === 'no_requests'
        ? 'NOT EXISTS (SELECT 1 FROM submissions s WHERE s.user_id=u.telegram_id)'
        : '1=1';
  const binds = audience === 'unused_quota' ? [monthKey] : [];
  const rows = await env.DB.prepare(`
    SELECT
      CASE WHEN u.language IN ('en','es','fil','hi','pt','id','vi','fr','de','ru') THEN u.language ELSE 'en' END AS locale,
      COUNT(*) AS n
    FROM users u
    LEFT JOIN user_admin_controls control ON control.user_id=u.telegram_id
    WHERE u.notify_announcements=1
      AND control.blocked_at IS NULL
      AND ${audienceSql}
    GROUP BY locale
    ORDER BY n DESC, locale ASC
  `).bind(...binds).all<{ locale: string; n: number }>();
  const locales = Object.fromEntries(rows.results.map(row => [row.locale, Number(row.n || 0)]));
  const total = Object.values(locales).reduce((sum, count) => sum + Number(count), 0);
  return { audience, total, locales, month_key: monthKey };
}

async function broadcastHistory(env: Env) {
  const rows = await env.DB.prepare(`
    SELECT b.id, b.kind, b.status, b.title, b.audience, b.preference_key,
           b.template_key, b.action_url, b.sent_count, b.failed_count,
           b.created_at, b.started_at, b.completed_at,
           COUNT(br.user_id) AS recipient_count,
           SUM(CASE WHEN br.status='skipped' THEN 1 ELSE 0 END) AS skipped_count,
           SUM(CASE WHEN br.status IN ('queued','retry') THEN 1 ELSE 0 END) AS pending_count,
           (SELECT COUNT(*) FROM broadcast_localizations bl WHERE bl.broadcast_id=b.id) AS locale_count
    FROM broadcasts b
    LEFT JOIN broadcast_recipients br ON br.broadcast_id=b.id
    GROUP BY b.id
    ORDER BY b.id DESC
    LIMIT 60
  `).all<Record<string, unknown>>();
  return rows.results;
}

async function sendAdminTest(
  env: Env,
  telegram: TelegramClient,
  adminId: number,
  copy: LocaleMessage,
  actionUrl: string,
): Promise<void> {
  const configured = String((env as unknown as { MINI_APP_URL?: string }).MINI_APP_URL || 'https://t.me/dollartlbot');
  let resolved = configured;
  try { resolved = /^https:\/\//i.test(actionUrl) ? actionUrl : new URL(actionUrl, configured).toString(); } catch {}
  await telegram.sendMessage(
    adminId,
    `<b>🧪 Broadcast test</b>\n\n<b>📣 ${escapeHtml(copy.title)}</b>\n\n${escapeHtml(copy.body)}`,
    { reply_markup: { inline_keyboard: [[{ text: copy.action_label || 'Open Dollar TL', web_app: { url: resolved } }]] } },
  );
}

async function audit(
  env: Env,
  adminId: number,
  action: string,
  broadcastId: number,
  details: unknown,
): Promise<void> {
  await env.DB.prepare(`
    INSERT INTO admin_audit_log (admin_user_id, action, target_type, target_id, details, created_at)
    VALUES (?, ?, 'broadcast', ?, ?, ?)
  `).bind(
    adminId,
    action,
    String(broadcastId),
    details ? JSON.stringify(details) : null,
    new Date().toISOString(),
  ).run().catch(() => undefined);
}

async function readJson<T>(request: Request): Promise<T> {
  try {
    return await request.json() as T;
  } catch {
    return {} as T;
  }
}

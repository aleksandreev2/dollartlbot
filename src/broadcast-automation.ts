import { currentMonthKey } from './db';
import { authenticateMiniAppRequest, miniAppJson, miniAppJsonError } from './miniapp-auth';

const AUTOMATION_KEY = 'unused_quota_reminders';
const ACTION_URL = '/app/?view=suggest';

type LocaleMessage = {
  title: string;
  body: string;
  action_label: string;
};

type ReminderStage = {
  key: 'midmonth' | 'late_month';
  windowStart: number;
  windowEnd: number;
  localizations: Record<string, LocaleMessage>;
};

const MIDMONTH_COPY: Record<string, LocaleMessage> = {
  en: {
    title: 'Your monthly translation request is still available',
    body: "You haven't used a translation request this month yet. If a web novel has been sitting in your bookmarks, send it to Dollar TL — we review every request manually.",
    action_label: 'Suggest a novel',
  },
  es: {
    title: 'Tu solicitud mensual de traducción sigue disponible',
    body: 'Este mes todavía no has usado una solicitud de traducción. Si tienes una web novel guardada desde hace tiempo, envíala a Dollar TL — revisamos cada solicitud manualmente.',
    action_label: 'Sugerir una novela',
  },
  fil: {
    title: 'Available pa ang monthly translation request mo',
    body: 'Wala ka pang nagagamit na translation request ngayong buwan. Kung may web novel kang matagal nang naka-bookmark, i-send ito sa Dollar TL — mano-mano naming nire-review ang bawat request.',
    action_label: 'Mag-suggest ng novel',
  },
  hi: {
    title: 'आपका मासिक अनुवाद अनुरोध अभी भी उपलब्ध है',
    body: 'आपने इस महीने अभी तक कोई अनुवाद अनुरोध इस्तेमाल नहीं किया है। अगर कोई वेब नॉवेल काफी समय से बुकमार्क में है, तो उसे Dollar TL को भेजें — हम हर अनुरोध की मैन्युअल समीक्षा करते हैं।',
    action_label: 'नॉवेल सुझाएँ',
  },
  pt: {
    title: 'Seu pedido mensal de tradução ainda está disponível',
    body: 'Você ainda não usou um pedido de tradução neste mês. Se tem uma web novel guardada há algum tempo, envie para a Dollar TL — analisamos cada pedido manualmente.',
    action_label: 'Sugerir uma novel',
  },
  id: {
    title: 'Permintaan terjemahan bulananmu masih tersedia',
    body: 'Kamu belum memakai permintaan terjemahan bulan ini. Kalau ada web novel yang sudah lama tersimpan di bookmark, kirim ke Dollar TL — setiap permintaan kami tinjau secara manual.',
    action_label: 'Sarankan novel',
  },
  vi: {
    title: 'Yêu cầu dịch hàng tháng của bạn vẫn còn',
    body: 'Tháng này bạn vẫn chưa dùng yêu cầu dịch nào. Nếu có web novel đã nằm trong bookmark từ lâu, hãy gửi cho Dollar TL — chúng tôi duyệt từng yêu cầu thủ công.',
    action_label: 'Đề xuất tiểu thuyết',
  },
  fr: {
    title: 'Votre demande de traduction mensuelle est toujours disponible',
    body: "Vous n'avez encore utilisé aucune demande de traduction ce mois-ci. Si un web novel attend dans vos favoris, envoyez-le à Dollar TL — chaque demande est examinée manuellement.",
    action_label: 'Proposer un roman',
  },
  de: {
    title: 'Deine monatliche Übersetzungsanfrage ist noch verfügbar',
    body: 'Du hast diesen Monat noch keine Übersetzungsanfrage genutzt. Wenn ein Webroman schon länger in deinen Lesezeichen liegt, schick ihn an Dollar TL — wir prüfen jede Anfrage manuell.',
    action_label: 'Roman vorschlagen',
  },
  ru: {
    title: 'Заявка на перевод в этом месяце ещё не использована',
    body: 'В этом месяце вы ещё не отправляли заявку на перевод. Если в закладках давно лежит подходящая веб-новелла — предложите её Dollar TL. Каждую заявку мы проверяем вручную.',
    action_label: 'Предложить новеллу',
  },
  ur: {
    title: 'آپ کی ماہانہ ترجمہ درخواست ابھی بھی دستیاب ہے',
    body: 'آپ نے اس ماہ ابھی تک کوئی ترجمہ درخواست استعمال نہیں کی۔ اگر کوئی ویب ناول کافی عرصے سے بُک مارکس میں ہے تو اسے Dollar TL کو بھیج دیں — ہم ہر درخواست کا دستی جائزہ لیتے ہیں۔',
    action_label: 'ناول تجویز کریں',
  },
};

const LATE_MONTH_COPY: Record<string, LocaleMessage> = {
  en: {
    title: 'Still have a novel you want translated?',
    body: "You still haven't used a translation request this month. If there's a title you want Dollar TL to consider, send it now and it'll go through the normal manual review.",
    action_label: 'Suggest a novel',
  },
  es: {
    title: '¿Aún tienes una novela que quieras ver traducida?',
    body: 'Este mes todavía no has usado una solicitud de traducción. Si hay un título que quieras que Dollar TL considere, envíalo ahora y pasará por la revisión manual habitual.',
    action_label: 'Sugerir una novela',
  },
  fil: {
    title: 'May novel ka pa bang gustong ma-translate?',
    body: 'Wala ka pa ring nagagamit na translation request ngayong buwan. Kung may title kang gustong ipa-review sa Dollar TL, i-send mo na at dadaan ito sa normal na manual review.',
    action_label: 'Mag-suggest ng novel',
  },
  hi: {
    title: 'अब भी कोई नॉवेल है जिसे आप अनुवाद में देखना चाहते हैं?',
    body: 'आपने इस महीने अभी तक कोई अनुवाद अनुरोध इस्तेमाल नहीं किया है। अगर कोई शीर्षक है जिसे आप Dollar TL से विचार करवाना चाहते हैं, तो उसे भेजें — वह सामान्य मैन्युअल समीक्षा से गुजरेगा।',
    action_label: 'नॉवेल सुझाएँ',
  },
  pt: {
    title: 'Ainda tem uma novel que gostaria de ver traduzida?',
    body: 'Você ainda não usou um pedido de tradução neste mês. Se existe um título que gostaria que a Dollar TL considerasse, envie agora e ele passará pela revisão manual normal.',
    action_label: 'Sugerir uma novel',
  },
  id: {
    title: 'Masih ada novel yang ingin kamu lihat diterjemahkan?',
    body: 'Kamu masih belum memakai permintaan terjemahan bulan ini. Kalau ada judul yang ingin dipertimbangkan Dollar TL, kirim sekarang dan judul itu akan masuk proses peninjauan manual biasa.',
    action_label: 'Sarankan novel',
  },
  vi: {
    title: 'Vẫn còn tiểu thuyết bạn muốn được dịch?',
    body: 'Tháng này bạn vẫn chưa dùng yêu cầu dịch nào. Nếu có tựa muốn Dollar TL cân nhắc, hãy gửi ngay — yêu cầu sẽ được đưa vào quy trình duyệt thủ công như bình thường.',
    action_label: 'Đề xuất tiểu thuyết',
  },
  fr: {
    title: 'Vous avez encore un roman que vous aimeriez voir traduit ?',
    body: "Vous n'avez toujours utilisé aucune demande de traduction ce mois-ci. Si un titre mérite selon vous l'attention de Dollar TL, envoyez-le maintenant : il suivra notre processus normal de vérification manuelle.",
    action_label: 'Proposer un roman',
  },
  de: {
    title: 'Gibt es noch einen Roman, den du übersetzt sehen möchtest?',
    body: 'Du hast diesen Monat weiterhin keine Übersetzungsanfrage genutzt. Wenn Dollar TL einen bestimmten Titel prüfen soll, schick ihn jetzt ein — er durchläuft die normale manuelle Prüfung.',
    action_label: 'Roman vorschlagen',
  },
  ru: {
    title: 'Есть новелла, которую вы всё ещё хотите предложить?',
    body: 'В этом месяце заявка на перевод всё ещё не использована. Если есть тайтл, который стоит рассмотреть Dollar TL, отправьте его сейчас — дальше он пройдёт обычную ручную проверку.',
    action_label: 'Предложить новеллу',
  },
  ur: {
    title: 'کیا اب بھی کوئی ناول ہے جس کا ترجمہ آپ چاہتے ہیں؟',
    body: 'آپ نے اس ماہ ابھی تک کوئی ترجمہ درخواست استعمال نہیں کی۔ اگر کوئی عنوان ہے جس پر آپ Dollar TL سے غور کروانا چاہتے ہیں تو اسے بھیج دیں — وہ معمول کے دستی جائزے سے گزرے گا۔',
    action_label: 'ناول تجویز کریں',
  },
};

const STAGES: readonly ReminderStage[] = [
  { key: 'midmonth', windowStart: 10, windowEnd: 16, localizations: MIDMONTH_COPY },
  { key: 'late_month', windowStart: 24, windowEnd: 31, localizations: LATE_MONTH_COPY },
];

export type BroadcastAutomationStatus = {
  key: string;
  label: string;
  description: string;
  enabled: boolean;
  schedule: string;
  schedule_days: number[];
  eligible_now: number;
  last_enqueued_at: string | null;
  next_due_at: string;
};

export async function runBroadcastAutomations(env: Env, now = new Date()): Promise<number> {
  if (!(await automationEnabled(env, AUTOMATION_KEY))) return 0;
  const day = now.getUTCDate();
  const stage = STAGES.find(item => day >= item.windowStart && day <= item.windowEnd);
  if (!stage) return 0;
  return enqueueUnusedQuotaReminder(env, stage, now) ? 1 : 0;
}

export async function handleAdminBroadcastAutomationRequest(
  request: Request,
  env: Env,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/app/admin/broadcast-automations')) return null;

  const auth = await authenticateMiniAppRequest(request, env);
  if (auth instanceof Response) return auth;
  if (!auth.admin) return miniAppJsonError('forbidden', 'Admin access required.', 403);

  if (request.method === 'GET' && url.pathname === '/api/app/admin/broadcast-automations') {
    return miniAppJson({ automations: [await automationStatus(env, new Date())] });
  }

  const match = /^\/api\/app\/admin\/broadcast-automations\/([^/]+)$/.exec(url.pathname);
  if (request.method === 'PATCH' && match) {
    const key = decodeURIComponent(match[1]);
    if (key !== AUTOMATION_KEY) return miniAppJsonError('not_found', 'Automation not found.', 404);
    const body = await readJson<{ enabled?: unknown }>(request);
    if (typeof body.enabled !== 'boolean') {
      return miniAppJsonError('invalid_enabled', 'enabled must be boolean.', 400);
    }
    const now = new Date().toISOString();
    await env.DB.prepare(`
      INSERT INTO broadcast_automations (automation_key, enabled, updated_by, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(automation_key) DO UPDATE SET
        enabled=excluded.enabled,
        updated_by=excluded.updated_by,
        updated_at=excluded.updated_at
    `).bind(key, body.enabled ? 1 : 0, auth.telegramUser.id, now).run();
    await env.DB.prepare(`
      INSERT INTO admin_audit_log (admin_user_id, action, target_type, target_id, details, created_at)
      VALUES (?, 'broadcast_automation_update', 'broadcast_automation', ?, ?, ?)
    `).bind(auth.telegramUser.id, key, JSON.stringify({ enabled: body.enabled }), now).run().catch(() => undefined);
    return miniAppJson({ ok: true, automation: await automationStatus(env, new Date()) });
  }

  return miniAppJsonError('not_found', 'Broadcast automation route not found.', 404);
}

async function enqueueUnusedQuotaReminder(env: Env, stage: ReminderStage, now: Date): Promise<boolean> {
  const monthKey = currentMonthKey(now);
  const dedupeKey = `automation:${AUTOMATION_KEY}:${monthKey}:${stage.key}`;
  const templateKey = `auto:${AUTOMATION_KEY}:${stage.key}`;
  const createdAt = now.toISOString();
  const english = stage.localizations.en;

  const inserted = await env.DB.prepare(`
    INSERT OR IGNORE INTO broadcasts (
      publication_id, kind, status, title, body, created_at, dedupe_key,
      audience, preference_key, action_url, template_key, created_by
    ) VALUES (NULL, 'announcement', 'queued', ?, ?, ?, ?,
              'unused_quota', 'notify_announcements', ?, ?, NULL)
  `).bind(
    english.title,
    english.body,
    createdAt,
    dedupeKey,
    ACTION_URL,
    templateKey,
  ).run();

  if (Number(inserted.meta.changes ?? 0) === 0) return false;
  const broadcastId = Number(inserted.meta.last_row_id);
  if (!Number.isSafeInteger(broadcastId) || broadcastId <= 0) return false;

  const localizations = Object.entries(stage.localizations).map(([locale, copy]) =>
    env.DB.prepare(`
      INSERT OR IGNORE INTO broadcast_localizations (
        broadcast_id, locale, title, body, action_label, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      broadcastId,
      locale,
      copy.title,
      copy.body,
      copy.action_label,
      createdAt,
      createdAt,
    )
  );
  if (localizations.length) await env.DB.batch(localizations);
  return true;
}

async function automationStatus(env: Env, now: Date): Promise<BroadcastAutomationStatus> {
  const enabled = await automationEnabled(env, AUTOMATION_KEY);
  const eligible = await countUnusedQuotaAudience(env, now);
  const last = await env.DB.prepare(`
    SELECT created_at
    FROM broadcasts
    WHERE template_key LIKE 'auto:unused_quota_reminders:%'
    ORDER BY id DESC
    LIMIT 1
  `).first<{ created_at: string }>();
  return {
    key: AUTOMATION_KEY,
    label: 'Неиспользованный request',
    description: 'Два разных мягких напоминания в месяц — только тем, кто ещё не отправлял request в текущем месяце.',
    enabled,
    schedule: '10–16 и 24–конец месяца · 10:00 UTC',
    schedule_days: [10, 24],
    eligible_now: eligible,
    last_enqueued_at: last?.created_at || null,
    next_due_at: nextDueAt(now),
  };
}

async function automationEnabled(env: Env, key: string): Promise<boolean> {
  const row = await env.DB.prepare(`
    SELECT enabled FROM broadcast_automations WHERE automation_key = ?
  `).bind(key).first<{ enabled: number }>();
  return Number(row?.enabled ?? 1) === 1;
}

async function countUnusedQuotaAudience(env: Env, now: Date): Promise<number> {
  const monthKey = currentMonthKey(now);
  const row = await env.DB.prepare(`
    SELECT COUNT(*) AS n
    FROM users u
    LEFT JOIN user_admin_controls control ON control.user_id = u.telegram_id
    WHERE u.notify_announcements = 1
      AND u.language_selected = 1
      AND control.blocked_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM submissions s
        WHERE s.user_id = u.telegram_id
          AND s.month_key = ?
          AND s.slot_returned = 0
      )
      AND NOT EXISTS (
        SELECT 1 FROM submission_intake_reservations sr
        WHERE sr.user_id = u.telegram_id
          AND sr.month_key = ?
          AND sr.state = 'reserved'
          AND sr.expires_at > ?
      )
  `).bind(monthKey, monthKey, now.toISOString()).first<{ n: number }>();
  return Number(row?.n ?? 0);
}

function nextDueAt(now: Date): string {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const day = now.getUTCDate();
  if (day < 10) return new Date(Date.UTC(year, month, 10, 10, 0, 0)).toISOString();
  if (day < 24) return new Date(Date.UTC(year, month, 24, 10, 0, 0)).toISOString();
  return new Date(Date.UTC(year, month + 1, 10, 10, 0, 0)).toISOString();
}

async function readJson<T>(request: Request): Promise<T> {
  try { return await request.json() as T; } catch { return {} as T; }
}

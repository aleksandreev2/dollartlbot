import { getOrCreateDistributionId } from './fingerprint/identity';
import { personalizeEpubWithHash, sha256Hex } from './fingerprint/epub';
import { readerCopy } from './reader-i18n';
import { getRuntimeSetting, runtimeFlag } from './runtime-settings';
import type { TelegramClient, TelegramMessage } from './telegram';

export type PersonalizableAsset = {
  id: number;
  file_name: string;
  mime_type: string | null;
  r2_key: string;
};

type PersonalizedRow = {
  distribution_id: string;
  telegram_file_id: string | null;
  status: string;
};

export async function sendPersonalizedReaderAsset(
  userId: number,
  asset: PersonalizableAsset,
  env: Env,
  telegram: TelegramClient,
): Promise<TelegramMessage | null> {
  if (!isEpub(asset) || !(await runtimeFlag(env, 'reader_personalized_epub_enabled', false))) return null;
  const failClosed = await runtimeFlag(env, 'reader_fingerprint_fail_closed', false);
  try {
    const existing = await env.DB.prepare(`
      SELECT distribution_id,telegram_file_id,status
      FROM reader_personalized_assets WHERE asset_id=? AND user_id=?
    `).bind(asset.id,userId).first<PersonalizedRow>();
    if (existing?.telegram_file_id && existing.status === 'ready') {
      try { return hidePersonalFileId(await telegram.sendDocument(userId, existing.telegram_file_id)); }
      catch {
        await env.DB.prepare(`
          UPDATE reader_personalized_assets SET telegram_file_id=NULL,status='pending',updated_at=?
          WHERE asset_id=? AND user_id=?
        `).bind(new Date().toISOString(),asset.id,userId).run().catch(() => undefined);
      }
    }

    const distributionId = existing?.distribution_id || await getOrCreateDistributionId(env, userId);
    const fingerprintVersion = Math.max(1, Number(await getRuntimeSetting(env,'reader_fingerprint_version','1')) || 1);
    const now = new Date().toISOString();
    await env.DB.prepare(`
      INSERT INTO reader_personalized_assets(
        asset_id,user_id,distribution_id,fingerprint_version,generator_version,status,updated_at
      ) VALUES (?,?,?,?,?,'generating',?)
      ON CONFLICT(asset_id,user_id) DO UPDATE SET
        distribution_id=excluded.distribution_id,
        fingerprint_version=excluded.fingerprint_version,
        generator_version=excluded.generator_version,
        status='generating',last_error=NULL,updated_at=excluded.updated_at
    `).bind(asset.id,userId,distributionId,fingerprintVersion,'reader-epub-1',now).run();

    const object = await env.COVERS.get(asset.r2_key);
    if (!object) throw new Error(`R2 object missing: ${asset.r2_key}`);
    const source = new Uint8Array(await object.arrayBuffer());
    const masterSha256 = await sha256Hex(source);
    const account = await env.DB.prepare('SELECT language FROM users WHERE telegram_id=?')
      .bind(userId).first<{ language: string | null }>();
    const copy = readerCopy(account?.language);
    const personalized = await personalizeEpubWithHash(source, {
      distributionId,
      fingerprintVersion,
      noticeTitle: copy.termsTitle,
      noticeBody: copy.termsBody,
    });
    const file = new File([personalized.bytes], asset.file_name, { type:'application/epub+zip' });
    const sent = await telegram.sendDocumentUpload(userId,file);
    const personalizedTelegramFileId = sent.document?.file_id || null;
    const updatedAt = new Date().toISOString();
    await env.DB.prepare(`
      UPDATE reader_personalized_assets SET
        fingerprint_version=?,generator_version=?,master_sha256=?,personalized_sha256=?,
        telegram_file_id=?,temporary_r2_key=NULL,status='ready',last_error=NULL,generated_at=COALESCE(generated_at,?),updated_at=?
      WHERE asset_id=? AND user_id=?
    `).bind(
      personalized.fingerprintVersion,personalized.generatorVersion,masterSha256,personalized.sha256,
      personalizedTelegramFileId,updatedAt,updatedAt,asset.id,userId,
    ).run();
    return hidePersonalFileId(sent);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await env.DB.prepare(`
      UPDATE reader_personalized_assets SET status='failed',last_error=?,updated_at=?
      WHERE asset_id=? AND user_id=?
    `).bind(message.slice(0,1000),new Date().toISOString(),asset.id,userId).run().catch(() => undefined);
    console.warn(JSON.stringify({event:'reader_personalization_failed',user_id:userId,asset_id:asset.id,error:message}));
    if (failClosed) throw error;
    return null;
  }
}

function hidePersonalFileId(message: TelegramMessage): TelegramMessage {
  if (!message.document) return message;
  return { ...message, document: { ...message.document, file_id:'' } };
}

function isEpub(asset: PersonalizableAsset): boolean {
  const mime = String(asset.mime_type || '').toLowerCase();
  const name = String(asset.file_name || '').toLowerCase();
  return mime === 'application/epub+zip' || name.endsWith('.epub');
}

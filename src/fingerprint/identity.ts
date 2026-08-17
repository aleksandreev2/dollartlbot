const PREFIX = 'DTL1';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export async function getOrCreateDistributionId(env: Env, userId: number): Promise<string> {
  const existing = await env.DB.prepare(`
    SELECT distribution_id FROM distribution_identities
    WHERE user_id=? AND revoked_at IS NULL LIMIT 1
  `).bind(userId).first<{ distribution_id: string }>();
  if (existing?.distribution_id) return existing.distribution_id;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const distributionId = `${PREFIX}-${segment(4)}-${segment(4)}-${segment(4)}`;
    try {
      await env.DB.prepare(`
        INSERT INTO distribution_identities(distribution_id,user_id,created_at,revoked_at)
        VALUES (?,?,?,NULL)
      `).bind(distributionId,userId,new Date().toISOString()).run();
      return distributionId;
    } catch {
      const raced = await env.DB.prepare(`
        SELECT distribution_id FROM distribution_identities
        WHERE user_id=? AND revoked_at IS NULL LIMIT 1
      `).bind(userId).first<{ distribution_id: string }>();
      if (raced?.distribution_id) return raced.distribution_id;
    }
  }
  throw new Error('Could not allocate distribution identity');
}

export function isDistributionId(value: string): boolean {
  return /^DTL1-[A-HJ-NP-Z2-9]{4}(?:-[A-HJ-NP-Z2-9]{4}){2}$/.test(value.trim().toUpperCase());
}

function segment(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let result = '';
  for (const byte of bytes) result += ALPHABET[byte % ALPHABET.length];
  return result;
}

import fs from 'node:fs';

const read=(p)=>fs.readFileSync(p,'utf8');
const write=(p,s)=>fs.writeFileSync(p,s);
const replaceOnce=(source,from,to,label)=>{
  const at=source.indexOf(from);
  if(at<0)throw new Error(`apply failed: ${label}`);
  if(source.indexOf(from,at+from.length)>=0)throw new Error(`apply ambiguous: ${label}`);
  return source.slice(0,at)+to+source.slice(at+from.length);
};

let novel=read('src/novelpia-discovery.ts');
novel=replaceOnce(novel,
`const NOVELPIA_ORIGIN = 'https://novelpia.com';`,
`import {\n  fetchNovelpiaHomepageFresh,\n  type NovelpiaHomepageFreshItem,\n} from './novelpia-home-fresh';\n\nconst NOVELPIA_ORIGIN = 'https://novelpia.com';`,
'import homepage provider');

novel=replaceOnce(novel,
`type SignalName = 'novelpia_free_new' | 'novelpia_plus_new' | 'novelpia_new_rank';`,
`type SignalName = 'novelpia_home_new_plus' | 'novelpia_free_new' | 'novelpia_plus_new' | 'novelpia_new_rank';`,
'homepage signal type');

novel=replaceOnce(novel,
`    priority: 0,\n  },\n  {\n    signal: 'novelpia_free_new',`,
`    priority: 1,\n  },\n  {\n    signal: 'novelpia_free_new',`,
'plus fallback priority');
novel=replaceOnce(novel,
`    maxIds: 40,\n    priority: 1,`,
`    maxIds: 40,\n    priority: 2,`,
'free fallback priority');
novel=replaceOnce(novel,
`    maxIds: 50,\n    priority: 2,`,
`    maxIds: 50,\n    priority: 3,`,
'rank fallback priority');

novel=replaceOnce(novel,
`    const candidates = new Map<string, Candidate>();\n    const sourceErrors: string[] = [];\n\n    for (const source of SOURCES) {`,
`    const candidates = new Map<string, Candidate>();\n    const sourceErrors: string[] = [];\n    const homepageFresh = new Map<string, NovelpiaHomepageFreshItem>();\n\n    // The NovelPia homepage does not render its Fresh cards in server HTML. Its own\n    // Vue component loads the seven New PLUS cards from /proc/main_v2 instead. Use\n    // that same first-party loader as the primary Fresh identity source, then keep\n    // the public list pages below as broader fallbacks/context signals.\n    try {\n      const items = await fetchNovelpiaHomepageFresh();\n      for (const item of items) {\n        homepageFresh.set(item.externalId, item);\n        const current = candidates.get(item.externalId) ?? {\n          externalId: item.externalId,\n          tier: 'plus' as const,\n          signals: new Map<SignalName, number>(),\n          priority: 0,\n        };\n        current.tier = 'plus';\n        current.priority = Math.min(current.priority, 0);\n        current.signals.set('novelpia_home_new_plus', item.rank);\n        candidates.set(item.externalId, current);\n      }\n    } catch (error) {\n      sourceErrors.push(\`novelpia_home_new_plus:\${errorMessage(error)}\`);\n    }\n\n    for (const source of SOURCES) {`,
'homepage primary ingestion');

novel=replaceOnce(novel,
`    if (!candidates.size) {\n      throw new Error(sourceErrors.length ? sourceErrors.join('; ') : 'novelpia_no_candidates');\n    }\n\n    const existing = await loadExistingCatalogRows(env, [...candidates.keys()]);`,
`    if (!candidates.size) {\n      throw new Error(sourceErrors.length ? sourceErrors.join('; ') : 'novelpia_no_candidates');\n    }\n\n    // Persist the first-party homepage descriptor immediately. A temporary failure\n    // of one detail page must not make a valid homepage Fresh title disappear.\n    for (const item of homepageFresh.values()) {\n      await upsertHomepageFreshHint(env, item, now);\n    }\n\n    const existing = await loadExistingCatalogRows(env, [...candidates.keys()]);`,
'homepage hint persistence');

novel=replaceOnce(novel,
`      (SELECT GROUP_CONCAT(s2.signal, ',') FROM discovery_catalog_signals s2\n        WHERE s2.catalog_id = c.id) AS signal_list`,
`      (SELECT GROUP_CONCAT(s2.signal, ',') FROM discovery_catalog_signals s2\n        WHERE s2.catalog_id = c.id\n          AND (\n            (s2.signal = 'novelpia_home_new_plus'\n              AND datetime(s2.last_seen_at) >= datetime('now', '-2 hours'))\n            OR (s2.signal <> 'novelpia_home_new_plus'\n              AND datetime(s2.last_seen_at) >= datetime('now', '-16 days'))\n          )) AS signal_list`,
'active Fresh signal projection');

novel=replaceOnce(novel,
`          AND active.last_seen_at >= datetime('now', '-16 days')`,
`          AND datetime(active.last_seen_at) >= datetime('now', '-16 days')`,
'active signal datetime parsing');

novel=replaceOnce(novel,
`    ORDER BY\n      CASE WHEN EXISTS (\n        SELECT 1 FROM discovery_catalog_signals fresh\n        WHERE fresh.catalog_id = c.id AND fresh.signal IN ('novelpia_plus_new','novelpia_free_new')\n      ) THEN 0 ELSE 1 END,\n      c.first_seen_at DESC,\n      COALESCE(source_rank, 9999) ASC,\n      c.views_count DESC`,
`    ORDER BY\n      CASE\n        WHEN EXISTS (\n          SELECT 1 FROM discovery_catalog_signals home_fresh\n          WHERE home_fresh.catalog_id = c.id\n            AND home_fresh.signal = 'novelpia_home_new_plus'\n            AND datetime(home_fresh.last_seen_at) >= datetime('now', '-2 hours')\n        ) THEN 0\n        WHEN EXISTS (\n          SELECT 1 FROM discovery_catalog_signals fresh\n          WHERE fresh.catalog_id = c.id\n            AND fresh.signal IN ('novelpia_plus_new','novelpia_free_new')\n            AND datetime(fresh.last_seen_at) >= datetime('now', '-16 days')\n        ) THEN 1\n        ELSE 2\n      END,\n      COALESCE((\n        SELECT MIN(home_rank.rank_position) FROM discovery_catalog_signals home_rank\n        WHERE home_rank.catalog_id = c.id\n          AND home_rank.signal = 'novelpia_home_new_plus'\n          AND datetime(home_rank.last_seen_at) >= datetime('now', '-2 hours')\n      ), 9999) ASC,\n      c.first_seen_at DESC,\n      COALESCE(source_rank, 9999) ASC,\n      c.views_count DESC`,
'homepage Fresh ordering');

novel=replaceOnce(novel,
`        (SELECT COUNT(DISTINCT s.catalog_id)\n          FROM discovery_catalog_signals s\n          JOIN discovery_catalog c ON c.id=s.catalog_id\n          WHERE c.provider='novelpia' AND s.last_seen_at >= datetime('now','-16 days')) AS active_signal_count,\n        (SELECT COUNT(DISTINCT s2.catalog_id)\n          FROM discovery_catalog_signals s2\n          JOIN discovery_catalog c2 ON c2.id=s2.catalog_id\n          WHERE c2.provider='novelpia' AND c2.linked_submission_id IS NULL\n            AND s2.last_seen_at >= datetime('now','-16 days')) AS fresh_unlinked_count`,
`        (SELECT COUNT(DISTINCT s.catalog_id)\n          FROM discovery_catalog_signals s\n          JOIN discovery_catalog c ON c.id=s.catalog_id\n          WHERE c.provider='novelpia' AND datetime(s.last_seen_at) >= datetime('now','-16 days')) AS active_signal_count,\n        (SELECT COUNT(DISTINCT s2.catalog_id)\n          FROM discovery_catalog_signals s2\n          JOIN discovery_catalog c2 ON c2.id=s2.catalog_id\n          WHERE c2.provider='novelpia' AND c2.linked_submission_id IS NULL\n            AND datetime(s2.last_seen_at) >= datetime('now','-16 days')) AS fresh_unlinked_count,\n        (SELECT COUNT(DISTINCT hs.catalog_id)\n          FROM discovery_catalog_signals hs\n          JOIN discovery_catalog hc ON hc.id=hs.catalog_id\n          WHERE hc.provider='novelpia'\n            AND hs.signal='novelpia_home_new_plus'\n            AND datetime(hs.last_seen_at) >= datetime('now','-2 hours')) AS homepage_signal_count,\n        (SELECT COUNT(DISTINCT hu.catalog_id)\n          FROM discovery_catalog_signals hu\n          JOIN discovery_catalog hc2 ON hc2.id=hu.catalog_id\n          WHERE hc2.provider='novelpia' AND hc2.linked_submission_id IS NULL\n            AND hu.signal='novelpia_home_new_plus'\n            AND datetime(hu.last_seen_at) >= datetime('now','-2 hours')) AS homepage_fresh_count`,
'homepage health counts');

novel=replaceOnce(novel,
`    \`).first<{ catalog_count: number; active_signal_count: number; fresh_unlinked_count: number }>(),`,
`    \`).first<{\n      catalog_count: number;\n      active_signal_count: number;\n      fresh_unlinked_count: number;\n      homepage_signal_count: number;\n      homepage_fresh_count: number;\n    }>(),`,
'health stat type');

novel=replaceOnce(novel,
`    fresh_unlinked_count: Number(stats?.fresh_unlinked_count ?? 0),\n  };`,
`    fresh_unlinked_count: Number(stats?.fresh_unlinked_count ?? 0),\n    homepage_signal_count: Number(stats?.homepage_signal_count ?? 0),\n    homepage_fresh_count: Number(stats?.homepage_fresh_count ?? 0),\n  };`,
'health stat presentation');

const upsertMarker=`async function upsertCatalogNovel(env: Env, novel: ParsedNovel, now: string): Promise<void> {`;
const upsertHome=`async function upsertHomepageFreshHint(\n  env: Env,\n  item: NovelpiaHomepageFreshItem,\n  now: string,\n): Promise<void> {\n  await env.DB.prepare(\`\n    INSERT INTO discovery_catalog (\n      provider, external_id, title, original_title, author, original_language,\n      chapter_count, publication_status, genres_tags, synopsis, source_url, cover_url,\n      source_tier, age_rating, views_count, favorites_count, recommendations_count,\n      raw_available, first_seen_at, last_seen_at, last_enriched_at, metadata_json,\n      created_at, updated_at\n    ) VALUES (\n      'novelpia', ?, ?, ?, ?, 'Korean', NULL, 'ongoing', '', NULL, ?, ?,\n      'plus', NULL, 0, 0, 0, 0, ?, ?, NULL, ?, ?, ?\n    )\n    ON CONFLICT(provider, external_id) DO UPDATE SET\n      title = excluded.title,\n      original_title = excluded.original_title,\n      author = COALESCE(excluded.author, discovery_catalog.author),\n      source_url = excluded.source_url,\n      cover_url = COALESCE(excluded.cover_url, discovery_catalog.cover_url),\n      source_tier = 'plus',\n      last_seen_at = excluded.last_seen_at,\n      updated_at = excluded.updated_at\n  \`).bind(\n    item.externalId,\n    item.title,\n    item.title,\n    item.author,\n    \`\${NOVELPIA_ORIGIN}/novel/\${item.externalId}\`,\n    item.coverUrl,\n    now,\n    now,\n    JSON.stringify({ source: 'official_novelpia_home_new_plus' }),\n    now,\n    now,\n  ).run();\n}\n\n`;
novel=replaceOnce(novel,upsertMarker,upsertHome+upsertMarker,'homepage hint upsert helper');
write('src/novelpia-discovery.ts',novel);

let feed=read('src/discovery-feed.ts');
feed=replaceOnce(feed,
`          'NovelPia new-rank',\n          'NovelPia views/favorites',`,
`          'NovelPia homepage Fresh',\n          'NovelPia new-rank',\n          'NovelPia views/favorites',`,
'opportunity score source list');
feed=replaceOnce(feed,
`  const freshness = row.fresh_signals.includes('novelpia_plus_new')\n    ? 7\n    : row.fresh_signals.includes('novelpia_free_new')\n      ? 5\n      : 3;`,
`  const freshness = row.fresh_signals.includes('novelpia_home_new_plus')\n    ? 10\n    : row.fresh_signals.includes('novelpia_plus_new')\n      ? 7\n      : row.fresh_signals.includes('novelpia_free_new')\n        ? 5\n        : 3;`,
'homepage freshness score');
feed=replaceOnce(feed,
`  if (row.favorites_count > 0) out.push(\`\${row.favorites_count} favorites\`);\n  if (row.fresh_signals.includes('novelpia_plus_new')) out.push('New PLUS conversion');`,
`  if (row.favorites_count > 0) out.push(\`\${row.favorites_count} favorites\`);\n  if (row.fresh_signals.includes('novelpia_home_new_plus')) out.push('NovelPia homepage Fresh');\n  else if (row.fresh_signals.includes('novelpia_plus_new')) out.push('New PLUS conversion');`,
'homepage opportunity signal');
feed=replaceOnce(feed,
`  fresh_unlinked_count?: number;\n} | null,`,
`  fresh_unlinked_count?: number;\n  homepage_signal_count?: number;\n  homepage_fresh_count?: number;\n} | null,`,
'homepage ingest health type');
feed=replaceOnce(feed,
`    fresh_unlinked_count: unlinked,\n    degraded: Boolean(state.last_error) || mismatch,`,
`    fresh_unlinked_count: unlinked,\n    homepage_signal_count: Number(state.homepage_signal_count ?? 0),\n    homepage_fresh_count: Number(state.homepage_fresh_count ?? 0),\n    degraded: Boolean(state.last_error) || mismatch,`,
'homepage ingest health presentation');
write('src/discovery-feed.ts',feed);

let audit=read('scripts/audit-discovery-foundation.mjs');
audit=replaceOnce(audit,
`const novelpia=read('src/novelpia-discovery.ts');`,
`const novelpia=read('src/novelpia-discovery.ts');\nconst novelpiaHomeFresh=read('src/novelpia-home-fresh.ts');`,
'audit homepage provider read');
audit=replaceOnce(audit,
`  "url: \`${'${NOVELPIA_ORIGIN}'}/plus/entry/date?main_genre=\`",`,
`  'fetchNovelpiaHomepageFresh',\n  "'novelpia_home_new_plus'",\n  'upsertHomepageFreshHint',\n  'homepage_signal_count',\n  'homepage_fresh_count',\n  "url: \`${'${NOVELPIA_ORIGIN}'}/plus/entry/date?main_genre=\`",`,
'audit homepage integration tokens');
const auditInsert=`\nfor(const token of [\n  "const HOMEPAGE_FRESH_PATH = '/proc/main_v2'",\n  "url.searchParams.set('cmd', 'new_novel_curation')",\n  "url.searchParams.set('novel_category', 'entry')",\n  'const MAX_RESPONSE_BYTES = 512_000',\n  'const MAX_ITEMS = 7',\n  "referer: \`${'${NOVELPIA_ORIGIN}'}/\`",\n  "redirect: 'follow'",\n  'signal: controller.signal',\n  'readResponseTextLimited',\n  'novelpia_home_fresh_response_too_large',\n  'extractOfficialNovelLinkId',\n  "const declaredId = String(value.novel_no ?? '').trim()",\n  'declaredId !== externalId',\n  "url.hostname !== 'images.novelpia.com'",\n])requireText(novelpiaHomeFresh,token,'official NovelPia homepage Fresh provider');\nif(/ori\\|thumb\\|cover|_\\(\\\\d/.test(novelpiaHomeFresh.slice(novelpiaHomeFresh.indexOf('function extractOfficialNovelLinkId'),novelpiaHomeFresh.indexOf('function normalizeOfficialAssetUrl')))){\n  throw new Error('Discovery audit failed: homepage Fresh identity must come from link_url, never cover/image IDs');\n}\n`;
audit=replaceOnce(audit,
`const extractorBlock=novelpia.slice(novelpia.indexOf('function extractNovelIds'),novelpia.indexOf('function minSignalRank'));`,
auditInsert+`\nconst extractorBlock=novelpia.slice(novelpia.indexOf('function extractNovelIds'),novelpia.indexOf('function minSignalRank'));`,
'audit homepage provider safety');
audit=replaceOnce(audit,
`requireText(feed,'catalogOpportunityScore','NovelPia opportunity score');`,
`requireText(feed,'catalogOpportunityScore','NovelPia opportunity score');\nrequireText(feed,"row.fresh_signals.includes('novelpia_home_new_plus')",'homepage Fresh opportunity priority');\nrequireText(feed,"out.push('NovelPia homepage Fresh')",'homepage Fresh opportunity signal');`,
'audit feed homepage priority');
write('scripts/audit-discovery-foundation.mjs',audit);

for(const path of [
  'scripts/probe-novelpia-source-structure.mjs',
  '.github/workflows/novelpia-source-structure-probe.yml',
  'scripts/apply-novelpia-home-fresh.mjs',
  '.github/workflows/apply-novelpia-home-fresh.yml',
]){
  try{fs.unlinkSync(path);}catch(error){if(error?.code!=='ENOENT')throw error;}
}

console.log('Applied NovelPia homepage Fresh provider integration.');

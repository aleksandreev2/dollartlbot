import fs from 'node:fs';

const root=new URL('../',import.meta.url);
const read=file=>fs.readFileSync(new URL(file,root),'utf8');
const need=(source,needle,label)=>{if(!source.includes(needle))throw new Error(`${label}: missing ${needle}`);};
const forbid=(source,needle,label)=>{if(source.includes(needle))throw new Error(`${label}: forbidden ${needle}`);};

const migration=read('migrations/0023_publishing_center.sql');
const backend=read('src/publishing-center.ts');
const pipelineBackend=read('src/publishing-pipeline.ts');
const preflight=read('src/publishing-preflight.ts');
const adminPublications=read('src/admin-publications.ts');
const frontend=read('public/app/admin-publishing-center.js');
const pipelineFrontend=read('public/app/admin-publication-pipeline.js');
const css=read('public/app/admin-publishing-center.css');
const html=read('public/app/index.html');
const pkg=read('package.json');

for(const token of [
  'CREATE TABLE IF NOT EXISTS publication_editor_drafts',
  'admin_user_id INTEGER PRIMARY KEY',
  'CREATE TABLE IF NOT EXISTS publication_templates',
  'source_publication_id INTEGER',
  'idx_publication_templates_updated',
])need(migration,token,'publishing center migration');

for(const token of [
  "'/api/app/admin/publishing-center'",
  "'/api/app/admin/publishing-center/draft'",
  "'/api/app/admin/publishing-center/templates'",
  "'/api/app/admin/publishing-center/preflight'",
  'from-publication',
  'ON CONFLICT(admin_user_id) DO UPDATE SET',
  'BUILTIN_TEMPLATES',
  "key:'chapter_release'",
  "key:'new_novel'",
  "key:'translation_complete'",
  'inspectPublishingEnvironment',
  'MAX_TOTAL_ASSET_BYTES',
  'submission.status',
])need(backend,token,'publishing center backend');

for(const token of [
  "'/api/app/admin/publishing-center/pipeline'",
  "rb.publication_id=p.id AND rb.kind='release'",
  'release_broadcast_status',
  'release_sent_count',
  'release_failed_count',
])need(pipelineBackend,token,'publishing pipeline backend');

for(const token of [
  'export async function inspectPublishingEnvironment',
  'channel_permission_missing',
  'discussion_unlinked',
  'discussion_permission_missing',
])need(preflight,token,'shared publishing preflight');

for(const token of [
  "from './publishing-center'",
  "from './publishing-pipeline'",
  'handlePublishingPipelineRequest(request,env)',
  'handlePublishingCenterRequest(request,env,telegram)',
])need(adminPublications,token,'admin publication routing');

for(const token of [
  "new Set(['section:publishing','tools:publications','section:broadcasts'])",
  'publishing-center-tabs',
  'publishingCenterHidden',
  '/api/app/admin/publishing-center/draft',
  '/api/app/admin/publishing-center/templates',
  '/api/app/admin/publishing-center/preflight',
  'from-publication',
  'scheduleAutosave',
  'enableClosingConfirmation',
  'Файлы и изображение не сохраняются',
  "url.pathname==='/api/app/admin/publications'",
  'clearDraftAfterPublicationCreate',
])need(frontend,token,'publishing center frontend');
forbid(frontend,'registerRoute(','publishing center route ownership');
forbid(frontend,'MutationObserver','publishing center observer');
forbid(frontend,'window.fetch =','publishing center fetch override');
new Function(frontend);

for(const token of [
  "activeRoute?.()==='tools:publications'",
  '/api/app/admin/publishing-center/pipeline',
  'publication-pipeline-step',
  'Release broadcast',
  "admin.open('section:broadcasts')",
])need(pipelineFrontend,token,'publication pipeline frontend');
forbid(pipelineFrontend,'registerRoute(','pipeline route ownership');
new Function(pipelineFrontend);

for(const token of ['publishing-center-tabs','publishing-center-preflight','publishing-center-clone','data-publishing-center-hidden','publication-pipeline-step'])need(css,token,'publishing center CSS');
need(html,'/app/admin-publishing-center.css?v=20260811-pcenter2','publishing center CSS asset');
need(html,'/app/admin-publishing-center.js?v=20260811-pcenter1','publishing center JS asset');
need(html,'/app/admin-publication-pipeline.js?v=20260811-pcenter1','publishing pipeline JS asset');
const publishingIndex=html.indexOf('/app/admin-publishing.js?v=20260810-admin1');
const centerIndex=html.indexOf('/app/admin-publishing-center.js?v=20260811-pcenter1');
const pipelineIndex=html.indexOf('/app/admin-publication-pipeline.js?v=20260811-pcenter1');
if(publishingIndex<0||centerIndex<0||pipelineIndex<0||centerIndex<publishingIndex||pipelineIndex<centerIndex)throw new Error('Publishing Center enhancers must load after canonical publishing in deterministic order.');
need(pkg,'tests/admin-publishing-center.spec.mjs','publishing center browser coverage');
need(pkg,'tests/admin-publication-pipeline.spec.mjs','publishing pipeline browser coverage');

console.log('Unified Publishing Center audit passed: one navigation surface, server autosave, reusable templates, shared preflight, duplicate-to-draft flow, attachment-loss warning, delivery pipeline, and browser coverage are wired.');

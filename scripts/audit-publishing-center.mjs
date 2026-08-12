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
const flowFrontend=read('public/app/admin-publishing-flow.js');
const flowCss=read('public/app/admin-publishing-flow.css');
const publicationTemplate=read('public/app/publication-template-ui.js');
const publicationLinks=read('src/publication-links.ts');
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
  'title?:unknown',
  'body?:unknown',
  "body.internal_title??body.title??''",
  "body.body_html??body.body??''",
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
  'title:snapshot.internal_title',
  'body:snapshot.body_html',
  'clearDraftAfterPublish',
  "const published=/^\\/api\\/app\\/admin\\/publications\\/\\d+\\/publish$/.test(url.pathname)",
  'enhanceDraftHistory',
  "['[data-pub-send]','send','Опубликовать']",
])need(frontend,token,'publishing center frontend');
forbid(frontend,'clearDraftAfterPublicationCreate','publishing center must not clear editor on save/test');
forbid(frontend,"url.pathname==='/api/app/admin/publications'&&response.ok",'publishing center must not clear editor after publication creation');
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

for(const token of [
  'dtl:publishing:last-publish-intent',
  'publishing-flow-result',
  'Следующая публикация',
  "data-publishing-result-route=\"tools:publications\"",
  'matchMedia',
])need(flowFrontend,token,'publishing 4.4 flow frontend');
forbid(flowFrontend,'registerRoute(','publishing flow route ownership');
new Function(flowFrontend);

for(const token of [
  'applyRequestDefaults',
  'publication-request-summary',
  'Обложка заявки',
  'attachRequestCover',
  '/media/covers/',
  "form.set('image'",
])need(publicationTemplate,token,'request-aware publishing defaults');
for(const token of ['s.original_language','s.publication_status','has_cover','s.cover_updated_at'])need(publicationLinks,token,'publication link metadata');

for(const token of ['publishing-center-tabs','publishing-center-preflight','publishing-center-clone','data-publishing-center-hidden','publication-pipeline-step'])need(css,token,'publishing center CSS');
for(const token of ['publisher-flow-map','publisher-flow-step','publisher-preview-summary','publication-request-cover-badge','publishing-flow-result','publisher-actions'])need(flowCss,token,'publishing 4.4 CSS');
need(html,'/app/admin-publishing-center.css?v=20260811-pcenter2','publishing center CSS asset');
need(html,'/app/admin-publishing-flow.css?v=20260811-pflow1','publishing flow CSS asset');
need(html,'/app/admin-ui-utils.js?v=20260811-ui2','publishing time utility asset');
need(html,'/app/admin-publishing-center.js?v=20260812-pcenter3','publishing center JS asset');
need(html,'/app/admin-publishing-flow.js?v=20260811-pflow1','publishing flow JS asset');
need(html,'/app/publication-template-ui.js?v=20260811-pubtemplate3','request-aware template JS asset');
need(html,'/app/admin-publication-pipeline.js?v=20260811-pcenter1','publishing pipeline JS asset');
const flowIndex=html.indexOf('/app/admin-publishing-flow.js?v=20260811-pflow1');
const publishingIndex=html.indexOf('/app/admin-publishing.js?v=20260810-admin1');
const utilsIndex=html.indexOf('/app/admin-ui-utils.js?v=20260811-ui2');
const centerIndex=html.indexOf('/app/admin-publishing-center.js?v=20260812-pcenter3');
const pipelineIndex=html.indexOf('/app/admin-publication-pipeline.js?v=20260811-pcenter1');
if(flowIndex<0||publishingIndex<0||utilsIndex<0||centerIndex<0||pipelineIndex<0||flowIndex>publishingIndex||utilsIndex<publishingIndex||centerIndex<utilsIndex||pipelineIndex<centerIndex)throw new Error('Publishing flow must capture publish intent before canonical publishing and center enhancers must keep deterministic order.');
need(pkg,'tests/admin-publishing-center.spec.mjs','publishing center browser coverage');
need(pkg,'tests/admin-publication-pipeline.spec.mjs','publishing pipeline browser coverage');

console.log('Unified Publishing Center audit passed: linear editor flow, compatibility payloads, preserved save/test state, request autofill, preflight/autosave and delivery pipeline are wired.');

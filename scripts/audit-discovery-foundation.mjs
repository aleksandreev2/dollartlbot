import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const migration=read('migrations/0025_discovery_foundation.sql');
const server=read('src/discovery.ts');
const index=read('src/index.ts');
const html=read('public/app/index.html');
const ui=read('public/app/discovery-ui.js');
const suggest=read('public/app/view-suggest.js');
const bot=read('scripts/configure-bot.mjs');

const requireText=(source,needle,label)=>{
  if(!source.includes(needle))throw new Error(`Discovery audit failed: ${label}`);
};

requireText(migration,'CREATE TABLE IF NOT EXISTS discovery_interests','interest table');
requireText(migration,'PRIMARY KEY (submission_id, user_id)','interest dedupe');
requireText(migration,'CREATE TABLE IF NOT EXISTS submission_external_sources','generic external source table');
requireText(migration,'UNIQUE(submission_id, provider)','one provider link per submission');
requireText(server,'authenticateMiniAppRequest(request, env)','authenticated discovery API');
requireText(server,"body.provider !== 'raw_fucknovelpia'",'provider allowlist');
requireText(server,"hostname === 'raw-fucknovelpia.com'",'RAW host allowlist');
requireText(server,"/^\\/novel\\/raw-[a-z0-9-]+$/i",'RAW page allowlist');
requireText(server,"'/api/app/discovery/search'",'search endpoint');
requireText(server,"'/api/app/discovery/interest'",'interest endpoint');
requireText(server,"'/api/app/discovery/source'",'source endpoint');
requireText(index,"import { handleDiscoveryRequest } from './discovery';",'worker route import');
requireText(index,'await handleDiscoveryRequest(request, env)','worker route invocation');
requireText(html,'/app/discovery-ui.css?v=20260811-discovery1','discovery CSS asset');
requireText(html,'/app/discovery-ui.js?v=20260811-discovery1','discovery JS asset');
if(html.indexOf('/app/discovery-ui.js?v=20260811-discovery1')>html.indexOf('/app/view-suggest.js?v=20260810-app4&discover=20260811a')){
  throw new Error('Discovery audit failed: discovery UI must load before Suggest view');
}
requireText(suggest,'discovery?.renderFinder?.()','finder mounted in Suggest');
requireText(suggest,'discovery?.bindFinder?.()','finder lifecycle bound in Suggest');
requireText(suggest,'persistSelectedSource?.(data.submission_id)','external source linked after successful submission');
requireText(ui,"'/api/app/discovery/interest'",'demand action wired to discovery API');
requireText(ui,"'/api/app/discovery/source'",'source persistence wired to discovery API');
requireText(bot,"await api('setChatMenuButton'",'Telegram chat menu Mini App button');
requireText(bot,'Configure Mini App → Enable Mini App','BotFather Main Mini App guidance');
requireText(bot,'?startapp','Main Mini App direct link guidance');

console.log('Discovery foundation audit passed.');

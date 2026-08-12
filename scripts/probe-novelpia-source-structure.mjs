const ORIGIN='https://novelpia.com';
const headers={accept:'text/html,application/xhtml+xml','accept-language':'ko-KR,ko;q=0.9,en;q=0.6','user-agent':'DollarTL-Discovery/2.0'};

const homeResponse=await fetch(`${ORIGIN}/`,{headers});
const homeHtml=await homeResponse.text();
console.log(JSON.stringify({homeStatus:homeResponse.status,homeLength:homeHtml.length,freshText:homeHtml.includes('따끈따끈 신규 작품'),newPlusText:homeHtml.includes('신규 PLUS 작품')},null,2));

const componentUrl=`${ORIGIN}/js/component/main/basic_v2_curation.js?v=1760926096`;
const componentResponse=await fetch(componentUrl,{headers:{...headers,accept:'*/*'}});
const component=await componentResponse.text();
console.log('=== basic_v2_curation.js ===');
console.log(component);
console.log('=== end basic_v2_curation.js ===');

const endpointStrings=[...component.matchAll(/["'`](\/?(?:proc|api|ajax|main|curation)[^"'`\s]*)["'`]/gi)].map(m=>m[1]);
console.log('endpointStrings',JSON.stringify([...new Set(endpointStrings)],null,2));

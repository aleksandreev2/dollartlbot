const ORIGIN='https://novelpia.com';
const headers={accept:'text/html,application/xhtml+xml','accept-language':'ko-KR,ko;q=0.9,en;q=0.6','user-agent':'DollarTL-Discovery/2.0'};
const pages=[
  ['home',`${ORIGIN}/`],
  ['plus-new',`${ORIGIN}/plus/entry/date?main_genre=`],
  ['free-new',`${ORIGIN}/freestory/new/date/1?main_genre=`],
  ['new-rank',`${ORIGIN}/top100/plus/today/view/all/all?main_genre=`],
];

const decode=s=>String(s||'').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/\s+/g,' ').trim();
const strip=s=>decode(String(s||'').replace(/<script\b[\s\S]*?<\/script>/gi,' ').replace(/<style\b[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' '));
const uniq=a=>[...new Set(a)];

let homeHtml='';
for(const [name,url] of pages){
  const r=await fetch(url,{headers});
  const html=await r.text();
  if(name==='home')homeHtml=html;
  const ids=[...html.matchAll(/(?:https?:\/\/(?:www\.)?novelpia\.com)?\/novel\/(\d{2,9})/gi)].map(m=>m[1]);
  const novelNo=[...html.matchAll(/(?:novel_no|novelNo)["']?\s*[:=]\s*["']?(\d{2,9})/gi)].map(m=>m[1]);
  const imgHints=[...html.matchAll(/(?:novel\/)?(?:\d+\/)?[^"'\s>]*_(\d{2,9})_(?:ori|thumb|cover)[^"'\s>]*/gi)].map(m=>m[1]);
  const scripts=[...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)].map(m=>m[1]);
  console.log(JSON.stringify({name,status:r.status,final:r.url,length:html.length,freshText:html.includes('따끈따끈 신규 작품'),newPlusText:html.includes('신규 PLUS 작품'),explicitIds:uniq(ids).slice(0,15),novelNo:uniq(novelNo).slice(0,15),imageHints:uniq(imgHints).slice(0,15),scriptCount:scripts.length,scripts:scripts.slice(-30)},null,2));
}

const inlineScripts=[...homeHtml.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
console.log('home inline script count',inlineScripts.length,'lengths',inlineScripts.map(s=>s.length));
for(let i=0;i<inlineScripts.length;i++){
  const s=inlineScripts[i];
  const interesting=uniq([
    ...[...s.matchAll(/[^\n;]{0,140}(?:httpVueLoader|\.vue\b|axios|\/api\/|ajax|vue_main_wrapper|main[_-]?(?:novel|new|rank)|신규)[^\n;]{0,220}/gi)].map(m=>m[0].replace(/\s+/g,' ').trim()),
  ]).slice(0,80);
  if(interesting.length)console.log(`inline[${i}]`,JSON.stringify(interesting,null,2));
}

const scriptSrcs=uniq([...homeHtml.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)].map(m=>m[1]));
for(const src of scriptSrcs.filter(s=>/novelpia|main|vue|home/i.test(s)).slice(0,20)){
  try{
    const u=new URL(src,ORIGIN);
    if(u.hostname!=='novelpia.com')continue;
    const r=await fetch(u,{headers:{...headers,accept:'*/*'}});
    const text=await r.text();
    const interesting=uniq([...text.matchAll(/[^\n;]{0,160}(?:\/api\/|axios|ajax|main[_-]?(?:novel|new|rank)|신규|novel_no|novelNo)[^\n;]{0,260}/gi)].map(m=>m[0].replace(/\s+/g,' ').trim())).slice(0,100);
    console.log('asset',u.pathname,'status',r.status,'len',text.length,'interesting',JSON.stringify(interesting,null,2));
  }catch(e){console.log('asset fail',src,String(e));}
}

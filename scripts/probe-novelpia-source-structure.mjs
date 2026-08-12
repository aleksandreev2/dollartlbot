const ORIGIN='https://novelpia.com';
const pages=[
  ['home',`${ORIGIN}/`],
  ['plus-new',`${ORIGIN}/plus/entry/date?main_genre=`],
  ['free-new',`${ORIGIN}/freestory/new/date/1?main_genre=`],
  ['new-rank',`${ORIGIN}/top100/plus/today/view/all/all?main_genre=`],
];

const decode=s=>String(s||'').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/\s+/g,' ').trim();
const strip=s=>decode(String(s||'').replace(/<script\b[\s\S]*?<\/script>/gi,' ').replace(/<style\b[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' '));

for(const [name,url] of pages){
  const r=await fetch(url,{headers:{accept:'text/html,application/xhtml+xml','accept-language':'ko-KR,ko;q=0.9,en;q=0.6','user-agent':'DollarTL-Discovery/2.0'}});
  const html=await r.text();
  const ids=[...html.matchAll(/(?:https?:\/\/(?:www\.)?novelpia\.com)?\/novel\/(\d{2,9})/gi)].map(m=>m[1]);
  const novelNo=[...html.matchAll(/(?:novel_no|novelNo)["']?\s*[:=]\s*["']?(\d{2,9})/gi)].map(m=>m[1]);
  const imgHints=[...html.matchAll(/(?:novel\/)?(?:\d+\/)?[^"'\s>]*_(\d{2,9})_(?:ori|thumb|cover)[^"'\s>]*/gi)].map(m=>m[1]);
  const scripts=[...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)].map(m=>m[1]).slice(0,30);
  const titles=[...html.matchAll(/<(?:p|div|span)\b[^>]*class=["'][^"']*(?:nov-tit|novel-title|title)[^"']*["'][^>]*>([\s\S]*?)<\/(?:p|div|span)>/gi)].map(m=>strip(m[1])).filter(Boolean).slice(0,20);
  const writers=[...html.matchAll(/<(?:p|div|span)\b[^>]*class=["'][^"']*(?:nov-writer|writer|author)[^"']*["'][^>]*>([\s\S]*?)<\/(?:p|div|span)>/gi)].map(m=>strip(m[1])).filter(Boolean).slice(0,20);
  console.log(JSON.stringify({name,status:r.status,final:r.url,length:html.length,freshText:html.includes('따끈따끈 신규 작품'),newPlusText:html.includes('신규 PLUS 작품'),explicitIds:[...new Set(ids)].slice(0,15),novelNo:[...new Set(novelNo)].slice(0,15),imageHints:[...new Set(imgHints)].slice(0,15),titles,writers,scripts},null,2));

  if(name==='plus-new'||name==='free-new'||name==='new-rank'){
    const anchorSamples=[...html.matchAll(/<a\b[^>]*href=["']([^"']*)["'][^>]*>([\s\S]{0,1000}?)<\/a>/gi)]
      .map(m=>({href:m[1],text:strip(m[2]).slice(0,120)}))
      .filter(x=>x.text && /[가-힣]/.test(x.text))
      .slice(0,12);
    console.log(name,'anchorSamples',JSON.stringify(anchorSamples,null,2));
  }
}

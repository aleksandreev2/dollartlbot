const ORIGIN='https://novelpia.com';
const headers={accept:'text/html,application/xhtml+xml','accept-language':'ko-KR,ko;q=0.9,en;q=0.6','user-agent':'DollarTL-Discovery/2.0'};

const homeResponse=await fetch(`${ORIGIN}/`,{headers});
const homeHtml=await homeResponse.text();
console.log(JSON.stringify({homeStatus:homeResponse.status,homeLength:homeHtml.length},null,2));

for(const needle of ['new_novel_curation','basic-curation','basic_curation','main_group','basic-curation']){
  let from=0,shown=0;
  while(shown<12){
    const at=homeHtml.indexOf(needle,from);
    if(at<0)break;
    console.log('HOME CONTEXT',needle,JSON.stringify(homeHtml.slice(Math.max(0,at-500),Math.min(homeHtml.length,at+800)).replace(/\s+/g,' ')));
    from=at+needle.length;
    shown++;
  }
}

const groups=new Set();
for(const m of homeHtml.matchAll(/(?:main[_-]group|mainGroup)["':=\s]+(?:Number\()?['"]?(\d{1,5})/gi))groups.add(m[1]);
console.log('candidate groups',JSON.stringify([...groups]));

for(const group of [...groups,'1','2','3','4','5','6','7','8','9','10','11','12','13','14','15','16','17','18','19','20']){
  const url=new URL('/proc/main_v2',ORIGIN);
  url.searchParams.set('cmd','new_novel_curation');
  url.searchParams.set('main_group',group);
  url.searchParams.set('novel_category','entry');
  try{
    const r=await fetch(url,{headers:{...headers,accept:'application/json,text/plain,*/*',referer:`${ORIGIN}/`}});
    const text=await r.text();
    let parsed=null; try{parsed=JSON.parse(text);}catch{}
    const list=Array.isArray(parsed?.list)?parsed.list:[];
    if(list.length||parsed?.status==200){
      console.log('API',group,'status',r.status,'bodyStatus',parsed?.status,'conf',JSON.stringify(parsed?.conf||null),'count',list.length,'sample',JSON.stringify(list.slice(0,8).map(x=>({novel_no:x.novel_no,link_url:x.link_url,novel_name:x.novel_name,writer_nick:x.writer_nick,novel_thumb:x.novel_thumb})),null,2));
    }
  }catch(e){console.log('API fail',group,String(e));}
}

const ORIGIN='https://novelpia.com';
const headers={accept:'application/json,text/plain,*/*','accept-language':'ko-KR,ko;q=0.9,en;q=0.6','user-agent':'DollarTL-Discovery/2.0',referer:`${ORIGIN}/`};
const expected=[
  ['얀데레 히로인은 나한테 집착하지 않는다','연꽃낙타'],
  ['일진녀에게 찍혀버렸다','TIGRIS'],
  ['오픈채팅방의 캠퍼스 여신','작은문'],
  ['평행세계갤러리 주딱입니다','몽상공상'],
  ['999,999,999,999분의 1 귀환권 뽑기','두발벌레'],
  ['무언가 나를 계속 회귀시킨다','초신성잔해'],
  ['연기천재는 망겜 인방이 하고 싶다','과일바구니'],
];

for(const category of ['entry','complete']){
  const url=new URL('/proc/main_v2',ORIGIN);
  url.searchParams.set('cmd','new_novel_curation');
  url.searchParams.set('novel_category',category);
  const r=await fetch(url,{headers});
  const text=await r.text();
  let parsed=null;try{parsed=JSON.parse(text)}catch{}
  const list=Array.isArray(parsed?.list)?parsed.list:[];
  const simplified=list.map(x=>({novel_no:String(x.novel_no||''),link_url:x.link_url,novel_name:x.novel_name,writer_nick:x.writer_nick,novel_thumb:x.novel_thumb}));
  const matches=expected.filter(([title,author])=>simplified.some(x=>x.novel_name===title&&x.writer_nick===author));
  console.log(JSON.stringify({category,httpStatus:r.status,bodyStatus:parsed?.status,count:list.length,matches:matches.length,exactExpectedOrder:expected.every(([t,a],i)=>simplified[i]?.novel_name===t&&simplified[i]?.writer_nick===a),list:simplified},null,2));
}

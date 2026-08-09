(() => {
  const units={ru:'глав',es:'capítulos',fil:'kabanata',hi:'अध्याय',pt:'capítulos',id:'bab',vi:'chương',fr:'chapitres',de:'Kapitel'};
  const requestWords={ru:'Заявка',es:'Solicitud',fil:'Kahilingan',hi:'अनुरोध',pt:'Pedido',id:'Permintaan',vi:'Yêu cầu',fr:'Demande',de:'Anfrage'};
  const positionWords={ru:'Позиция',es:'Posición',fil:'Puwesto',hi:'स्थान',pt:'Posição',id:'Posisi',vi:'Vị trí',fr:'Position',de:'Position'};
  function locale(){return String(document.documentElement.lang||'en').toLowerCase().split('-')[0];}
  function patch(){
    const l=locale(); if(!units[l])return;
    for(const root of [document.getElementById('viewRoot'),document.getElementById('bottomNav'),document.getElementById('sheetRoot')]){
      if(!root)continue;
      const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
      for(const node of nodes){
        let s=node.nodeValue||'';
        const next=s
          .replace(/\b(\d+)\s+chapters\b/gi,(_,n)=>`${n} ${units[l]}`)
          .replace(/\bRequest\s+#(\d+)\b/gi,(_,n)=>`${requestWords[l]} #${n}`)
          .replace(/\bPosition\s+#(\d+)\b/gi,(_,n)=>`${positionWords[l]} #${n}`);
        if(next!==s)node.nodeValue=next;
      }
    }
  }
  let raf=0;const schedule=()=>{if(raf)return;raf=requestAnimationFrame(()=>{raf=0;patch();});};
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true,characterData:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
})();

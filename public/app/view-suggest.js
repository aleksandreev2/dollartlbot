(() => {
  const app=window.DTL_APP;
  if(!app?.registerView)throw new Error('DTL app core must load before view-suggest.js');
  const {state,viewRoot,filePicker,tr,copy,escapeHtml,languageFlag,languageName,tagLabel,requestLabel}=app;

  function ico(name,cls=''){return `<i data-lucide="${name}"${cls?` class="${cls}"`:''} aria-hidden="true"></i>`;}
  function refreshIcons(){requestAnimationFrame(()=>{try{window.lucide?.createIcons?.({attrs:{'stroke-width':1.8,'aria-hidden':'true'}});}catch{}});}
  function renderCanonicalContent(){
    const content=window.DTL_SUGGEST_CONTENT;
    if(!content?.render)throw new Error('Canonical Suggest content renderer is unavailable.');
    return content.render();
  }

  function renderSuggest() {
    if(state.wizardStep===1)return renderUploadStep();
    if(state.wizardStep===2)return renderDetailsStep();
    if(state.wizardStep===3)return renderCanonicalContent();
    return renderReviewStep();
  }

  function wizardHeader(){
    const labels=[tr('upload'),tr('details'),tr('tagsContent'),tr('review')];
    return `<div class="wizard-head"><div class="wizard-title-row"><h1 style="margin:0">${escapeHtml(tr('suggestNovel'))}</h1></div><div class="stepper">${labels.map((label,i)=>{const n=i+1,cls=n<state.wizardStep?'done':n===state.wizardStep?'active':'';return`<div class="step-node ${cls}"><span class="step-circle">${n<state.wizardStep?ico('check'):n}</span><span>${escapeHtml(label)}</span></div>`}).join('')}</div></div>`;
  }

  function renderUploadStep(){
    const discovery=window.DTL_DISCOVERY;
    const finder=discovery?.renderFinder?.()||'';
    viewRoot.innerHTML=`<section class="page suggest-wizard-page">${wizardHeader()}${finder}<div class="upload-zone"><div class="upload-inner"><div class="upload-illustration">${ico('upload')}</div><h2>${escapeHtml(tr('uploadNovelFile'))}</h2><p>${escapeHtml(tr('uploadCopy'))}</p><button class="primary-button" id="pickFile" type="button">${ico('upload')} ${escapeHtml(tr('uploadButton'))}</button><div class="small muted suggest-inline-note" style="margin-top:12px">${ico('lock')} ${escapeHtml(tr('filePrivate'))}</div>${state.file?filePickedMarkup():''}</div></div><div class="form-section"><label class="form-label suggest-field-label" for="sourceUrl">${ico('external-link')} ${escapeHtml(tr('originalSourceOptional'))}</label><input class="text-input" id="sourceUrl" type="url" value="${escapeHtml(state.draft.source_url)}" placeholder="https://example.com/novel"><p class="form-help">${escapeHtml(tr('sourceHelp'))}</p></div><div class="tip-card" style="margin-top:18px"><div class="round-icon">${ico('sparkles')}</div><div><div class="tip-title">${escapeHtml(tr('autoFillHint'))}</div><div class="tip-copy">${escapeHtml(tr('autoFillCopy'))}</div></div></div>${state.fileAnalysis?analysisMarkup():''}<button class="primary-button wide-button" id="uploadContinue" type="button" style="margin-top:18px" ${!state.file?'disabled':''}>${escapeHtml(tr('continue'))} ${ico('arrow-right')}</button></section>`;
    document.getElementById('pickFile')?.addEventListener('click',()=>filePicker.click());
    document.getElementById('sourceUrl')?.addEventListener('input',e=>state.draft.source_url=e.target.value);
    document.getElementById('uploadContinue')?.addEventListener('click',()=>{state.wizardStep=2;renderSuggest();});
    discovery?.bindFinder?.();
    refreshIcons();
  }

  function filePickedMarkup(){
    return `<div class="file-picked"><div class="round-icon">${ico('file-text')}</div><div><strong title="${escapeHtml(state.file.name)}">${escapeHtml(state.file.name)}</strong><div class="small muted">${formatBytes(state.file.size)}</div></div><span class="status-pill green" aria-label="${escapeHtml(tr('fileAnalyzed'))}">${ico('check')}</span></div>`;
  }

  function analysisMarkup(){
    const a=state.fileAnalysis;
    return `<div class="analysis-card" style="margin-top:18px"><div class="analysis-head"><div class="analysis-icon">${ico('sparkles')}</div><div><div class="analysis-title">${escapeHtml(a.done?tr('fileAnalyzed'):tr('analyzing'))}</div><div class="small muted">${a.done?escapeHtml(tr('autoDetected')):''}</div></div></div><div class="analysis-steps">${a.steps.map(step=>`<div class="analysis-step ${step.status}"><span class="step-dot">${step.status==='done'?ico('check'):ico('circle')}</span>${escapeHtml(step.label)}</div>`).join('')}</div></div>`;
  }

  filePicker.addEventListener('change',async()=>{
    const file=filePicker.files?.[0];
    if(!file)return;
    if(file.size>45*1024*1024){app.toast(tr('fileTooLarge'),'error');filePicker.value='';return;}
    const ext=file.name.split('.').pop()?.toLowerCase();
    if(!['txt','epub'].includes(ext)){app.toast(tr('unsupportedFile'),'error');filePicker.value='';return;}
    state.file=file;
    state.fileAnalysis={done:false,steps:[{label:tr('readingFile'),status:'running'},{label:tr('detectingLanguage'),status:''},{label:tr('findingChapters'),status:''},{label:tr('readingStructure'),status:''}]};
    renderSuggest();
    await analyzeFile(file);
  });

  async function analyzeFile(file){try{setAnalysisStep(0,'done');setAnalysisStep(1,'running');let result;if(file.name.toLowerCase().endsWith('.txt'))result=await analyzeTxt(file);else result=await analyzeEpub(file);setAnalysisStep(1,'done');setAnalysisStep(2,'done');setAnalysisStep(3,'done');state.fileAnalysis.done=true;if(result.title&&!state.draft.title)state.draft.title=result.title;if(result.language)state.draft.original_language=result.language;if(result.chapters)state.draft.chapter_count=String(result.chapters);renderSuggest();try{app.tg?.HapticFeedback?.notificationOccurred('success');}catch{}}catch(e){state.fileAnalysis.done=true;state.fileAnalysis.steps.forEach(s=>{if(s.status==='running')s.status='';});renderSuggest();app.toast(e.message||tr('genericError'),'error');}}
  function setAnalysisStep(index,status){if(!state.fileAnalysis)return;state.fileAnalysis.steps[index].status=status;renderSuggest();}
  async function analyzeTxt(file){const text=await file.text();const sample=text.slice(0,800000);const language=detectLanguage(sample);const chapters=detectChapters(sample);const title=detectTxtTitle(sample);return{language,chapters,title};}
  async function analyzeEpub(file){const buffer=await file.arrayBuffer();const entries=readZipDirectory(buffer);let metadata={};let textSamples=[];let contentCount=0;for(const entry of entries){if(!/\.(opf|xhtml|html|htm)$/i.test(entry.name))continue;if(entry.uncompressedSize>5_000_000)continue;let text='';try{text=await extractZipText(buffer,entry);}catch{continue;}if(/\.opf$/i.test(entry.name)){metadata=parseOpf(text);continue;}const plain=htmlToText(text);if(plain.length>300){contentCount++;if(textSamples.join('').length<500000)textSamples.push(plain.slice(0,80000));}}const combined=textSamples.join('\n');const language=normalizeDetectedLanguage(metadata.language)||detectLanguage(combined);const chapters=contentCount||detectChapters(combined);return{language,chapters,title:metadata.title||''};}
  function readZipDirectory(buffer){const view=new DataView(buffer);let eocd=-1;for(let i=Math.max(0,buffer.byteLength-65557);i<=buffer.byteLength-22;i++){if(view.getUint32(i,true)===0x06054b50)eocd=i;}if(eocd<0)throw new Error(copy('epubRead'));const count=view.getUint16(eocd+10,true);let offset=view.getUint32(eocd+16,true);const decoder=new TextDecoder();const entries=[];for(let n=0;n<count&&offset+46<=buffer.byteLength;n++){if(view.getUint32(offset,true)!==0x02014b50)break;const method=view.getUint16(offset+10,true),compressedSize=view.getUint32(offset+20,true),uncompressedSize=view.getUint32(offset+24,true),nameLen=view.getUint16(offset+28,true),extraLen=view.getUint16(offset+30,true),commentLen=view.getUint16(offset+32,true),localOffset=view.getUint32(offset+42,true);const name=decoder.decode(new Uint8Array(buffer,offset+46,nameLen));entries.push({name,method,compressedSize,uncompressedSize,localOffset});offset+=46+nameLen+extraLen+commentLen;}return entries;}
  async function extractZipText(buffer,entry){const view=new DataView(buffer);if(view.getUint32(entry.localOffset,true)!==0x04034b50)throw new Error(copy('epubEntry'));const nameLen=view.getUint16(entry.localOffset+26,true),extraLen=view.getUint16(entry.localOffset+28,true),start=entry.localOffset+30+nameLen+extraLen;const bytes=new Uint8Array(buffer,start,entry.compressedSize);let out;if(entry.method===0)out=bytes;else if(entry.method===8&&typeof DecompressionStream!=='undefined'){const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));out=new Uint8Array(await new Response(stream).arrayBuffer());}else throw new Error(copy('epubCompression'));return new TextDecoder('utf-8').decode(out);}
  function parseOpf(xml){try{const doc=new DOMParser().parseFromString(xml,'application/xml');const value=names=>{for(const name of names){const el=doc.querySelector(name);if(el?.textContent?.trim())return el.textContent.trim();}return'';};return{title:value(['dc\\:title','title']),language:value(['dc\\:language','language'])};}catch{return{};}}
  function htmlToText(html){try{const doc=new DOMParser().parseFromString(html,'text/html');doc.querySelectorAll('script,style,nav').forEach(x=>x.remove());return(doc.body?.textContent||'').replace(/\s+/g,' ').trim();}catch{return html.replace(/<[^>]+>/g,' ');}}
  function detectLanguage(text){const hangul=(text.match(/[\uAC00-\uD7AF]/g)||[]).length,kana=(text.match(/[\u3040-\u30FF]/g)||[]).length,han=(text.match(/[\u4E00-\u9FFF]/g)||[]).length,dev=(text.match(/[\u0900-\u097F]/g)||[]).length,cyr=(text.match(/[\u0400-\u04FF]/g)||[]).length;if(hangul>30)return'Korean';if(kana>30)return'Japanese';if(han>50)return'Chinese';if(dev>30)return'Hindi';if(cyr>100)return'Russian';const lower=` ${text.toLowerCase()} `;const scores={English:[' the ',' and ',' of ',' to '],Spanish:[' el ',' la ',' de ',' que '],Portuguese:[' de ',' que ',' não ',' uma '],French:[' le ',' la ',' les ',' des '],German:[' der ',' die ',' und ',' das '],Indonesian:[' yang ',' dan ',' tidak ',' dengan '],Vietnamese:[' và ',' của ',' không ',' một ']};let best='';let score=0;for(const [lang,words]of Object.entries(scores)){const s=words.reduce((sum,w)=>sum+(lower.split(w).length-1),0);if(s>score){score=s;best=lang;}}return score>3?best:'';}
  function normalizeDetectedLanguage(value=''){const v=value.toLowerCase();if(v.startsWith('ko'))return'Korean';if(v.startsWith('ja'))return'Japanese';if(v.startsWith('zh'))return'Chinese';if(v.startsWith('en'))return'English';if(v.startsWith('ru'))return'Russian';if(v.startsWith('es'))return'Spanish';if(v.startsWith('pt'))return'Portuguese';if(v.startsWith('fr'))return'French';if(v.startsWith('de'))return'German';if(v.startsWith('id'))return'Indonesian';if(v.startsWith('vi'))return'Vietnamese';if(v.startsWith('hi'))return'Hindi';return value;}
  function detectChapters(text){const patterns=[/^(?:chapter|chap\.?|ch\.?)[\s:#.-]*\d+/gim,/^глава[\s:#.-]*\d+/gim,/^제\s*\d+\s*[화장]/gm,/^第\s*\d+\s*[章节話话]/gm];let max=0;for(const re of patterns)max=Math.max(max,(text.match(re)||[]).length);return max||0;}
  function detectTxtTitle(text){const lines=text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean).slice(0,15);return lines.find(line=>line.length>2&&line.length<140&&!/^(chapter|chap\.?|глава|제\s*\d+|第\s*\d+)/i.test(line))||'';}
  function formatBytes(bytes){if(bytes<1024)return`${bytes} B`;if(bytes<1024*1024)return`${(bytes/1024).toFixed(1)} KB`;return`${(bytes/1024/1024).toFixed(1)} MB`;}

  function renderDetailsStep(){
    const a=state.bootstrap.account;
    const tooLong=a.plan!=='subscriber'&&Number(state.draft.chapter_count)>a.regular_max_chapters;
    viewRoot.innerHTML=`<section class="page suggest-wizard-page">${wizardHeader()}${state.fileAnalysis?`<div class="analysis-card"><div class="analysis-head"><div class="analysis-icon">${ico('check-circle')}</div><div><div class="analysis-title">${escapeHtml(tr('fileAnalyzed'))}</div><div class="small suggest-inline-note" style="color:var(--green)">${ico('sparkles')} ${escapeHtml(tr('autoDetected'))}</div></div></div></div>`:''}<div class="section"><div class="section-header"><h2>${escapeHtml(tr('detectedDetails'))}</h2></div><div class="surface-card detected-list"><div class="detected-row"><div class="round-icon">${ico('text')}</div><div><div class="detected-name">${escapeHtml(tr('novelTitle'))}</div><input class="text-input" id="draftTitle" value="${escapeHtml(state.draft.title)}" style="margin-top:5px"></div></div><div class="detected-row"><div class="round-icon">${ico('languages')}</div><div><div class="detected-name">${escapeHtml(tr('originalLanguage'))}</div><input class="text-input" id="draftLanguage" value="${escapeHtml(state.draft.original_language)}" style="margin-top:5px"></div></div><div class="detected-row"><div class="round-icon">${ico('book-open')}</div><div><div class="detected-name">${escapeHtml(tr('chapterCount'))}</div><input class="text-input" id="draftChapters" type="number" min="1" value="${escapeHtml(state.draft.chapter_count)}" style="margin-top:5px"></div></div><div class="detected-row"><div class="round-icon">${ico('circle-dot')}</div><div><div class="detected-name">${escapeHtml(tr('publicationStatus'))}</div><select class="select-input" id="draftStatus" style="margin-top:5px"><option value="ongoing" ${state.draft.publication_status==='ongoing'?'selected':''}>${escapeHtml(tr('ongoing'))}</option><option value="completed" ${state.draft.publication_status==='completed'?'selected':''}>${escapeHtml(tr('completed'))}</option></select></div></div></div></div><div class="tip-card ${tooLong?'warn':''}" style="margin-top:18px"><div class="round-icon">${ico('lightbulb')}</div><div><div class="tip-title">${escapeHtml(tr('chapterLimit'))}</div><div class="tip-copy">${escapeHtml(a.plan==='subscriber'?tr('boostyNoLimit'):tr('regularLimitCopy'))}</div>${tooLong?`<div class="tip-copy" style="color:var(--red);font-weight:700">${escapeHtml(tr('regularTooLong'))}</div>`:''}</div></div><div class="button-row" style="margin-top:18px"><button class="secondary-button" id="detailsBack">${ico('arrow-left')} ${escapeHtml(tr('back'))}</button><button class="primary-button" id="detailsContinue" ${tooLong?'disabled':''}>${escapeHtml(tr('continue'))} ${ico('arrow-right')}</button></div></section>`;
    bindInput('draftTitle','title');
    bindInput('draftLanguage','original_language');
    bindInput('draftChapters','chapter_count');
    bindInput('draftStatus','publication_status');
    document.getElementById('detailsBack').addEventListener('click',()=>{state.wizardStep=1;renderSuggest();});
    document.getElementById('detailsContinue').addEventListener('click',()=>{if(!state.draft.title||!state.draft.original_language||!Number(state.draft.chapter_count)){app.toast(copy('completeDetails'),'error');return;}state.wizardStep=3;renderSuggest();});
    refreshIcons();
  }

  function bindInput(id,key){document.getElementById(id)?.addEventListener('input',e=>{state.draft[key]=e.target.value;});document.getElementById(id)?.addEventListener('change',e=>{state.draft[key]=e.target.value;});}

  function renderReviewStep(){
    const a=state.bootstrap.account;
    const after=Math.min(a.limit,a.used+1);
    const language=languageName(state.draft.original_language)||state.draft.original_language;
    const edit=escapeHtml(copy('edit'));
    const sexual=state.draft.sexual_content==='None'?tr('noSexual'):state.draft.sexual_content;
    const sensitive=state.draft.sensitive_content==='None'?'—':state.draft.sensitive_content;
    const discoverySource=window.DTL_DISCOVERY?.reviewSourceMarkup?.()||'';
    viewRoot.innerHTML=`<section class="page suggest-wizard-page">${wizardHeader()}<div class="page-heading compact"><h2>${escapeHtml(tr('reviewYourRequest'))}</h2><p class="subtitle">${escapeHtml(tr('reviewCopy'))}</p></div><div class="surface-card review-card"><div class="review-row"><div class="round-icon">${ico('file-text')}</div><div><div class="review-label">${escapeHtml(tr('uploadedSource'))}</div><div class="review-value review-file-name" title="${escapeHtml(state.file?.name||'—')}">${escapeHtml(state.file?.name||'—')}</div><div class="review-sub">${state.file?formatBytes(state.file.size):''}</div>${discoverySource}</div><button class="edit-link" data-edit-step="1">${edit}</button></div><div class="review-row"><div class="round-icon">${ico('book-open')}</div><div><div class="review-label">${escapeHtml(tr('detectedInfo'))}</div><div class="review-value">${escapeHtml(state.draft.title)}</div><div class="review-sub">${languageFlag(state.draft.original_language)} ${escapeHtml(language)} · ${escapeHtml(state.draft.chapter_count)} ${escapeHtml(tr('chapters'))} · ${escapeHtml(tr(state.draft.publication_status==='completed'?'completed':'ongoing'))}</div></div><button class="edit-link" data-edit-step="2">${edit}</button></div><div class="review-row"><div class="round-icon">${ico('tags')}</div><div><div class="review-label">${escapeHtml(tr('genresTags'))}</div><div class="review-value">${escapeHtml(state.draft.genres_tags.split(',').map(x=>tagLabel(x.trim())).filter(Boolean).join(', '))}</div></div><button class="edit-link" data-edit-step="3">${edit}</button></div><div class="review-row"><div class="round-icon">${ico('shield')}</div><div><div class="review-label">${escapeHtml(tr('disclosure'))}</div><div class="review-value">${escapeHtml(sexual)}</div><div class="review-sub">${escapeHtml(sensitive)}</div></div><button class="edit-link" data-edit-step="3">${edit}</button></div></div><div class="usage-box" style="margin-top:14px"><div class="usage-item"><div class="round-icon">${ico('sparkles')}</div><div><div class="usage-label">${escapeHtml(tr('afterSubmission'))}</div><div class="usage-value">${after} / ${a.limit}</div><div class="usage-caption">${escapeHtml(tr('requestsUsed'))}</div></div></div><div class="usage-divider"></div><div class="usage-item"><div class="round-icon">${ico('inbox')}</div><div><div class="usage-label">${escapeHtml(tr('remainingRequests'))}</div><div class="usage-value">${Math.max(0,a.limit-after)}</div><div class="usage-caption">${escapeHtml(tr('requestsLeft'))}</div></div></div></div><label class="rules-check"><input type="checkbox" id="rulesAccepted" ${state.draft.rules_accepted?'checked':''}><span>${escapeHtml(tr('rulesAgree'))}</span></label><div class="button-row"><button class="secondary-button" id="reviewBack">${ico('arrow-left')} ${escapeHtml(tr('back'))}</button><button class="primary-button" id="submitRequest" ${!state.draft.rules_accepted?'disabled':''}>${ico('send')} ${escapeHtml(tr('submitRequest'))}</button></div><div id="submitProgress"></div></section>`;
    document.querySelectorAll('[data-edit-step]').forEach(btn=>btn.addEventListener('click',()=>{state.wizardStep=Number(btn.dataset.editStep);renderSuggest();}));
    document.getElementById('reviewBack').addEventListener('click',()=>{state.wizardStep=3;renderSuggest();});
    document.getElementById('rulesAccepted').addEventListener('change',e=>{state.draft.rules_accepted=e.target.checked;renderReviewStep();});
    document.getElementById('submitRequest')?.addEventListener('click',submitRequest);
    refreshIcons();
  }

  async function submitRequest(){
    if(!state.file||!state.draft.rules_accepted)return;
    if(state.preview){showSubmitted({submission_id:42,used:2,limit:5,remaining:3});return;}
    const btn=document.getElementById('submitRequest');
    btn.disabled=true;
    btn.textContent=tr('submitting');
    const form=new FormData();
    form.set('file',state.file,state.file.name);
    for(const key of ['title','original_language','chapter_count','publication_status','source_url','genres_tags','sexual_content','sensitive_content','notes'])form.set(key,state.draft[key]??'');
    form.set('rules_accepted','true');
    try{
      const data=await app.api('/api/app/submit',{method:'POST',body:form});
      await window.DTL_DISCOVERY?.persistSelectedSource?.(data.submission_id);
      showSubmitted(data);
      await app.refreshBootstrap(false);
      try{app.tg?.HapticFeedback?.notificationOccurred('success');}catch{}
    }catch(e){
      btn.disabled=false;
      btn.innerHTML=`${ico('send')} ${escapeHtml(tr('submitRequest'))}`;
      refreshIcons();
      app.toast(e.message,'error');
      try{app.tg?.HapticFeedback?.notificationOccurred('error');}catch{}
    }
  }

  function showSubmitted(data){
    viewRoot.innerHTML=`<section class="page"><div class="empty-state surface-card" style="margin-top:40px"><div class="empty-icon" style="background:var(--green-soft);color:var(--green)">${ico('check')}</div><h1 style="font-size:30px">${escapeHtml(tr('requestSubmitted'))}</h1><p>${escapeHtml(tr('requestSubmittedCopy'))}</p><div class="status-pill gold" style="margin-top:13px">${escapeHtml(requestLabel(data.submission_id))}</div><button class="primary-button wide-button" id="submittedHome" type="button" style="margin-top:20px">${escapeHtml(tr('backHome'))}</button></div></section>`;
    document.getElementById('submittedHome').addEventListener('click',()=>{resetDraft();app.navigate('home');});
    refreshIcons();
  }

  function resetDraft(){
    state.file=null;
    state.fileAnalysis=null;
    filePicker.value='';
    state.wizardStep=1;
    state.draft={title:'',original_language:'',chapter_count:'',publication_status:'ongoing',source_url:'',genres_tags:'',sexual_level:'none',sexual_content:'None',sexual_tags:[],sexual_notes:'',sensitive_content:'None',notes:'',rules_accepted:false};
    window.DTL_DISCOVERY?.reset?.();
  }

  document.addEventListener('dtl:discoveryselected',()=>{if(state.view==='suggest'&&state.wizardStep===1)renderSuggest();});
  app.registerView('suggest',renderSuggest);
})();

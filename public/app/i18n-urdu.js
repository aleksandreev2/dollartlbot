(() => {
  const urLanguageLabels={ko:'کوریائی',ja:'جاپانی',zh:'چینی',en:'انگریزی',ru:'روسی',es:'ہسپانوی',pt:'پرتگالی',id:'انڈونیشی',vi:'ویتنامی',fr:'فرانسیسی',de:'جرمن',hi:'ہندی',fil:'فلپائنی',ur:'اردو'};
  const urTags={Fantasy:'فینٹسی',Romance:'رومانس',Adventure:'مہم جوئی',Academy:'اکیڈمی',Isekai:'ایسیکائی',Reincarnation:'دوبارہ جنم',Magic:'جادو','Strong MC':'طاقتور مرکزی کردار',Harem:'حرم','Slice of Life':'روزمرہ زندگی','Time Travel':'وقت کا سفر',System:'سسٹم',Villainess:'خاتون ولن','Slow Burn':'آہستہ پیش رفت'};
  const urCopy={
    thanks:'ناول تراجم کی حمایت کا شکریہ۔',regular:n=>`${n} ابواب تک کے ناول۔`,guideSub:'درخواست سے ترجمے تک واضح راستہ',rulesSub:'درخواست کی شرائط اور مواد کی پابندیاں',chatSub:'سوالات، اطلاعات اور chat کا متبادل',boostySub:'ماہانہ 5 درخواستیں · 250 ابواب کی پابندی لاگو نہیں',progress:'ترجمے کی پیش رفت',noRequests:'ابھی کوئی درخواست نہیں۔',noMatching:'کوئی مماثل درخواست نہیں ملی۔',nothing:'یہاں ابھی کچھ نہیں۔',edit:'ترمیم کریں',reader:'قاری',justNow:'ابھی',minAgo:n=>`${n} منٹ پہلے`,hourAgo:n=>`${n} گھنٹے پہلے`,dayAgo:n=>`${n} دن پہلے`,saving:'زبان محفوظ ہو رہی ہے…',epubRead:'EPUB کی ساخت نہیں پڑھی جا سکی۔',epubEntry:'EPUB کا ایک حصہ نہیں پڑھا جا سکا۔',epubCompression:'اس device پر اس EPUB کی compression supported نہیں ہے۔',completeDetails:'ناول کی معلومات مکمل کریں۔',addTag:'کم از کم ایک genre یا tag شامل کریں۔',describeSex:'sexual content یا fetishes کی وضاحت کریں۔',notifications:'درخواست کی حالت کے لیے Telegram bot اطلاعات فعال ہیں۔'
  };
  const urGuide={intro:'پہلی درخواست سے ترجمہ شروع ہونے تک ہر مرحلہ واضح اور قابلِ پیروی رہتا ہے۔',steps:[['ناول بھیجیں','Raw فائل upload کریں اور عنوان، زبان، ابواب، tags اور اہم content notes فراہم کریں۔'],['دستی جائزہ','ہم ہر درخواست کو Dollar TL کے قواعد کے مطابق چیک کرتے ہیں اور معلومات مکمل ہونے کی تصدیق کرتے ہیں۔'],['عوامی قطار','قبول شدہ ناول عوامی translation queue میں شامل ہوتے ہیں، جہاں ان کی حالت اور پوزیشن دیکھی جا سکتی ہے۔'],['Telegram اطلاعات','درخواست قبول ہونے، ترجمہ شروع ہونے یا کام مکمل ہونے پر آپ کو Telegram اطلاع ملتی ہے۔']]};
  const urRules={intro:'ناول بھیجنے سے پہلے مکمل اور درست معلومات فراہم کریں۔',requiredTitle:'کیا بتانا ضروری ہے',required:['Raw / اصل فائل','اہم genres اور tags','تمام fetishes، kinks اور sexual content','کوئی بھی انتہائی، پریشان کن، متنازع یا ممکنہ طور پر حساس content'],blockedTitle:'قبول نہیں کیا جاتا',blocked:['Guro، انتہائی gore، mutilation، dismemberment یا graphic body horror','نابالغ یا کم عمر کرداروں سے متعلق sexual یا sexualized content','Bestiality / zoophilia','Necrophilia','Scat / coprophilia / human toilet','Snuff','انتہائی یا sexualized torture','Cannibalism','Vomit / emetophilia fetish content','Parasite / infestation fetish content','Unbirthing یا اسی نوعیت کا انتہائی fetish content','Futanari / futa','خاتون مرکزی کردار','حقیقی لوگوں کو کردار کے طور پر استعمال کرنا','Gender bender (MtF)','ٹیم کی صوابدید پر دیگر انتہائی fetish، پریشان کن یا shock content'],repostTitle:'ترجمہ اور دوبارہ پوسٹ کرنے کے قواعد',repost:'اجازت کے بغیر Dollar TL تراجم کو کہیں اور copy، repost، reupload، mirror یا publish نہ کریں۔ اصل ترجمے کا لنک شیئر کرنا بالکل ٹھیک ہے۔'};
  const urUi={
    'Premium account':'پریمیم اکاؤنٹ','Regular account':'Regular اکاؤنٹ','Boosty Subscriber':'Boosty سبسکرائبر','Regular':'Regular',"This month's usage":'اس ماہ کا استعمال','Remaining requests':'باقی درخواستیں','requests used':'درخواستیں استعمال ہوئیں','requests left':'درخواستیں باقی','My Requests':'میری درخواستیں','View All':'سب دیکھیں','Quality translations. Community powered.':'معیاری تراجم، کمیونٹی کے تعاون سے۔','Active':'فعال','Rejected · quota returned':'مسترد · quota واپس','chapters':'ابواب','Preferences':'ترجیحات','Support & Resources':'مدد اور وسائل','Language':'زبان','Help / Guide':'یہ کیسے کام کرتا ہے','Rules':'قواعد','Open Telegram Chat':'Telegram chat کھولیں','Boosty Subscription':'Boosty سبسکرپشن','Account':'اکاؤنٹ','Manage your account and preferences.':'اپنا اکاؤنٹ اور ترجیحات منظم کریں۔','Current Plan':'موجودہ پلان','Close':'بند کریں','Original Language':'اصل زبان','Total Chapters':'کل ابواب','Queue Position':'قطار میں پوزیشن','Status':'حالت','Last Updated':'آخری اپ ڈیٹ','Open Original Source':'اصل ماخذ کھولیں','Position':'پوزیشن','Chapter Progress':'ترجمے کی پیش رفت','Pending':'جائزے کا منتظر','In Queue':'قطار میں','In Progress':'ترجمہ جاری','Completed':'مکمل','Rejected':'مسترد','Request submitted':'درخواست بھیج دی گئی','Back Home':'ہوم پر واپس','After submission':'درخواست کے بعد','Uploaded Source':'Upload شدہ ماخذ','Novel Details':'ناول کی معلومات','Content Disclosure':'مواد کی معلومات','Edit':'ترمیم کریں','All':'سب','Good to see you':'آپ کو دوبارہ دیکھ کر خوشی ہوئی',"Let’s bring more amazing stories to life.":'مزید شاندار کہانیوں کو ترجمے کے ذریعے زندہ کریں۔','Actively translating':'ترجمہ جاری ہے','Nothing here.':'یہاں ابھی کچھ نہیں۔','No requests yet.':'ابھی کوئی درخواست نہیں۔','No matching requests.':'کوئی مماثل درخواست نہیں ملی۔','Confirm':'تصدیق کریں','Cancel':'منسوخ کریں','Save':'محفوظ کریں','Try Again':'دوبارہ کوشش کریں'
  };
  const urApiErrors={onboarding_required:'درخواست بھیجنے سے پہلے welcome guide اور عمر کی تصدیق مکمل کریں۔',file_too_large:'فائل بہت بڑی ہے۔ زیادہ سے زیادہ 45 MB۔',file_required:'TXT یا EPUB فائل منتخب کریں۔',unsupported_file:'صرف TXT اور EPUB فائلیں supported ہیں۔',rules_required:'Dollar TL کے submission rules کی تصدیق کریں۔',invalid_title:'درست ناول عنوان درج کریں۔',invalid_language:'اصل زبان درج کریں۔',invalid_chapters:'درست ابواب کی تعداد درج کریں۔',invalid_status:'منتخب کریں کہ ناول جاری ہے یا مکمل۔',invalid_source:'درست source URL درج کریں۔',invalid_tags:'اہم genres اور tags شامل کریں۔',invalid_content:'sexual content کی معلومات مکمل کریں۔',invalid_sensitive:'sensitive content کی معلومات مکمل کریں۔',invalid_notes:'اضافی نوٹس بہت طویل ہیں۔',verification_unavailable:'Boosty verification عارضی طور پر دستیاب نہیں۔ بعد میں دوبارہ کوشش کریں۔',chapter_limit:'Regular users زیادہ سے زیادہ 250 ابواب والے ناول تجویز کر سکتے ہیں۔',quota_reached:'آپ کی ماہانہ درخواست کی حد پوری ہو گئی ہے۔',quota_race:'درخواست مکمل ہونے سے پہلے ماہانہ حد پوری ہو گئی۔',telegram_upload_failed:'Telegram upload شدہ فائل محفوظ نہیں کر سکا۔',auth_expired:'Telegram authorization ختم ہو گئی۔ Mini App دوبارہ کھولیں۔',unauthorized:'Mini App کو Telegram سے کھولیں۔',not_found:'مطلوبہ چیز نہیں ملی۔',forbidden:'یہ کارروائی آپ کے اکاؤنٹ کے لیے دستیاب نہیں۔',temporary_error:'کچھ غلط ہو گیا۔ دوبارہ کوشش کریں۔'};

  window.DTL_LOCALE_EXTENSIONS={
    languagePatterns:{ur:/(?:\burdu\b|اردو|урду)/i},
    languageLabels:{ur:urLanguageLabels},
    tags:{ur:urTags},
    copy:{ur:urCopy},
    guide:{ur:urGuide},
    rules:{ur:urRules},
    uiFallback:{ur:urUi},
    apiErrors:{ur:urApiErrors},
  };

  const staticText={
    'Discover':'دریافت کریں','Find stories worth translating before they disappear into the queue.':'ترجمے کے قابل کہانیاں تلاش کریں اور قطار میں گم ہونے سے پہلے ان کی حمایت کریں۔','Request a novel':'ناول تجویز کریں','Search novels or paste a NovelPia / RAW link…':'ناول تلاش کریں یا NovelPia / RAW لنک paste کریں…','Trending':'ٹرینڈنگ','Most requested':'سب سے زیادہ مطلوب','RAW available':'RAW دستیاب','Recently found':'حال ہی میں ملے','Fresh from NovelPia':'NovelPia سے نئے','I want this translated':'میں اس کا ترجمہ چاہتا ہوں','Wanted':'مطلوب','Your request':'آپ کی درخواست','View':'کھولیں','Follow updates':'اپ ڈیٹس follow کریں','Following':'Follow کر رہے ہیں','Following updates':'Follow کی گئی اپ ڈیٹس','Manage request':'درخواست منظم کریں','Notifications':'اطلاعات','Invite friends':'دوستوں کو مدعو کریں','Referral bonus':'ریفرل بونس','Share invite':'دعوت شیئر کریں','Copy link':'لنک copy کریں','Search':'تلاش','No results':'کوئی نتیجہ نہیں','Loading…':'لوڈ ہو رہا ہے…','Retry':'دوبارہ کوشش کریں','Share progress':'پیش رفت شیئر کریں','Share title':'عنوان شیئر کریں','Latest releases':'تازہ ترین releases','Open in Telegram':'Telegram میں کھولیں','Published':'شائع شدہ','In translation':'ترجمہ جاری','Follow':'Follow کریں','Unfollow':'Unfollow کریں','Withdraw request':'درخواست واپس لیں','Replace RAW':'RAW تبدیل کریں','Save changes':'تبدیلیاں محفوظ کریں','Needs information':'مزید معلومات درکار','Reply to Dollar TL':'Dollar TL کو جواب دیں'
  };

  function esc(value=''){return String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
  function patchUrdu(){
    const runtime=window.DTL_I18N;
    if(runtime?.locale?.()!=='ur')return;
    document.documentElement.dir='rtl';
    const button=document.querySelector('#sheetRoot [data-lang="ur"]');
    if(button){
      button.classList.add('language-picker-option');button.setAttribute('aria-current','true');
      button.innerHTML=`<span class="language-picker-flag" data-picker-country="pk"></span><span class="language-picker-name">اردو</span><span class="language-picker-check">✓</span>`;
    }
    document.querySelectorAll('.sheet-copy').forEach(sheet=>{
      const kind=sheet.dataset.dtlSheetKind;
      if(kind==='guide'&&sheet.dataset.dtlUrduStamp!=='guide'){
        sheet.dataset.dtlUrduStamp='guide';
        sheet.innerHTML=`<div class="rich-intro">${esc(urGuide.intro)}</div><div class="flow-steps">${urGuide.steps.map((step,i)=>`<div class="flow-step"><div class="flow-step-number">${i+1}</div><div><div class="flow-step-title">${esc(step[0])}</div><div class="flow-step-copy">${esc(step[1])}</div></div></div>`).join('')}</div>`;
      }else if(kind==='rules'&&sheet.dataset.dtlUrduStamp!=='rules'){
        sheet.dataset.dtlUrduStamp='rules';
        sheet.innerHTML=`<div class="rich-intro">${esc(urRules.intro)}</div><div class="rich-section"><div class="rich-section-title">${esc(urRules.requiredTitle)}</div><ul class="rule-list">${urRules.required.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div><div class="rich-section"><div class="rich-section-title">${esc(urRules.blockedTitle)}</div><ul class="rule-list prohibited">${urRules.blocked.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div><div class="rule-note"><strong>${esc(urRules.repostTitle)}</strong><br>${esc(urRules.repost)}</div>`;
      }
    });
    for(const root of [document.getElementById('viewRoot'),document.getElementById('bottomNav'),document.getElementById('sheetRoot'),document.getElementById('toastRegion')]){
      if(!root)continue;
      const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode(node){const parent=node.parentElement;if(!parent||parent.closest('script,style,textarea,input,.admin-v2,.admin-v3'))return NodeFilter.FILTER_REJECT;return NodeFilter.FILTER_ACCEPT;}});
      const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
      for(const node of nodes){const raw=node.nodeValue||'';const value=raw.trim();const translated=staticText[value]||urUi[value];if(!translated)continue;const lead=raw.match(/^\s*/)?.[0]||'';const tail=raw.match(/\s*$/)?.[0]||'';node.nodeValue=lead+translated+tail;}
    }
  }

  function localizeUrduError(response,{pathname=''}){
    if(window.DTL_I18N?.locale?.()!=='ur'||response.ok||!pathname.startsWith('/api/app/'))return response;
    return response.clone().json().then(payload=>{
      const message=urApiErrors[payload?.error?.code];if(!message)return response;
      payload.error={...(payload.error||{}),message};
      const headers=new Headers(response.headers);headers.set('content-type','application/json; charset=utf-8');headers.delete('content-length');
      return new Response(JSON.stringify(payload),{status:response.status,statusText:response.statusText,headers});
    }).catch(()=>response);
  }

  setTimeout(()=>{
    const runtime=window.DTL_I18N;
    runtime?.registerPatcher?.(patchUrdu);
    runtime?.registerResponseHandler?.(localizeUrduError);
    runtime?.schedule?.();
  },0);
})();

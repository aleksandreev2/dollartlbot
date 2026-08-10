(() => {
  const app = window.DTL_APP;
  if (!app?.state || !app?.render || !app?.i18nTable) throw new Error('DTL app/i18n must load before suggest-content-picker.js');

  const TAG_GROUPS = [
    ['genre', ['Fantasy','Romance','Action','Adventure','Comedy','Drama','Mystery','Horror','Thriller','Sci-Fi','Slice of Life']],
    ['setting', ['Academy','Modern','Historical','Murim','Dungeon','Apocalypse','Game World']],
    ['mechanics', ['Isekai','Reincarnation','Regression','Transmigration','System','Time Travel','Cultivation','Magic']],
    ['mc', ['Male Protagonist','Strong MC','Overpowered MC','Weak to Strong','Antihero','Villain','Genius MC','Hidden Identity']],
    ['story', ['Revenge','Survival','Kingdom Building','Politics','Business','Crafting','Cooking','Sports','Slow Burn']],
    ['relationship', ['Harem','No Romance','Childhood Friend']],
  ];
  const TAGS = TAG_GROUPS.flatMap(([,items]) => items);
  const POPULAR = ['Fantasy','Romance','Adventure','Academy','Isekai','Reincarnation','Regression','System','Magic','Strong MC','Overpowered MC','Harem','Slice of Life','Dungeon','Apocalypse','Slow Burn'];
  const SEXUAL_TAGS = ['BDSM','Bondage','Dom/Sub','Spanking','NTR / Netorare','Voyeurism','Exhibitionism','Foot Fetish','Stockings','Lingerie','Uniform Fetish','Maid','Roleplay','Body Worship','Breast Fetish','Butt Fetish','Thigh Fetish','Size Difference','Pregnancy','Lactation','Mind Control','Hypnosis','Oral Sex','Anal Sex','Group Sex'];
  const SEXUAL_POPULAR = ['BDSM','Bondage','Dom/Sub','NTR / Netorare','Voyeurism','Exhibitionism','Stockings','Lingerie','Maid','Body Worship','Breast Fetish','Thigh Fetish'];
  const BLOCKED_ALIASES = [
    /\b(?:minor|underage|child|loli|shota)\b/i,
    /(?:несовершеннолет|малолет|лоли|шота)/i,
    /\b(?:bestiality|zoophilia)\b/i,
    /(?:зоофил|скотолож)/i,
    /\bnecrophil(?:ia|ic)?\b/i,
    /некрофил/i,
    /\b(?:scat|coprophil(?:ia|ic)?|human toilet)\b/i,
    /(?:копрофил|скат)/i,
    /\bsnuff\b/i,
    /снафф/i,
    /\bemetophil(?:ia|ic)?\b/i,
    /(?:эметофил|фетиш.{0,12}рвот)/i,
    /\b(?:parasite|infestation)\b/i,
    /(?:паразит|заражен)/i,
    /\bunbirthing\b/i,
    /\b(?:futanari|futa)\b/i,
    /футанари/i,
  ];

  const UI = {
    en:{selected:'Selected',allTags:'All tags',searchTags:'Search tags…',customTag:'Type a custom tag and press Enter',alreadyAdded:'Already added',popularSexual:'Popular sexual tags',selectedSexual:'Selected sexual tags',allSexual:'All sexual tags',customSexual:'Add a custom fetish or sexual tag…',sexualDetails:'Additional description',sexualDetailsHelp:'Add context only if the tags are not enough.',blocked:'What content is not accepted?',blockedTitle:'Content we do not accept',blockedIntro:'These restrictions come directly from the current Dollar TL rules.',blockedDetected:'This tag matches content that Dollar TL does not accept.',openRules:'Open restrictions',close:'Close',genre:'Genres',setting:'Setting',mechanics:'Mechanics',mc:'MC / Tropes',story:'Story / Themes',relationship:'Relationships',noneSelected:'Nothing selected yet',sexualLevel:'Sexual level',sensitive:'Sensitive content',notes:'Additional notes',details:'Details',tags:'Tags'},
    ru:{selected:'Выбрано',allTags:'Все теги',searchTags:'Найти тег…',customTag:'Введите свой тег и нажмите Enter',alreadyAdded:'Уже добавлено',popularSexual:'Популярные сексуальные теги',selectedSexual:'Выбранные сексуальные теги',allSexual:'Все сексуальные теги',customSexual:'Добавить свой фетиш или сексуальный тег…',sexualDetails:'Дополнительное описание',sexualDetailsHelp:'Добавьте пояснение, только если одних тегов недостаточно.',blocked:'Какой контент мы не принимаем?',blockedTitle:'Контент, который мы не принимаем',blockedIntro:'Список берётся напрямую из действующих правил Dollar TL.',blockedDetected:'Этот тег относится к контенту, который Dollar TL не принимает.',openRules:'Открыть ограничения',close:'Закрыть',genre:'Жанры',setting:'Сеттинг',mechanics:'Механики',mc:'ГГ / тропы',story:'Сюжет / темы',relationship:'Отношения',noneSelected:'Пока ничего не выбрано',sexualLevel:'Уровень сексуального контента',sensitive:'Чувствительный контент',notes:'Дополнительные заметки',details:'Описание',tags:'Теги'},
    es:{selected:'Seleccionado',allTags:'Todas las etiquetas',searchTags:'Buscar etiquetas…',customTag:'Escribe una etiqueta y pulsa Enter',alreadyAdded:'Ya añadida',popularSexual:'Etiquetas sexuales populares',selectedSexual:'Etiquetas sexuales seleccionadas',allSexual:'Todas las etiquetas sexuales',customSexual:'Añade un fetiche o etiqueta sexual…',sexualDetails:'Descripción adicional',sexualDetailsHelp:'Añade contexto solo si las etiquetas no bastan.',blocked:'¿Qué contenido no aceptamos?',blockedTitle:'Contenido no aceptado',blockedIntro:'Estas restricciones provienen de las reglas actuales de Dollar TL.',blockedDetected:'Esta etiqueta coincide con contenido que Dollar TL no acepta.',openRules:'Ver restricciones',close:'Cerrar',genre:'Géneros',setting:'Ambientación',mechanics:'Mecánicas',mc:'Protagonista / tropos',story:'Historia / temas',relationship:'Relaciones',noneSelected:'Aún no hay nada seleccionado',sexualLevel:'Nivel sexual',sensitive:'Contenido sensible',notes:'Notas adicionales',details:'Detalles',tags:'Etiquetas'},
    fil:{selected:'Napili',allTags:'Lahat ng tag',searchTags:'Maghanap ng tag…',customTag:'Mag-type ng sariling tag at pindutin ang Enter',alreadyAdded:'Nadagdag na',popularSexual:'Sikat na sexual tags',selectedSexual:'Napiling sexual tags',allSexual:'Lahat ng sexual tags',customSexual:'Magdagdag ng sariling fetish o sexual tag…',sexualDetails:'Karagdagang detalye',sexualDetailsHelp:'Magdagdag lang ng paliwanag kung kulang ang tags.',blocked:'Anong content ang hindi tinatanggap?',blockedTitle:'Hindi tinatanggap na content',blockedIntro:'Direktang mula sa kasalukuyang Dollar TL rules ang listahang ito.',blockedDetected:'Tumutugma ang tag na ito sa content na hindi tinatanggap ng Dollar TL.',openRules:'Buksan ang restrictions',close:'Isara',genre:'Genre',setting:'Setting',mechanics:'Mechanics',mc:'MC / Tropes',story:'Story / Themes',relationship:'Relationships',noneSelected:'Wala pang napili',sexualLevel:'Sexual level',sensitive:'Sensitive content',notes:'Karagdagang notes',details:'Detalye',tags:'Tags'},
    hi:{selected:'चुने गए',allTags:'सभी टैग',searchTags:'टैग खोजें…',customTag:'अपना टैग लिखें और Enter दबाएँ',alreadyAdded:'पहले से जोड़ा गया',popularSexual:'लोकप्रिय यौन टैग',selectedSexual:'चुने गए यौन टैग',allSexual:'सभी यौन टैग',customSexual:'अपना fetish या sexual tag जोड़ें…',sexualDetails:'अतिरिक्त विवरण',sexualDetailsHelp:'टैग पर्याप्त न हों तभी अतिरिक्त संदर्भ दें।',blocked:'कौन-सा कंटेंट स्वीकार नहीं है?',blockedTitle:'स्वीकार न किया जाने वाला कंटेंट',blockedIntro:'ये प्रतिबंध सीधे Dollar TL के मौजूदा नियमों से आते हैं।',blockedDetected:'यह टैग ऐसे कंटेंट से मेल खाता है जिसे Dollar TL स्वीकार नहीं करता।',openRules:'प्रतिबंध देखें',close:'बंद करें',genre:'शैलियाँ',setting:'सेटिंग',mechanics:'मैकेनिक्स',mc:'मुख्य पात्र / ट्रोप्स',story:'कहानी / विषय',relationship:'रिश्ते',noneSelected:'अभी कुछ नहीं चुना गया',sexualLevel:'यौन स्तर',sensitive:'संवेदनशील कंटेंट',notes:'अतिरिक्त नोट्स',details:'विवरण',tags:'टैग'},
    pt:{selected:'Selecionado',allTags:'Todas as tags',searchTags:'Buscar tags…',customTag:'Digite uma tag e pressione Enter',alreadyAdded:'Já adicionada',popularSexual:'Tags sexuais populares',selectedSexual:'Tags sexuais selecionadas',allSexual:'Todas as tags sexuais',customSexual:'Adicione um fetiche ou tag sexual…',sexualDetails:'Descrição adicional',sexualDetailsHelp:'Adicione contexto apenas se as tags não forem suficientes.',blocked:'Que conteúdo não aceitamos?',blockedTitle:'Conteúdo não aceito',blockedIntro:'Estas restrições vêm diretamente das regras atuais da Dollar TL.',blockedDetected:'Esta tag corresponde a conteúdo que a Dollar TL não aceita.',openRules:'Ver restrições',close:'Fechar',genre:'Gêneros',setting:'Ambientação',mechanics:'Mecânicas',mc:'Protagonista / tropos',story:'História / temas',relationship:'Relacionamentos',noneSelected:'Nada selecionado ainda',sexualLevel:'Nível sexual',sensitive:'Conteúdo sensível',notes:'Notas adicionais',details:'Detalhes',tags:'Tags'},
    id:{selected:'Dipilih',allTags:'Semua tag',searchTags:'Cari tag…',customTag:'Ketik tag sendiri lalu tekan Enter',alreadyAdded:'Sudah ditambahkan',popularSexual:'Tag seksual populer',selectedSexual:'Tag seksual terpilih',allSexual:'Semua tag seksual',customSexual:'Tambahkan fetish atau tag seksual sendiri…',sexualDetails:'Deskripsi tambahan',sexualDetailsHelp:'Tambahkan konteks hanya jika tag belum cukup.',blocked:'Konten apa yang tidak diterima?',blockedTitle:'Konten yang tidak diterima',blockedIntro:'Batasan ini diambil langsung dari aturan Dollar TL saat ini.',blockedDetected:'Tag ini cocok dengan konten yang tidak diterima Dollar TL.',openRules:'Buka batasan',close:'Tutup',genre:'Genre',setting:'Latar',mechanics:'Mekanik',mc:'MC / trope',story:'Cerita / tema',relationship:'Relasi',noneSelected:'Belum ada yang dipilih',sexualLevel:'Tingkat seksual',sensitive:'Konten sensitif',notes:'Catatan tambahan',details:'Detail',tags:'Tag'},
    vi:{selected:'Đã chọn',allTags:'Tất cả tag',searchTags:'Tìm tag…',customTag:'Nhập tag riêng rồi nhấn Enter',alreadyAdded:'Đã thêm',popularSexual:'Tag tình dục phổ biến',selectedSexual:'Tag tình dục đã chọn',allSexual:'Tất cả tag tình dục',customSexual:'Thêm fetish hoặc tag tình dục riêng…',sexualDetails:'Mô tả bổ sung',sexualDetailsHelp:'Chỉ thêm ngữ cảnh nếu các tag chưa đủ.',blocked:'Nội dung nào không được chấp nhận?',blockedTitle:'Nội dung không được chấp nhận',blockedIntro:'Các hạn chế này lấy trực tiếp từ quy tắc Dollar TL hiện hành.',blockedDetected:'Tag này khớp với nội dung Dollar TL không chấp nhận.',openRules:'Xem hạn chế',close:'Đóng',genre:'Thể loại',setting:'Bối cảnh',mechanics:'Cơ chế',mc:'Nhân vật chính / trope',story:'Cốt truyện / chủ đề',relationship:'Quan hệ',noneSelected:'Chưa chọn gì',sexualLevel:'Mức độ tình dục',sensitive:'Nội dung nhạy cảm',notes:'Ghi chú thêm',details:'Chi tiết',tags:'Tag'},
    fr:{selected:'Sélectionné',allTags:'Tous les tags',searchTags:'Rechercher des tags…',customTag:'Saisissez un tag puis appuyez sur Entrée',alreadyAdded:'Déjà ajouté',popularSexual:'Tags sexuels populaires',selectedSexual:'Tags sexuels sélectionnés',allSexual:'Tous les tags sexuels',customSexual:'Ajouter un fétiche ou tag sexuel…',sexualDetails:'Description supplémentaire',sexualDetailsHelp:'Ajoutez du contexte seulement si les tags ne suffisent pas.',blocked:'Quel contenu refusons-nous ?',blockedTitle:'Contenu non accepté',blockedIntro:'Ces restrictions proviennent directement des règles Dollar TL actuelles.',blockedDetected:'Ce tag correspond à un contenu que Dollar TL n’accepte pas.',openRules:'Voir les restrictions',close:'Fermer',genre:'Genres',setting:'Cadre',mechanics:'Mécaniques',mc:'Protagoniste / tropes',story:'Histoire / thèmes',relationship:'Relations',noneSelected:'Rien de sélectionné',sexualLevel:'Niveau sexuel',sensitive:'Contenu sensible',notes:'Notes supplémentaires',details:'Détails',tags:'Tags'},
    de:{selected:'Ausgewählt',allTags:'Alle Tags',searchTags:'Tags suchen…',customTag:'Eigenen Tag eingeben und Enter drücken',alreadyAdded:'Bereits hinzugefügt',popularSexual:'Beliebte sexuelle Tags',selectedSexual:'Ausgewählte sexuelle Tags',allSexual:'Alle sexuellen Tags',customSexual:'Eigenen Fetisch oder sexuellen Tag hinzufügen…',sexualDetails:'Zusätzliche Beschreibung',sexualDetailsHelp:'Zusätzlichen Kontext nur angeben, wenn die Tags nicht ausreichen.',blocked:'Welche Inhalte akzeptieren wir nicht?',blockedTitle:'Nicht akzeptierte Inhalte',blockedIntro:'Diese Einschränkungen stammen direkt aus den aktuellen Dollar-TL-Regeln.',blockedDetected:'Dieser Tag entspricht Inhalten, die Dollar TL nicht akzeptiert.',openRules:'Einschränkungen öffnen',close:'Schließen',genre:'Genres',setting:'Setting',mechanics:'Mechaniken',mc:'Protagonist / Tropes',story:'Story / Themen',relationship:'Beziehungen',noneSelected:'Noch nichts ausgewählt',sexualLevel:'Sexuelles Niveau',sensitive:'Sensible Inhalte',notes:'Zusätzliche Notizen',details:'Details',tags:'Tags'},
  };

  const RU_TAGS = {
    Action:'Экшен',Comedy:'Комедия',Drama:'Драма',Mystery:'Мистика / детектив',Horror:'Хоррор',Thriller:'Триллер','Sci-Fi':'Научная фантастика',Modern:'Современность',Historical:'Историческое',Murim:'Мурим',Dungeon:'Подземелья',Apocalypse:'Апокалипсис','Game World':'Игровой мир',Regression:'Регрессия',Transmigration:'Переселение',Cultivation:'Культивация','Male Protagonist':'Главный герой-мужчина','Overpowered MC':'Сверхсильный ГГ','Weak to Strong':'От слабого к сильному',Antihero:'Антигерой',Villain:'Злодей','Genius MC':'Гениальный ГГ','Hidden Identity':'Скрытая личность',Revenge:'Месть',Survival:'Выживание','Kingdom Building':'Строительство королевства',Politics:'Политика',Business:'Бизнес',Crafting:'Крафт',Cooking:'Кулинария',Sports:'Спорт','No Romance':'Без романтики','Childhood Friend':'Друг детства',
    'Foot Fetish':'Фетиш на ступни',Stockings:'Чулки',Lingerie:'Нижнее бельё','Uniform Fetish':'Фетиш на униформу',Maid:'Горничная',Roleplay:'Ролевые игры','Body Worship':'Поклонение телу','Breast Fetish':'Фетиш на грудь','Butt Fetish':'Фетиш на ягодицы','Thigh Fetish':'Фетиш на бёдра','Size Difference':'Разница в размерах',Pregnancy:'Беременность',Lactation:'Лактация','Mind Control':'Контроль разума',Hypnosis:'Гипноз','Oral Sex':'Оральный секс','Anal Sex':'Анальный секс','Group Sex':'Групповой секс',Voyeurism:'Вуайеризм',Exhibitionism:'Эксгибиционизм',Bondage:'Бондаж',Spanking:'Спанкинг',
  };

  function locale(){const l=String(app.state.locale||'en').toLowerCase().split('-')[0];return UI[l]?l:'en';}
  function t(key){return UI[locale()]?.[key]||UI.en[key]||key;}
  function label(tag){const base=app.tagLabel?.(tag);if(base&&base!==tag)return base;if(locale()==='ru'&&RU_TAGS[tag])return RU_TAGS[tag];return tag;}
  function ico(name,cls=''){return `<i data-lucide="${name}"${cls?` class="${cls}"`:''} aria-hidden="true"></i>`;}
  function icons(){try{window.lucide?.createIcons?.({attrs:{'stroke-width':1.8,'aria-hidden':'true'}});}catch{}}
  function tags(){return splitCsv(app.state.draft.genres_tags);}
  function sexualTags(){ensureDraft();return app.state.draft.sexual_tags;}
  function ensureDraft(){
    if(!Array.isArray(app.state.draft.sexual_tags))app.state.draft.sexual_tags=[];
    if(typeof app.state.draft.sexual_notes!=='string'){
      const old=String(app.state.draft.sexual_content||'');
      app.state.draft.sexual_notes=old&&old!=='None'&&!/^Level:/m.test(old)?old:'';
    }
  }
  function splitCsv(value){return String(value||'').split(',').map(x=>x.trim()).filter(Boolean);}
  function same(a,b){return String(a).trim().toLocaleLowerCase()===String(b).trim().toLocaleLowerCase();}
  function contains(list,value){return list.some(x=>same(x,value));}
  function saveTags(list){app.state.draft.genres_tags=list.join(', ');}
  function setTag(tag,on){tag=String(tag||'').trim();if(!tag)return;const list=tags().filter(x=>!same(x,tag));if(on!==false)list.push(tag);saveTags(list);}
  function setSexualTag(tag,on){ensureDraft();tag=String(tag||'').trim();if(!tag)return;app.state.draft.sexual_tags=app.state.draft.sexual_tags.filter(x=>!same(x,tag));if(on!==false)app.state.draft.sexual_tags.push(tag);syncSexualContent();}
  function syncSexualContent(){
    ensureDraft();
    if(app.state.draft.sexual_level==='none'){app.state.draft.sexual_content='None';return;}
    const level=app.state.draft.sexual_level==='explicit'?'Explicit (18+)':'Suggestive';
    const parts=[`Level: ${level}`];
    if(app.state.draft.sexual_tags.length)parts.push(`Tags: ${app.state.draft.sexual_tags.join(', ')}`);
    const notes=app.state.draft.sexual_notes.trim();if(notes)parts.push(`Details: ${notes}`);
    app.state.draft.sexual_content=parts.join('\n');
  }
  function isBlocked(value){return BLOCKED_ALIASES.some(re=>re.test(String(value||'')));}

  function renderSelected(list,type){
    if(!list.length)return `<div class="content-empty-selection">${t('noneSelected')}</div>`;
    return `<div class="content-selected-list">${list.map(tag=>`<button class="content-chip selected" type="button" data-${type}-remove="${app.escapeHtml(tag)}"><span>${app.escapeHtml(label(tag))}</span>${ico('x')}</button>`).join('')}</div>`;
  }
  function chip(tag,selected,attr){return `<button class="content-chip ${selected?'selected':''}" type="button" ${attr}="${app.escapeHtml(tag)}" aria-pressed="${selected?'true':'false'}"><span>${app.escapeHtml(label(tag))}</span>${selected?ico('check'):ico('plus')}</button>`;}

  function renderContent(){
    if(app.state.view!=='suggest'||app.state.wizardStep!==3)return;
    ensureDraft();
    const root=app.viewRoot;
    const selected=tags();
    const sexSelected=sexualTags();
    const level=app.state.draft.sexual_level||'none';
    root.innerHTML=`<section class="page suggest-content-page">
      ${wizardHeaderFromDom()}
      <section class="surface-card content-card">
        <div class="content-section-head"><div class="content-head-icon">${ico('tags')}</div><div><h2>${app.escapeHtml(app.tr('genresTags'))}</h2><p class="subtitle">${app.escapeHtml(app.tr('genresHelp'))}</p></div></div>
        <div class="content-subhead"><span>${t('selected')}</span><span>${selected.length}</span></div>
        <div id="selectedTags">${renderSelected(selected,'tag')}</div>
        <div class="content-search-wrap">${ico('search')}<input class="text-input" id="tagInput" autocomplete="off" placeholder="${app.escapeHtml(t('searchTags'))}"></div>
        <div id="tagSearchResults" class="content-search-results" hidden></div>
        <div class="content-subhead"><span>${app.escapeHtml(app.tr('popularTags'))}</span><button class="content-link" id="allTagsButton" type="button">${app.escapeHtml(t('allTags'))} ${ico('chevron-right')}</button></div>
        <div class="content-chip-grid">${POPULAR.map(tag=>chip(tag,contains(selected,tag),'data-tag-toggle')).join('')}</div>
        <p class="content-input-help">${app.escapeHtml(t('customTag'))}</p>
      </section>

      <section class="surface-card content-card">
        <div class="content-section-head"><div class="content-head-icon">${ico('shield')}</div><div><h2>${app.escapeHtml(app.tr('sexualContent'))}</h2><p class="subtitle">${app.escapeHtml(app.tr('sexualHelp'))}</p></div></div>
        <div class="content-choice-grid">
          ${choice('none','shield-check',app.tr('noSexual'),level)}
          ${choice('suggestive','eye',app.tr('suggestive'),level)}
          ${choice('explicit','alert-triangle',app.tr('explicit'),level,true)}
        </div>
        ${level==='none'?'':`
          <div class="content-reveal">
            <div class="content-subhead"><span>${t('selectedSexual')}</span><span>${sexSelected.length}</span></div>
            <div id="selectedSexualTags">${renderSelected(sexSelected,'sexual')}</div>
            <div class="content-subhead"><span>${t('popularSexual')}</span><button class="content-link" id="allSexualButton" type="button">${t('allSexual')} ${ico('chevron-right')}</button></div>
            <div class="content-chip-grid sexual">${SEXUAL_POPULAR.map(tag=>chip(tag,contains(sexSelected,tag),'data-sexual-toggle')).join('')}</div>
            <div class="content-search-wrap sexual-custom">${ico('plus')}<input class="text-input" id="sexualTagInput" autocomplete="off" placeholder="${app.escapeHtml(t('customSexual'))}"></div>
            <div id="blockedTagWarning" class="blocked-inline" hidden>${ico('alert-triangle')}<div><strong>${app.escapeHtml(t('blockedDetected'))}</strong><button type="button" id="warningRulesButton">${app.escapeHtml(t('openRules'))}</button></div></div>
            <label class="content-field-label" for="sexualDetails">${app.escapeHtml(t('sexualDetails'))}</label>
            <textarea class="textarea-input" id="sexualDetails" placeholder="${app.escapeHtml(app.tr('sexualDetails'))}">${app.escapeHtml(app.state.draft.sexual_notes)}</textarea>
            <p class="content-input-help">${app.escapeHtml(t('sexualDetailsHelp'))}</p>
            <button class="blocked-content-button" id="blockedContentButton" type="button">${ico('shield')}<span>${app.escapeHtml(t('blocked'))}</span>${ico('chevron-right')}</button>
          </div>`}
      </section>

      <section class="surface-card content-card">
        <div class="content-section-head"><div class="content-head-icon">${ico('alert-triangle')}</div><div><h2>${app.escapeHtml(app.tr('sensitiveContent'))}</h2><p class="subtitle">${app.escapeHtml(app.tr('sensitiveHelp'))}</p></div></div>
        <textarea class="textarea-input" id="sensitiveDetails">${app.escapeHtml(app.state.draft.sensitive_content==='None'?'':app.state.draft.sensitive_content)}</textarea>
      </section>

      <div class="tip-card content-tip">${ico('lightbulb')}<div><div class="tip-title">${app.escapeHtml(app.tr('whyMatters'))}</div><div class="tip-copy">${app.escapeHtml(app.tr('contentWhy'))}</div></div></div>
      <div class="form-section"><label class="form-label" for="notes">${app.escapeHtml(app.tr('additionalNotes'))}</label><textarea class="textarea-input" id="notes" placeholder="${app.escapeHtml(app.tr('notesPlaceholder'))}">${app.escapeHtml(app.state.draft.notes)}</textarea></div>
      <div class="button-row" style="margin-top:18px"><button class="secondary-button" id="contentBack">${ico('arrow-left')} ${app.escapeHtml(app.tr('back'))}</button><button class="primary-button" id="contentContinue">${app.escapeHtml(app.tr('continue'))} ${ico('arrow-right')}</button></div>
    </section>`;
    bindContent();
    icons();
  }

  function wizardHeaderFromDom(){
    const labels=[app.tr('upload'),app.tr('details'),app.tr('tagsContent'),app.tr('review')];
    return `<div class="wizard-head"><div class="wizard-title-row"><h1 style="margin:0">${app.escapeHtml(app.tr('suggestNovel'))}</h1></div><div class="stepper">${labels.map((text,i)=>{const n=i+1,cls=n<3?'done':n===3?'active':'';return `<div class="step-node ${cls}"><span class="step-circle">${n<3?'✓':n}</span><span>${app.escapeHtml(text)}</span></div>`;}).join('')}</div></div>`;
  }
  function choice(id,icon,text,current,explicit=false){const active=id===current;return `<button class="content-choice ${active?'active':''}" type="button" data-sexual-level="${id}" aria-pressed="${active?'true':'false'}"><span class="content-choice-icon">${ico(icon)}</span>${explicit?'<span class="content-18">18+</span>':''}<span>${app.escapeHtml(text)}</span>${active?`<span class="content-choice-check">${ico('check')}</span>`:''}</button>`;}

  function bindContent(){
    document.querySelectorAll('[data-tag-toggle]').forEach(btn=>btn.addEventListener('click',()=>{const tag=btn.dataset.tagToggle;setTag(tag,!contains(tags(),tag));renderContent();}));
    document.querySelectorAll('[data-tag-remove]').forEach(btn=>btn.addEventListener('click',()=>{setTag(btn.dataset.tagRemove,false);renderContent();}));
    document.querySelectorAll('[data-sexual-toggle]').forEach(btn=>btn.addEventListener('click',()=>{const tag=btn.dataset.sexualToggle;setSexualTag(tag,!contains(sexualTags(),tag));renderContent();}));
    document.querySelectorAll('[data-sexual-remove]').forEach(btn=>btn.addEventListener('click',()=>{setSexualTag(btn.dataset.sexualRemove,false);renderContent();}));
    document.querySelectorAll('[data-sexual-level]').forEach(btn=>btn.addEventListener('click',()=>{
      app.state.draft.sexual_level=btn.dataset.sexualLevel;
      if(app.state.draft.sexual_level==='none'){app.state.draft.sexual_tags=[];app.state.draft.sexual_notes='';}
      syncSexualContent();renderContent();
    }));
    const tagInput=document.getElementById('tagInput');
    tagInput?.addEventListener('input',()=>renderTagSearch(tagInput.value));
    tagInput?.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===','){e.preventDefault();const value=tagInput.value.replace(/,$/,'').trim();if(value){setTag(value,true);renderContent();}}});
    const sexualInput=document.getElementById('sexualTagInput');
    sexualInput?.addEventListener('input',()=>showBlockedWarning(sexualInput.value));
    sexualInput?.addEventListener('keydown',e=>{if(e.key!=='Enter'&&e.key!==',')return;e.preventDefault();const value=sexualInput.value.replace(/,$/,'').trim();if(!value)return;if(isBlocked(value)){showBlockedWarning(value,true);return;}setSexualTag(value,true);renderContent();});
    document.getElementById('sexualDetails')?.addEventListener('input',e=>{app.state.draft.sexual_notes=e.target.value;syncSexualContent();});
    document.getElementById('sensitiveDetails')?.addEventListener('input',e=>app.state.draft.sensitive_content=e.target.value||'None');
    document.getElementById('notes')?.addEventListener('input',e=>app.state.draft.notes=e.target.value);
    document.getElementById('allTagsButton')?.addEventListener('click',()=>openCatalog('tags'));
    document.getElementById('allSexualButton')?.addEventListener('click',()=>openCatalog('sexual'));
    document.getElementById('blockedContentButton')?.addEventListener('click',openBlocked);
    document.getElementById('warningRulesButton')?.addEventListener('click',openBlocked);
    document.getElementById('contentBack')?.addEventListener('click',()=>{app.state.wizardStep=2;app.render();});
    document.getElementById('contentContinue')?.addEventListener('click',()=>{
      if(!app.state.draft.genres_tags){app.toast(app.copy('addTag'),'error');return;}
      syncSexualContent();
      if(app.state.draft.sexual_level!=='none'&&!sexualTags().length&&!app.state.draft.sexual_notes.trim()){app.toast(app.copy('describeSex'),'error');return;}
      if(!app.state.draft.sensitive_content.trim())app.state.draft.sensitive_content='None';
      app.state.wizardStep=4;app.render();
    });
  }

  function renderTagSearch(query){
    const box=document.getElementById('tagSearchResults');if(!box)return;
    const q=String(query||'').trim().toLocaleLowerCase();
    if(!q){box.hidden=true;box.innerHTML='';return;}
    const current=tags();
    const matches=TAGS.filter(tag=>label(tag).toLocaleLowerCase().includes(q)||tag.toLocaleLowerCase().includes(q)).slice(0,8);
    box.hidden=false;
    box.innerHTML=matches.length?matches.map(tag=>chip(tag,contains(current,tag),'data-tag-toggle')).join(''):`<button class="content-chip custom-result" type="button" data-tag-toggle="${app.escapeHtml(query.trim())}"><span>${app.escapeHtml(query.trim())}</span>${ico('plus')}</button>`;
    box.querySelectorAll('[data-tag-toggle]').forEach(btn=>btn.addEventListener('click',()=>{const tag=btn.dataset.tagToggle;setTag(tag,!contains(tags(),tag));renderContent();}));
    icons();
  }
  function showBlockedWarning(value,force=false){const warning=document.getElementById('blockedTagWarning');if(!warning)return;warning.hidden=!(force||isBlocked(value));}

  function openCatalog(kind){
    const sexual=kind==='sexual';
    const title=sexual?t('allSexual'):t('allTags');
    const list=sexual?SEXUAL_TAGS:TAGS;
    const groups=sexual?[['sexual',list]]:TAG_GROUPS;
    app.sheetRoot.innerHTML=`<div class="sheet-backdrop content-picker-sheet" role="presentation"><div class="bottom-sheet" role="dialog" aria-modal="true" aria-label="${app.escapeHtml(title)}"><div class="sheet-handle"></div><div class="content-sheet-head"><div><div class="sheet-title">${app.escapeHtml(title)}</div></div><button class="content-sheet-close" type="button" aria-label="${app.escapeHtml(t('close'))}">${ico('x')}</button></div><div class="content-search-wrap sheet-search">${ico('search')}<input class="text-input" id="catalogSearch" placeholder="${app.escapeHtml(t('searchTags'))}"></div><div id="catalogBody" class="content-catalog-body"></div></div></div>`;
    const search=document.getElementById('catalogSearch');
    const draw=()=>{
      const q=String(search?.value||'').trim().toLocaleLowerCase();
      const selected=sexual?sexualTags():tags();
      const html=groups.map(([group,items])=>{const visible=items.filter(tag=>!q||label(tag).toLocaleLowerCase().includes(q)||tag.toLocaleLowerCase().includes(q));if(!visible.length)return'';return `<section class="content-catalog-group"><div class="content-subhead"><span>${sexual?t('popularSexual'):t(group)}</span><span>${visible.length}</span></div><div class="content-chip-grid">${visible.map(tag=>chip(tag,contains(selected,tag),sexual?'data-sheet-sexual':'data-sheet-tag')).join('')}</div></section>`;}).join('');
      document.getElementById('catalogBody').innerHTML=html||`<div class="content-empty-selection">${t('noneSelected')}</div>`;
      document.querySelectorAll('[data-sheet-tag]').forEach(btn=>btn.addEventListener('click',()=>{const tag=btn.dataset.sheetTag;setTag(tag,!contains(tags(),tag));draw();}));
      document.querySelectorAll('[data-sheet-sexual]').forEach(btn=>btn.addEventListener('click',()=>{const tag=btn.dataset.sheetSexual;setSexualTag(tag,!contains(sexualTags(),tag));draw();}));
      icons();
    };
    search?.addEventListener('input',draw);
    app.sheetRoot.querySelector('.content-sheet-close')?.addEventListener('click',closeSheet);
    app.sheetRoot.querySelector('.sheet-backdrop')?.addEventListener('click',e=>{if(e.target===e.currentTarget)closeSheet();});
    draw();icons();
  }
  function openBlocked(){
    const rules=app.i18nTable('rules')||{};
    const blocked=Array.isArray(rules.blocked)?rules.blocked:[];
    app.sheetRoot.innerHTML=`<div class="sheet-backdrop content-picker-sheet"><div class="bottom-sheet blocked-sheet" role="dialog" aria-modal="true" aria-label="${app.escapeHtml(t('blockedTitle'))}"><div class="sheet-handle"></div><div class="content-sheet-head"><div><div class="sheet-title">${app.escapeHtml(t('blockedTitle'))}</div><p class="sheet-copy">${app.escapeHtml(t('blockedIntro'))}</p></div><button class="content-sheet-close" type="button" aria-label="${app.escapeHtml(t('close'))}">${ico('x')}</button></div><div class="blocked-rule-list">${blocked.map(text=>`<div class="blocked-rule">${ico('x')}<span>${app.escapeHtml(text)}</span></div>`).join('')}</div><button class="secondary-button wide-button" id="blockedClose" type="button">${app.escapeHtml(t('close'))}</button></div></div>`;
    app.sheetRoot.querySelector('.content-sheet-close')?.addEventListener('click',closeSheet);
    document.getElementById('blockedClose')?.addEventListener('click',closeSheet);
    app.sheetRoot.querySelector('.sheet-backdrop')?.addEventListener('click',e=>{if(e.target===e.currentTarget)closeSheet();});
    icons();
  }
  function closeSheet(){app.sheetRoot.innerHTML='';}

  function patchReview(){
    if(app.state.view!=='suggest'||app.state.wizardStep!==4)return;
    ensureDraft();syncSexualContent();
    const rows=[...app.viewRoot.querySelectorAll('.review-row')];
    const iconNames=['file-text','book-open','tags','shield'];
    rows.forEach((row,i)=>{const icon=row.querySelector('.round-icon');if(icon)icon.innerHTML=ico(iconNames[i]||'circle');});
    if(rows[2]){
      const value=rows[2].querySelector('.review-value');
      if(value)value.innerHTML=`<div class="review-chip-list">${tags().map(tag=>`<span>${app.escapeHtml(label(tag))}</span>`).join('')}</div>`;
    }
    if(rows[3]){
      const value=rows[3].querySelector('.review-value');
      const sub=rows[3].querySelector('.review-sub');
      const level=app.state.draft.sexual_level==='none'?app.tr('noSexual'):app.tr(app.state.draft.sexual_level==='explicit'?'explicit':'suggestive');
      if(value)value.innerHTML=`<div class="review-disclosure"><strong>${app.escapeHtml(level)}</strong>${sexualTags().length?`<div class="review-chip-list sexual">${sexualTags().map(tag=>`<span>${app.escapeHtml(label(tag))}</span>`).join('')}</div>`:''}${app.state.draft.sexual_notes.trim()?`<p>${app.escapeHtml(app.state.draft.sexual_notes.trim())}</p>`:''}</div>`;
      if(sub)sub.innerHTML=`<span class="review-mini-label">${app.escapeHtml(t('sensitive'))}</span> ${app.escapeHtml(app.state.draft.sensitive_content==='None'?'—':app.state.draft.sensitive_content)}`;
    }
    const submit=document.getElementById('submitRequest');if(submit)submit.innerHTML=`${ico('send')} ${app.escapeHtml(app.tr('submitRequest'))}`;
    icons();
  }

  document.addEventListener('dtl:suggest',()=>{if(app.state.wizardStep===3)renderContent();else if(app.state.wizardStep===4)patchReview();});
  document.addEventListener('dtl:localechange',()=>{if(app.state.view==='suggest')app.render();});
})();

(() => {
  const app=window.DTL_APP;
  if(!app?.registerView)throw new Error('DTL app core must load before view-discover.js');
  const {state,viewRoot,escapeHtml,languageFlag,cover,relativeTime}=app;

  const COPY={
    en:{nav:'Discover',title:'Discover',subtitle:'Find stories worth translating before they disappear into the queue.',request:'Request a novel',search:'Search novels or paste a NovelPia / RAW link…',searchHelp:'Title · Korean title · NovelPia ID · NovelPia URL · RAW link',trending:'Trending',trendingSub:'Titles gaining interest right now.',most:'Most requested',raw:'RAW available',recent:'Recently found',allLang:'All languages',allStatus:'Any status',allChapters:'Any length',allGenres:'All genres',ongoing:'Ongoing',completed:'Completed',ch50:'50+ chapters',ch100:'100+ chapters',ch250:'250+ chapters',fantasy:'Fantasy',romance:'Romance',academy:'Academy',isekai:'Isekai',villainess:'Villainess',empty:'Nothing matches these filters yet.',emptySub:'Try another section or loosen a filter.',loading:'Loading Discover…',error:'Discover could not be loaded.',retry:'Try again',readers:n=>`${n} reader${n===1?'':'s'} want this`,rising:n=>n>0?`+${n} this week`:'Active this week',rawBadge:'RAW',translating:'Translating',queued:'In queue',review:'Under review',done:'Completed',want:'I want this translated',wanted:'Wanted',yours:'Your request',view:'View',suggest:'Suggest translation',searching:'Searching Dollar TL and external sources…',noSearch:'No matching titles found.',local:'Dollar TL',external:'External sources',providerDown:'External RAW search is temporarily unavailable. Dollar TL matches still work.',clear:'Clear search',admin:'Titles worth considering',adminSub:'Opportunity score uses measurable Dollar TL signals: demand, 7-day momentum, RAW availability, chapter depth and publication status.',score:'Opportunity',openAdmin:'Admin',found:'Found'},
    ru:{nav:'Поиск',title:'Discover',subtitle:'Находите интересные тайтлы и поддерживайте их до того, как они поднимутся в очередь.',request:'Предложить новеллу',search:'Название или ссылка NovelPia / RAW…',searchHelp:'Название · корейское название · NovelPia ID · NovelPia URL · RAW-ссылка',trending:'В тренде',trendingSub:'Тайтлы, которые сейчас быстрее набирают интерес.',most:'Самые желанные',raw:'Есть RAW',recent:'Недавно найдены',allLang:'Все языки',allStatus:'Любой статус',allChapters:'Любой объём',allGenres:'Все жанры',ongoing:'Онгоинг',completed:'Завершено',ch50:'50+ глав',ch100:'100+ глав',ch250:'250+ глав',fantasy:'Фэнтези',romance:'Романтика',academy:'Академия',isekai:'Исекай',villainess:'Злодейка',empty:'По этим фильтрам пока ничего нет.',emptySub:'Попробуйте другой раздел или ослабьте фильтры.',loading:'Загружаем Discover…',error:'Не удалось загрузить Discover.',retry:'Повторить',readers:n=>`${n} читател${n%10===1&&n%100!==11?'ь':'ей'} хотят перевод`,rising:n=>n>0?`+${n} за неделю`:'Есть интерес за неделю',rawBadge:'RAW',translating:'Переводится',queued:'В очереди',review:'На проверке',done:'Завершено',want:'Хочу этот перевод',wanted:'Хочу перевод',yours:'Ваша заявка',view:'Открыть',suggest:'Предложить перевод',searching:'Ищем в Dollar TL и внешних источниках…',noSearch:'Совпадений не найдено.',local:'Dollar TL',external:'Внешние источники',providerDown:'Внешний RAW-поиск временно недоступен. Поиск Dollar TL продолжает работать.',clear:'Очистить поиск',admin:'Тайтлы, которые стоит рассмотреть',adminSub:'Opportunity score использует измеримые сигналы Dollar TL: спрос, динамику за 7 дней, наличие RAW, объём и статус публикации.',score:'Оценка',openAdmin:'Админка',found:'Найдено'},
    es:{nav:'Descubrir',title:'Descubrir',subtitle:'Encuentra historias prometedoras y apóyalas antes de que lleguen a la cola.',request:'Proponer novela',search:'Busca una novela o pega un enlace NovelPia / RAW…',searchHelp:'Título · título coreano · ID o enlace NovelPia · RAW',trending:'Tendencias',trendingSub:'Títulos que están ganando interés ahora.',most:'Más solicitadas',raw:'RAW disponible',recent:'Recién encontradas',allLang:'Todos los idiomas',allStatus:'Cualquier estado',allChapters:'Cualquier extensión',allGenres:'Todos los géneros',ongoing:'En curso',completed:'Completada',ch50:'50+ capítulos',ch100:'100+ capítulos',ch250:'250+ capítulos',fantasy:'Fantasía',romance:'Romance',academy:'Academia',isekai:'Isekai',villainess:'Villana',empty:'Nada coincide con estos filtros.',emptySub:'Prueba otra sección o cambia los filtros.',loading:'Cargando Discover…',error:'No se pudo cargar Discover.',retry:'Reintentar',readers:n=>`${n} lectores quieren esta traducción`,rising:n=>n>0?`+${n} esta semana`:'Interés esta semana',rawBadge:'RAW',translating:'En traducción',queued:'En cola',review:'En revisión',done:'Completada',want:'Quiero esta traducción',wanted:'Solicitada',yours:'Tu solicitud',view:'Ver',suggest:'Proponer traducción',searching:'Buscando en Dollar TL y fuentes externas…',noSearch:'No hay coincidencias.',local:'Dollar TL',external:'Fuentes externas',providerDown:'La búsqueda RAW externa no está disponible temporalmente.',clear:'Limpiar búsqueda',admin:'Títulos a considerar',adminSub:'La puntuación usa demanda, impulso de 7 días, RAW, capítulos y estado.',score:'Oportunidad',openAdmin:'Admin',found:'Encontrado'},
    fil:{nav:'Discover',title:'Discover',subtitle:'Maghanap ng promising na stories at suportahan ang mga ito bago umakyat sa pila.',request:'Magmungkahi',search:'Maghanap o mag-paste ng NovelPia / RAW link…',searchHelp:'Title · Korean title · NovelPia ID o link · RAW',trending:'Trending',trendingSub:'Mga title na mabilis magkaroon ng interes.',most:'Pinaka-hinihiling',raw:'May RAW',recent:'Bagong nahanap',allLang:'Lahat ng wika',allStatus:'Kahit anong status',allChapters:'Kahit anong haba',allGenres:'Lahat ng genre',ongoing:'Ongoing',completed:'Tapos',ch50:'50+ chapters',ch100:'100+ chapters',ch250:'250+ chapters',fantasy:'Fantasy',romance:'Romance',academy:'Academy',isekai:'Isekai',villainess:'Villainess',empty:'Walang tugma sa filters.',emptySub:'Subukan ang ibang section o filter.',loading:'Naglo-load ng Discover…',error:'Hindi ma-load ang Discover.',retry:'Subukan ulit',readers:n=>`${n} readers ang gusto nito`,rising:n=>n>0?`+${n} this week`:'May interest this week',rawBadge:'RAW',translating:'Isinasalin',queued:'Nasa pila',review:'Sinusuri',done:'Tapos',want:'Gusto kong maisalin ito',wanted:'Gusto ko ito',yours:'Request mo',view:'Tingnan',suggest:'I-suggest',searching:'Naghahanap sa Dollar TL at external sources…',noSearch:'Walang nahanap.',local:'Dollar TL',external:'External sources',providerDown:'Pansamantalang unavailable ang external RAW search.',clear:'I-clear',admin:'Titles worth considering',adminSub:'Score mula sa demand, 7-day momentum, RAW, chapters at status.',score:'Opportunity',openAdmin:'Admin',found:'Nahanap'},
    hi:{nav:'खोजें',title:'Discover',subtitle:'अनुवाद के लायक कहानियाँ खोजें और कतार में आने से पहले उनका समर्थन करें।',request:'उपन्यास सुझाएँ',search:'उपन्यास खोजें या NovelPia / RAW लिंक पेस्ट करें…',searchHelp:'शीर्षक · कोरियाई शीर्षक · NovelPia ID/लिंक · RAW',trending:'ट्रेंडिंग',trendingSub:'अभी तेजी से रुचि पाने वाले शीर्षक।',most:'सबसे अधिक अनुरोधित',raw:'RAW उपलब्ध',recent:'हाल में मिले',allLang:'सभी भाषाएँ',allStatus:'कोई भी स्थिति',allChapters:'कोई भी लंबाई',allGenres:'सभी शैलियाँ',ongoing:'जारी',completed:'पूर्ण',ch50:'50+ अध्याय',ch100:'100+ अध्याय',ch250:'250+ अध्याय',fantasy:'फ़ैंटेसी',romance:'रोमांस',academy:'अकादमी',isekai:'इसेकाई',villainess:'विलेनस',empty:'इन फ़िल्टरों से कुछ नहीं मिला।',emptySub:'दूसरा सेक्शन या फ़िल्टर आज़माएँ।',loading:'Discover लोड हो रहा है…',error:'Discover लोड नहीं हो सका।',retry:'फिर कोशिश करें',readers:n=>`${n} पाठक इसका अनुवाद चाहते हैं`,rising:n=>n>0?`इस सप्ताह +${n}`:'इस सप्ताह सक्रिय',rawBadge:'RAW',translating:'अनुवाद जारी',queued:'कतार में',review:'समीक्षा में',done:'पूर्ण',want:'मैं इसका अनुवाद चाहता हूँ',wanted:'चाहते हैं',yours:'आपका अनुरोध',view:'खोलें',suggest:'अनुवाद सुझाएँ',searching:'Dollar TL और बाहरी स्रोतों में खोज रहे हैं…',noSearch:'कोई मिलान नहीं मिला।',local:'Dollar TL',external:'बाहरी स्रोत',providerDown:'बाहरी RAW खोज अस्थायी रूप से उपलब्ध नहीं है।',clear:'खोज साफ़ करें',admin:'विचार योग्य शीर्षक',adminSub:'स्कोर मांग, 7-दिन गति, RAW, अध्याय और स्थिति पर आधारित है।',score:'अवसर',openAdmin:'Admin',found:'मिला'},
    pt:{nav:'Descobrir',title:'Descobrir',subtitle:'Encontre histórias promissoras e apoie-as antes de chegarem à fila.',request:'Sugerir novel',search:'Pesquise ou cole um link NovelPia / RAW…',searchHelp:'Título · título coreano · ID/link NovelPia · RAW',trending:'Em alta',trendingSub:'Títulos ganhando interesse agora.',most:'Mais pedidas',raw:'RAW disponível',recent:'Encontradas recentemente',allLang:'Todos os idiomas',allStatus:'Qualquer status',allChapters:'Qualquer tamanho',allGenres:'Todos os gêneros',ongoing:'Em andamento',completed:'Concluída',ch50:'50+ capítulos',ch100:'100+ capítulos',ch250:'250+ capítulos',fantasy:'Fantasia',romance:'Romance',academy:'Academia',isekai:'Isekai',villainess:'Vilã',empty:'Nada corresponde aos filtros.',emptySub:'Tente outra seção ou ajuste os filtros.',loading:'Carregando Discover…',error:'Não foi possível carregar Discover.',retry:'Tentar novamente',readers:n=>`${n} leitores querem esta tradução`,rising:n=>n>0?`+${n} esta semana`:'Interesse nesta semana',rawBadge:'RAW',translating:'Em tradução',queued:'Na fila',review:'Em análise',done:'Concluído',want:'Quero esta tradução',wanted:'Quero traduzido',yours:'Seu pedido',view:'Abrir',suggest:'Sugerir tradução',searching:'Pesquisando no Dollar TL e fontes externas…',noSearch:'Nenhum resultado.',local:'Dollar TL',external:'Fontes externas',providerDown:'A busca RAW externa está temporariamente indisponível.',clear:'Limpar busca',admin:'Títulos a considerar',adminSub:'A pontuação usa demanda, impulso de 7 dias, RAW, capítulos e status.',score:'Oportunidade',openAdmin:'Admin',found:'Encontrado'},
    id:{nav:'Temukan',title:'Temukan',subtitle:'Temukan cerita yang layak diterjemahkan dan dukung sebelum masuk antrean.',request:'Sarankan novel',search:'Cari novel atau tempel tautan NovelPia / RAW…',searchHelp:'Judul · judul Korea · ID/tautan NovelPia · RAW',trending:'Trending',trendingSub:'Judul yang sedang cepat mendapat minat.',most:'Paling diminta',raw:'RAW tersedia',recent:'Baru ditemukan',allLang:'Semua bahasa',allStatus:'Status apa pun',allChapters:'Panjang apa pun',allGenres:'Semua genre',ongoing:'Berjalan',completed:'Selesai',ch50:'50+ bab',ch100:'100+ bab',ch250:'250+ bab',fantasy:'Fantasi',romance:'Romansa',academy:'Akademi',isekai:'Isekai',villainess:'Villainess',empty:'Tidak ada yang cocok.',emptySub:'Coba bagian atau filter lain.',loading:'Memuat Discover…',error:'Discover tidak dapat dimuat.',retry:'Coba lagi',readers:n=>`${n} pembaca menginginkan terjemahan ini`,rising:n=>n>0?`+${n} minggu ini`:'Aktif minggu ini',rawBadge:'RAW',translating:'Sedang diterjemahkan',queued:'Dalam antrean',review:'Ditinjau',done:'Selesai',want:'Saya ingin diterjemahkan',wanted:'Diinginkan',yours:'Permintaan Anda',view:'Buka',suggest:'Sarankan terjemahan',searching:'Mencari di Dollar TL dan sumber eksternal…',noSearch:'Tidak ada hasil.',local:'Dollar TL',external:'Sumber eksternal',providerDown:'Pencarian RAW eksternal sementara tidak tersedia.',clear:'Hapus pencarian',admin:'Judul yang layak dipertimbangkan',adminSub:'Skor memakai permintaan, momentum 7 hari, RAW, jumlah bab dan status.',score:'Peluang',openAdmin:'Admin',found:'Ditemukan'},
    vi:{nav:'Khám phá',title:'Khám phá',subtitle:'Tìm những truyện đáng dịch và ủng hộ trước khi chúng tiến vào hàng đợi.',request:'Đề xuất truyện',search:'Tìm truyện hoặc dán liên kết NovelPia / RAW…',searchHelp:'Tên · tên tiếng Hàn · ID/liên kết NovelPia · RAW',trending:'Xu hướng',trendingSub:'Các truyện đang tăng nhanh mức quan tâm.',most:'Được yêu cầu nhiều nhất',raw:'Có RAW',recent:'Mới tìm thấy',allLang:'Mọi ngôn ngữ',allStatus:'Mọi trạng thái',allChapters:'Mọi độ dài',allGenres:'Mọi thể loại',ongoing:'Đang ra',completed:'Hoàn thành',ch50:'50+ chương',ch100:'100+ chương',ch250:'250+ chương',fantasy:'Fantasy',romance:'Romance',academy:'Academy',isekai:'Isekai',villainess:'Villainess',empty:'Không có truyện phù hợp.',emptySub:'Thử mục khác hoặc nới bộ lọc.',loading:'Đang tải Discover…',error:'Không thể tải Discover.',retry:'Thử lại',readers:n=>`${n} độc giả muốn bản dịch này`,rising:n=>n>0?`+${n} tuần này`:'Có quan tâm tuần này',rawBadge:'RAW',translating:'Đang dịch',queued:'Trong hàng đợi',review:'Đang duyệt',done:'Hoàn thành',want:'Tôi muốn bản dịch này',wanted:'Đã quan tâm',yours:'Yêu cầu của bạn',view:'Mở',suggest:'Đề xuất dịch',searching:'Đang tìm trong Dollar TL và nguồn bên ngoài…',noSearch:'Không tìm thấy kết quả.',local:'Dollar TL',external:'Nguồn bên ngoài',providerDown:'Tìm kiếm RAW bên ngoài tạm thời không khả dụng.',clear:'Xóa tìm kiếm',admin:'Tác phẩm đáng cân nhắc',adminSub:'Điểm dựa trên nhu cầu, động lực 7 ngày, RAW, số chương và trạng thái.',score:'Cơ hội',openAdmin:'Admin',found:'Tìm thấy'},
    fr:{nav:'Découvrir',title:'Découvrir',subtitle:'Trouvez des histoires à traduire et soutenez-les avant leur arrivée dans la file.',request:'Proposer un roman',search:'Recherchez ou collez un lien NovelPia / RAW…',searchHelp:'Titre · titre coréen · ID/lien NovelPia · RAW',trending:'Tendances',trendingSub:'Les titres qui gagnent de l’intérêt maintenant.',most:'Les plus demandés',raw:'RAW disponible',recent:'Récemment trouvés',allLang:'Toutes les langues',allStatus:'Tous les statuts',allChapters:'Toutes longueurs',allGenres:'Tous les genres',ongoing:'En cours',completed:'Terminé',ch50:'50+ chapitres',ch100:'100+ chapitres',ch250:'250+ chapitres',fantasy:'Fantasy',romance:'Romance',academy:'Academy',isekai:'Isekai',villainess:'Villainess',empty:'Aucun titre ne correspond.',emptySub:'Essayez une autre section ou filtre.',loading:'Chargement de Discover…',error:'Impossible de charger Discover.',retry:'Réessayer',readers:n=>`${n} lecteurs veulent cette traduction`,rising:n=>n>0?`+${n} cette semaine`:'Actif cette semaine',rawBadge:'RAW',translating:'En traduction',queued:'Dans la file',review:'En révision',done:'Terminé',want:'Je veux cette traduction',wanted:'Demandé',yours:'Votre demande',view:'Voir',suggest:'Proposer la traduction',searching:'Recherche dans Dollar TL et les sources externes…',noSearch:'Aucun résultat.',local:'Dollar TL',external:'Sources externes',providerDown:'La recherche RAW externe est temporairement indisponible.',clear:'Effacer',admin:'Titres à considérer',adminSub:'Le score utilise la demande, l’élan sur 7 jours, RAW, le nombre de chapitres et le statut.',score:'Opportunité',openAdmin:'Admin',found:'Trouvé'},
    de:{nav:'Entdecken',title:'Entdecken',subtitle:'Finde Geschichten mit Potenzial und unterstütze sie, bevor sie in die Warteschlange kommen.',request:'Roman vorschlagen',search:'Roman suchen oder NovelPia-/RAW-Link einfügen…',searchHelp:'Titel · koreanischer Titel · NovelPia-ID/Link · RAW',trending:'Im Trend',trendingSub:'Titel, deren Interesse gerade wächst.',most:'Meistgewünscht',raw:'RAW verfügbar',recent:'Kürzlich gefunden',allLang:'Alle Sprachen',allStatus:'Jeder Status',allChapters:'Jede Länge',allGenres:'Alle Genres',ongoing:'Laufend',completed:'Abgeschlossen',ch50:'50+ Kapitel',ch100:'100+ Kapitel',ch250:'250+ Kapitel',fantasy:'Fantasy',romance:'Romance',academy:'Academy',isekai:'Isekai',villainess:'Villainess',empty:'Keine Titel passen zu den Filtern.',emptySub:'Andere Sektion oder Filter versuchen.',loading:'Discover wird geladen…',error:'Discover konnte nicht geladen werden.',retry:'Erneut versuchen',readers:n=>`${n} Leser möchten diese Übersetzung`,rising:n=>n>0?`+${n} diese Woche`:'Diese Woche aktiv',rawBadge:'RAW',translating:'Wird übersetzt',queued:'In Warteschlange',review:'In Prüfung',done:'Abgeschlossen',want:'Ich möchte diese Übersetzung',wanted:'Gewünscht',yours:'Deine Anfrage',view:'Öffnen',suggest:'Übersetzung vorschlagen',searching:'Suche in Dollar TL und externen Quellen…',noSearch:'Keine Treffer.',local:'Dollar TL',external:'Externe Quellen',providerDown:'Die externe RAW-Suche ist vorübergehend nicht verfügbar.',clear:'Suche leeren',admin:'Titel zum Prüfen',adminSub:'Der Score nutzt Nachfrage, 7-Tage-Dynamik, RAW, Kapitelzahl und Status.',score:'Chance',openAdmin:'Admin',found:'Gefunden'}
  };

  const FRESH_COPY={
    en:{fresh:'Fresh from NovelPia',freshSub:'New and newly promoted titles found automatically on NovelPia.',freshSearch:'Fresh NovelPia catalog',plus:'PLUS',free:'Free',newPlus:'New PLUS',newFree:'New free',newRank:n=>`New rank #${n}`,openNovelPia:'Open NovelPia',requestFresh:'Suggest translation',autoUpdated:v=>`Auto-discovered · updated ${v}`,degraded:'NovelPia sync is partially degraded; cached fresh titles remain available.',author:'Author',unknownChapters:'Chapters unknown',views:n=>`${n} views`,freshAdmin:'Score also uses NovelPia new-rank and public popularity signals.'},
    ru:{fresh:'Свежее с NovelPia',freshSub:'Новые и недавно продвинутые тайтлы, которые Dollar TL находит автоматически.',freshSearch:'Свежий каталог NovelPia',plus:'PLUS',free:'Бесплатно',newPlus:'Новый PLUS',newFree:'Новый бесплатный',newRank:n=>`Новинки #${n}`,openNovelPia:'Открыть NovelPia',requestFresh:'Предложить перевод',autoUpdated:v=>`Найдено автоматически · обновлено ${v}`,degraded:'Синхронизация NovelPia частично недоступна; уже найденные тайтлы остаются в Discover.',author:'Автор',unknownChapters:'Главы не определены',views:n=>`${n} просмотров`,freshAdmin:'Оценка также учитывает NovelPia New Rank и публичные сигналы популярности.'},
    es:{fresh:'Novedades de NovelPia',freshSub:'Títulos nuevos detectados automáticamente en NovelPia.',freshSearch:'Catálogo nuevo de NovelPia',plus:'PLUS',free:'Gratis',newPlus:'Nuevo PLUS',newFree:'Nuevo gratis',newRank:n=>`Ranking nuevo #${n}`,openNovelPia:'Abrir NovelPia',requestFresh:'Proponer traducción',autoUpdated:v=>`Descubierto automáticamente · actualizado ${v}`,degraded:'La sincronización de NovelPia está parcialmente degradada.',author:'Autor',unknownChapters:'Capítulos desconocidos',views:n=>`${n} vistas`,freshAdmin:'La puntuación también usa el ranking nuevo y señales públicas de NovelPia.'},
    fil:{fresh:'Fresh from NovelPia',freshSub:'Mga bagong title na awtomatikong nahahanap sa NovelPia.',freshSearch:'Fresh NovelPia catalog',plus:'PLUS',free:'Free',newPlus:'New PLUS',newFree:'New free',newRank:n=>`New rank #${n}`,openNovelPia:'Buksan ang NovelPia',requestFresh:'I-suggest ang translation',autoUpdated:v=>`Auto-discovered · updated ${v}`,degraded:'Bahagyang degraded ang NovelPia sync.',author:'Author',unknownChapters:'Unknown chapters',views:n=>`${n} views`,freshAdmin:'Kasama rin sa score ang NovelPia new-rank at public popularity.'},
    hi:{fresh:'NovelPia से नया',freshSub:'NovelPia पर अपने-आप मिले नए शीर्षक।',freshSearch:'नया NovelPia कैटलॉग',plus:'PLUS',free:'मुफ़्त',newPlus:'नया PLUS',newFree:'नया मुफ़्त',newRank:n=>`नया रैंक #${n}`,openNovelPia:'NovelPia खोलें',requestFresh:'अनुवाद सुझाएँ',autoUpdated:v=>`अपने-आप मिला · ${v} अपडेट`,degraded:'NovelPia सिंक आंशिक रूप से उपलब्ध नहीं है।',author:'लेखक',unknownChapters:'अध्याय अज्ञात',views:n=>`${n} व्यू`,freshAdmin:'स्कोर NovelPia new-rank और सार्वजनिक लोकप्रियता भी उपयोग करता है।'},
    pt:{fresh:'Novidades do NovelPia',freshSub:'Títulos novos encontrados automaticamente no NovelPia.',freshSearch:'Catálogo novo do NovelPia',plus:'PLUS',free:'Grátis',newPlus:'Novo PLUS',newFree:'Novo grátis',newRank:n=>`Ranking novo #${n}`,openNovelPia:'Abrir NovelPia',requestFresh:'Sugerir tradução',autoUpdated:v=>`Descoberto automaticamente · atualizado ${v}`,degraded:'A sincronização do NovelPia está parcialmente degradada.',author:'Autor',unknownChapters:'Capítulos desconhecidos',views:n=>`${n} visualizações`,freshAdmin:'A pontuação também usa o ranking novo e sinais públicos do NovelPia.'},
    id:{fresh:'Baru dari NovelPia',freshSub:'Judul baru yang ditemukan otomatis di NovelPia.',freshSearch:'Katalog NovelPia baru',plus:'PLUS',free:'Gratis',newPlus:'PLUS baru',newFree:'Gratis baru',newRank:n=>`Peringkat baru #${n}`,openNovelPia:'Buka NovelPia',requestFresh:'Sarankan terjemahan',autoUpdated:v=>`Ditemukan otomatis · diperbarui ${v}`,degraded:'Sinkronisasi NovelPia sedang sebagian terganggu.',author:'Penulis',unknownChapters:'Bab tidak diketahui',views:n=>`${n} tayangan`,freshAdmin:'Skor juga memakai new-rank dan sinyal popularitas publik NovelPia.'},
    vi:{fresh:'Mới từ NovelPia',freshSub:'Tác phẩm mới được tự động tìm thấy trên NovelPia.',freshSearch:'Danh mục NovelPia mới',plus:'PLUS',free:'Miễn phí',newPlus:'PLUS mới',newFree:'Miễn phí mới',newRank:n=>`Hạng mới #${n}`,openNovelPia:'Mở NovelPia',requestFresh:'Đề xuất dịch',autoUpdated:v=>`Tự động phát hiện · cập nhật ${v}`,degraded:'Đồng bộ NovelPia đang bị gián đoạn một phần.',author:'Tác giả',unknownChapters:'Chưa rõ số chương',views:n=>`${n} lượt xem`,freshAdmin:'Điểm cũng dùng new-rank và tín hiệu phổ biến công khai của NovelPia.'},
    fr:{fresh:'Nouveautés NovelPia',freshSub:'Nouveaux titres trouvés automatiquement sur NovelPia.',freshSearch:'Catalogue NovelPia récent',plus:'PLUS',free:'Gratuit',newPlus:'Nouveau PLUS',newFree:'Nouveau gratuit',newRank:n=>`Classement nouveau #${n}`,openNovelPia:'Ouvrir NovelPia',requestFresh:'Proposer la traduction',autoUpdated:v=>`Découvert automatiquement · mis à jour ${v}`,degraded:'La synchronisation NovelPia est partiellement dégradée.',author:'Auteur',unknownChapters:'Chapitres inconnus',views:n=>`${n} vues`,freshAdmin:'Le score utilise aussi le new-rank et les signaux publics de NovelPia.'},
    de:{fresh:'Neu von NovelPia',freshSub:'Neue Titel, die automatisch auf NovelPia gefunden wurden.',freshSearch:'Neuer NovelPia-Katalog',plus:'PLUS',free:'Kostenlos',newPlus:'Neues PLUS',newFree:'Neu kostenlos',newRank:n=>`Neu-Rang #${n}`,openNovelPia:'NovelPia öffnen',requestFresh:'Übersetzung vorschlagen',autoUpdated:v=>`Automatisch gefunden · aktualisiert ${v}`,degraded:'Die NovelPia-Synchronisierung ist teilweise beeinträchtigt.',author:'Autor',unknownChapters:'Kapitel unbekannt',views:n=>`${n} Aufrufe`,freshAdmin:'Der Score nutzt auch NovelPia New-Rank und öffentliche Popularitätssignale.'}
  };

  const locale=()=>COPY[state.locale]?state.locale:'en';
  const tx=(key,...args)=>{const value=FRESH_COPY[locale()]?.[key]??FRESH_COPY.en[key]??COPY[locale()]?.[key]??COPY.en[key]??key;return typeof value==='function'?value(...args):value;};
  const icon=name=>`<i data-lucide="${name}" aria-hidden="true"></i>`;
  const refreshIcons=()=>requestAnimationFrame(()=>{try{window.lucide?.createIcons?.({attrs:{'stroke-width':1.8,'aria-hidden':'true'}});}catch{}});

  let feed=null;
  let opportunities=null;
  let loading=false;
  let failed=false;
  let mode='fresh_novelpia';
  let query='';
  let searchTimer=0;
  let searchSeq=0;
  let searchPayload=null;
  const filters={language:'all',status:'all',chapters:0,genre:'all'};

  function renderDiscover(){
    viewRoot.innerHTML=`<section class="page discover-page">
      <div class="discover-heading"><div><h1>${escapeHtml(tx('title'))}</h1><p>${escapeHtml(tx('subtitle'))}</p></div><button class="discover-request-button" id="discoverRequest" type="button">${icon('plus')} ${escapeHtml(tx('request'))}</button></div>
      <div class="discover-search-shell">${icon('search')}<input class="discover-search-input" id="discoverQuery" value="${escapeHtml(query)}" autocomplete="off" spellcheck="false" placeholder="${escapeHtml(tx('search'))}">${query?`<button class="discover-search-clear" id="discoverClear" type="button" aria-label="${escapeHtml(tx('clear'))}">${icon('x')}</button>`:''}</div><div class="discover-search-help">${escapeHtml(tx('searchHelp'))}</div></div>
      <div id="discoverContent">${contentMarkup()}</div>
    </section>`;
    bind();
    refreshIcons();
    window.DTL_COVERS?.patchCovers?.(viewRoot);
    if(!feed&&!loading&&!failed)loadFeed();
  }

  function contentMarkup(){
    if(query.length>=2)return searchMarkup();
    if(loading&&!feed)return stateMarkup('loader-circle',tx('loading'),'','is-loading');
    if(failed&&!feed)return stateMarkup('triangle-alert',tx('error'),tx('retry'),'');
    if(!feed)return stateMarkup('loader-circle',tx('loading'),'','is-loading');
    const freshTop=(feed.fresh_novelpia||[]).slice(0,3);
    const trendTop=(feed.trending||[]).slice(0,3);
    const hero=freshTop.length
      ? `<section class="discover-hero discover-fresh-hero"><div class="discover-section-head"><div><h2>${escapeHtml(tx('fresh'))}</h2><p>${escapeHtml(tx('freshSub'))}</p></div></div><div class="discover-hero-grid">${freshTop.map((row,index)=>freshFeatureMarkup(row,index+1)).join('')}</div>${freshStatusMarkup()}</section>`
      : trendTop.length
        ? `<section class="discover-hero"><div class="discover-section-head"><div><h2>${escapeHtml(tx('trending'))}</h2><p>${escapeHtml(tx('trendingSub'))}</p></div></div><div class="discover-hero-grid">${trendTop.map((row,index)=>featureMarkup(row,index+1)).join('')}</div></section>`
        : '';
    return `${hero}<div class="discover-toolbar">${modesMarkup()}${filtersMarkup()}</div>
      <div class="discover-list">${listMarkup(filteredRows())}</div>
      ${state.bootstrap?.user?.is_admin&&opportunities?adminMarkup():''}`;
  }

  function stateMarkup(iconName,title,sub,extra=''){
    return `<div class="discover-state ${extra}">${icon(iconName)}<div><strong>${escapeHtml(title)}</strong>${sub?`<span>${escapeHtml(sub)}</span>`:''}</div>${failed&&!feed?`<button class="discover-action secondary" id="discoverRetry" type="button">${escapeHtml(tx('retry'))}</button>`:''}</div>`;
  }

  function freshStatusMarkup(){
    const stateInfo=feed?.novelpia_ingest;
    if(!stateInfo?.last_success_at)return'';
    const age=relativeTime(stateInfo.last_success_at);
    return `<div class="discover-fresh-sync ${stateInfo.degraded?'is-degraded':''}">${icon(stateInfo.degraded?'cloud-alert':'refresh-cw')}<span>${escapeHtml(tx('autoUpdated',age))}</span>${stateInfo.degraded?`<span class="discover-fresh-warning">${escapeHtml(tx('degraded'))}</span>`:''}</div>`;
  }

  function modesMarkup(){
    const items=[['fresh_novelpia','telescope',tx('fresh')],['trending','flame',tx('trending')],['most_requested','users-round',tx('most')],['raw_available','archive',tx('raw')],['recently_found','sparkles',tx('recent')]];
    return `<div class="discover-modes" role="tablist">${items.map(([id,ico,label])=>`<button class="discover-mode ${mode===id?'is-active':''}" type="button" data-discover-mode="${id}" role="tab" aria-selected="${mode===id?'true':'false'}">${icon(ico)} ${escapeHtml(label)}</button>`).join('')}</div>`;
  }

  function filtersMarkup(){
    return `<div class="discover-filters">
      <select class="discover-filter" id="discoverLanguage" aria-label="${escapeHtml(tx('allLang'))}"><option value="all">${escapeHtml(tx('allLang'))}</option>${['Korean','Japanese','Chinese'].map(v=>`<option value="${v}" ${filters.language===v?'selected':''}>${languageFlag(v)} ${escapeHtml(v)}</option>`).join('')}</select>
      <select class="discover-filter" id="discoverStatus" aria-label="${escapeHtml(tx('allStatus'))}"><option value="all">${escapeHtml(tx('allStatus'))}</option><option value="ongoing" ${filters.status==='ongoing'?'selected':''}>${escapeHtml(tx('ongoing'))}</option><option value="completed" ${filters.status==='completed'?'selected':''}>${escapeHtml(tx('completed'))}</option></select>
      <select class="discover-filter" id="discoverChapters" aria-label="${escapeHtml(tx('allChapters'))}"><option value="0">${escapeHtml(tx('allChapters'))}</option><option value="50" ${filters.chapters===50?'selected':''}>${escapeHtml(tx('ch50'))}</option><option value="100" ${filters.chapters===100?'selected':''}>${escapeHtml(tx('ch100'))}</option><option value="250" ${filters.chapters===250?'selected':''}>${escapeHtml(tx('ch250'))}</option></select>
      <select class="discover-filter" id="discoverGenre" aria-label="${escapeHtml(tx('allGenres'))}"><option value="all">${escapeHtml(tx('allGenres'))}</option>${['fantasy','romance','academy','isekai','villainess'].map(v=>`<option value="${v}" ${filters.genre===v?'selected':''}>${escapeHtml(tx(v))}</option>`).join('')}</select>
    </div>`;
  }

  function filteredRows(){
    const rows=feed?.[mode]||[];
    return rows.filter(row=>{
      if(filters.language!=='all'&&String(row.original_language)!==filters.language)return false;
      if(filters.status!=='all'&&row.publication_status!==filters.status)return false;
      if(filters.chapters&&Number(row.chapter_count||0)<filters.chapters)return false;
      if(filters.genre!=='all'&&!String(row.genres_tags||'').toLowerCase().includes(filters.genre))return false;
      return true;
    });
  }

  function listMarkup(rows){
    if(!rows.length)return stateMarkup('search-x',tx('empty'),tx('emptySub'));
    return rows.map(row=>rowMarkup(row)).join('');
  }

  function featureMarkup(row,rank){
    return `<article class="discover-feature" data-novel="${Number(row.id)}"><div class="discover-feature-rank">${rank}</div>${cover(row.title)}<div class="discover-feature-copy"><button class="discover-row-title discover-feature-title" type="button" data-discover-open="${Number(row.id)}" ${row.request_status==='accepted'?'':'disabled'}>${escapeHtml(row.title)}</button><div class="discover-feature-meta">${languageFlag(row.original_language)} ${escapeHtml(row.original_language)} · ${Number(row.chapter_count)} ch.</div><div class="discover-feature-demand">${icon('users-round')} ${escapeHtml(tx('readers',Number(row.demand_count)||1))}</div></div></article>`;
  }

  function freshFeatureMarkup(row,rank){
    const meta=[row.source_tier==='plus'?tx('plus'):tx('free'),row.source_rank?tx('newRank',Number(row.source_rank)):null].filter(Boolean).join(' · ');
    return `<article class="discover-feature discover-fresh-feature" data-catalog="${Number(row.catalog_id)}"><div class="discover-feature-rank">${rank}</div>${catalogCover(row)}<div class="discover-feature-copy"><a class="discover-row-title discover-feature-title" href="${escapeHtml(row.source_url)}" target="_blank" rel="noopener">${escapeHtml(row.title)}</a><div class="discover-feature-meta">${escapeHtml(meta)}</div><div class="discover-feature-demand">${icon('users-round')} ${escapeHtml(tx('readers',Number(row.demand_count)||0))}</div></div></article>`;
  }

  function rowMarkup(row){
    if(row?.kind==='catalog')return catalogRowMarkup(row);
    const openable=row.request_status==='accepted';
    const status=statusMarkup(row);
    const trend=Number(row.recent_interest_count)>0?`<span class="discover-badge rising">${icon('trending-up')} ${escapeHtml(tx('rising',Number(row.recent_interest_count)))}</span>`:'';
    const raw=row.raw_available?`<span class="discover-badge raw">${icon('archive')} ${escapeHtml(tx('rawBadge'))}</span>`:'';
    const tags=String(row.genres_tags||'').split(/[,;|]/).map(v=>v.trim()).filter(Boolean).slice(0,5).join(' · ');
    return `<article class="discover-row" data-novel="${Number(row.id)}">${cover(row.title,true)}<div class="discover-row-copy"><button class="discover-row-title" type="button" data-discover-open="${Number(row.id)}" ${openable?'':'disabled'}>${escapeHtml(row.title)}</button><div class="discover-row-meta"><span>${languageFlag(row.original_language)} ${escapeHtml(row.original_language)}</span><span>·</span><span>${Number(row.chapter_count)} ch.</span><span>·</span><strong>${escapeHtml(tx('readers',Number(row.demand_count)||1))}</strong>${status}${raw}${trend}</div>${tags?`<div class="discover-row-tags">${escapeHtml(tags)}</div>`:''}</div><div class="discover-row-actions">${actionsMarkup(row)}</div></article>`;
  }

  function catalogRowMarkup(row){
    const tags=String(row.genres_tags||'').split(/[,;|]/).map(v=>v.trim()).filter(Boolean).slice(0,5).join(' · ');
    const chapterText=row.chapter_count?`${Number(row.chapter_count)} ch.`:tx('unknownChapters');
    const author=row.author?`<span>${icon('pen-line')} ${escapeHtml(row.author)}</span>`:'';
    const views=Number(row.views_count)>0?`<span>${escapeHtml(tx('views',Number(row.views_count)))}</span>`:'';
    return `<article class="discover-row discover-catalog-row" data-catalog="${Number(row.catalog_id)}">${catalogCover(row)}<div class="discover-row-copy"><a class="discover-row-title" href="${escapeHtml(row.source_url)}" target="_blank" rel="noopener">${escapeHtml(row.title)}</a>${row.original_title&&row.original_title!==row.title?`<div class="discover-catalog-original">${escapeHtml(row.original_title)}</div>`:''}<div class="discover-row-meta"><span>${languageFlag('Korean')} Korean</span><span>·</span><span>${escapeHtml(chapterText)}</span>${author}${views}<strong>${escapeHtml(tx('readers',Number(row.demand_count)||0))}</strong>${catalogBadges(row)}</div>${tags?`<div class="discover-row-tags">${escapeHtml(tags)}</div>`:''}</div><div class="discover-row-actions">${catalogActionsMarkup(row)}</div></article>`;
  }

  function catalogCover(row){
    const fallback=String(row.title||'?').trim().slice(0,1).toUpperCase()||'?';
    return `<span class="novel-cover discover-catalog-cover"><span class="discover-catalog-cover-fallback">${escapeHtml(fallback)}</span>${row.cover_url?`<img src="${escapeHtml(row.cover_url)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">`:''}</span>`;
  }

  function catalogBadges(row){
    const signals=Array.isArray(row.fresh_signals)?row.fresh_signals:[];
    const source=row.source_tier==='plus'?`<span class="discover-badge source plus">${icon('badge-check')} ${escapeHtml(tx('plus'))}</span>`:`<span class="discover-badge source">${escapeHtml(tx('free'))}</span>`;
    const fresh=signals.includes('novelpia_plus_new')?`<span class="discover-badge fresh">${icon('sparkles')} ${escapeHtml(tx('newPlus'))}</span>`:signals.includes('novelpia_free_new')?`<span class="discover-badge fresh">${icon('sparkles')} ${escapeHtml(tx('newFree'))}</span>`:'';
    const rank=row.source_rank?`<span class="discover-badge rank">${icon('chart-no-axes-column-increasing')} ${escapeHtml(tx('newRank',Number(row.source_rank)))}</span>`:'';
    return `${source}${fresh}${rank}`;
  }

  function statusMarkup(row){
    if(row.queue_status==='in_progress')return `<span class="discover-badge live">${icon('radio')} ${escapeHtml(tx('translating'))}</span>`;
    if(row.queue_status==='completed')return `<span class="discover-badge">${escapeHtml(tx('done'))}</span>`;
    if(row.queue_status==='queued')return `<span class="discover-badge">${escapeHtml(tx('queued'))}${row.queue_position?` #${Number(row.queue_position)}`:''}</span>`;
    return `<span class="discover-badge">${escapeHtml(tx('review'))}</span>`;
  }

  function actionsMarkup(row){
    const id=Number(row.id);
    const interest=row.own_request?`<button class="discover-action secondary" type="button" disabled>${escapeHtml(tx('yours'))}</button>`:`<button class="discover-action secondary ${row.viewer_interested?'is-active':''}" type="button" data-discover-interest="${id}" data-next="${row.viewer_interested?'0':'1'}">${icon('heart')} ${escapeHtml(row.viewer_interested?tx('wanted'):tx('want'))}</button>`;
    const open=row.request_status==='accepted'?`<button class="discover-action primary" type="button" data-discover-open="${id}">${escapeHtml(tx('view'))}</button>`:'';
    return `${interest}${open}`;
  }

  function catalogActionsMarkup(row){
    const id=Number(row.catalog_id);
    return `<button class="discover-action secondary ${row.viewer_interested?'is-active':''}" type="button" data-catalog-interest="${id}" data-next="${row.viewer_interested?'0':'1'}">${icon('heart')} ${escapeHtml(row.viewer_interested?tx('wanted'):tx('want'))}</button><a class="discover-action secondary discover-action-link" href="${escapeHtml(row.source_url)}" target="_blank" rel="noopener">${icon('external-link')} ${escapeHtml(tx('openNovelPia'))}</a><button class="discover-action primary" type="button" data-catalog-request="${id}">${escapeHtml(tx('requestFresh'))}</button>`;
  }

  function searchMarkup(){
    if(!searchPayload)return stateMarkup('loader-circle',tx('searching'),'','is-loading');
    if(searchPayload.error)return stateMarkup('triangle-alert',tx('error'),searchPayload.error);
    const local=searchPayload.local||[];
    const catalog=searchPayload.catalog||[];
    const external=searchPayload.external||[];
    if(!local.length&&!catalog.length&&!external.length)return stateMarkup('search-x',tx('noSearch'),searchPayload.provider_status==='unavailable'?tx('providerDown'):'');
    return `<div class="discover-search-results">${searchPayload.provider_status==='unavailable'?`<div class="discover-state" style="min-height:auto;padding:10px 0">${icon('cloud-off')}<div><span>${escapeHtml(tx('providerDown'))}</span></div></div>`:''}${local.length?`<div class="discover-search-source">${escapeHtml(tx('local'))}</div><div class="discover-list">${local.map(normalizeSearchLocal).map(rowMarkup).join('')}</div>`:''}${catalog.length?`<div class="discover-search-source">${escapeHtml(tx('freshSearch'))}</div><div class="discover-list">${catalog.map(rowMarkup).join('')}</div>`:''}${external.length?`<div class="discover-search-source">${escapeHtml(tx('external'))}</div>${external.map((row,index)=>externalMarkup(row,index)).join('')}`:''}</div>`;
  }

  function normalizeSearchLocal(row){
    return {...row,kind:'local',recent_interest_count:0,trend_delta:0,genres_tags:row.genres_tags||'',publication_status:row.publication_status||'ongoing'};
  }

  function externalMarkup(row,index){
    return `<article class="discover-external-row"><div><div class="discover-external-title">${escapeHtml(row.title||tx('found'))}</div>${row.original_title?`<div class="discover-external-original">${escapeHtml(row.original_title)}</div>`:''}<div class="discover-external-meta"><span>${languageFlag(row.original_language||'Korean')} ${escapeHtml(row.original_language||'Korean')}</span>${row.chapter_count?`<span>· ${Number(row.chapter_count)} ch.</span>`:''}${row.raw_available?`<span class="discover-badge raw">${icon('archive')} ${escapeHtml(tx('rawBadge'))}</span>`:''}</div></div><button class="discover-action primary" type="button" data-discover-external="${index}">${escapeHtml(tx('suggest'))}</button></article>`;
  }

  function adminMarkup(){
    const items=(opportunities?.items||[]).slice(0,8);
    if(!items.length)return'';
    return `<section class="discover-admin"><div class="discover-section-head"><div><h2>${escapeHtml(tx('admin'))}</h2><p>${escapeHtml(tx('score'))}</p></div></div><p class="discover-admin-note">${escapeHtml(tx('adminSub'))} ${escapeHtml(tx('freshAdmin'))}</p>${items.map(opportunityMarkup).join('')}</section>`;
  }

  function opportunityMarkup(row){
    const catalog=row.kind==='catalog';
    const demand=escapeHtml(tx('readers',Number(row.demand_count)||0));
    const chapters=row.chapter_count?`${Number(row.chapter_count)} ch.`:tx('unknownChapters');
    const signals=Array.isArray(row.opportunity_signals)&&row.opportunity_signals.length?` · ${escapeHtml(row.opportunity_signals.slice(0,2).join(' · '))}`:'';
    const action=catalog?`<a class="discover-action secondary discover-action-link" href="${escapeHtml(row.source_url)}" target="_blank" rel="noopener">${escapeHtml(tx('openNovelPia'))}</a>`:`<button class="discover-action secondary" type="button" data-discover-open="${Number(row.id)}">${escapeHtml(tx('view'))}</button>`;
    return `<div class="discover-opportunity" ${catalog?`data-catalog="${Number(row.catalog_id)}"`:`data-novel="${Number(row.id)}"`}><div class="discover-score">${Number(row.opportunity_score)}</div><div><div class="discover-opportunity-title">${escapeHtml(row.title)}</div><div class="discover-opportunity-meta">${demand} · ${escapeHtml(chapters)}${signals}</div></div>${action}</div>`;
  }

  function bind(){
    document.getElementById('discoverRequest')?.addEventListener('click',()=>app.navigate('suggest'));
    bindContentOnly();
    const input=document.getElementById('discoverQuery');
    if(input){input.addEventListener('input',()=>{clearTimeout(searchTimer);query=String(input.value||'').trim();syncClearButton();if(query.length<2){searchPayload=null;rerenderContent();return;}searchPayload=null;rerenderContent();searchTimer=setTimeout(()=>runSearch(query),360);});input.addEventListener('keydown',event=>{if(event.key==='Enter'&&query.length>=2){event.preventDefault();clearTimeout(searchTimer);runSearch(query);}});}
    document.getElementById('discoverClear')?.addEventListener('click',clearSearch);
  }

  function rerenderContent(){
    const host=document.getElementById('discoverContent');if(!host||state.view!=='discover')return;host.innerHTML=contentMarkup();bindContentOnly();refreshIcons();window.DTL_COVERS?.patchCovers?.(host);
  }

  function bindContentOnly(){
    document.getElementById('discoverRetry')?.addEventListener('click',()=>{failed=false;feed=null;loadFeed();});
    document.querySelectorAll('[data-discover-mode]').forEach(button=>button.addEventListener('click',()=>{mode=button.dataset.discoverMode||'fresh_novelpia';rerenderContent();}));
    const language=document.getElementById('discoverLanguage');if(language)language.addEventListener('change',()=>{filters.language=language.value;rerenderContent();});
    const status=document.getElementById('discoverStatus');if(status)status.addEventListener('change',()=>{filters.status=status.value;rerenderContent();});
    const chapters=document.getElementById('discoverChapters');if(chapters)chapters.addEventListener('change',()=>{filters.chapters=Number(chapters.value)||0;rerenderContent();});
    const genre=document.getElementById('discoverGenre');if(genre)genre.addEventListener('change',()=>{filters.genre=genre.value;rerenderContent();});
    document.querySelectorAll('[data-discover-open]').forEach(button=>button.addEventListener('click',()=>openTitle(Number(button.dataset.discoverOpen))));
    document.querySelectorAll('[data-discover-interest]').forEach(button=>button.addEventListener('click',()=>toggleInterest(Number(button.dataset.discoverInterest),button.dataset.next==='1')));
    document.querySelectorAll('[data-catalog-interest]').forEach(button=>button.addEventListener('click',()=>toggleCatalogInterest(Number(button.dataset.catalogInterest),button.dataset.next==='1')));
    document.querySelectorAll('[data-catalog-request]').forEach(button=>button.addEventListener('click',()=>requestCatalog(Number(button.dataset.catalogRequest))));
    document.querySelectorAll('[data-discover-external]').forEach(button=>button.addEventListener('click',()=>useExternal(Number(button.dataset.discoverExternal))));
  }

  function syncClearButton(){
    const shell=document.querySelector('.discover-search-shell');if(!shell)return;let clear=document.getElementById('discoverClear');if(query&&!clear){clear=document.createElement('button');clear.id='discoverClear';clear.type='button';clear.className='discover-search-clear';clear.setAttribute('aria-label',tx('clear'));clear.innerHTML=icon('x');clear.addEventListener('click',clearSearch);shell.appendChild(clear);refreshIcons();}else if(!query&&clear)clear.remove();
  }

  function clearSearch(){query='';searchPayload=null;clearTimeout(searchTimer);const input=document.getElementById('discoverQuery');if(input)input.value='';syncClearButton();rerenderContent();}

  async function loadFeed(){
    loading=true;failed=false;rerenderContent();
    try{
      feed=state.preview?previewFeed():await app.api('/api/app/discovery/feed');
      loading=false;
      if(!(feed?.fresh_novelpia||[]).length&&mode==='fresh_novelpia')mode='trending';
      if(state.bootstrap?.user?.is_admin&&!opportunities){loadOpportunities();}
      rerenderContent();
    }catch(error){loading=false;failed=true;console.warn('discover_feed_failed',error);rerenderContent();}
  }

  async function loadOpportunities(){
    try{opportunities=state.preview?{items:[...(feed?.fresh_novelpia||[]).slice(0,3),...(feed?.most_requested||[]).slice(0,5)].map((row,index)=>({...row,opportunity_score:94-index*5,opportunity_signals:row.kind==='catalog'?['NovelPia new #4','public popularity']:['Dollar TL demand']}))}:await app.api('/api/app/discovery/opportunities');rerenderContent();}catch(error){console.warn('discover_opportunities_failed',error);}
  }

  function previewFresh(){
    const now=Date.now();
    return [
      {kind:'catalog',catalog_id:501,provider:'novelpia',external_id:'401201',title:'아카데미에서 마법사는 퇴근하고 싶다',original_title:'아카데미에서 마법사는 퇴근하고 싶다',author:'새벽작가',original_language:'Korean',chapter_count:24,publication_status:'ongoing',genres_tags:'판타지, 아카데미',source_url:'https://novelpia.com/novel/401201',page_url:'https://novelpia.com/novel/401201',cover_url:null,source_tier:'plus',views_count:18420,favorites_count:971,recommendations_count:288,raw_available:false,demand_count:7,viewer_interested:false,source_rank:4,fresh_signals:['novelpia_plus_new','novelpia_new_rank'],discovered_at:new Date(now-1800000).toISOString(),updated_at:new Date(now-600000).toISOString()},
      {kind:'catalog',catalog_id:502,provider:'novelpia',external_id:'401202',title:'회귀한 용사는 조용히 살고 싶다',original_title:'회귀한 용사는 조용히 살고 싶다',author:'종이달',original_language:'Korean',chapter_count:11,publication_status:'ongoing',genres_tags:'판타지, 회귀',source_url:'https://novelpia.com/novel/401202',page_url:'https://novelpia.com/novel/401202',cover_url:null,source_tier:'free',views_count:5100,favorites_count:318,recommendations_count:102,raw_available:false,demand_count:2,viewer_interested:false,source_rank:null,fresh_signals:['novelpia_free_new'],discovered_at:new Date(now-3600000).toISOString(),updated_at:new Date(now-1200000).toISOString()},
      {kind:'catalog',catalog_id:503,provider:'novelpia',external_id:'401203',title:'악녀의 집사가 되었다',original_title:'악녀의 집사가 되었다',author:'라일락',original_language:'Korean',chapter_count:38,publication_status:'ongoing',genres_tags:'로맨스, 판타지',source_url:'https://novelpia.com/novel/401203',page_url:'https://novelpia.com/novel/401203',cover_url:null,source_tier:'plus',views_count:27900,favorites_count:1402,recommendations_count:611,raw_available:false,demand_count:5,viewer_interested:true,source_rank:9,fresh_signals:['novelpia_plus_new','novelpia_new_rank'],discovered_at:new Date(now-7200000).toISOString(),updated_at:new Date(now-1800000).toISOString()},
    ];
  }

  function previewFeed(){
    const queue=state.bootstrap?.queue||{};
    const rows=[...(queue.active||[]),...(queue.upcoming||[]),...(queue.completed||[])].map((row,index)=>({kind:'local',id:Number(row.id)||index+1,title:row.title||`Novel ${index+1}`,original_language:row.original_language||'Korean',chapter_count:Number(row.chapter_count)||120,publication_status:row.publication_status||'ongoing',genres_tags:row.genres_tags||(['Fantasy','Academy','Romance'][index%3]),request_status:'accepted',queue_status:row.queue_status||(index===0?'in_progress':'queued'),queue_position:row.queue_position||index+1,current_chapter:row.current_chapter||null,demand_count:Math.max(4,34-index*4),recent_interest_count:Math.max(1,8-index),trend_delta:Math.max(0,4-index),viewer_interested:false,own_request:false,raw_available:index%2===0,discovered_at:row.updated_at||new Date(Date.now()-index*86400000).toISOString(),updated_at:row.updated_at||new Date().toISOString()}));
    while(rows.length<8){const i=rows.length;rows.push({kind:'local',id:100+i,title:['The Prince’s Nanny Specializes in Assassination','Academy Villain’s Second Semester','I Found a Dragon Egg','The Saint’s Secret Wedding'][i%4],original_language:'Korean',chapter_count:90+i*47,publication_status:i%4===3?'completed':'ongoing',genres_tags:['Fantasy, Academy','Romance, Fantasy','Adventure, Fantasy','Romance, Villainess'][i%4],request_status:'accepted',queue_status:i%3===0?'queued':null,queue_position:i+2,current_chapter:null,demand_count:42-i*3,recent_interest_count:9-i,trend_delta:4-i%3,viewer_interested:false,own_request:false,raw_available:i%2===0,discovered_at:new Date(Date.now()-i*7200000).toISOString(),updated_at:new Date().toISOString()});}
    const demand=[...rows].sort((a,b)=>b.demand_count-a.demand_count);const trend=[...rows].sort((a,b)=>b.recent_interest_count-a.recent_interest_count||b.demand_count-a.demand_count);const recent=[...rows].sort((a,b)=>String(b.discovered_at).localeCompare(String(a.discovered_at)));return{trending:trend.slice(0,12),most_requested:demand.slice(0,12),raw_available:demand.filter(row=>row.raw_available).slice(0,12),recently_found:recent.slice(0,12),fresh_novelpia:previewFresh(),catalog:demand,novelpia_ingest:{available:true,last_success_at:new Date(Date.now()-600000).toISOString(),item_count:48,degraded:false}};
  }

  async function runSearch(value){
    const seq=++searchSeq;
    try{
      let base,catalog;
      if(state.preview){base=previewSearch(value);catalog={items:(feed?.fresh_novelpia||[]).filter(row=>catalogMatches(row,value)).slice(0,8)};}
      else [base,catalog]=await Promise.all([
        app.api(`/api/app/discovery/search?q=${encodeURIComponent(value)}`),
        app.api(`/api/app/discovery/catalog/search?q=${encodeURIComponent(value)}`).catch(()=>({items:[]})),
      ]);
      if(seq!==searchSeq||query!==value)return;
      searchPayload={...base,catalog:catalog?.items||[]};
      rerenderContent();
    }catch(error){if(seq!==searchSeq)return;searchPayload={error:error?.message||String(error),local:[],catalog:[],external:[]};rerenderContent();}
  }

  function catalogMatches(row,value){
    const q=String(value||'').toLowerCase();
    return [row.title,row.original_title,row.author,row.external_id,row.source_url].some(v=>String(v||'').toLowerCase().includes(q));
  }

  function previewSearch(value){
    const q=value.toLowerCase();const local=(feed?.catalog||[]).filter(row=>String(row.title).toLowerCase().includes(q)||String(row.genres_tags||'').toLowerCase().includes(q)).slice(0,6);return{query:value,provider_status:'ok',local,external:q.includes('174592')||q.includes('nanny')?[{provider:'raw_fucknovelpia',external_id:'174592',title:'The Prince’s Nanny Specializes in Assassination',original_title:'황자의 보모는 암살에 특화되어 있다',author:'NovelPia author',original_language:'Korean',chapter_count:360,publication_status:'ongoing',source_url:'https://novelpia.com/novel/174592',page_url:'https://raw-fucknovelpia.com/novel/174592',raw_available:true,genres_tags:'Fantasy, Romance'}]:[]};
  }

  async function toggleInterest(id,interested){
    try{
      const data=state.preview?{submission_id:id,demand_count:Math.max(1,(findRow(id)?.demand_count||1)+(interested?1:-1)),viewer_interested:interested}:await app.api('/api/app/discovery/interest',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({submission_id:id,interested})});
      updateRow(id,row=>({...row,viewer_interested:Boolean(data.viewer_interested),demand_count:Number(data.demand_count)||row.demand_count}));
      try{app.tg?.HapticFeedback?.selectionChanged?.();}catch{}
      rerenderContent();
    }catch(error){app.toast?.(error?.message||String(error),'error');}
  }

  async function toggleCatalogInterest(id,interested){
    try{
      const current=findCatalog(id);
      const data=state.preview?{catalog_id:id,demand_count:Math.max(0,Number(current?.demand_count||0)+(interested?1:-1)),viewer_interested:interested}:await app.api('/api/app/discovery/catalog/interest',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({catalog_id:id,interested})});
      updateCatalog(id,row=>({...row,viewer_interested:Boolean(data.viewer_interested),demand_count:Number(data.demand_count)||0}));
      try{app.tg?.HapticFeedback?.selectionChanged?.();}catch{}
      rerenderContent();
    }catch(error){app.toast?.(error?.message||String(error),'error');}
  }

  function findRow(id){for(const key of ['trending','most_requested','raw_available','recently_found','catalog']){const row=feed?.[key]?.find(item=>Number(item.id)===Number(id));if(row)return row;}return searchPayload?.local?.find(item=>Number(item.id)===Number(id))||null;}
  function updateRow(id,fn){if(feed)for(const key of ['trending','most_requested','raw_available','recently_found','catalog'])feed[key]=(feed[key]||[]).map(row=>Number(row.id)===Number(id)?fn(row):row);if(searchPayload?.local)searchPayload.local=searchPayload.local.map(row=>Number(row.id)===Number(id)?fn(row):row);if(opportunities?.items)opportunities.items=opportunities.items.map(row=>row.kind!=='catalog'&&Number(row.id)===Number(id)?fn(row):row);}
  function findCatalog(id){return feed?.fresh_novelpia?.find(row=>Number(row.catalog_id)===Number(id))||searchPayload?.catalog?.find(row=>Number(row.catalog_id)===Number(id))||opportunities?.items?.find(row=>row.kind==='catalog'&&Number(row.catalog_id)===Number(id))||null;}
  function updateCatalog(id,fn){if(feed?.fresh_novelpia)feed.fresh_novelpia=feed.fresh_novelpia.map(row=>Number(row.catalog_id)===Number(id)?fn(row):row);if(searchPayload?.catalog)searchPayload.catalog=searchPayload.catalog.map(row=>Number(row.catalog_id)===Number(id)?fn(row):row);if(opportunities?.items)opportunities.items=opportunities.items.map(row=>row.kind==='catalog'&&Number(row.catalog_id)===Number(id)?fn(row):row);}

  function openTitle(id){const row=findRow(id);if(row?.request_status&&row.request_status!=='accepted')return;app.openNovel?.(id);}

  function requestCatalog(id){
    const row=findCatalog(id);if(!row)return;
    state.discoverySource=null;
    state.discoveryAuto={catalog_id:Number(row.catalog_id),provider:'novelpia',external_id:row.external_id||'',title:row.title||'',original_language:'Korean',chapter_count:row.chapter_count||'',publication_status:row.publication_status||'ongoing',source_url:row.source_url||'',genres_tags:row.genres_tags||''};
    if(row.title)state.draft.title=row.title;
    state.draft.original_language='Korean';
    if(row.chapter_count)state.draft.chapter_count=String(row.chapter_count);
    if(row.publication_status)state.draft.publication_status=row.publication_status;
    state.draft.source_url=row.source_url||state.draft.source_url||'';
    if(row.genres_tags&&!state.draft.genres_tags)state.draft.genres_tags=row.genres_tags;
    app.navigate('suggest');
  }

  function useExternal(index){
    const row=searchPayload?.external?.[index];if(!row)return;
    state.discoverySource={...row,kind:'external'};
    state.discoveryAuto={title:row.title||'',original_language:row.original_language||'Korean',chapter_count:row.chapter_count||'',publication_status:row.publication_status||'ongoing',source_url:row.source_url||row.page_url||'',genres_tags:row.genres_tags||''};
    if(row.title)state.draft.title=row.title;
    if(row.original_language)state.draft.original_language=row.original_language;
    if(row.chapter_count)state.draft.chapter_count=String(row.chapter_count);
    if(row.publication_status)state.draft.publication_status=row.publication_status;
    if(!state.draft.source_url)state.draft.source_url=row.source_url||row.page_url||'';
    if(row.genres_tags&&!state.draft.genres_tags)state.draft.genres_tags=row.genres_tags;
    app.navigate('suggest');
  }

  function patchDiscoverNav(){
    const nav=app.bottomNav;if(!nav)return;
    const admin=Boolean(state.bootstrap?.user?.is_admin);
    const original=nav.querySelector(`[data-nav="${admin?'requests':'suggest'}"]`);
    const existing=nav.querySelector('[data-nav="discover"]');
    const button=existing||original;
    if(!button)return;
    button.dataset.nav='discover';
    button.classList.toggle('active',state.view==='discover');
    const label=tx('nav');
    const next=`<span class="nav-icon">⌕</span><span>${escapeHtml(label)}</span>`;
    if(button.innerHTML!==next)button.innerHTML=next;
    button.setAttribute('aria-label',label);
  }

  const navObserver=new MutationObserver(()=>patchDiscoverNav());
  if(app.bottomNav)navObserver.observe(app.bottomNav,{childList:true});
  document.addEventListener('dtl:viewchange',()=>queueMicrotask(patchDiscoverNav));
  document.addEventListener('dtl:localechange',()=>{queueMicrotask(patchDiscoverNav);if(state.view==='discover')renderDiscover();});

  app.registerView('discover',renderDiscover);
  queueMicrotask(patchDiscoverNav);
})();

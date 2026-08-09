(() => {
  const supported = new Set(['en','es','fil','hi','pt','id','vi','fr','de','ru']);
  const tgLocale = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code;
  let locale = supported.has(tgLocale) ? tgLocale : 'en';
  let accountPlan = null;

  const languageNames = {
    en:{ko:'Korean',ja:'Japanese',zh:'Chinese',en:'English',ru:'Russian',es:'Spanish',pt:'Portuguese',id:'Indonesian',vi:'Vietnamese',fr:'French',de:'German',hi:'Hindi',fil:'Filipino'},
    ru:{ko:'Корейский',ja:'Японский',zh:'Китайский',en:'Английский',ru:'Русский',es:'Испанский',pt:'Португальский',id:'Индонезийский',vi:'Вьетнамский',fr:'Французский',de:'Немецкий',hi:'Хинди',fil:'Филиппинский'},
    es:{ko:'Coreano',ja:'Japonés',zh:'Chino',en:'Inglés',ru:'Ruso',es:'Español',pt:'Portugués',id:'Indonesio',vi:'Vietnamita',fr:'Francés',de:'Alemán',hi:'Hindi',fil:'Filipino'},
    fil:{ko:'Koreano',ja:'Hapon',zh:'Tsino',en:'Ingles',ru:'Ruso',es:'Espanyol',pt:'Portuges',id:'Indones',vi:'Biyetnames',fr:'Pranses',de:'Aleman',hi:'Hindi',fil:'Filipino'},
    hi:{ko:'कोरियाई',ja:'जापानी',zh:'चीनी',en:'अंग्रेज़ी',ru:'रूसी',es:'स्पेनिश',pt:'पुर्तगाली',id:'इंडोनेशियाई',vi:'वियतनामी',fr:'फ़्रेंच',de:'जर्मन',hi:'हिंदी',fil:'फ़िलिपिनो'},
    pt:{ko:'Coreano',ja:'Japonês',zh:'Chinês',en:'Inglês',ru:'Russo',es:'Espanhol',pt:'Português',id:'Indonésio',vi:'Vietnamita',fr:'Francês',de:'Alemão',hi:'Hindi',fil:'Filipino'},
    id:{ko:'Korea',ja:'Jepang',zh:'Tionghoa',en:'Inggris',ru:'Rusia',es:'Spanyol',pt:'Portugis',id:'Indonesia',vi:'Vietnam',fr:'Prancis',de:'Jerman',hi:'Hindi',fil:'Filipino'},
    vi:{ko:'Tiếng Hàn',ja:'Tiếng Nhật',zh:'Tiếng Trung',en:'Tiếng Anh',ru:'Tiếng Nga',es:'Tiếng Tây Ban Nha',pt:'Tiếng Bồ Đào Nha',id:'Tiếng Indonesia',vi:'Tiếng Việt',fr:'Tiếng Pháp',de:'Tiếng Đức',hi:'Tiếng Hindi',fil:'Tiếng Filipino'},
    fr:{ko:'Coréen',ja:'Japonais',zh:'Chinois',en:'Anglais',ru:'Russe',es:'Espagnol',pt:'Portugais',id:'Indonésien',vi:'Vietnamien',fr:'Français',de:'Allemand',hi:'Hindi',fil:'Filipino'},
    de:{ko:'Koreanisch',ja:'Japanisch',zh:'Chinesisch',en:'Englisch',ru:'Russisch',es:'Spanisch',pt:'Portugiesisch',id:'Indonesisch',vi:'Vietnamesisch',fr:'Französisch',de:'Deutsch',hi:'Hindi',fil:'Filipino'},
  };

  const copy = {
    en:{thanks:'Thank you for supporting novel translations.',regular:n=>`Novels up to ${n} chapters.`,guideSub:'A clear path from request to translation',rulesSub:'Submission requirements and content restrictions',chatSub:'Questions, notifications and chat fallback',boostySub:'5 requests per month · no 250-chapter restriction',progress:'Chapter Progress',noRequests:'No requests yet.',noMatching:'No matching requests.',nothing:'Nothing here yet.',edit:'Edit',howIntro:'From your first request to the start of translation, every step stays visible and predictable.',how:[['Submit a novel','Upload the raw file and provide the title, language, chapter count, tags and important content notes.'],['Manual review','We check every request against Dollar TL rules and make sure the information is complete.'],['Public queue','Accepted novels are added to the public translation queue, where their status and position can be tracked.'],['Telegram updates','You receive Telegram notifications when the request is accepted, translation starts, or the work is completed.']],rulesIntro:'Please provide complete and accurate information before submitting a novel.',required:'What you must disclose',requiredItems:['Raw/original file','Main genres and tags','All fetishes, kinks and sexual content','Any extreme, disturbing, controversial or potentially sensitive content'],blocked:'Not accepted',repost:'Translation & reposting rules',repostCopy:'Do not copy, repost, reupload, mirror or publish Dollar TL translations elsewhere without permission. Sharing a link to the original translation is completely fine.'},
    ru:{thanks:'Спасибо за поддержку переводов новелл.',regular:n=>`Новеллы до ${n} глав.`,guideSub:'Понятный путь от заявки до начала перевода',rulesSub:'Требования к заявкам и ограничения по контенту',chatSub:'Вопросы, уведомления и резервная работа через чат',boostySub:'5 заявок в месяц · ограничение в 250 глав не действует',progress:'Прогресс перевода',noRequests:'Заявок пока нет.',noMatching:'Подходящих заявок не найдено.',nothing:'Здесь пока ничего нет.',edit:'Изменить',howIntro:'От первой заявки до начала перевода каждый этап остаётся понятным и отслеживаемым.',how:[['Предложите новеллу','Загрузите raw-файл и укажите название, язык, количество глав, теги и важную информацию о контенте.'],['Ручная проверка','Мы проверяем каждую заявку по правилам Dollar TL и смотрим, достаточно ли информации для решения.'],['Публичная очередь','Принятые новеллы попадают в общую очередь переводов, где можно следить за статусом и позицией.'],['Уведомления в Telegram','Бот сообщит, когда заявка принята, перевод начался или работа завершена.']],rulesIntro:'Перед отправкой новеллы укажите всю важную информацию честно и полностью.',required:'Что обязательно указать',requiredItems:['Raw/оригинальный файл','Основные жанры и теги','Все фетиши, кинки и сексуальный контент','Любой экстремальный, тревожный, спорный или потенциально чувствительный контент'],blocked:'Мы не принимаем новеллы, содержащие',repost:'Правила переводов и репостов',repostCopy:'Нельзя без разрешения копировать, репостить, перезаливать, зеркалить или публиковать переводы Dollar TL на других сайтах, в приложениях, на платформах или в сообществах. Делиться ссылкой на оригинальную публикацию перевода можно.'},
    es:{thanks:'Gracias por apoyar las traducciones de novelas.',regular:n=>`Novelas de hasta ${n} capítulos.`,guideSub:'Un proceso claro desde la solicitud hasta la traducción',rulesSub:'Requisitos de envío y restricciones de contenido',chatSub:'Preguntas, avisos y acceso alternativo por chat',boostySub:'5 solicitudes al mes · sin límite de 250 capítulos',progress:'Progreso de traducción',noRequests:'Aún no hay solicitudes.',noMatching:'No hay solicitudes que coincidan.',nothing:'Todavía no hay nada aquí.',edit:'Editar',howIntro:'Cada etapa, desde la solicitud hasta el inicio de la traducción, es clara y fácil de seguir.',how:[['Envía una novela','Sube el archivo original y añade título, idioma, capítulos, etiquetas y notas de contenido.'],['Revisión manual','Revisamos cada solicitud según las reglas de Dollar TL.'],['Cola pública','Las novelas aceptadas entran en la cola pública de traducción.'],['Avisos en Telegram','Recibirás avisos cuando se acepte, empiece o termine la traducción.']],rulesIntro:'Proporciona información completa y precisa antes de enviar una novela.',required:'Debes indicar',requiredItems:['Archivo original/raw','Géneros y etiquetas principales','Fetiches, kinks y contenido sexual','Contenido extremo, perturbador, polémico o sensible'],blocked:'No se acepta',repost:'Traducciones y republicación',repostCopy:'No copies, resubas, reflejes ni publiques traducciones de Dollar TL en otros sitios sin permiso. Compartir el enlace original sí está permitido.'},
    fil:{thanks:'Salamat sa pagsuporta sa mga pagsasalin ng nobela.',regular:n=>`Mga nobelang hanggang ${n} kabanata.`,guideSub:'Malinaw na proseso mula kahilingan hanggang pagsasalin',rulesSub:'Mga tuntunin sa pagsusumite at nilalaman',chatSub:'Mga tanong, abiso at backup na chat',boostySub:'5 kahilingan bawat buwan · walang 250-kabanatang limitasyon',progress:'Progreso ng pagsasalin',noRequests:'Wala pang mga kahilingan.',noMatching:'Walang tumutugmang kahilingan.',nothing:'Wala pa rito.',edit:'I-edit',howIntro:'Madaling sundan ang bawat hakbang mula pagsusumite hanggang pagsisimula ng pagsasalin.',how:[['Magsumite ng nobela','I-upload ang raw file at ilagay ang pamagat, wika, kabanata, tags at mahahalagang content note.'],['Manwal na pagsusuri','Sinusuri namin ang bawat kahilingan ayon sa mga tuntunin ng Dollar TL.'],['Pampublikong pila','Ang mga tinanggap na nobela ay napupunta sa pampublikong pila.'],['Mga abiso sa Telegram','Aabisuhan ka kapag tinanggap, sinimulan o natapos ang pagsasalin.']],rulesIntro:'Magbigay ng kumpleto at tumpak na impormasyon bago magsumite.',required:'Kailangang ilahad',requiredItems:['Raw/original file','Pangunahing genre at tags','Lahat ng fetish, kink at sexual content','Extreme, disturbing, controversial o sensitive content'],blocked:'Hindi tinatanggap',repost:'Pagsasalin at repost',repostCopy:'Huwag kopyahin, i-reupload, i-mirror o ilathala ang mga salin ng Dollar TL sa ibang lugar nang walang pahintulot. Puwedeng ibahagi ang link sa orihinal.'},
    hi:{thanks:'उपन्यास अनुवादों का समर्थन करने के लिए धन्यवाद।',regular:n=>`${n} अध्याय तक के उपन्यास।`,guideSub:'अनुरोध से अनुवाद तक स्पष्ट प्रक्रिया',rulesSub:'सबमिशन आवश्यकताएँ और कंटेंट प्रतिबंध',chatSub:'सवाल, सूचनाएँ और चैट बैकअप',boostySub:'हर महीने 5 अनुरोध · 250 अध्याय की सीमा लागू नहीं',progress:'अनुवाद प्रगति',noRequests:'अभी कोई अनुरोध नहीं है।',noMatching:'कोई मेल खाता अनुरोध नहीं मिला।',nothing:'यहाँ अभी कुछ नहीं है।',edit:'संपादित करें',howIntro:'अनुरोध से लेकर अनुवाद शुरू होने तक हर चरण स्पष्ट और ट्रैक करने योग्य है।',how:[['उपन्यास भेजें','Raw फ़ाइल अपलोड करें और शीर्षक, भाषा, अध्याय, टैग तथा महत्वपूर्ण कंटेंट जानकारी दें।'],['मैनुअल समीक्षा','हर अनुरोध Dollar TL के नियमों के अनुसार जाँचा जाता है।'],['सार्वजनिक कतार','स्वीकृत उपन्यास सार्वजनिक अनुवाद कतार में जाते हैं।'],['Telegram सूचनाएँ','स्वीकृति, अनुवाद शुरू होने और पूरा होने पर आपको सूचना मिलेगी।']],rulesIntro:'सबमिट करने से पहले पूरी और सही जानकारी दें।',required:'क्या बताना आवश्यक है',requiredItems:['Raw/original फ़ाइल','मुख्य genres और tags','सभी fetishes, kinks और sexual content','Extreme, disturbing, controversial या sensitive content'],blocked:'स्वीकार नहीं किया जाता',repost:'अनुवाद और repost नियम',repostCopy:'बिना अनुमति Dollar TL अनुवादों को कॉपी, reupload, mirror या कहीं और प्रकाशित न करें। मूल लिंक साझा करना ठीक है।'},
    pt:{thanks:'Obrigado por apoiar as traduções de novels.',regular:n=>`Novels de até ${n} capítulos.`,guideSub:'Um caminho claro do pedido até a tradução',rulesSub:'Requisitos de envio e restrições de conteúdo',chatSub:'Dúvidas, notificações e acesso alternativo pelo chat',boostySub:'5 pedidos por mês · sem limite de 250 capítulos',progress:'Progresso da tradução',noRequests:'Ainda não há pedidos.',noMatching:'Nenhum pedido correspondente.',nothing:'Ainda não há nada aqui.',edit:'Editar',howIntro:'Cada etapa, do pedido ao início da tradução, permanece clara e fácil de acompanhar.',how:[['Envie uma novel','Faça upload do arquivo raw e informe título, idioma, capítulos, tags e observações importantes.'],['Revisão manual','Cada pedido é revisado de acordo com as regras da Dollar TL.'],['Fila pública','Novels aceitas entram na fila pública de tradução.'],['Notificações no Telegram','Você recebe avisos quando o pedido é aceito, iniciado ou concluído.']],rulesIntro:'Forneça informações completas e corretas antes de enviar.',required:'Informe obrigatoriamente',requiredItems:['Arquivo raw/original','Principais gêneros e tags','Todos os fetiches, kinks e conteúdo sexual','Conteúdo extremo, perturbador, controverso ou sensível'],blocked:'Não aceitamos',repost:'Traduções e repostagens',repostCopy:'Não copie, reenvie, espelhe ou publique traduções da Dollar TL em outros lugares sem permissão. Compartilhar o link original é permitido.'},
    id:{thanks:'Terima kasih telah mendukung terjemahan novel.',regular:n=>`Novel hingga ${n} bab.`,guideSub:'Alur jelas dari permintaan hingga penerjemahan',rulesSub:'Syarat pengajuan dan batasan konten',chatSub:'Pertanyaan, notifikasi, dan akses cadangan lewat chat',boostySub:'5 permintaan per bulan · tanpa batas 250 bab',progress:'Progres terjemahan',noRequests:'Belum ada permintaan.',noMatching:'Tidak ada permintaan yang cocok.',nothing:'Belum ada apa pun di sini.',edit:'Edit',howIntro:'Setiap tahap dari pengajuan sampai penerjemahan dimulai tetap jelas dan mudah dilacak.',how:[['Ajukan novel','Unggah file raw lalu isi judul, bahasa, jumlah bab, tag dan catatan konten penting.'],['Tinjauan manual','Setiap permintaan diperiksa sesuai aturan Dollar TL.'],['Antrean publik','Novel yang diterima masuk ke antrean terjemahan publik.'],['Notifikasi Telegram','Anda mendapat pemberitahuan saat diterima, mulai diterjemahkan, atau selesai.']],rulesIntro:'Berikan informasi lengkap dan akurat sebelum mengajukan novel.',required:'Wajib dicantumkan',requiredItems:['File raw/original','Genre dan tag utama','Semua fetish, kink dan konten seksual','Konten ekstrem, mengganggu, kontroversial atau sensitif'],blocked:'Tidak diterima',repost:'Aturan terjemahan dan repost',repostCopy:'Jangan menyalin, mengunggah ulang, mirror, atau menerbitkan terjemahan Dollar TL di tempat lain tanpa izin. Membagikan tautan asli diperbolehkan.'},
    vi:{thanks:'Cảm ơn bạn đã ủng hộ các bản dịch tiểu thuyết.',regular:n=>`Tiểu thuyết tối đa ${n} chương.`,guideSub:'Quy trình rõ ràng từ yêu cầu đến bản dịch',rulesSub:'Yêu cầu gửi và giới hạn nội dung',chatSub:'Câu hỏi, thông báo và phương án dự phòng qua chat',boostySub:'5 yêu cầu mỗi tháng · không áp dụng giới hạn 250 chương',progress:'Tiến độ dịch',noRequests:'Chưa có yêu cầu nào.',noMatching:'Không có yêu cầu phù hợp.',nothing:'Chưa có gì ở đây.',edit:'Chỉnh sửa',howIntro:'Mọi bước từ gửi yêu cầu đến khi bắt đầu dịch đều rõ ràng và dễ theo dõi.',how:[['Gửi tiểu thuyết','Tải file raw và cung cấp tiêu đề, ngôn ngữ, số chương, tag và ghi chú nội dung quan trọng.'],['Kiểm duyệt thủ công','Mỗi yêu cầu được kiểm tra theo quy định Dollar TL.'],['Hàng đợi công khai','Tiểu thuyết được duyệt sẽ vào hàng đợi dịch công khai.'],['Thông báo Telegram','Bạn sẽ được báo khi yêu cầu được duyệt, bắt đầu dịch hoặc hoàn thành.']],rulesIntro:'Hãy cung cấp thông tin đầy đủ và chính xác trước khi gửi.',required:'Bắt buộc khai báo',requiredItems:['File raw/original','Thể loại và tag chính','Mọi fetish, kink và nội dung tình dục','Nội dung cực đoan, gây khó chịu, gây tranh cãi hoặc nhạy cảm'],blocked:'Không chấp nhận',repost:'Quy định dịch và đăng lại',repostCopy:'Không sao chép, đăng lại, mirror hoặc xuất bản bản dịch Dollar TL ở nơi khác nếu chưa được phép. Có thể chia sẻ liên kết bản dịch gốc.'},
    fr:{thanks:'Merci de soutenir les traductions de romans.',regular:n=>`Romans jusqu’à ${n} chapitres.`,guideSub:'Un parcours clair de la demande à la traduction',rulesSub:'Conditions de soumission et restrictions de contenu',chatSub:'Questions, notifications et accès de secours par chat',boostySub:'5 demandes par mois · aucune limite de 250 chapitres',progress:'Progression de la traduction',noRequests:'Aucune demande pour le moment.',noMatching:'Aucune demande correspondante.',nothing:'Rien ici pour le moment.',edit:'Modifier',howIntro:'Chaque étape, de la demande au début de la traduction, reste claire et facile à suivre.',how:[['Proposez un roman','Importez le fichier raw et indiquez le titre, la langue, les chapitres, les tags et les informations importantes.'],['Vérification manuelle','Chaque demande est vérifiée selon les règles Dollar TL.'],['File publique','Les romans acceptés rejoignent la file publique de traduction.'],['Notifications Telegram','Vous êtes averti lorsque la demande est acceptée, commence ou est terminée.']],rulesIntro:'Fournissez des informations complètes et exactes avant l’envoi.',required:'À déclarer obligatoirement',requiredItems:['Fichier raw/original','Genres et tags principaux','Tous les fétiches, kinks et contenus sexuels','Tout contenu extrême, dérangeant, controversé ou sensible'],blocked:'Non accepté',repost:'Traductions et republication',repostCopy:'Ne copiez, republiez, reuploadez, mirror ou publiez pas les traductions Dollar TL ailleurs sans autorisation. Le partage du lien original est autorisé.'},
    de:{thanks:'Danke für deine Unterstützung der Novel-Übersetzungen.',regular:n=>`Novels mit bis zu ${n} Kapiteln.`,guideSub:'Ein klarer Ablauf von der Anfrage bis zur Übersetzung',rulesSub:'Einreichungsregeln und Inhaltsbeschränkungen',chatSub:'Fragen, Benachrichtigungen und Chat als Ausweichmöglichkeit',boostySub:'5 Anfragen pro Monat · keine 250-Kapitel-Grenze',progress:'Übersetzungsfortschritt',noRequests:'Noch keine Anfragen.',noMatching:'Keine passenden Anfragen.',nothing:'Hier ist noch nichts.',edit:'Bearbeiten',howIntro:'Jeder Schritt von der Anfrage bis zum Übersetzungsstart bleibt klar und nachvollziehbar.',how:[['Novel einreichen','Raw-Datei hochladen und Titel, Sprache, Kapitelzahl, Tags und wichtige Inhaltsangaben ergänzen.'],['Manuelle Prüfung','Jede Anfrage wird nach den Dollar-TL-Regeln geprüft.'],['Öffentliche Warteschlange','Angenommene Novels kommen in die öffentliche Übersetzungswarteschlange.'],['Telegram-Benachrichtigungen','Du wirst informiert, wenn die Anfrage angenommen, gestartet oder abgeschlossen wird.']],rulesIntro:'Bitte gib vor dem Absenden vollständige und korrekte Informationen an.',required:'Pflichtangaben',requiredItems:['Raw-/Originaldatei','Wichtigste Genres und Tags','Alle Fetische, Kinks und sexuellen Inhalte','Extreme, verstörende, kontroverse oder sensible Inhalte'],blocked:'Nicht akzeptiert',repost:'Übersetzungs- und Repost-Regeln',repostCopy:'Dollar-TL-Übersetzungen dürfen ohne Erlaubnis nicht kopiert, erneut hochgeladen, gespiegelt oder anderswo veröffentlicht werden. Der Link zur Originalübersetzung darf geteilt werden.'},
  };

  const prohibited = {
    en:['Guro, extreme gore, mutilation, dismemberment or graphic body horror','Sexual or sexualized content involving minors or underage characters','Bestiality / zoophilia','Necrophilia','Scat / coprophilia / human toilet','Snuff','Extreme or sexualized torture','Cannibalism','Vomit / emetophilia fetish content','Parasite / infestation fetish content','Unbirthing or similar extreme fetish content','Futanari / futa','A female main character','Real people used as characters','Gender bender (MtF)','Other extreme fetish, disturbing or shock content at our discretion'],
    ru:['Гуро, экстремальный gore, увечья, расчленение или графический body horror','Любой сексуальный или сексуализированный контент с несовершеннолетними персонажами','Зоофилия / bestiality','Некрофилия','Scat / копрофилия / human toilet','Snuff','Экстремальные или сексуализированные пытки','Каннибализм','Фетиш на рвоту / эметофилия','Фетиш на паразитов / заражение','Unbirthing и схожий экстремальный фетиш-контент','Futanari / futa','Главная героиня-женщина','Реальные люди в качестве персонажей','Gender bender (MtF)','Другой экстремальный фетиш-, тревожный или шок-контент по усмотрению команды'],
  };
  const genericBlocked = ['Guro / extreme gore / graphic body horror','Sexualized minors','Bestiality / zoophilia','Necrophilia','Scat / coprophilia / human toilet','Snuff','Extreme or sexualized torture','Cannibalism','Vomit / emetophilia fetish','Parasite / infestation fetish','Unbirthing or similar extreme fetish content','Futanari / futa','Female main character','Real people as characters','Gender bender (MtF)','Other extreme or shock fetish content'];

  const localeNameToCode = {English:'en','Español':'es',Filipino:'fil','हिन्दी':'hi','Português':'pt','Bahasa Indonesia':'id','Tiếng Việt':'vi','Français':'fr','Deutsch':'de','Русский':'ru'};

  const langPatterns = {
    ko:/(?:\bkorean\b|\bkoreano\b|\bcoreano\b|\bcoréen\b|\bkoreanisch\b|корей\w*|한국어|한국말|tiếng hàn|कोरियाई|bahasa korea)/i,
    ja:/(?:\bjapanese\b|\bjaponés\b|\bjaponês\b|\bjaponais\b|\bjapanisch\b|япон\w*|日本語|tiếng nhật|जापानी|bahasa jepang|\bhapon\b)/i,
    zh:/(?:\bchinese\b|\bchino\b|\bchinês\b|\bchinois\b|\bchinesisch\b|китай\w*|中文|汉语|漢語|tiếng trung|चीनी|tionghoa|\btsino\b)/i,
    en:/(?:\benglish\b|\binglés\b|\binglês\b|\banglais\b|\benglisch\b|англ\w*|tiếng anh|अंग्रेज़ी|\bingles\b|\binggris\b)/i,
    ru:/(?:\brussian\b|\bruso\b|\brusso\b|\brusse\b|\brussisch\b|русск\w*|tiếng nga|रूसी|\brusia\b)/i,
    es:/(?:\bspanish\b|\bespañol\b|\bespanhol\b|\bespagnol\b|\bspanisch\b|испан\w*|tiếng tây ban nha|स्पेनिश|\bespanyol\b|\bspanyol\b)/i,
    pt:/(?:\bportuguese\b|\bportuguês\b|\bportugais\b|\bportugiesisch\b|португал\w*|tiếng bồ đào nha|पुर्तगाली|\bportuges\b|\bportugis\b)/i,
    id:/(?:\bindonesian\b|\bindonesio\b|\bindonésio\b|\bindonésien\b|\bindonesisch\b|индонез\w*|tiếng indonesia|इंडोनेशियाई|bahasa indonesia)/i,
    vi:/(?:\bvietnamese\b|\bvietnamita\b|\bvietnamien\b|\bvietnamesisch\b|вьетнам\w*|tiếng việt|वियतनामी|\bbiyetnames\b)/i,
    fr:/(?:\bfrench\b|\bfrancés\b|\bfrancês\b|\bfrançais\b|\bfranzösisch\b|француз\w*|tiếng pháp|फ़्रेंच|\bpranses\b|\bprancis\b)/i,
    de:/(?:\bgerman\b|\balemán\b|\balemão\b|\ballemand\b|\bdeutsch\b|немец\w*|tiếng đức|जर्मन|\baleman\b|\bjerman\b)/i,
    hi:/(?:\bhindi\b|\bहिंदी\b|\bहिन्दी\b|хинди)/i,
    fil:/(?:\bfilipino\b|\btagalog\b|филиппин\w*)/i,
  };

  function activeCopy(){ return copy[locale] || copy.en; }
  function normalizeLocale(value){ const v=String(value||'').toLowerCase().split('-')[0]; return supported.has(v)?v:'en'; }
  function languageCode(raw){ const clean=String(raw||'').normalize('NFKC').replace(/[\u{1F1E6}-\u{1F1FF}]/gu,' ').trim(); for(const [code,re] of Object.entries(langPatterns)){ if(re.test(clean)) return code; } const short=clean.toLowerCase().replace(/[^a-z]/g,''); const shortMap={ko:'ko',kr:'ko',ja:'ja',jp:'ja',zh:'zh',cn:'zh',en:'en',gb:'en',ru:'ru',es:'es',pt:'pt',id:'id',vi:'vi',fr:'fr',de:'de',hi:'hi',fil:'fil'}; return shortMap[short]||null; }
  function localizedLanguage(code){ return (languageNames[locale]||languageNames.en)[code] || (languageNames.en[code]||code); }
  function replaceLanguageText(text){
    let out=String(text||'').replace(/[\u{1F1E6}-\u{1F1FF}]/gu,'').replace(/^\s*(?:KR|KO|JP|JA|CN|ZH|GB|EN)\s+(?=[A-Za-zА-Яа-яÀ-ÿ])/i,'').trimStart();
    for(const [code,re] of Object.entries(langPatterns)){ if(re.test(out)) out=out.replace(re,localizedLanguage(code)); }
    return out;
  }

  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const response = await nativeFetch(...args);
    try {
      const input = args[0];
      const url = typeof input === 'string' ? input : input?.url || '';
      if (url.includes('/api/app/bootstrap')) {
        response.clone().json().then((data) => {
          locale = normalizeLocale(data?.user?.locale || locale);
          accountPlan = data?.account?.plan || accountPlan;
          schedule();
        }).catch(()=>{});
      }
      if (url.includes('/api/app/language') && response.ok) {
        const options=args[1]||{};
        const body=typeof options.body==='string'?JSON.parse(options.body):null;
        if(body?.locale){locale=normalizeLocale(body.locale);schedule();}
      }
    } catch {}
    return response;
  };

  function inferLocaleFromDom(){
    const value=document.querySelector('#languageSetting .setting-sub')?.textContent?.trim();
    if(value && localeNameToCode[value]) locale=localeNameToCode[value];
  }

  function polishAccount(){
    const note=document.querySelector('.premium-note');
    if(!note)return;
    const t=activeCopy();
    const subscriber=accountPlan==='subscriber' || /Boosty/i.test(document.querySelector('.premium-name')?.textContent||'');
    if(subscriber) note.textContent=t.thanks;
    else {
      const match=note.textContent.match(/(\d+)/);
      note.textContent=t.regular(Number(match?.[1]||250));
    }
  }

  function polishSettings(){
    const t=activeCopy();
    const descriptions={guideSetting:t.guideSub,rulesSetting:t.rulesSub,chatSetting:t.chatSub,boostySetting:t.boostySub};
    for(const [id,text] of Object.entries(descriptions)){
      const el=document.querySelector(`#${id} .setting-sub`);
      if(el)el.textContent=text;
    }
  }

  function polishLanguages(){
    document.querySelectorAll('.novel-meta').forEach((meta)=>{
      const spans=[...meta.querySelectorAll(':scope > span')];
      spans.forEach((span)=>{
        const code=languageCode(span.textContent);
        if(!code)return;
        if(span.dataset.langLocale===locale)return;
        span.dataset.langLocale=locale;
        span.innerHTML=`<span class="localized-language"><i data-lucide="globe-2" aria-hidden="true"></i><span>${localizedLanguage(code)}</span></span>`;
      });
    });
    document.querySelectorAll('.list-meta,.admin-meta,.review-sub,.info-value').forEach((el)=>{
      if(el.dataset.langLocale===locale)return;
      const before=el.textContent;
      const after=replaceLanguageText(before);
      if(after!==before){
        const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);
        const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
        nodes.forEach((node)=>{node.nodeValue=replaceLanguageText(node.nodeValue);});
        el.dataset.langLocale=locale;
      }
    });
    const input=document.getElementById('draftLanguage');
    if(input && document.activeElement!==input){const code=languageCode(input.value);if(code)input.value=localizedLanguage(code);}
  }

  function polishHardcoded(){
    const t=activeCopy();
    document.querySelectorAll('.progress-labels span').forEach((el)=>{if(el.textContent.trim()==='Chapter Progress'||el.dataset.progressPolished) {el.textContent=t.progress;el.dataset.progressPolished='1';}});
    document.querySelectorAll('.empty-state p').forEach((el)=>{
      const s=el.textContent.trim();
      if(s==='No requests yet.')el.textContent=t.noRequests;
      else if(s==='No matching requests.')el.textContent=t.noMatching;
      else if(s==='Nothing here.')el.textContent=t.nothing;
    });
    document.querySelectorAll('.edit-link').forEach((el)=>{if(/edit/i.test(el.textContent)) {const icon=el.querySelector('svg,[data-lucide]');el.textContent=t.edit;if(icon)el.prepend(icon);}});
    document.querySelectorAll('.updated-text,.admin-meta').forEach((el)=>localizeRelativeTime(el));
  }

  function localizeRelativeTime(el){
    if(locale==='en')return;
    const map={
      ru:{now:'только что',m:n=>`${n} мин назад`,h:n=>`${n} ч назад`,d:n=>`${n} дн назад`},
      es:{now:'ahora mismo',m:n=>`hace ${n} min`,h:n=>`hace ${n} h`,d:n=>`hace ${n} d`},
      fil:{now:'ngayon lang',m:n=>`${n} min ang nakalipas`,h:n=>`${n} oras ang nakalipas`,d:n=>`${n} araw ang nakalipas`},
      hi:{now:'अभी',m:n=>`${n} मिनट पहले`,h:n=>`${n} घंटे पहले`,d:n=>`${n} दिन पहले`},
      pt:{now:'agora mesmo',m:n=>`há ${n} min`,h:n=>`há ${n} h`,d:n=>`há ${n} d`},
      id:{now:'baru saja',m:n=>`${n} mnt lalu`,h:n=>`${n} jam lalu`,d:n=>`${n} hari lalu`},
      vi:{now:'vừa xong',m:n=>`${n} phút trước`,h:n=>`${n} giờ trước`,d:n=>`${n} ngày trước`},
      fr:{now:'à l’instant',m:n=>`il y a ${n} min`,h:n=>`il y a ${n} h`,d:n=>`il y a ${n} j`},
      de:{now:'gerade eben',m:n=>`vor ${n} Min.`,h:n=>`vor ${n} Std.`,d:n=>`vor ${n} T.`},
    }[locale];
    if(!map)return;
    const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
    nodes.forEach(node=>{let s=node.nodeValue||'';s=s.replace(/just now/g,map.now).replace(/(\d+) min ago/g,(_,n)=>map.m(n)).replace(/(\d+) h ago/g,(_,n)=>map.h(n)).replace(/(\d+) d ago/g,(_,n)=>map.d(n));node.nodeValue=s;});
  }

  function rulesMarkup(){
    const t=activeCopy();
    const blocked=prohibited[locale]||genericBlocked;
    return `<div class="rich-intro">${t.rulesIntro}</div><div class="rich-section"><div class="rich-section-title">${t.required}</div><ul class="rule-list">${t.requiredItems.map(x=>`<li>${x}</li>`).join('')}</ul></div><div class="rich-section"><div class="rich-section-title">${t.blocked}</div><ul class="rule-list prohibited">${blocked.map(x=>`<li>${x}</li>`).join('')}</ul></div><div class="rule-note"><strong>${t.repost}</strong><br>${t.repostCopy}</div>`;
  }
  function howMarkup(){
    const t=activeCopy();
    return `<div class="rich-intro">${t.howIntro}</div><div class="flow-steps">${t.how.map((step,i)=>`<div class="flow-step"><div class="flow-step-number">${i+1}</div><div><div class="flow-step-title">${step[0]}</div><div class="flow-step-copy">${step[1]}</div></div></div>`).join('')}</div>`;
  }
  function polishSheet(){
    const sheet=document.querySelector('.sheet-copy');if(!sheet)return;
    const raw=sheet.textContent.trim();
    if(raw.startsWith('1. Suggest a novel.')){sheet.classList.add('rich-sheet');sheet.innerHTML=howMarkup();}
    else if(raw.startsWith('Do not hide important tags')){sheet.classList.add('rich-sheet');sheet.innerHTML=rulesMarkup();}
  }

  function polish(){
    inferLocaleFromDom();
    document.documentElement.lang=locale;
    polishAccount();
    polishSettings();
    polishLanguages();
    polishHardcoded();
    polishSheet();
  }

  let raf=0;
  function schedule(){if(raf)return;raf=requestAnimationFrame(()=>{raf=0;polish();});}
  const observer=new MutationObserver(schedule);
  observer.observe(document.documentElement,{childList:true,subtree:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
})();

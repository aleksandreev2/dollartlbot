import { normalizeLocale, type Locale } from './i18n/index';

export type ReaderCopy = {
  library: string;
  latestUpdates: string;
  openTitle: string;
  rating: string;
  rateTitle: string;
  download: string;
  thankYou: string;
  thankYouRequired: string;
  preparing: string;
  quotaReached: string;
  quotaStatus: (used: number, limit: number) => string;
  boostyUnlimited: string;
  termsTitle: string;
  termsBody: string;
  termsAccept: string;
  filesSent: string;
};

const copies: Record<Locale, ReaderCopy> = {
  en: c('Library','Latest updates','Open title','Rating','Rate this title','Download','Thank you.','Tap Thank you before opening the private download link.','Preparing your files…','Daily download limit reached.',(u,l)=>`Daily limit: ${u}/${l} novels`,'Boosty — unlimited downloads','Personal use only','Publishing, re-uploading or distributing this Dollar TL translation on other websites, apps, channels or file archives without permission is prohibited by the project rules. Downloaded files may contain an individual distribution identifier.','I understand, continue','Your files were sent in the private bot chat.'),
  ru: c('Библиотека','Последние обновления','Открыть тайтл','Рейтинг','Оценить тайтл','Скачать','Спасибо.','Сначала нажмите «Спасибо», и только потом открывайте личную ссылку на скачивание.','Готовим файлы…','Дневной лимит скачиваний исчерпан.',(u,l)=>`Дневной лимит: ${u}/${l} новелл`,'Boosty — безлимитные скачивания','Только для личного использования','Публикация, перезалив или распространение перевода Dollar TL на других сайтах, в приложениях, каналах и файловых архивах без разрешения запрещены правилами проекта. Загружаемые файлы могут содержать индивидуальный идентификатор распространения.','Понятно, продолжить','Файлы отправлены в личный чат с ботом.'),
  es: c('Biblioteca','Últimas actualizaciones','Abrir título','Valoración','Valorar este título','Descargar','Gracias.','Pulsa Gracias antes de abrir el enlace privado de descarga.','Preparando tus archivos…','Has alcanzado el límite diario de descargas.',(u,l)=>`Límite diario: ${u}/${l} novelas`,'Boosty — descargas ilimitadas','Solo para uso personal','Publicar, volver a subir o distribuir esta traducción de Dollar TL en otros sitios web, aplicaciones, canales o archivos sin permiso está prohibido por las reglas del proyecto. Los archivos descargados pueden contener un identificador individual de distribución.','Entiendo, continuar','Tus archivos se enviaron al chat privado del bot.'),
  fil: c('Library','Pinakabagong update','Buksan ang title','Rating','I-rate ang title','I-download','Salamat.','I-tap muna ang Salamat bago buksan ang private download link.','Inihahanda ang files…','Naabot na ang daily download limit.',(u,l)=>`Daily limit: ${u}/${l} novels`,'Boosty — unlimited downloads','Para sa personal na paggamit lamang','Ipinagbabawal ng project rules ang pag-publish, muling pag-upload, o pamamahagi ng Dollar TL translation sa ibang websites, apps, channels, o file archives nang walang pahintulot. Maaaring may individual distribution identifier ang downloaded files.','Nauunawaan ko, magpatuloy','Naipadala ang files sa private bot chat.'),
  hi: c('लाइब्रेरी','नवीनतम अपडेट','शीर्षक खोलें','रेटिंग','रेट करें','डाउनलोड','धन्यवाद।','निजी डाउनलोड लिंक खोलने से पहले धन्यवाद दबाएँ।','फ़ाइलें तैयार हो रही हैं…','दैनिक डाउनलोड सीमा पूरी हो गई है।',(u,l)=>`दैनिक सीमा: ${u}/${l} उपन्यास`,'Boosty — असीमित डाउनलोड','केवल निजी उपयोग के लिए','बिना अनुमति Dollar TL अनुवाद को अन्य वेबसाइटों, ऐप्स, चैनलों या फ़ाइल संग्रहों में प्रकाशित, दोबारा अपलोड या वितरित करना परियोजना नियमों के अनुसार निषिद्ध है। डाउनलोड की गई फ़ाइलों में व्यक्तिगत वितरण पहचानकर्ता हो सकता है।','समझ गया, जारी रखें','फ़ाइलें निजी बॉट चैट में भेज दी गई हैं।'),
  pt: c('Biblioteca','Atualizações recentes','Abrir título','Avaliação','Avaliar este título','Baixar','Obrigado.','Toque em Obrigado antes de abrir o link privado de download.','Preparando os arquivos…','Limite diário de downloads atingido.',(u,l)=>`Limite diário: ${u}/${l} novels`,'Boosty — downloads ilimitados','Somente para uso pessoal','Publicar, reenviar ou distribuir esta tradução da Dollar TL em outros sites, aplicativos, canais ou arquivos sem permissão é proibido pelas regras do projeto. Os arquivos baixados podem conter um identificador individual de distribuição.','Entendi, continuar','Os arquivos foram enviados no chat privado do bot.'),
  id: c('Perpustakaan','Pembaruan terbaru','Buka judul','Rating','Beri rating','Unduh','Terima kasih.','Tekan Terima kasih sebelum membuka tautan unduhan pribadi.','Menyiapkan berkas…','Batas unduhan harian tercapai.',(u,l)=>`Batas harian: ${u}/${l} novel`,'Boosty — unduhan tanpa batas','Hanya untuk penggunaan pribadi','Menerbitkan, mengunggah ulang, atau menyebarkan terjemahan Dollar TL ini di situs, aplikasi, kanal, atau arsip berkas lain tanpa izin dilarang oleh aturan proyek. Berkas yang diunduh dapat memuat pengenal distribusi individual.','Saya mengerti, lanjutkan','Berkas dikirim ke chat pribadi bot.'),
  vi: c('Thư viện','Cập nhật mới nhất','Mở tác phẩm','Đánh giá','Đánh giá tác phẩm','Tải xuống','Cảm ơn.','Hãy nhấn Cảm ơn trước khi mở liên kết tải xuống riêng tư.','Đang chuẩn bị tệp…','Đã đạt giới hạn tải xuống hằng ngày.',(u,l)=>`Giới hạn hằng ngày: ${u}/${l} truyện`,'Boosty — tải xuống không giới hạn','Chỉ dành cho sử dụng cá nhân','Việc đăng, tải lại hoặc phân phối bản dịch Dollar TL này trên các trang web, ứng dụng, kênh hoặc kho tệp khác mà không được phép là vi phạm quy tắc dự án. Tệp tải xuống có thể chứa mã nhận dạng phân phối riêng.','Tôi hiểu, tiếp tục','Tệp đã được gửi vào cuộc trò chuyện riêng với bot.'),
  fr: c('Bibliothèque','Dernières mises à jour','Ouvrir le titre','Note','Noter ce titre','Télécharger','Merci.','Appuyez sur Merci avant d’ouvrir le lien privé de téléchargement.','Préparation des fichiers…','Limite quotidienne de téléchargement atteinte.',(u,l)=>`Limite quotidienne : ${u}/${l} romans`,'Boosty — téléchargements illimités','Usage personnel uniquement','La publication, le réupload ou la distribution de cette traduction Dollar TL sur d’autres sites, applications, chaînes ou archives de fichiers sans autorisation est interdite par les règles du projet. Les fichiers téléchargés peuvent contenir un identifiant de distribution individuel.','J’ai compris, continuer','Les fichiers ont été envoyés dans le chat privé du bot.'),
  de: c('Bibliothek','Neueste Updates','Titel öffnen','Bewertung','Titel bewerten','Herunterladen','Danke.','Tippe zuerst auf Danke, bevor du den privaten Download-Link öffnest.','Dateien werden vorbereitet…','Tägliches Download-Limit erreicht.',(u,l)=>`Tageslimit: ${u}/${l} Romane`,'Boosty — unbegrenzte Downloads','Nur zur persönlichen Nutzung','Das Veröffentlichen, erneute Hochladen oder Verteilen dieser Dollar-TL-Übersetzung auf anderen Websites, in Apps, Kanälen oder Dateiarchiven ohne Erlaubnis ist nach den Projektregeln untersagt. Heruntergeladene Dateien können eine individuelle Verteilungskennung enthalten.','Verstanden, weiter','Die Dateien wurden im privaten Bot-Chat gesendet.'),
  ur: c('لائبریری','تازہ ترین اپ ڈیٹس','عنوان کھولیں','ریٹنگ','ریٹنگ دیں','ڈاؤن لوڈ','شکریہ۔','نجی ڈاؤن لوڈ لنک کھولنے سے پہلے شکریہ دبائیں۔','فائلیں تیار کی جا رہی ہیں…','روزانہ ڈاؤن لوڈ کی حد پوری ہو گئی ہے۔',(u,l)=>`روزانہ حد: ${u}/${l} ناول`,'Boosty — لامحدود ڈاؤن لوڈ','صرف ذاتی استعمال کے لیے','بغیر اجازت Dollar TL ترجمہ کو دوسری ویب سائٹس، ایپس، چینلز یا فائل آرکائیوز پر شائع، دوبارہ اپ لوڈ یا تقسیم کرنا پراجیکٹ کے قواعد کے تحت ممنوع ہے۔ ڈاؤن لوڈ کی گئی فائلوں میں انفرادی تقسیم شناخت کنندہ شامل ہو سکتا ہے۔','سمجھ گیا، جاری رکھیں','فائلیں بوٹ کی نجی چیٹ میں بھیج دی گئی ہیں۔'),
};

export function readerCopy(value: string | null | undefined): ReaderCopy {
  return copies[normalizeLocale(value)];
}

function c(
  library: string, latestUpdates: string, openTitle: string, rating: string, rateTitle: string,
  download: string, thankYou: string, thankYouRequired: string, preparing: string, quotaReached: string,
  quotaStatus: (used: number, limit: number) => string, boostyUnlimited: string,
  termsTitle: string, termsBody: string, termsAccept: string, filesSent: string,
): ReaderCopy {
  return { library,latestUpdates,openTitle,rating,rateTitle,download,thankYou,thankYouRequired,preparing,quotaReached,quotaStatus,boostyUnlimited,termsTitle,termsBody,termsAccept,filesSent };
}

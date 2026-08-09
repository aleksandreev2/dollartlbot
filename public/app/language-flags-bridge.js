(() => {
  const patterns = {
    ko: /(?:\bkorean\b|\bkoreano\b|\bcoreano\b|\bcoréen\b|\bkoreanisch\b|корей\w*|한국어|한국말|tiếng hàn|कोरियाई|bahasa korea)/i,
    ja: /(?:\bjapanese\b|\bjaponés\b|\bjaponês\b|\bjaponais\b|\bjapanisch\b|япон\w*|日本語|tiếng nhật|जापानी|bahasa jepang|\bhapon\b)/i,
    zh: /(?:\bchinese\b|\bchino\b|\bchinês\b|\bchinois\b|\bchinesisch\b|китай\w*|中文|汉语|漢語|tiếng trung|चीनी|tionghoa|\btsino\b)/i,
    en: /(?:\benglish\b|\binglés\b|\binglês\b|\banglais\b|\benglisch\b|англ\w*|tiếng anh|अंग्रेज़ी|\bingles\b|\binggris\b)/i,
    ru: /(?:\brussian\b|\bruso\b|\brusso\b|\brusse\b|\brussisch\b|русск\w*|tiếng nga|रूसी|\brusia\b)/i,
    es: /(?:\bspanish\b|\bespañol\b|\bespanhol\b|\bespagnol\b|\bspanisch\b|испан\w*|tiếng tây ban nha|स्पेनिश|\bspanyol\b|\bespanyol\b)/i,
    pt: /(?:\bportuguese\b|\bportugués\b|\bportuguês\b|\bportugais\b|\bportugiesisch\b|португал\w*|tiếng bồ đào nha|पुर्तगाली|\bportugis\b|\bportuges\b)/i,
    id: /(?:\bindonesian\b|\bindonesio\b|\bindonésio\b|\bindonésien\b|\bindonesisch\b|индонез\w*|tiếng indonesia|इंडोनेशियाई|bahasa indonesia|\bindones\b)/i,
    vi: /(?:\bvietnamese\b|\bvietnamita\b|\bvietnamien\b|\bvietnamesisch\b|вьетнам\w*|tiếng việt|वियतनामी|\bbiyetnames\b)/i,
    fr: /(?:\bfrench\b|\bfrancés\b|\bfrancês\b|\bfrançais\b|\bfranzösisch\b|француз\w*|tiếng pháp|फ़्रेंच|\bprancis\b|\bpranses\b)/i,
    de: /(?:\bgerman\b|\balemán\b|\balemão\b|\ballemand\b|\bdeutsch\b|немец\w*|tiếng đức|जर्मन|\bjerman\b|\baleman\b)/i,
    hi: /(?:\bhindi\b|\bहिंदी\b|\bहिन्दी\b|хинди)/i,
    fil: /(?:\bfilipino\b|\bfilipina\b|\btagalog\b|филиппин\w*|फ़िलिपिनो)/i,
  };

  function detect(text = '') {
    const value = String(text).normalize('NFKC').replace(/[\u{1F1E6}-\u{1F1FF}]/gu, ' ').trim();
    for (const [code, re] of Object.entries(patterns)) if (re.test(value)) return code;
    return null;
  }

  function patch(root = document) {
    root.querySelectorAll('.novel-meta .localized-language').forEach((el) => {
      if (el.dataset.languageCode) {
        el.classList.add('canonical-language');
        return;
      }
      const code = detect(el.textContent);
      if (!code) return;
      el.dataset.languageCode = code;
      el.classList.add('canonical-language');
    });
  }

  let raf = 0;
  function schedule() {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      patch(document);
    });
  }

  const patchRoot = document.getElementById('viewRoot') || document.body;
  new MutationObserver(schedule).observe(patchRoot, { childList: true, subtree: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', schedule, { once: true });
  else schedule();
})();

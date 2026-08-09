(() => {
  const tg = window.Telegram?.WebApp;
  let lastNovelId = null;
  let coverRevision = Date.now();

  const strings = {
    en:{cover:'Cover',replace:'Replace cover',remove:'Remove cover',auto:'Real cover or branded fallback',updated:'Cover updated',removed:'Cover removed',failed:'Could not update the cover'},
    es:{cover:'Portada',replace:'Cambiar portada',remove:'Eliminar portada',auto:'Portada real o diseño de respaldo',updated:'Portada actualizada',removed:'Portada eliminada',failed:'No se pudo actualizar la portada'},
    fil:{cover:'Pabalat',replace:'Palitan ang pabalat',remove:'Alisin ang pabalat',auto:'Tunay na pabalat o branded fallback',updated:'Na-update ang pabalat',removed:'Inalis ang pabalat',failed:'Hindi ma-update ang pabalat'},
    hi:{cover:'कवर',replace:'कवर बदलें',remove:'कवर हटाएँ',auto:'वास्तविक कवर या ब्रांडेड फ़ॉलबैक',updated:'कवर अपडेट हो गया',removed:'कवर हटा दिया गया',failed:'कवर अपडेट नहीं हो सका'},
    pt:{cover:'Capa',replace:'Trocar capa',remove:'Remover capa',auto:'Capa real ou fallback da marca',updated:'Capa atualizada',removed:'Capa removida',failed:'Não foi possível atualizar a capa'},
    id:{cover:'Sampul',replace:'Ganti sampul',remove:'Hapus sampul',auto:'Sampul asli atau fallback bermerek',updated:'Sampul diperbarui',removed:'Sampul dihapus',failed:'Sampul tidak dapat diperbarui'},
    vi:{cover:'Bìa',replace:'Thay bìa',remove:'Xóa bìa',auto:'Bìa thật hoặc bìa dự phòng có thương hiệu',updated:'Đã cập nhật bìa',removed:'Đã xóa bìa',failed:'Không thể cập nhật bìa'},
    fr:{cover:'Couverture',replace:'Remplacer la couverture',remove:'Supprimer la couverture',auto:'Couverture réelle ou visuel de secours',updated:'Couverture mise à jour',removed:'Couverture supprimée',failed:'Impossible de mettre à jour la couverture'},
    de:{cover:'Cover',replace:'Cover ersetzen',remove:'Cover entfernen',auto:'Echtes Cover oder Marken-Fallback',updated:'Cover aktualisiert',removed:'Cover entfernt',failed:'Cover konnte nicht aktualisiert werden'},
    ru:{cover:'Обложка',replace:'Заменить обложку',remove:'Удалить обложку',auto:'Настоящая обложка или фирменный fallback',updated:'Обложка обновлена',removed:'Обложка удалена',failed:'Не удалось обновить обложку'},
  };

  function locale() {
    const lang = (document.documentElement.lang || 'en').toLowerCase();
    if (lang.startsWith('ru')) return 'ru';
    if (lang.startsWith('es')) return 'es';
    if (lang.startsWith('fil') || lang.startsWith('tl')) return 'fil';
    if (lang.startsWith('hi')) return 'hi';
    if (lang.startsWith('pt')) return 'pt';
    if (lang.startsWith('id')) return 'id';
    if (lang.startsWith('vi')) return 'vi';
    if (lang.startsWith('fr')) return 'fr';
    if (lang.startsWith('de')) return 'de';
    return 'en';
  }
  const tr = (key) => strings[locale()]?.[key] || strings.en[key] || key;

  function authHeaders(extra = {}) {
    return { 'x-telegram-init-data': tg?.initData || '', ...extra };
  }

  function coverUrl(id) {
    return `/media/covers/${id}?v=${coverRevision}`;
  }

  function installRealCover(cover, id) {
    if (!cover || !id || cover.dataset.realCoverChecked === String(coverRevision)) return;
    cover.dataset.realCoverChecked = String(coverRevision);
    const img = document.createElement('img');
    img.className = 'real-cover-image';
    img.alt = '';
    img.decoding = 'async';
    img.loading = 'lazy';
    img.src = coverUrl(id);
    img.addEventListener('load', () => cover.classList.add('has-real-cover'), { once:true });
    img.addEventListener('error', () => {
      cover.classList.remove('has-real-cover');
      img.remove();
    }, { once:true });
    cover.appendChild(img);
  }

  function patchCovers(root = document) {
    root.querySelectorAll('[data-novel] .novel-cover').forEach((cover) => {
      const owner = cover.closest('[data-novel]');
      installRealCover(cover, Number(owner?.dataset.novel));
    });
    const detail = root.querySelector('.detail-hero .novel-cover');
    if (detail && lastNovelId) installRealCover(detail, lastNovelId);
  }

  function adminId(card) {
    const action = card.querySelector('[data-admin-action][data-id]');
    if (action?.dataset.id) return Number(action.dataset.id);
    const save = card.querySelector('[data-progress-save]');
    if (save?.dataset.progressSave) return Number(save.dataset.progressSave);
    const eyebrow = card.querySelector('.eyebrow')?.textContent || '';
    const match = /#(\d+)/.exec(eyebrow);
    return match ? Number(match[1]) : null;
  }

  function makeIcon(name) {
    const i = document.createElement('i');
    i.setAttribute('data-lucide', name);
    i.setAttribute('aria-hidden', 'true');
    return i;
  }

  function installAdminTools(card) {
    if (card.dataset.coverToolsReady === '1') return;
    const id = adminId(card);
    if (!id) return;
    card.dataset.coverToolsReady = '1';

    const tools = document.createElement('div');
    tools.className = 'admin-cover-tools';
    tools.innerHTML = `
      <div class="admin-cover-preview"></div>
      <div class="admin-cover-copy">
        <div class="admin-cover-title">${escapeHtml(tr('cover'))}</div>
        <div class="admin-cover-sub">${escapeHtml(tr('auto'))}</div>
      </div>
      <div class="admin-cover-actions"></div>`;

    const preview = tools.querySelector('.admin-cover-preview');
    const previewImg = document.createElement('img');
    previewImg.alt = '';
    previewImg.src = coverUrl(id);
    previewImg.addEventListener('error', () => previewImg.remove(), { once:true });
    preview.appendChild(previewImg);

    const actions = tools.querySelector('.admin-cover-actions');
    const replace = document.createElement('button');
    replace.type = 'button';
    replace.className = 'admin-cover-action';
    replace.title = tr('replace');
    replace.setAttribute('aria-label', tr('replace'));
    replace.appendChild(makeIcon('image-up'));

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'admin-cover-action danger';
    remove.title = tr('remove');
    remove.setAttribute('aria-label', tr('remove'));
    remove.appendChild(makeIcon('trash-2'));
    actions.append(replace, remove);

    replace.addEventListener('click', () => chooseCover(id, tools));
    remove.addEventListener('click', () => removeCover(id, tools));
    card.appendChild(tools);
  }

  async function chooseCover(id, tools) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp,image/avif';
    input.hidden = true;
    document.body.appendChild(input);
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) { input.remove(); return; }
      const form = new FormData();
      form.set('cover', file, file.name);
      try {
        const response = await fetch(`/api/app/admin/cover/${id}`, {
          method: 'POST', headers: authHeaders(), body: form,
        });
        if (!response.ok) throw new Error('upload failed');
        coverRevision = Date.now();
        refreshAdminPreview(tools, id);
        refreshVisibleCovers(id);
        toast(tr('updated'));
      } catch {
        toast(tr('failed'), true);
      } finally {
        input.remove();
      }
    }, { once:true });
    input.click();
  }

  async function removeCover(id, tools) {
    try {
      const response = await fetch(`/api/app/admin/cover/${id}`, {
        method: 'DELETE', headers: authHeaders(),
      });
      if (!response.ok) throw new Error('delete failed');
      coverRevision = Date.now();
      tools.querySelector('.admin-cover-preview img')?.remove();
      document.querySelectorAll(`[data-novel="${id}"] .novel-cover`).forEach((cover) => {
        cover.classList.remove('has-real-cover');
        cover.querySelector('.real-cover-image')?.remove();
        delete cover.dataset.realCoverChecked;
      });
      toast(tr('removed'));
    } catch {
      toast(tr('failed'), true);
    }
  }

  function refreshAdminPreview(tools, id) {
    const preview = tools.querySelector('.admin-cover-preview');
    preview.innerHTML = '';
    const img = document.createElement('img');
    img.alt = '';
    img.src = coverUrl(id);
    preview.appendChild(img);
  }

  function refreshVisibleCovers(id) {
    document.querySelectorAll(`[data-novel="${id}"] .novel-cover`).forEach((cover) => {
      cover.querySelector('.real-cover-image')?.remove();
      cover.classList.remove('has-real-cover');
      delete cover.dataset.realCoverChecked;
      installRealCover(cover, id);
    });
    if (lastNovelId === id) {
      const detail = document.querySelector('.detail-hero .novel-cover');
      if (detail) {
        detail.querySelector('.real-cover-image')?.remove();
        detail.classList.remove('has-real-cover');
        delete detail.dataset.realCoverChecked;
        installRealCover(detail, id);
      }
    }
  }

  function toast(message, error = false) {
    const region = document.getElementById('toastRegion');
    if (!region) return;
    const el = document.createElement('div');
    el.className = `toast ${error ? 'error' : 'success'}`;
    el.textContent = message;
    region.appendChild(el);
    setTimeout(() => el.remove(), 2600);
  }

  function escapeHtml(value='') {
    return String(value).replace(/[&<>'"]/g, (ch) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  }

  function patch(root = document) {
    patchCovers(root);
    root.querySelectorAll('.admin-request').forEach(installAdminTools);
    if (window.lucide?.createIcons) window.lucide.createIcons({ attrs:{'stroke-width':1.8,'aria-hidden':'true'} });
  }

  document.addEventListener('click', (event) => {
    const novel = event.target.closest?.('[data-novel]');
    if (novel?.dataset.novel) lastNovelId = Number(novel.dataset.novel);
  }, true);

  let raf = 0;
  const schedule = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; patch(document); });
  };
  new MutationObserver(schedule).observe(document.documentElement, { childList:true, subtree:true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', schedule, { once:true });
  else schedule();
})();

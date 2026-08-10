(() => {
  const tg = window.Telegram?.WebApp;
  const runtime = window.DTL_RUNTIME;
  if (!runtime?.registerPatcher) throw new Error('DTL runtime core must load before cover-ui.js');

  let lastNovelId = null;
  let manifestLoaded = false;
  let manifestLoading = null;
  const assigned = new Map();

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
    const value = runtime.locale();
    return strings[value] ? value : 'en';
  }
  const tr = (key) => strings[locale()]?.[key] || strings.en[key] || key;

  function authHeaders(extra = {}) {
    return { 'x-telegram-init-data': tg?.initData || '', ...extra };
  }

  function coverToken(id) {
    return encodeURIComponent(String(assigned.get(Number(id)) || '1'));
  }

  function coverUrl(id) {
    return `/media/covers/${id}?cover=${coverToken(id)}`;
  }

  async function loadManifest(force = false) {
    if (!tg?.initData) {
      manifestLoaded = true;
      return;
    }
    if (manifestLoaded && !force) return;
    if (manifestLoading) return manifestLoading;
    manifestLoading = fetch('/api/app/cover-manifest', {
      cache:'no-store',
      headers:authHeaders(),
    })
      .then(async response => {
        if (!response.ok) throw new Error('cover manifest unavailable');
        const data = await response.json();
        assigned.clear();
        for (const row of data.covers || []) assigned.set(Number(row.id), String(row.cover_updated_at || '1'));
        manifestLoaded = true;
      })
      .catch(() => {
        // Fail closed for this foreground session instead of creating a request loop.
        manifestLoaded = true;
      })
      .finally(() => {
        manifestLoading = null;
        runtime.schedule();
      });
    return manifestLoading;
  }

  function clearRealCover(cover) {
    if (!cover) return;
    cover.classList.remove('has-real-cover');
    cover.querySelectorAll('.real-cover-image').forEach(img => img.remove());
  }

  function installRealCover(cover, id) {
    id = Number(id);
    if (!cover || !id || !manifestLoaded) return;
    if (!assigned.has(id)) {
      clearRealCover(cover);
      cover.dataset.realCoverChecked = 'none';
      delete cover.dataset.coverFailures;
      return;
    }

    const stamp = String(assigned.get(id) || '1');
    const failures = Number(cover.dataset.coverFailures || 0);
    if (cover.dataset.realCoverChecked === stamp && cover.querySelector('.real-cover-image')) return;
    if (cover.dataset.realCoverChecked === stamp && failures >= 3) return;
    cover.dataset.realCoverChecked = stamp;
    clearRealCover(cover);

    const img = document.createElement('img');
    img.className = 'real-cover-image';
    img.alt = '';
    img.decoding = 'async';
    img.loading = 'lazy';
    img.src = coverUrl(id);
    img.addEventListener('load', () => {
      cover.dataset.coverFailures = '0';
      cover.classList.add('has-real-cover');
    }, { once:true });
    img.addEventListener('error', () => {
      img.remove();
      cover.classList.remove('has-real-cover');
      const nextFailures = Number(cover.dataset.coverFailures || 0) + 1;
      cover.dataset.coverFailures = String(nextFailures);
      if (nextFailures < 3) {
        setTimeout(() => {
          if (!cover.isConnected || !assigned.has(id) || cover.classList.contains('has-real-cover')) return;
          delete cover.dataset.realCoverChecked;
          runtime.schedule();
        }, 500 * nextFailures);
      }
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

  function syncAdminToolsCopy(tools) {
    const title = tools.querySelector('.admin-cover-title');
    const sub = tools.querySelector('.admin-cover-sub');
    const replace = tools.querySelector('[data-cover-action="replace"]');
    const remove = tools.querySelector('[data-cover-action="remove"]');
    if (title) title.textContent = tr('cover');
    if (sub) sub.textContent = tr('auto');
    if (replace) { replace.title = tr('replace'); replace.setAttribute('aria-label', tr('replace')); }
    if (remove) { remove.title = tr('remove'); remove.setAttribute('aria-label', tr('remove')); }
  }

  function syncAdminPreview(tools, id) {
    const preview = tools.querySelector('.admin-cover-preview');
    if (!preview) return;
    const existing = preview.querySelector('img');
    if (!assigned.has(id)) {
      existing?.remove();
      return;
    }
    const src = coverUrl(id);
    if (existing?.getAttribute('src') === src) return;
    existing?.remove();
    const img = document.createElement('img');
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.src = src;
    img.addEventListener('error', () => img.remove(), { once:true });
    preview.appendChild(img);
  }

  function installAdminTools(card) {
    const id = adminId(card);
    if (!id) return;
    let tools = card.querySelector('.admin-cover-tools');
    if (tools) {
      syncAdminToolsCopy(tools);
      syncAdminPreview(tools, id);
      return;
    }

    tools = document.createElement('div');
    tools.className = 'admin-cover-tools';
    tools.dataset.coverId = String(id);
    tools.innerHTML = `
      <div class="admin-cover-preview"></div>
      <div class="admin-cover-copy">
        <div class="admin-cover-title"></div>
        <div class="admin-cover-sub"></div>
      </div>
      <div class="admin-cover-actions"></div>`;

    const actions = tools.querySelector('.admin-cover-actions');
    const replace = document.createElement('button');
    replace.type = 'button';
    replace.className = 'admin-cover-action';
    replace.dataset.coverAction = 'replace';
    replace.appendChild(makeIcon('image-up'));

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'admin-cover-action danger';
    remove.dataset.coverAction = 'remove';
    remove.appendChild(makeIcon('trash-2'));
    actions.append(replace, remove);

    replace.addEventListener('click', () => chooseCover(id, tools));
    remove.addEventListener('click', () => removeCover(id, tools));
    card.appendChild(tools);
    syncAdminToolsCopy(tools);
    syncAdminPreview(tools, id);
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
        assigned.set(id, String(Date.now()));
        manifestLoaded = true;
        syncAdminPreview(tools, id);
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
      assigned.delete(id);
      manifestLoaded = true;
      syncAdminPreview(tools, id);
      document.querySelectorAll(`[data-novel="${id}"] .novel-cover`).forEach((cover) => {
        clearRealCover(cover);
        cover.dataset.realCoverChecked = 'none';
        delete cover.dataset.coverFailures;
      });
      if (lastNovelId === id) {
        const detail = document.querySelector('.detail-hero .novel-cover');
        if (detail) clearRealCover(detail);
      }
      toast(tr('removed'));
    } catch {
      toast(tr('failed'), true);
    }
  }

  function refreshVisibleCovers(id) {
    document.querySelectorAll(`[data-novel="${id}"] .novel-cover`).forEach((cover) => {
      clearRealCover(cover);
      delete cover.dataset.realCoverChecked;
      delete cover.dataset.coverFailures;
      installRealCover(cover, id);
    });
    if (lastNovelId === id) {
      const detail = document.querySelector('.detail-hero .novel-cover');
      if (detail) {
        clearRealCover(detail);
        delete detail.dataset.realCoverChecked;
        delete detail.dataset.coverFailures;
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

  function patch(root = document) {
    if (!manifestLoaded && !manifestLoading) loadManifest();
    patchCovers(root);
    if (manifestLoaded) root.querySelectorAll('.admin-request').forEach(installAdminTools);
    if (window.lucide?.createIcons) window.lucide.createIcons({ attrs:{'stroke-width':1.8,'aria-hidden':'true'} });
  }

  document.addEventListener('click', (event) => {
    const novel = event.target.closest?.('[data-novel]');
    if (novel?.dataset.novel) lastNovelId = Number(novel.dataset.novel);
  }, true);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    document.querySelectorAll('.novel-cover').forEach(cover => {
      if (!cover.classList.contains('has-real-cover')) {
        delete cover.dataset.realCoverChecked;
        delete cover.dataset.coverFailures;
      }
    });
    manifestLoaded = false;
    loadManifest(true);
  });

  runtime.registerPatcher(() => patch(document));
})();

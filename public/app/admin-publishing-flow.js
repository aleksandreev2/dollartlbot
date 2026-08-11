(() => {
  const runtime = window.DTL_RUNTIME;
  const admin = window.DTL_ADMIN;
  if (!runtime?.registerPatcher || !admin?.api || !admin?.open) throw new Error('Publishing flow requires canonical admin runtime.');

  const KEY = 'dtl:publishing:last-publish-intent';
  let checking = false;
  let installedEditor = null;
  const ico = name => `<i data-lucide="${name}" aria-hidden="true"></i>`;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const isPublishing = () => admin.activeRoute?.() === 'section:publishing';

  function rememberPublishIntent() {
    if (!isPublishing()) return;
    const button = document.getElementById('pubPublish');
    if (!button) return;
    const title = document.getElementById('pubTitle')?.value.trim() || '';
    if (!title) return;
    try {
      sessionStorage.setItem(KEY, JSON.stringify({
        title,
        notify: Boolean(document.getElementById('pubNotify')?.checked),
        at: Date.now(),
      }));
    } catch {}
  }

  function intent() {
    try {
      const raw = sessionStorage.getItem(KEY);
      if (!raw) return null;
      const value = JSON.parse(raw);
      if (!value?.title || !Number.isFinite(Number(value.at))) return null;
      if (Date.now() - Number(value.at) > 120_000) { sessionStorage.removeItem(KEY); return null; }
      return value;
    } catch { return null; }
  }

  function clearIntent() {
    try { sessionStorage.removeItem(KEY); } catch {}
  }

  function publicationTimestamp(row) {
    const value = row?.published_at || row?.updated_at || row?.created_at || '';
    const timestamp = Date.parse(String(value));
    return Number.isFinite(timestamp) ? timestamp : 0;
  }

  async function maybeShowResult() {
    if (!isPublishing() || checking) return;
    const pending = intent();
    if (!pending || !document.querySelector('.publisher-editor')) return;
    checking = true;
    try {
      const data = await admin.api('/api/app/admin/publishing');
      if (!isPublishing()) return;
      const rows = Array.isArray(data.publications) ? data.publications : [];
      const threshold = Number(pending.at) - 30_000;
      const published = rows.find(row => row.status === 'published'
        && String(row.internal_title || '') === String(pending.title)
        && publicationTimestamp(row) >= threshold);
      if (!published) return;
      const layout = document.querySelector('.publisher-layout');
      if (!layout) return;
      layout.outerHTML = resultMarkup(published, pending);
      clearIntent();
      bindResult();
      admin.icons?.();
    } catch {
      // The canonical publishing module owns actual error feedback.
    } finally {
      checking = false;
    }
  }

  function resultMarkup(publication, pending) {
    return `<section class="admin-panel publishing-flow-result" data-publishing-result="${Number(publication.id)}">
      <div class="publishing-flow-result-icon">${ico('circle-check-big')}</div>
      <div><h2>Публикация отправлена</h2><p>${esc(publication.internal_title || pending.title)} уже опубликована в Telegram. Можно сразу перейти к следующему действию.</p></div>
      <div class="publishing-flow-result-meta">
        <span>Публикация #${Number(publication.id)}</span>
        ${publication.channel_message_id ? `<span>Telegram message #${Number(publication.channel_message_id)}</span>` : ''}
        ${pending.notify ? '<span>Рассылка релиза включена</span>' : '<span>Без рассылки</span>'}
      </div>
      <div class="publishing-flow-result-actions">
        <button type="button" data-publishing-result-route="tools:publications">${ico('files')} Открыть публикации</button>
        ${pending.notify ? `<button type="button" data-publishing-result-route="section:broadcasts">${ico('megaphone')} Перейти к рассылкам</button>` : ''}
        <button type="button" class="primary" data-publishing-result-next>${ico('plus')} Следующая публикация</button>
      </div>
    </section>`;
  }

  function bindResult() {
    document.querySelectorAll('[data-publishing-result-route]').forEach(button => button.addEventListener('click', () => void admin.open(button.dataset.publishingResultRoute)));
    document.querySelector('[data-publishing-result-next]')?.addEventListener('click', () => {
      clearIntent();
      void admin.refresh?.();
    });
  }

  function install() {
    if (!isPublishing()) { installedEditor = null; return; }
    const editor = document.querySelector('.publisher-editor');
    if (!editor) return;
    if (installedEditor !== editor) {
      installedEditor = editor;
      const preview = document.querySelector('.publisher-preview');
      if (preview instanceof HTMLDetailsElement && matchMedia('(max-width: 700px)').matches) preview.open = false;
    }
    void maybeShowResult();
  }

  document.addEventListener('click', event => {
    if (event.target.closest?.('#pubPublish')) rememberPublishIntent();
  }, true);
  document.addEventListener('dtl:adminrender', install);
  document.addEventListener('dtl:adminroutechange', () => queueMicrotask(install));
  runtime.registerPatcher(install);
  window.DTL_ADMIN_PUBLISHING_FLOW = Object.freeze({ refresh: install });
})();

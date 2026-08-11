(() => {
  const runtime = window.DTL_RUNTIME;
  const admin = window.DTL_ADMIN;
  if (!runtime?.registerPatcher || !admin?.registerRoute || !admin?.api) {
    throw new Error('Canonical admin runtime must load before admin-publishing-view.js');
  }

  let previewUrl = '';

  const api = (path, options = {}) => admin.api(path, options);
  const esc = (value = '') => String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));
  const icon = name => `<i data-lucide="${name}" aria-hidden="true"></i>`;
  const isActive = () => admin.activeRoute?.() === 'section:publishing';

  function markActive() {
    window.DTL_ADMIN_CONSOLE?.markSection?.('publishing');
    document.querySelectorAll('[data-admin-tools],[data-admin-health]').forEach(button => button.classList.remove('active'));
  }

  function clearPreviewUrl() {
    if (!previewUrl) return;
    URL.revokeObjectURL(previewUrl);
    previewUrl = '';
  }

  function pubBadge(status) {
    const map = {
      draft: ['draft', 'Черновик'],
      publishing: ['queued', 'Отправляется'],
      published: ['done', 'Опубликовано'],
      failed: ['bad', 'Ошибка'],
    };
    const [className, label] = map[status] || ['draft', status || '—'];
    return `<span class="admin-badge ${className}">${esc(label)}</span>`;
  }

  function date(value) {
    if (!value) return '—';
    try { return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); }
    catch { return String(value); }
  }

  function publicationRow(publication) {
    return `<div class="publication-row">
      <div class="publication-thumb">${publication.image_key ? `<img src="/media/publications/${publication.id}/image" alt="">` : icon('file-text')}</div>
      <div class="publication-copy"><strong>${esc(publication.internal_title)}</strong><span>${date(publication.created_at)} · ${Number(publication.file_count || 0)} файл(ов)</span>${publication.error_text ? `<small>${esc(publication.error_text)}</small>` : ''}</div>
      ${pubBadge(publication.status)}
      <div class="publication-actions">${publication.status !== 'published' ? `<button type="button" data-pub-test="${publication.id}" title="Тест">${icon('flask-conical')}</button><button type="button" data-pub-send="${publication.id}" title="Опубликовать">${icon('send')}</button><button type="button" data-pub-del="${publication.id}" title="Удалить">${icon('trash-2')}</button>` : ''}</div>
    </div>`;
  }

  function stepHead(number, title, hint) {
    return `<div class="publisher-flow-step-head"><span>${number}</span><div><h3>${title}</h3><p>${hint}</p></div></div>`;
  }

  async function render() {
    markActive();
    admin.setHead?.('Publishing', 'Подготовь публикацию по шагам и отправь без лишних экранов');
    admin.content?.(`<div class="admin-loading">${icon('loader-circle')} Загружаем редактор…</div>`);
    try {
      const data = await api('/api/app/admin/publishing');
      if (!isActive()) return false;
      const publications = data.publications || [];
      admin.content?.(`<div class="publisher-flow-map" aria-label="Этапы публикации">
          <span>${icon('link-2')} Заявка</span><i>${icon('chevron-right')}</i>
          <span>${icon('file-text')} Текст</span><i>${icon('chevron-right')}</i>
          <span>${icon('paperclip')} Вложения</span><i>${icon('chevron-right')}</i>
          <span>${icon('sliders-horizontal')} Настройки</span><i>${icon('chevron-right')}</i>
          <span>${icon('circle-check')} Готовность</span>
        </div>
        <div class="publisher-layout publisher-flow-layout">
        <section class="publisher-editor admin-panel">
          <div class="admin-panel-head publisher-editor-head"><div><h2>Новая публикация</h2><p>Один рабочий поток от заявки до Telegram</p></div><span class="admin-badge draft">Черновик</span></div>
          <div class="publisher-flow">
            <section class="publisher-flow-step publisher-flow-main">
              ${stepHead('1', 'Заявка и текст', 'Свяжи пост с заявкой — название и обложка подставятся автоматически.')}
              <label class="admin-field"><span>Название для админки</span><input id="pubTitle" maxlength="180" placeholder="Например: Chapters 78–85 · Pure Love"></label>
              <label class="admin-field"><span>Текст поста <small id="pubCounter">0 / 700</small></span><textarea id="pubBody" maxlength="700" rows="8" placeholder="Напишите основной текст публикации…"></textarea></label>
            </section>

            <section class="publisher-flow-step">
              ${stepHead('2', 'Вложения', 'Обложка поста и файлы, которые уйдут в комментарии.')}
              <div class="publisher-upload-grid">
                <label class="publisher-drop" id="pubImageDrop">${icon('image-plus')}<strong>Изображение поста</strong><span>JPEG, PNG, WebP или AVIF · до 8 МБ</span><input id="pubImage" type="file" accept="image/jpeg,image/png,image/webp,image/avif" hidden></label>
                <label class="publisher-drop" id="pubFilesDrop">${icon('paperclip')}<strong>Файлы в комментарий</strong><span>До 8 файлов · каждый до 45 МБ</span><input id="pubFiles" type="file" multiple hidden></label>
              </div>
              <div id="pubAssetSummary" class="publisher-assets"></div>
            </section>

            <section class="publisher-flow-step">
              ${stepHead('3', 'Настройки', 'Редкие параметры не мешают основному тексту.')}
              <div class="publisher-options">
                <label><input id="pubFooter" type="checkbox" checked><span><b>Шаблонный footer</b><small>Need a translation? → Dollar TL Bot</small></span></label>
                <label><input id="pubDonate" type="checkbox" checked><span><b>Кнопка Donate</b><small>Boosty donation</small></span></label>
                <label><input id="pubBotComment" type="checkbox" checked><span><b>Реклама бота под файлами</b><small>Отдельным комментарием</small></span></label>
                <label><input id="pubNotify" type="checkbox"><span><b>Разослать релиз пользователям</b><small>Только тем, кто не отключил релизы</small></span></label>
              </div>
            </section>
          </div>
          <div class="publisher-actions">
            <button id="pubSave">${icon('save')} Сохранить черновик</button>
            <button id="pubTest">${icon('flask-conical')} Тест мне</button>
            <button id="pubPublish" class="primary">${icon('send')} Опубликовать</button>
          </div>
        </section>
        <details class="publisher-preview admin-panel" open>
          <summary class="publisher-preview-summary"><span>${icon('eye')} Предпросмотр</span><small>Telegram</small>${icon('chevron-down')}</summary>
          <div class="publisher-preview-body">
            <div class="tg-preview">
              <div id="tgPreviewImage" class="tg-preview-image empty">${icon('image')}</div>
              <div class="tg-preview-body" id="tgPreviewBody">Текст публикации появится здесь.</div>
              <div class="tg-preview-footer"><b>Need a translation?</b><br>Open <span>Dollar TL Bot</span> and suggest a novel for translation.</div>
              <div class="tg-preview-buttons"><span>Suggest a Novel</span><span>Donate</span></div>
            </div>
          </div>
        </details>
      </div>
      <section class="admin-panel admin-publication-history">
        <div class="admin-panel-head"><div><h2>История публикаций</h2><p>Черновики и опубликованные посты</p></div></div>
        <div class="admin-publication-list">${publications.length ? publications.map(publicationRow).join('') : '<div class="admin-empty">Пока пусто.</div>'}</div>
      </section>`);
      bindPreview();
      bindPublicationRows();
      admin.icons?.();
      runtime.schedule();
      return true;
    } catch (error) {
      if (error?.name === 'AbortError' || !isActive()) return false;
      admin.content?.(`<div class="admin-panel admin-error">${icon('triangle-alert')}<strong>Ошибка редактора публикаций</strong><span>${esc(error.message)}</span></div>`);
      return false;
    }
  }

  function bindPreview() {
    const body = document.getElementById('pubBody');
    const footer = document.getElementById('pubFooter');
    const donate = document.getElementById('pubDonate');
    const image = document.getElementById('pubImage');
    const files = document.getElementById('pubFiles');

    const update = () => {
      const counter = document.getElementById('pubCounter');
      const previewBody = document.getElementById('tgPreviewBody');
      if (counter && body) counter.textContent = `${body.value.length} / 700`;
      if (previewBody && body) previewBody.textContent = body.value || 'Текст публикации появится здесь.';
      const footerNode = document.querySelector('.tg-preview-footer');
      if (footerNode) footerNode.style.display = footer?.checked ? 'block' : 'none';
      const donateNode = document.querySelector('.tg-preview-buttons')?.children?.[1];
      if (donateNode) donateNode.style.display = donate?.checked ? 'inline-flex' : 'none';
    };

    body?.addEventListener('input', update);
    footer?.addEventListener('change', update);
    donate?.addEventListener('change', update);
    image?.addEventListener('change', () => {
      clearPreviewUrl();
      const selected = image.files?.[0];
      const box = document.getElementById('tgPreviewImage');
      if (!box) return;
      if (!selected) {
        box.className = 'tg-preview-image empty';
        box.innerHTML = icon('image');
      } else {
        previewUrl = URL.createObjectURL(selected);
        box.className = 'tg-preview-image';
        box.innerHTML = `<img src="${previewUrl}" alt="">`;
      }
      assetSummary();
      admin.icons?.();
    });
    files?.addEventListener('change', assetSummary);
    update();
  }

  function assetSummary() {
    const host = document.getElementById('pubAssetSummary');
    if (!host) return;
    const rows = [];
    const image = document.getElementById('pubImage')?.files?.[0];
    if (image) rows.push(`<span>${icon('image')} ${esc(image.name)}</span>`);
    for (const file of [...(document.getElementById('pubFiles')?.files || [])].slice(0, 8)) {
      rows.push(`<span>${icon('file')} ${esc(file.name)}</span>`);
    }
    host.innerHTML = rows.join('');
    admin.icons?.();
  }

  function bindPublicationRows() {
    document.querySelectorAll('[data-pub-test]').forEach(button => {
      button.addEventListener('click', () => void publicationAction(Number(button.dataset.pubTest), 'test'));
    });
    document.querySelectorAll('[data-pub-send]').forEach(button => {
      button.addEventListener('click', () => void publicationAction(Number(button.dataset.pubSend), 'publish'));
    });
    document.querySelectorAll('[data-pub-del]').forEach(button => {
      button.addEventListener('click', () => void deletePublication(Number(button.dataset.pubDel)));
    });
  }

  async function confirmAction(config) {
    if (window.DTL_ADMIN_STABILITY?.confirm) return window.DTL_ADMIN_STABILITY.confirm(config);
    return window.confirm(config.body || config.title);
  }

  async function publicationAction(id, action) {
    if (action === 'publish') {
      const ok = await confirmAction({
        title: 'Опубликовать этот черновик?',
        body: 'Пост будет отправлен в настроенный Telegram-канал.',
        confirm: 'Опубликовать',
      });
      if (!ok) return;
    }
    try {
      await api(`/api/app/admin/publications/${id}/${action}`, { method: 'POST' });
      admin.toast?.(action === 'test' ? 'Тест отправлен.' : 'Пост опубликован.');
      if (isActive()) await render();
    } catch (error) {
      admin.toast?.(error.message, true);
    }
  }

  async function deletePublication(id) {
    const ok = await confirmAction({
      title: 'Удалить черновик?',
      body: 'Черновик и его загруженные файлы будут удалены.',
      confirm: 'Удалить',
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/api/app/admin/publications/${id}`, { method: 'DELETE' });
      admin.toast?.('Черновик удалён.');
      if (isActive()) await render();
    } catch (error) {
      admin.toast?.(error.message, true);
    }
  }

  admin.registerRoute('section:publishing', {
    mount: render,
    refresh: render,
    unmount: clearPreviewUrl,
  });

  window.DTL_ADMIN_PUBLISHING_VIEW = Object.freeze({ render });
})();

(() => {
  const runtime = window.DTL_RUNTIME;
  const admin = window.DTL_ADMIN;
  const tg = window.Telegram?.WebApp;
  if (!runtime?.registerPatcher || !runtime?.registerResponseHandler || !admin?.activeRoute) return;

  const MAX_PARALLEL = 4;
  const avatarCache = new Map();
  const objectUrls = new Set();
  const requestUsers = new Map();
  let topUsers = [];
  let selectedUserId = 0;
  let selectedTitleUserId = 0;
  let latestRequestUserId = 0;
  let activeLoads = 0;
  let scheduled = false;
  let contentObserver = null;
  let intersectionObserver = null;
  const queue = [];

  const esc = (value = '') => String(value).replace(/[&<>"']/g, char => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;',
  }[char]));

  runtime.registerResponseHandler(async (response, context) => {
    if (!response.ok) return response;
    const path = String(context?.pathname || '');
    if (path !== '/api/app/admin/analytics' && path !== '/api/app/admin/list' && !/^\/api\/app\/admin\/requests\/\d+$/.test(path)) return response;
    try {
      const payload = await response.clone().json();
      if (path === '/api/app/admin/analytics') {
        topUsers = Array.isArray(payload?.top_users) ? payload.top_users : [];
      } else if (path === '/api/app/admin/list') {
        for (const row of Array.isArray(payload?.requests) ? payload.requests : []) rememberRequest(row);
      } else if (payload?.request) {
        rememberRequest(payload.request);
        latestRequestUserId = positiveId(payload.request.user_id);
      }
      schedulePatch();
    } catch {}
    return response;
  });

  function positiveId(value) {
    const id = Number(value || 0);
    return Number.isSafeInteger(id) && id > 0 ? id : 0;
  }

  function rememberRequest(row) {
    const requestId = positiveId(row?.id);
    const userId = positiveId(row?.user_id);
    if (requestId && userId) requestUsers.set(requestId, userId);
  }

  function initials(value = '') {
    const text = String(value || '').replace(/^@/, '').trim();
    return (text.slice(0, 1) || '?').toLocaleUpperCase();
  }

  function avatarNode(userId, fallback = '?', className = '') {
    const node = document.createElement('span');
    node.className = `admin-global-avatar ${className}`.trim();
    node.textContent = initials(fallback);
    markAvatar(node, userId);
    return node;
  }

  function markAvatar(node, userId) {
    const id = positiveId(userId);
    if (!node || !id) return;
    const same = node.dataset.adminAvatarUser === String(id);
    node.dataset.adminAvatarUser = String(id);
    if (!same) {
      node.querySelector(':scope > .admin-avatar-image')?.remove();
      delete node.dataset.adminAvatarState;
    }
    if (!node.dataset.adminAvatarState) observeAvatar(node);
  }

  function ensureIntersectionObserver() {
    if (intersectionObserver || typeof IntersectionObserver !== 'function') return;
    intersectionObserver = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        intersectionObserver.unobserve(entry.target);
        enqueue(entry.target);
      }
    }, { rootMargin: '180px 0px' });
  }

  function observeAvatar(node) {
    if (!node?.isConnected) return;
    node.dataset.adminAvatarState = 'waiting';
    ensureIntersectionObserver();
    if (intersectionObserver) intersectionObserver.observe(node);
    else enqueue(node);
  }

  function enqueue(node) {
    if (!node?.isConnected || node.dataset.adminAvatarState === 'queued' || node.dataset.adminAvatarState === 'loaded') return;
    node.dataset.adminAvatarState = 'queued';
    queue.push(node);
    pump();
  }

  function pump() {
    while (activeLoads < MAX_PARALLEL && queue.length) {
      const node = queue.shift();
      if (!node?.isConnected) continue;
      activeLoads += 1;
      void loadInto(node).finally(() => {
        activeLoads -= 1;
        pump();
      });
    }
  }

  async function loadInto(node) {
    const userId = positiveId(node.dataset.adminAvatarUser);
    if (!userId) return;
    const url = await avatarUrl(userId);
    if (!node.isConnected || positiveId(node.dataset.adminAvatarUser) !== userId) return;
    if (!url) {
      node.dataset.adminAvatarState = 'fallback';
      return;
    }
    let image = node.querySelector(':scope > .admin-avatar-image');
    if (!image) {
      image = document.createElement('img');
      image.className = 'admin-avatar-image';
      image.alt = '';
      image.draggable = false;
      image.decoding = 'async';
      node.append(image);
    }
    image.src = url;
    node.dataset.adminAvatarState = 'loaded';
  }

  function avatarUrl(userId) {
    if (avatarCache.has(userId)) return avatarCache.get(userId);
    const promise = (async () => {
      try {
        const headers = new Headers();
        headers.set('x-telegram-init-data', tg?.initData || '');
        const response = await fetch(`/api/app/admin/users/${encodeURIComponent(userId)}/avatar`, {
          method: 'GET',
          headers,
          cache: 'force-cache',
          credentials: 'same-origin',
        });
        if (response.status === 204 || response.status === 404) return null;
        if (!response.ok) return null;
        const type = String(response.headers.get('content-type') || '').toLowerCase();
        if (!type.startsWith('image/')) return null;
        const blob = await response.blob();
        if (!blob.size) return null;
        const url = URL.createObjectURL(blob);
        objectUrls.add(url);
        return url;
      } catch {
        return null;
      }
    })();
    avatarCache.set(userId, promise);
    return promise;
  }

  function invalidate(userId) {
    const id = positiveId(userId);
    if (!id) return;
    avatarCache.delete(id);
    document.querySelectorAll(`[data-admin-avatar-user="${CSS.escape(String(id))}"]`).forEach(node => {
      node.querySelector(':scope > .admin-avatar-image')?.remove();
      delete node.dataset.adminAvatarState;
      observeAvatar(node);
    });
  }

  function patchUsersCenter() {
    document.querySelectorAll('[data-user-id]').forEach(row => {
      const id = positiveId(row.dataset.userId);
      const avatar = row.querySelector('.admin-user-avatar');
      if (avatar) markAvatar(avatar, id);
    });
    const selected = positiveId(document.querySelector('.admin-user-row.selected')?.dataset.userId) || selectedUserId;
    const profile = document.querySelector('.admin-profile-avatar');
    if (profile && selected) markAvatar(profile, selected);
  }

  function patchStatistics() {
    const panel = [...document.querySelectorAll('.statistics-panel')]
      .find(node => node.querySelector('h2')?.textContent?.trim() === 'Самые активные заявители');
    if (panel) {
      [...panel.querySelectorAll('.statistics-ranking-row.compact')].forEach((row, index) => {
        const user = topUsers[index];
        const id = positiveId(user?.telegram_id);
        if (!id) return;
        let avatar = row.querySelector('.statistics-ranking-user-avatar');
        if (!avatar) {
          avatar = avatarNode(id, user?.first_name || user?.username || id, 'statistics-ranking-user-avatar');
          row.querySelector('.statistics-rank')?.after(avatar);
          row.classList.add('has-user-avatar');
        } else markAvatar(avatar, id);
      });
    }

    document.querySelectorAll('[data-stat-title-user]').forEach(row => {
      const id = positiveId(row.dataset.statTitleUser);
      const avatar = row.querySelector('.statistics-user-avatar');
      if (avatar) markAvatar(avatar, id);
    });
    const detailAvatar = document.querySelector('[data-stat-title-user-detail] .statistics-user-avatar.large');
    if (detailAvatar && selectedTitleUserId) markAvatar(detailAvatar, selectedTitleUserId);
  }

  function patchActivity() {
    document.querySelectorAll('[data-activity-user]').forEach(card => {
      const id = positiveId(card.dataset.activityUser);
      const host = card.querySelector('.admin-activity-event-icon');
      if (host) markAvatar(host, id);
    });
  }

  function requestIdFromText(value) {
    const match = String(value || '').match(/#(\d+)/);
    return positiveId(match?.[1]);
  }

  function patchRequests() {
    document.querySelectorAll('[data-workflow-request]').forEach(row => {
      const requestId = positiveId(row.dataset.workflowRequest);
      const userId = requestUsers.get(requestId) || 0;
      if (!userId) return;
      let avatar = row.querySelector('.admin-request-user-avatar');
      if (!avatar) {
        avatar = avatarNode(userId, row.querySelector('.admin-inbox-copy span')?.textContent || userId, 'admin-request-user-avatar');
        row.querySelector('.admin-inbox-state')?.after(avatar);
        row.classList.add('has-user-avatar');
      } else markAvatar(avatar, userId);
    });

    const detail = document.querySelector('.admin-inbox-detail-head');
    if (detail) {
      const requestId = requestIdFromText(detail.querySelector('.admin-card-id')?.textContent);
      const userId = requestUsers.get(requestId) || latestRequestUserId;
      if (userId && !detail.querySelector('.admin-request-detail-avatar')) {
        detail.prepend(avatarNode(userId, userId, 'admin-request-detail-avatar'));
        detail.classList.add('has-user-avatar');
      }
    }

    const ops = document.querySelector('.request-ops-topbar');
    if (ops && latestRequestUserId) {
      const title = ops.children?.[1];
      if (title && !title.querySelector('.admin-request-ops-avatar')) {
        title.classList.add('has-user-avatar');
        title.prepend(avatarNode(latestRequestUserId, latestRequestUserId, 'admin-request-ops-avatar'));
      }
    }
  }

  function patchHome() {
    document.querySelectorAll('[data-home-request]').forEach(row => {
      const requestId = positiveId(row.dataset.homeRequest);
      const userId = requestUsers.get(requestId) || 0;
      const icon = row.querySelector('.admin-home-row-icon');
      if (userId && icon) markAvatar(icon, userId);
    });
  }

  function patchQueue() {
    document.querySelectorAll('[data-qw-working]').forEach(card => {
      const requestId = positiveId(card.dataset.qwWorking);
      const userId = requestUsers.get(requestId) || 0;
      const top = card.querySelector('.admin-queue-working-top');
      if (!userId || !top) return;
      let avatar = top.querySelector('.admin-queue-user-avatar');
      if (!avatar) {
        avatar = avatarNode(userId, userId, 'admin-queue-user-avatar');
        top.prepend(avatar);
        top.classList.add('has-user-avatar');
      } else markAvatar(avatar, userId);
    });

    document.querySelectorAll('[data-qw-row]').forEach(row => {
      const requestId = positiveId(row.dataset.qwRow);
      const userId = requestUsers.get(requestId) || 0;
      if (!userId) return;
      let avatar = row.querySelector('.admin-queue-row-avatar');
      if (!avatar) {
        avatar = avatarNode(userId, userId, 'admin-queue-row-avatar');
        row.querySelector('.admin-queue-workspace-position')?.after(avatar);
        row.classList.add('has-user-avatar');
      } else markAvatar(avatar, userId);
    });
  }

  function patchMarked() {
    document.querySelectorAll('[data-admin-avatar-user]').forEach(node => {
      if (!node.dataset.adminAvatarState) observeAvatar(node);
    });
  }

  function ensureContentObserver() {
    const host = document.querySelector('.admin-content');
    if (!host || contentObserver?.__host === host) return;
    contentObserver?.disconnect();
    contentObserver = new MutationObserver(schedulePatch);
    contentObserver.__host = host;
    contentObserver.observe(host, { childList: true, subtree: true });
  }

  function patchAll() {
    scheduled = false;
    if (!document.querySelector('.admin-v2')) return;
    ensureContentObserver();
    patchUsersCenter();
    patchStatistics();
    patchActivity();
    patchRequests();
    patchHome();
    patchQueue();
    patchMarked();
  }

  function schedulePatch() {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(patchAll);
  }

  document.addEventListener('click', event => {
    const user = event.target.closest?.('[data-user-id]');
    if (user) selectedUserId = positiveId(user.dataset.userId);
    const titleUser = event.target.closest?.('[data-stat-title-user]');
    if (titleUser) selectedTitleUserId = positiveId(titleUser.dataset.statTitleUser);
    schedulePatch();
    setTimeout(schedulePatch, 40);
  }, true);

  document.addEventListener('dtl:adminroutechange', schedulePatch);
  document.addEventListener('dtl:adminrender', schedulePatch);
  runtime.registerPatcher(patchAll);
  window.addEventListener('pagehide', () => {
    contentObserver?.disconnect();
    intersectionObserver?.disconnect();
    for (const url of objectUrls) URL.revokeObjectURL(url);
    objectUrls.clear();
  }, { once: true });

  window.DTL_ADMIN_AVATARS = Object.freeze({ refresh: schedulePatch, invalidate });
  schedulePatch();
})();
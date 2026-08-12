(() => {
  const runtime = window.DTL_RUNTIME;
  const admin = window.DTL_ADMIN;
  if (!runtime?.registerPatcher || !runtime?.registerResponseHandler || !admin?.api || !admin?.open) {
    throw new Error('Source Watch admin runtime requires canonical runtime/admin APIs.');
  }

  const CACHE_MS = 45_000;
  let cached = null;
  let loadedAt = 0;
  let loading = null;
  let renderSeq = 0;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;',
  }[c]));
  const ico = name => `<i data-lucide="${name}" aria-hidden="true"></i>`;
  const fmt = value => {
    if (!value) return 'ещё не проверялся';
    try { return new Intl.DateTimeFormat('ru-RU', { dateStyle:'short', timeStyle:'short' }).format(new Date(value)); }
    catch { return String(value); }
  };
  const relative = value => {
    if (!value) return 'ещё не проверялся';
    const time = Date.parse(value);
    if (!Number.isFinite(time)) return fmt(value);
    const delta = Date.now() - time;
    if (delta < 60_000) return 'только что';
    if (delta < 3_600_000) return `${Math.max(1, Math.round(delta / 60_000))} мин назад`;
    if (delta < 86_400_000) return `${Math.max(1, Math.round(delta / 3_600_000))} ч назад`;
    return fmt(value);
  };
  const icons = () => admin.icons?.();
  const route = () => admin.activeRoute?.() || '';
  const isQueue = () => route() === 'section:queue';
  const isHealth = () => route() === 'health:1';

  async function load(force = false) {
    if (!force && cached && Date.now() - loadedAt < CACHE_MS) return cached;
    if (loading) return loading;
    loading = (async () => {
      const data = await admin.api('/api/app/admin/source-watch/status');
      cached = data || { summary:{}, watches:[], attention:[] };
      loadedAt = Date.now();
      return cached;
    })();
    try { return await loading; }
    finally { loading = null; }
  }

  function schedule(force = false, delay = 30) {
    const seq = ++renderSeq;
    setTimeout(() => {
      if (seq !== renderSeq || (!isQueue() && !isHealth())) return;
      void refreshVisible(force);
    }, delay);
  }

  async function refreshVisible(force = false) {
    if (!isQueue() && !isHealth()) return;
    let data;
    try { data = await load(force); }
    catch (error) {
      if (error?.name !== 'AbortError') console.warn('[Dollar TL] source watch status unavailable', error);
      return;
    }
    if (isQueue()) patchQueue(data);
    if (isHealth()) patchHealth(data);
  }

  function watchMap(data) {
    return new Map((Array.isArray(data?.watches) ? data.watches : []).map(row => [Number(row.submission_id), row]));
  }

  function patchQueue(data) {
    const map = watchMap(data);
    document.querySelectorAll('[data-qw-working]').forEach(card => {
      const id = Number(card.dataset.qwWorking);
      patchWorkingCard(card, map.get(id));
    });
    document.querySelectorAll('[data-qw-row]').forEach(row => {
      const id = Number(row.dataset.qwRow);
      patchQueueRow(row, map.get(id));
    });
    icons();
  }

  function patchWorkingCard(card, row) {
    const old = card.querySelector(':scope > [data-source-watch-inline]');
    if (!row) { old?.remove(); return; }
    const stamp = sourceStamp(row);
    if (old?.dataset.sourceWatchStamp === stamp) return;

    const node = old || document.createElement('div');
    node.dataset.sourceWatchInline = '1';
    node.dataset.sourceWatchStamp = stamp;
    const attention = Number(row.attention_count || 0);
    const tone = attention ? 'warn' : row.last_error ? 'error' : 'ok';
    const remote = remoteSummary(row);
    const change = attention ? changeSummary(row) : '';
    node.className = `admin-source-watch-detail ${tone}`;
    node.innerHTML = `${ico(attention ? 'triangle-alert' : row.last_error ? 'cloud-off' : 'cloud-check')}
      <div class="admin-source-watch-copy">
        <strong>${esc(attention ? change : remote)}</strong>
        <small>${esc(row.last_error ? `Ошибка проверки: ${row.last_error}` : `NovelPia #${row.external_id} · проверено ${relative(row.last_success_at)}`)}</small>
      </div>
      <div class="admin-source-watch-actions">
        ${attention ? `<button type="button" data-source-watch-ack="${Number(row.submission_id)}">${ico('check')} Проверено</button>` : ''}
        <button type="button" data-source-watch-refresh="${Number(row.submission_id)}">${ico('refresh-cw')} Обновить</button>
      </div>`;
    if (!old) card.querySelector('.admin-queue-working-top')?.after(node);
    bindNode(node);
  }

  function patchQueueRow(rowNode, row) {
    const title = rowNode.querySelector('.admin-queue-workspace-title');
    if (!title) return;
    let node = title.querySelector('[data-source-watch-row]');
    if (!row) { node?.remove(); return; }
    const stamp = sourceStamp(row);
    if (node?.dataset.sourceWatchStamp === stamp) return;
    if (!node) {
      node = document.createElement('span');
      node.dataset.sourceWatchRow = '1';
      node.className = 'admin-source-watch-queue-status';
      title.append(node);
    }
    node.dataset.sourceWatchStamp = stamp;
    const attention = Number(row.attention_count || 0);
    node.className = `admin-source-watch-queue-status${attention ? ' warn' : ''}`;
    node.innerHTML = `${ico(attention ? 'triangle-alert' : row.last_error ? 'cloud-off' : 'cloud-check')}<span>${esc(attention ? changeSummary(row) : remoteSummary(row))}</span>`;
  }

  function patchHealth(data) {
    const grid = document.querySelector('.ops-health-grid');
    if (!grid) return;
    const summary = data?.summary || {};
    let card = grid.querySelector('[data-source-watch-health]');
    const stamp = [summary.watched, summary.due, summary.errors, summary.attention, summary.last_success_at].join('|');
    if (!card) {
      card = document.createElement('article');
      card.dataset.sourceWatchHealth = '1';
      grid.append(card);
    }
    if (card.dataset.sourceWatchStamp !== stamp) {
      card.dataset.sourceWatchStamp = stamp;
      const bad = Number(summary.errors || 0) + Number(summary.attention || 0);
      card.className = `admin-panel ops-health-card ops-source-watch-card ${bad ? 'warn' : 'ok'}`;
      card.innerHTML = `<div class="ops-health-card-head"><div>${ico('cloud-cog')}<h2>Источники</h2></div><span>${bad ? 'CHECK' : 'OK'}</span></div>
        <div class="ops-health-metrics">
          ${metric(summary.watched, 'Под наблюдением')}
          ${metric(summary.due, 'Ждут проверки')}
          ${metric(summary.attention, 'Нужно разобрать')}
          ${metric(summary.errors, 'Ошибок provider')}
        </div>
        <p>${esc(summary.last_success_at ? `Последняя успешная проверка ${relative(summary.last_success_at)}.` : 'Source Watch ещё не выполнялся.')}</p>
        <div class="ops-source-watch-actions"><button type="button" data-source-watch-refresh-all>${ico('refresh-cw')} Проверить источники сейчас</button></div>`;
      bindNode(card);
    }

    let attentionHost = document.querySelector('[data-source-watch-attention]');
    const attention = Array.isArray(data?.attention) ? data.attention : [];
    if (!attention.length) {
      attentionHost?.remove();
      icons();
      return;
    }
    const attentionStamp = attention.slice(0, 20).map(item => item.id).join(',');
    if (!attentionHost) {
      attentionHost = document.createElement('section');
      attentionHost.dataset.sourceWatchAttention = '1';
      const firstIssues = document.querySelector('.ops-health-issues');
      if (firstIssues) firstIssues.before(attentionHost); else grid.after(attentionHost);
    }
    if (attentionHost.dataset.sourceWatchStamp !== attentionStamp) {
      attentionHost.dataset.sourceWatchStamp = attentionStamp;
      attentionHost.className = 'admin-panel ops-health-issues ops-source-watch-attention';
      attentionHost.innerHTML = `<div class="admin-panel-head"><div><h2>Изменения источников</h2><p>NovelPia изменился, но опасное изменение не применялось автоматически.</p></div><span class="ops-count">${attention.length}</span></div>
        <div class="ops-source-watch-list">${attention.slice(0,20).map(sourceAttentionRow).join('')}</div>`;
      bindNode(attentionHost);
    }
    icons();
  }

  function sourceAttentionRow(item) {
    const id = Number(item.submission_id);
    return `<article class="ops-source-watch-row"><div><strong>#${id} · ${esc(item.title || 'Без названия')}</strong><span>${esc(formatField(item.field_name))}: ${esc(item.old_value ?? '—')} → ${esc(item.new_value ?? '—')}</span><small>${fmt(item.created_at)}</small></div><button type="button" data-source-watch-ack="${id}">${ico('check')} Проверено</button></article>`;
  }

  function metric(value, label) {
    return `<div><strong>${Number(value || 0)}</strong><span>${esc(label)}</span></div>`;
  }

  function sourceStamp(row) {
    return [row.last_success_at, row.last_error, row.last_remote_chapter_count, row.last_remote_publication_status, row.attention_count, row.attention_field, row.attention_old_value, row.attention_new_value].join('|');
  }

  function sourceStatusLabel(status) {
    if (status === 'completed') return 'завершён';
    if (status === 'ongoing') return 'онгоинг';
    if (status === 'paused') return 'пауза';
    if (status === 'discontinued') return 'прекращён';
    return '';
  }

  function remoteSummary(row) {
    const chapters = Number(row.last_remote_chapter_count || 0);
    const status = sourceStatusLabel(row.last_remote_publication_status);
    if (chapters && status) return `Источник: ${chapters} глав · ${status}`;
    if (chapters) return `Источник: ${chapters} глав`;
    if (status) return `Источник: ${status}`;
    return `NovelPia #${row.external_id}`;
  }

  function changeSummary(row) {
    return `${formatField(row.attention_field)}: ${row.attention_old_value ?? '—'} → ${row.attention_new_value ?? '—'}`;
  }

  function formatField(field) {
    if (field === 'chapter_count') return 'Число глав';
    if (field === 'publication_status') return 'Статус публикации';
    if (field === 'source_title') return 'Название на NovelPia';
    return field || 'Источник изменился';
  }

  function bindNode(node) {
    node.querySelectorAll('[data-source-watch-ack]').forEach(button => button.addEventListener('click', () => void acknowledge(Number(button.dataset.sourceWatchAck), button)));
    node.querySelectorAll('[data-source-watch-refresh]').forEach(button => button.addEventListener('click', () => void refreshOne(Number(button.dataset.sourceWatchRefresh), button)));
    node.querySelectorAll('[data-source-watch-refresh-all]').forEach(button => button.addEventListener('click', () => void refreshAll(button)));
  }

  function releaseButton(button) {
    if (!button?.isConnected) return;
    button.disabled = false;
    button.classList.remove('admin-source-watch-loading');
  }

  async function acknowledge(submissionId, button) {
    if (!submissionId || button.disabled) return;
    button.disabled = true;
    button.classList.add('admin-source-watch-loading');
    try {
      await admin.api('/api/app/admin/source-watch/acknowledge', {
        method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ submission_id:submissionId }),
      });
      admin.toast?.('Изменение источника отмечено как проверенное.');
      cached = null;
      await refreshVisible(true);
    } catch (error) {
      admin.toast?.(error?.message || String(error), true);
    } finally {
      releaseButton(button);
    }
  }

  async function refreshOne(submissionId, button) {
    if (!submissionId || button.disabled) return;
    button.disabled = true;
    button.classList.add('admin-source-watch-loading');
    try {
      await admin.api('/api/app/admin/source-watch/refresh', {
        method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ submission_id:submissionId, limit:1 }),
      });
      admin.toast?.('NovelPia проверен.');
      cached = null;
      await refreshVisible(true);
    } catch (error) {
      admin.toast?.(error?.message || String(error), true);
    } finally {
      releaseButton(button);
    }
  }

  async function refreshAll(button) {
    if (button.disabled) return;
    button.disabled = true;
    button.classList.add('admin-source-watch-loading');
    try {
      await admin.api('/api/app/admin/source-watch/refresh', {
        method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ limit:8 }),
      });
      admin.toast?.('Проверка источников завершена.');
      cached = null;
      await refreshVisible(true);
    } catch (error) {
      admin.toast?.(error?.message || String(error), true);
    } finally {
      releaseButton(button);
    }
  }

  runtime.registerResponseHandler(async (response, context) => {
    if (response.ok && (context.pathname === '/api/app/admin/list' || context.pathname === '/api/app/admin/health')) {
      schedule(false, 40);
    }
    return response;
  });

  document.addEventListener('dtl:adminrender', () => schedule(false, 50));
  document.addEventListener('dtl:adminroutechange', () => schedule(false, 20));
  runtime.registerPatcher(() => {
    if (isQueue() || isHealth()) schedule(false, 20);
  });

  window.DTL_ADMIN_SOURCE_WATCH = Object.freeze({
    refresh: () => refreshVisible(true),
    status: () => cached,
  });
})();

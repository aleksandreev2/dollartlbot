var formatTime = window.formatTime || function formatTime(value) {
  const date = new Date(value || Date.now());
  if (!Number.isFinite(date.getTime())) return '—';
  try {
    return new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(date);
  } catch {
    return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }
};
window.formatTime = formatTime;

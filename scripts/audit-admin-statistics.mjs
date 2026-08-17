import fs from 'node:fs';
import assert from 'node:assert/strict';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const ui=read('public/app/admin-statistics.js');
const titleUi=read('public/app/admin-title-statistics.js');
const css=read('public/app/admin-statistics.css');
const titleCss=read('public/app/admin-title-statistics.css');
const navigation=read('public/app/admin-navigation.js');
const backend=read('src/admin-analytics.ts');

assert.match(ui,/registerRoute\('section:statistics'/,'Статистика должна быть отдельным маршрутом админки.');
assert.match(ui,/dataAdminSection='statistics'|dataset\.adminSection='statistics'/,'Навигация должна создавать отдельную вкладку статистики.');
assert.match(ui,/>Статистика<\/span>/,'Вкладка должна называться «Статистика».');
assert.match(ui,/7 дней/);
assert.match(ui,/30 дней/);
assert.match(ui,/90 дней/);
assert.match(ui,/Всё время/);
assert.match(ui,/Динамика/);
assert.match(ui,/Чтение и выдача файлов/);
assert.match(ui,/Состояние заявок/);
assert.match(ui,/Сколько занимает перевод/);
assert.match(ui,/Путь до заявки/);
assert.match(ui,/Языки оригинала/);
assert.match(ui,/Самые читаемые релизы/);
assert.match(ui,/Самые активные заявители/);
assert.match(ui,/Что ищут и не находят/);
assert.match(ui,/Качество публикаций/);
assert.match(ui,/Стоит посмотреть/);
assert.match(ui,/echarts@6\.1\.0/,'Графики должны использовать закреплённую версию библиотеки.');
assert.match(ui,/renderMode:'richText'/,'Подсказки графиков не должны вставлять пользовательский HTML.');
assert.match(ui,/\[data-admin-tools="analytics"\].*remove/s,'Старая вкладка «Аналитика» должна скрываться.');

for(const forbidden of ['PRODUCT ANALYTICS','Zero-result','Intent actions','Referral funnel','RAW opens','Telemetry events','Suggest drop-off']){
  assert.ok(!ui.includes(forbidden),`В новой статистике не должно быть видимой технической подписи: ${forbidden}`);
}

assert.match(titleUi,/data-stat-title-publication/,'Релизы в рейтинге должны открывать профиль тайтла.');
assert.match(titleUi,/Статистика тайтла/,'У тайтла должен быть отдельный подробный экран.');
assert.match(titleUi,/data-stat-title-user/,'В профиле тайтла должен быть список пользователей.');
assert.match(titleUi,/История действий пользователя/,'Должна быть подробная история действий конкретного пользователя.');
assert.match(titleUi,/EVENT_LABELS/,'Технические названия событий должны переводиться в понятные русские подписи.');
assert.ok(!titleUi.includes('Telemetry events'),'В профиле тайтла не должно быть технических подписей.');

assert.match(css,/statistics-kpis/);
assert.match(css,/@media\(max-width:540px\)/,'Статистика должна иметь мобильную раскладку.');
assert.match(titleCss,/statistics-title-user/,'Профиль тайтла должен иметь отдельную удобную раскладку пользователей.');
assert.match(titleCss,/@media\(max-width:540px\)/,'Профиль тайтла должен корректно работать на мобильных экранах.');
assert.match(navigation,/admin-statistics\.js/,'Статистика должна лениво подключаться только внутри админки.');
assert.match(navigation,/admin-statistics\.css/,'Стили статистики должны лениво подключаться только внутри админки.');
assert.match(navigation,/admin-title-statistics\.js/,'Профиль тайтла должен подключаться только внутри админки.');
assert.match(navigation,/admin-title-statistics\.css/,'Стили профиля тайтла должны подключаться только внутри админки.');
assert.ok(!navigation.includes("label('[data-admin-section=\"publishing\"]', 'Publishing')"),'Навигация админки не должна переименовывать публикацию на английский.');

assert.match(backend,/SUPPORTED_PERIODS=new Set\(\[0,7,30,90,365\]\)/,'Сервер должен поддерживать все периоды интерфейса.');
assert.match(backend,/previous/,'Сервер должен возвращать предыдущий период для сравнения.');
assert.match(backend,/publication_reader_events/,'Статистика должна учитывать реальные действия читателей.');
assert.match(backend,/top_releases/,'Сервер должен возвращать рейтинг релизов.');
assert.match(backend,/\/api\/app\/admin\/analytics\/title/,'Должен быть отдельный защищённый API профиля тайтла.');
assert.match(backend,/e\.user_id=\?/,'API должен уметь выдавать историю конкретного пользователя.');
assert.match(backend,/repeat_deliveries/,'Профиль должен учитывать повторные выдачи.');
assert.match(backend,/wait_hours/,'Сервер должен считать время ожидания заявки.');
assert.match(backend,/work_hours/,'Сервер должен считать время работы над заявкой.');
assert.match(backend,/active_users/,'Сервер должен считать активных пользователей.');

console.log('Admin statistics audit passed: Russian dashboard plus per-title and per-user reader history are wired with responsive UI and safe event labels.');
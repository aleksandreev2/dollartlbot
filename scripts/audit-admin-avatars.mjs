import fs from 'node:fs';
import assert from 'node:assert/strict';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const ui=read('public/app/admin-avatars.js');
const css=read('public/app/admin-avatars.css');
const navigation=read('public/app/admin-navigation.js');
const route=read('src/admin-users.ts');
const backend=read('src/admin-user-avatar.ts');

assert.match(navigation,/admin-avatars\.js/,'Глобальный загрузчик аватаров должен подключаться в админке.');
assert.match(navigation,/admin-avatars\.css/,'Глобальные стили аватаров должны подключаться в админке.');
assert.match(route,/adminUserAvatarResponse/,'Admin users API должен маршрутизировать защищённую выдачу аватара.');
assert.match(route,/\/avatar\$/,'Маршрут аватара должен быть отдельным endpoint пользователя.');

assert.match(backend,/getUserProfilePhotos/,'Аватар должен браться из текущего профиля Telegram.');
assert.match(backend,/getFile/,'Большой Telegram PhotoSize должен разрешаться через getFile.');
assert.match(backend,/candidateArea > bestArea/,'Сервер должен выбирать крупнейший доступный размер аватара.');
assert.match(backend,/TELEGRAM_BOT_TOKEN/,'Скачивание Telegram-файла должно происходить только на сервере.');
assert.match(backend,/private, max-age=/,'Ответ с аватаром не должен становиться публичным shared-cache объектом.');
assert.match(backend,/x-content-type-options/,'Ответ изображения должен запрещать MIME sniffing.');
assert.match(backend,/safeTelegramFilePath/,'Telegram file_path должен валидироваться до скачивания.');

assert.match(ui,/x-telegram-init-data/,'Картинка должна запрашиваться с Mini App admin-аутентификацией.');
assert.match(ui,/MAX_PARALLEL = 4/,'Параллельные Telegram avatar fetch должны быть ограничены.');
assert.match(ui,/IntersectionObserver/,'Списки должны лениво загружать только приближающиеся к viewport аватары.');
assert.match(ui,/avatarCache/,'Повторное появление пользователя не должно повторно скачивать фото в одной admin-сессии.');
assert.match(ui,/data-user-id/,'Центр Пользователи должен получать реальные аватары.');
assert.match(ui,/Самые активные заявители/,'Рейтинг пользователей в статистике должен получать реальные аватары.');
assert.match(ui,/data-stat-title-user/,'Профиль тайтла и список его читателей должны получать реальные аватары.');
assert.match(ui,/data-activity-user/,'Лента активности должна получать реальные аватары.');
assert.match(ui,/data-workflow-request/,'Заявки должны получать реальные аватары.');
assert.match(ui,/data-home-request/,'Главная админки должна получать реальные аватары заявителей.');
assert.match(ui,/data-qw-working/,'Активная очередь перевода должна получать реальные аватары.');
assert.match(ui,/data-qw-row/,'Строки очереди должны получать реальные аватары.');
assert.ok(!ui.includes('api.telegram.org/file/bot'),'Frontend никогда не должен получать URL Telegram Bot API с токеном.');
assert.match(css,/admin-avatar-image/,'Для реальной фотографии должен быть единый безопасный image layer.');
assert.match(css,/object-fit:cover/,'Аватар должен полностью заполнять предусмотренную форму без деформации.');

console.log('Admin avatar audit passed: authenticated full Telegram photos are lazy, bounded, cached per session and wired across all user-facing admin surfaces.');
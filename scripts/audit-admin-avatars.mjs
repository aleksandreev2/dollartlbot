import fs from 'node:fs';
import assert from 'node:assert/strict';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const ui=read('public/app/admin-avatars.js');
const css=read('public/app/admin-avatars.css');
const navigation=read('public/app/admin-navigation.js');
const route=read('src/admin-users.ts');
const backend=read('src/admin-user-avatar.ts');
const db=read('src/db.ts');
const telegram=read('src/telegram.ts');
const migration=read('migrations/0046_telegram_user_photos.sql');

assert.match(navigation,/admin-avatars\.js/,'Глобальный загрузчик аватаров должен подключаться в админке.');
assert.match(navigation,/admin-avatars\.css/,'Глобальные стили аватаров должны подключаться в админке.');
assert.match(route,/adminUserAvatarResponse/,'Admin users API должен маршрутизировать защищённую выдачу аватара.');
assert.match(route,/\/avatar\$/,'Маршрут аватара должен быть отдельным endpoint пользователя.');

assert.match(telegram,/photo_url\?: string/,'Telegram WebAppUser photo_url должен сохраняться в типизированных данных пользователя.');
assert.match(migration,/telegram_photo_url TEXT/,'D1 должна хранить подписанный Telegram photo_url.');
assert.match(migration,/telegram_photo_updated_at TEXT/,'D1 должна хранить время наблюдения аватара.');
assert.match(db,/normalizeTelegramPhotoUrl/,'Перед сохранением Telegram photo_url должен проходить URL-проверку.');
assert.match(db,/telegram_photo_url = CASE/,'Повторный Mini App вход должен обновлять сохранённую фотографию.');
assert.match(db,/isTelegramPhotoSchemaMissing/,'Миграция аватаров не должна ломать публичный Mini App при кратком schema race.');

assert.match(backend,/storedTelegramPhotoUrl/,'Сервер должен сначала использовать подписанный photo_url из Mini App.');
assert.match(backend,/fetchStoredTelegramPhoto/,'Подписанная фотография должна проксироваться сервером, а не раскрываться как внутренний admin URL.');
assert.match(backend,/x-dtl-avatar-source/,'Admin avatar endpoint должен сообщать диагностический источник изображения.');
assert.match(backend,/avatarError/,'Техническая ошибка аватара не должна маскироваться под отсутствие фотографии.');
assert.match(backend,/status: 502/,'Временный upstream-сбой должен быть отличим от честного 204 без фотографии.');
assert.match(backend,/getChat/,'Текущий аватар приватного Telegram-чата должен оставаться Bot API fallback.');
assert.match(backend,/big_file_id/,'Сервер должен предпочитать большой текущий ChatPhoto в Bot API fallback.');
assert.match(backend,/getUserProfilePhotos/,'История профильных фото должна оставаться вторым fallback для совместимости.');
assert.match(backend,/getFile/,'Telegram file_id должен разрешаться через getFile.');
assert.match(backend,/candidateArea > bestArea/,'Fallback должен выбирать крупнейший доступный размер аватара.');
assert.match(backend,/TELEGRAM_BOT_TOKEN/,'Скачивание Bot API Telegram-файла должно происходить только на сервере.');
assert.match(backend,/private, max-age=/,'Ответ с аватаром не должен становиться публичным shared-cache объектом.');
assert.match(backend,/x-content-type-options/,'Ответ изображения должен запрещать MIME sniffing.');
assert.match(backend,/safeTelegramFilePath/,'Telegram file_path должен валидироваться до скачивания.');

assert.match(ui,/x-telegram-init-data/,'Картинка должна запрашиваться с Mini App admin-аутентификацией.');
assert.match(ui,/MAX_PARALLEL = 4/,'Параллельные Telegram avatar fetch должны быть ограничены.');
assert.match(ui,/IntersectionObserver/,'Списки должны лениво загружать только приближающиеся к viewport аватары.');
assert.match(ui,/avatarCache/,'Успешный аватар должен кэшироваться в одной admin-сессии.');
assert.match(ui,/avatarCache\.delete\(userId\)/,'Неуспешный avatar fetch нельзя навсегда кэшировать как отсутствие фото.');
assert.match(ui,/TRANSIENT_RETRY_MS/,'Временные avatar-сбои должны автоматически повторяться.');
assert.match(ui,/cache: 'no-store'/,'Повтор после сбоя не должен получать старую ошибку из browser cache.');
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

console.log('Admin avatar audit passed: signed Mini App profile photos are persisted, proxied, retried on transient failures and backed by Bot API fallbacks.');

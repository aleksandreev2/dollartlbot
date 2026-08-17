import fs from 'node:fs';
import { test, expect } from '@playwright/test';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('home library opens title details instead of Telegram release posts',()=>{
  const home=read('public/app/home-v2.js');
  expect(home).toContain("title:'Library'");
  expect(home).toContain('data-reader-title');
  expect(home).toContain('app.openNovel(id)');
  expect(home).not.toContain('openTelegramLink(link.href)');
});

test('reader detail requires thank-you flow and exposes localized terms',()=>{
  const ui=read('public/app/reader-title-ui.js');
  expect(ui).toContain('Thank you & download');
  expect(ui).toContain('Спасибо и скачать');
  expect(ui).toContain('/api/app/reader/terms');
  expect(ui).toContain('/thank-you');
  expect(ui).toContain('readerState?.terms?.accepted');
});

test('quota counts unique novels and fingerprint never embeds Telegram identity',()=>{
  const quota=read('migrations/0043_reader_download_policy.sql');
  const epub=read('src/fingerprint/epub.ts');
  expect(quota).toContain('PRIMARY KEY (day_key, user_id, submission_id)');
  expect(quota).toContain('reader_daily_reservations');
  expect(epub).toContain('META-INF/dollartl.xml');
  expect(epub).toContain('dollartl-notice.xhtml');
  expect(epub).not.toContain('telegram_id');
  expect(epub).not.toContain('username');
});

test('personalized EPUB rollout is feature-flagged and fail-open by default',()=>{
  const delivery=read('src/reader-personalization.ts');
  expect(delivery).toContain("reader_personalized_epub_enabled', false");
  expect(delivery).toContain("reader_fingerprint_fail_closed', false");
  expect(delivery).toContain("file_id:''");
});

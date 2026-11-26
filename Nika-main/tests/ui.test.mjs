import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('هر workspace از همان نسخه ماژول pages و icons استفاده می‌کند', async () => {
  const [main, admin, ui] = await Promise.all([
    readFile(new URL('../public/js/main.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/js/admin.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/js/ui.js', import.meta.url), 'utf8')
  ]);
  const version = main.split("from './pages.js?v=")[1]?.split("'")[0];
  assert.ok(version, 'نسخه ماژول pages در main مشخص باشد');
  assert.ok(admin.includes("from './pages.js?v=" + version[1] + "'"), 'admin و main باید یک نمونه از pages را وارد کنند');
  assert.ok(ui.includes("from './icons.js?v=2'"), 'ماژول آیکون در ui باید با بقیه یکسان باشد');
});

test('onSubmit مجموعه ورودی‌های مبلغ را با querySelectorAll می‌گیرد', async () => {
  const source = await readFile(new URL('../public/js/ui.js', import.meta.url), 'utf8');
  const start = source.indexOf('export function onSubmit(');
  const end = source.indexOf('\nexport const num', start);
  assert.ok(start >= 0 && end > start, 'تابع onSubmit باید وجود داشته باشد');
  const body = source.slice(start, end);
  assert.match(body, /\$\$\(['"]input\[name="amount"\], input\[data-money="true"\]['"],\s*form\)/);
  assert.equal(body.split('\n').some(line => line.startsWith("  $('input[name")), false);
});

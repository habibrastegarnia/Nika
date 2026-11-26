import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('هر workspace از همان نسخه ماژول pages و icons استفاده می‌کند', async () => {
  const [main, admin, ui] = await Promise.all([
    readFile(new URL('../public/js/main.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/js/admin.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/js/ui.js', import.meta.url), 'utf8')
  ]);
  const getVersion = source => {
    const marker = 'pages.js?v=';
    const at = source.indexOf(marker);
    return at < 0 ? null : source.slice(at + marker.length).split("'")[0];
  };
  const mainVersion = getVersion(main), adminVersion = getVersion(admin);
  assert.ok(mainVersion, 'نسخه ماژول pages در main مشخص باشد');
  assert.equal(adminVersion, mainVersion, 'admin و main باید یک نسخه از pages را وارد کنند');
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

test('میانبرهای مالی فرم مربوط را در پنجره شناور باز می‌کنند، نه داخل داشبورد', async () => {
  const source = await readFile(new URL('../public/js/admin.js', import.meta.url), 'utf8');
  const start = source.indexOf('async function financeTab()');
  const end = source.indexOf('\nasync function registerUnitPaymentTab()', start);
  assert.ok(start >= 0 && end > start, 'تابع financeTab باید وجود داشته باشد');
  const body = source.slice(start, end);
  assert.match(body, /\$\{raw\(join\(shortcuts\)\)\}/);
  assert.match(body, /class="categories is-manager nika-finance-shortcuts"/);
  assert.match(body, /class="category nika-finance-shortcut"/);
  assert.match(body, /raw\(iconMarkup\(iconName\)\)/);
  assert.match(body, /addShortcut\('unit-payment', 'ثبت شارژ واحدها', 'wallet'\)/);
  assert.match(body, /addShortcut\('payment-approvals', 'تأیید پرداخت‌ها', 'badge-check'\)/);
  assert.match(body, /addShortcut\('expense-create', 'ثبت هزینه', 'receipt-text'\)/);
  assert.match(body, /addShortcut\('expense-review', 'بررسی درخواست‌های هزینه', 'clipboard-list'\)/);
  assert.match(body, /addShortcut\('expense-finalize', 'تأیید نهایی هزینه‌ها', 'shield-check'\)/);
  assert.match(body, /openModal\(action\.title, action\.view\.html\)/);
  assert.match(body, /action\.view\.bind\?\.\(modal\)/);
  assert.doesNotMatch(body, /\$\{raw\(join\(panels\)\)\}/);
  assert.doesNotMatch(body, /financeSection\(/);
  const reload = source.match(/const reload = \(\) => \{ closeModal\(\); return loadTab\(\); \};/);
  assert.ok(reload, 'پس از عملیات موفق، پنجره فرم بسته و داشبورد تازه‌سازی شود');
});

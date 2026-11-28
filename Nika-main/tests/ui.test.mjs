import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('ماژول‌های مشترک در تمام workspaceها از URL یکسان استفاده می‌کنند', async () => {
  const [main, admin, pages, ui] = await Promise.all([
    readFile(new URL('../public/js/main.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/js/admin.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/js/pages.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/js/ui.js', import.meta.url), 'utf8')
  ]);
  const modules = { main, admin, pages, ui };
  const importUrl = (source, name) => {
    const escapedName = name.replace('.', '\\.');
    const match = source.match(new RegExp("from '\\./" + escapedName + "\\?([^']+)'"));
    return match ? name + '?' + match[1] : null;
  };
  for (const name of ['util.js', 'ui.js', 'icons.js']) {
    const users = Object.entries(modules).filter(([key]) =>
      name !== 'ui.js' || key !== 'ui'
    );
    const urls = users.map(([key, source]) => [key, importUrl(source, name)]);
    assert.equal(urls.length, users.length, name + ' باید در همه مصرف‌کننده‌ها با نسخه مشخص وارد شود');
    assert.ok(urls.length >= 2, name + ' باید در چند ماژول استفاده شود');
    assert.equal(new Set(urls.map(([, url]) => url)).size, 1,
      name + ' باید در همه مصرف‌کننده‌ها URL یکسان داشته باشد: ' + JSON.stringify(urls));
  }
  const pageUrls = [importUrl(main, 'pages.js'), importUrl(admin, 'pages.js')];
  assert.equal(pageUrls[0], pageUrls[1], 'admin و main باید یک نسخه از pages را وارد کنند');
});

test('تشخیص HTML امن بین نسخه‌های تکراری util نیز پایدار می‌ماند', async () => {
  const source = await readFile(new URL('../public/js/util.js', import.meta.url), 'utf8');
  assert.match(source, /Symbol\.for\(['"]nika\.safe-html['"]\)/);
  assert.match(source, /v\[SAFE_HTML\]\s*===\s*true/);
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

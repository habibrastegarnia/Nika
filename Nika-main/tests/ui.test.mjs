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

test('تمام آیکون‌های پنجره پیام و انتخاب مخاطب در رجیستری موجودند', async () => {
  const [icons, pages] = await Promise.all([
    readFile(new URL('../public/js/icons.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/js/pages.js', import.meta.url), 'utf8')
  ]);
  const required = ['inbox', 'send', 'pencil', 'megaphone', 'nika-board', 'user-round-check'];
  for (const name of required) {
    assert.ok(icons.includes("'" + name + "':") || icons.includes(name + ":"), 'آیکون ' + name + ' باید ثبت شده باشد');
  }
  assert.match(pages, /function openMessageRecipientPicker\(/);
  assert.match(pages, /iconMarkup\('user-round-check'\)/);
});


test('تمام صفحات داخلی از همان پنجره شناور مشترک صندوق پیام استفاده می‌کنند', async () => {
  const source = await readFile(new URL('../public/js/ui.js', import.meta.url), 'utf8');
  const start = source.indexOf('export function route(');
  const end = source.indexOf('\nasync function run(', start);
  assert.ok(start >= 0 && end > start, 'تابع route باید وجود داشته باشد');
  const body = source.slice(start, end);
  assert.match(body, /replaceRouteModal\(title, body\)/);
  assert.doesNotMatch(body, /#pageView|page-close/);
  assert.match(source, /const modalStack = \[\]/);
  assert.match(source, /modalStack\.push\(/);
  assert.match(source, /modalStack\.pop\(/);
  assert.match(source, /handlers\[name\] = host\[name\]/);
  assert.match(source, /host\[name\] = previous\.handlers\[name\]/);
  assert.match(source, /page-modal-sub/);
});


test('تقویم ماهانه و هفتگی تعطیلات قرمز و رویداد بعدی را با حلقه سبز نشان می‌دهند', async () => {
  const source = await readFile(new URL('../public/js/pages.js', import.meta.url), 'utf8');
  const weeklyStart = source.indexOf('export async function loadWeeklyCalendar()');
  const homeEnd = source.indexOf('export async function loadHome()', weeklyStart);
  const monthStart = source.indexOf('export async function calendarPage(');
  const monthEnd = source.indexOf('// ======================', monthStart + 40);
  assert.ok(weeklyStart >= 0 && homeEnd > weeklyStart, 'تابع تقویم هفتگی باید وجود داشته باشد');
  assert.ok(monthStart >= 0 && monthEnd > monthStart, 'تابع تقویم ماهانه باید وجود داشته باشد');
  const weekly = source.slice(weeklyStart, homeEnd);
  const monthly = source.slice(monthStart, monthEnd);
  assert.match(weekly, /const buildingItems = allItems\.filter\(event => !String\(event\.id\)\.startsWith\('holiday:'\)\)/, 'فقط رویدادهای ثبت‌شده ساختمان در فهرست هفتگی باشند');
  assert.match(monthly, /const buildingItems = items\.filter\(event => !String\(event\.id\)\.startsWith\('holiday:'\)\)/, 'مناسبت‌های تقویمی در فهرست رویدادهای ساختمان نمایش داده نشوند');
  assert.match(weekly, /const holidayDates = new Set\(allItems\.filter\(event => event\.isOfficialHoliday\)/);
  assert.match(weekly, /\$\{holiday \? 'holiday' : ''\}/);
  assert.match(weekly, /holidayDates\.has\(day\.key\) \|\| i === 6/, 'جمعه در نمای هفتگی تعطیل است');
  assert.match(weekly, /\$\{pulse \? 'next-event' : ''\}/);
  assert.match(monthly, /const holidayDays = new Set\(items\.filter\(event => event\.isOfficialHoliday\)/);
  assert.match(monthly, /\$\{isHoliday \? 'holiday' : ''\}/);
  assert.match(monthly, /holidayDays\.has\(d\) \|\| new Date\(start\.getTime\(\) \+ \(d - 1\) \* 864e5\)\.getUTCDay\(\) === 5/, 'جمعه در نمای ماهانه تعطیل است');
  assert.match(monthly, /\$\{isNextEvent \? 'next-event' : ''\}/);
  assert.match(monthly, /for \(let d = 1; d <= len; d\+\+\)/, 'نمای ماهانه فقط روزهای همان ماه را تولید کند');
  assert.doesNotMatch(weekly + monthly, /class="event-dot/, 'نقطه رویداد باید با حلقه دور شماره روز جایگزین شده باشد');
  const css = await readFile(new URL('../public/app.css', import.meta.url), 'utf8');
  assert.match(css, /\.page-calendar span\.day-cell\.holiday \.day-number/);
  assert.match(css, /\.page-calendar span\.day-cell\.next-event \.day-number/);\n  assert.match(css, /\.page-calendar span\.day-cell\.today \.day-number\\{border-color:transparent/);\n  assert.match(css, /\.weekly \.weekly-calendar span\.day-cell\.today \.day-number\\{border-color:transparent/);\n  assert.match(source, /isOfficialHoliday/);
  assert.match(css, /@keyframes calendarEventRing/);
});

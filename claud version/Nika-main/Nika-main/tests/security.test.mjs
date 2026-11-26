import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, Client, bootstrap, makeUser, activate } from './helpers.mjs';
import { runReminders } from '../src/reminders.js';
import { jTehran } from '../src/jcal.js';

const env = makeEnv();
let chair, S = {};

test('راه‌اندازی: رمز موقت تصادفی، بدون رمز ثابت، و config-check پس از راه‌اندازی چیزی فاش نمی‌کند', async () => {
  const pre = await new Client(env).get('/api/config-check');
  assert.equal(pre.data.initialized, false); assert.equal(pre.data.jwt, true);
  const boot = await bootstrap(env); chair = boot.chair;
  assert.ok(boot.setup.data.tempPassword.length >= 12 && boot.setup.data.tempPassword !== 'admin');
  assert.equal((await new Client(env).login('Admin', 'admin')).status, 401);
  assert.deepEqual((await new Client(env).get('/api/config-check')).data, { ok: true, initialized: true });
});

test('رمز اولیه‌ی ساکن به‌صورت پیش‌فرض تصادفی است (نه شماره موبایل) و حداقل رمز ۸ کاراکتر است', async () => {
  const u = await makeUser(chair, { name: 'ساکن', accountType: 'resident', unit: '5', phone: '09125550001', roles: [] });
  assert.ok(u.tempPassword && !u.initialPasswordIsPhone);
  assert.equal((await new Client(env).login('5', '09125550001')).status, 401, 'قبل از فعال‌سازی نمی‌توان با موبایل وارد شد');
  const c = new Client(env); assert.equal((await c.login('5', u.tempPassword)).status, 200);
  assert.equal((await c.post('/api/password', { newPassword: 'abc1234' })).data.error, 'WEAK_PASSWORD');
  assert.equal((await c.post('/api/password', { newPassword: 'abc12345' })).status, 200);
  // بازنشانی هم رمز تصادفی می‌دهد
  const id = (await chair.get('/api/admin/users?q=5')).data.users.find(x => x.phone === '09125550001').id;
  const r = await chair.post(`/api/admin/users/${id}/reset-password`, { reason: 'آزمون' });
  assert.ok(r.data.tempPassword && !r.data.initialPasswordIsPhone);
});

test('حالت قدیمی INITIAL_PASSWORD_MODE=phone هنوز در دسترس است', async () => {
  env.INITIAL_PASSWORD_MODE = 'phone';
  try {
    const u = await makeUser(chair, { name: 'قدیمی', accountType: 'resident', unit: '6', phone: '09125550002', roles: [] });
    assert.equal(u.initialPasswordIsPhone, true);
    assert.equal((await new Client(env).login('6', '09125550002')).status, 200);
  } finally { delete env.INITIAL_PASSWORD_MODE; }
});

test('مدیر اجرایی و مدیر سامانه نمی‌توانند حساب‌های مدیریتی را تصاحب کنند؛ رئیس می‌تواند', async () => {
  const fin = await makeUser(chair, { name: 'مالی', accountType: 'staff', phone: '09125551001', roles: ['finance'] });
  const exe = await makeUser(chair, { name: 'اجرایی', accountType: 'staff', phone: '09125551002', roles: ['executive'] });
  const sys = await makeUser(chair, { name: 'سامانه', accountType: 'staff', phone: '09125551003', roles: ['system_admin'] });
  const brd = await makeUser(chair, { name: 'هیئت', accountType: 'staff', phone: '09125551004', roles: ['board'] });
  const resident = await makeUser(chair, { name: 'ساکن ۷', accountType: 'resident', unit: '7', phone: '09125551005', roles: [] });
  S = { finId: fin.id, residentId: resident.id, brdId: brd.id };
  S.exec = await activate(env, '09125551002', exe.tempPassword, 'Exec-Strong-Pass-1');
  S.sys = await activate(env, '09125551003', sys.tempPassword, 'Sys-Strong-Pass-12');
  S.fin = await activate(env, '09125551001', fin.tempPassword, 'Fin-Strong-Pass-12');
  for (const actor of [S.exec, S.sys]) {
    assert.equal((await actor.post(`/api/admin/users/${fin.id}/reset-password`, {})).status, 403);
    assert.equal((await actor.patch(`/api/admin/users/${fin.id}`, { phone: '09125559999' })).status, 403);
    assert.equal((await actor.del(`/api/admin/users/${brd.id}`)).status, 403);
    assert.equal((await actor.post(`/api/admin/users/${resident.id}/reset-password`, {})).status, 200, 'ساکن عادی قابل مدیریت است');
  }
  assert.equal((await chair.post(`/api/admin/users/${fin.id}/reset-password`, { reason: 'آزمون' })).status, 200);
  const stillFin = new Client(env); // رمز مدیر مالی بازنشانی شد؛ نشست قبلی او باید باطل باشد
  assert.equal((await S.fin.get('/api/me')).status, 401);
  assert.equal((await stillFin.login('09125551001', 'Fin-Strong-Pass-12')).status, 401);
});

test('قفل ورود: مهاجم از IP دیگر نمی‌تواند حساب قربانی را قفل کند', async () => {
  const u = await makeUser(chair, { name: 'قربانی', accountType: 'resident', unit: '8', phone: '09125552001', roles: [] });
  const victim = await activate(env, '8', u.tempPassword, 'Victim-Pass-1234');
  const attacker = new Client(env, '66.66.66.66');
  for (let i = 0; i < 5; i++) assert.equal((await attacker.login('8', 'wrong-guess-1')).status, 401);
  assert.equal((await attacker.login('8', 'wrong-guess-1')).status, 429, 'مهاجم خودش قفل می‌شود');
  assert.equal((await new Client(env, '77.77.77.77').login('8', 'Victim-Pass-1234')).status, 200, 'کاربر واقعی از IP دیگر وارد می‌شود');
});

test('تغییر رمز: تلاش‌های اشتباه محدود می‌شود و oracle رمز واحد دیگر باز نیست', async () => {
  const o = await makeUser(chair, { name: 'مالک ۹', accountType: 'owner', unit: '9', phone: '09125553001', roles: [] });
  const r = await makeUser(chair, { name: 'ساکن ۹', accountType: 'resident', unit: '9', phone: '09125553002', roles: [] });
  await activate(env, '09125553001'.length ? '9' : '9', o.tempPassword, 'Owner9-Secret-Pass');
  const res = new Client(env); await res.login('9', r.tempPassword);
  await res.post('/api/password', { newPassword: 'Resident9-Pass-12' });
  let last;
  for (let i = 0; i < 6; i++) last = await res.post('/api/password', { currentPassword: 'Resident9-Pass-12', newPassword: 'Owner9-Secret-Pass' });
  assert.equal(last.status, 429, 'حدس‌زدن رمز مالک از طریق تغییر رمز بعد از چند بار قفل می‌شود');
  const c2 = new Client(env); await c2.login('9', r.tempPassword).catch(() => {});
});

test('حساب «مالک و ساکن» اطلاعیه‌ی هر دو گروه را می‌بیند و اطلاعیه‌ی مدیران را نه', async () => {
  const b = await makeUser(chair, { name: 'هر دو', accountType: 'both', unit: '10', phone: '09125554001', roles: [] });
  const both = await activate(env, '10', b.tempPassword, 'Both-Strong-Pass-1');
  for (const [title, audience] of [['برای همه', 'all'], ['ساکنان', 'resident'], ['مالکان', 'owner'], ['مدیران', 'staff']])
    assert.equal((await chair.post('/api/notices', { title, body: 'متن', audience })).status, 201);
  const titles = (await both.get('/api/notices')).data.notices.map(n => n.title).sort();
  assert.deepEqual(titles, ['برای همه', 'ساکنان', 'مالکان'].sort());
  assert.equal((await chair.get('/api/notices')).data.notices.length, 4, 'حساب مدیر/کارکنان همه را می‌بیند');
});

test('شارژ مالکانه بدون ذکر سال، سال جاری شمسی را می‌گیرد', async () => {
  const r = await chair.post('/api/finance/charges', { fund: 'owner', amount: 1000, title: 'مالکانه جاری', reason: 'آزمون' });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const rows = (await chair.get('/api/transactions?fund=owner&scope=all&kind=charge')).data.transactions;
  assert.ok(rows.length > 0 && rows.every(t => t.period === String(jTehran().y)));
});

test('تقویم: تکرار ماهانه «۳۱ام» برای همیشه روی ۳۰ یا ۲۹ نمی‌ماند و تکرار هفتگی درست است', async () => {
  const mk = b => chair.post('/api/events', { reason: 'آزمون', ...b });
  assert.equal((await mk({ title: 'ماهانه', event_date: '1405-01-31', recurrence: 'monthly' })).status, 201);
  assert.equal((await mk({ title: 'هفتگی', event_date: '1404-01-01', event_time: '18:00', recurrence: 'weekly' })).status, 201);
  const days = async (m, title) => (await chair.get(`/api/events?month=${m}`)).data.items.filter(e => e.title === title && !e.isHoliday).map(e => e.event_date);
  assert.deepEqual(await days('1405-02', 'ماهانه'), ['1405-02-31']);
  assert.deepEqual(await days('1405-08', 'ماهانه'), ['1405-08-30']);
  assert.deepEqual(await days('1405-12', 'ماهانه'), ['1405-12-29']);
  assert.deepEqual(await days('1406-01', 'ماهانه'), ['1406-01-31']);
  assert.deepEqual(await days('1405-09', 'هفتگی'), ['1405-09-06', '1405-09-13', '1405-09-20', '1405-09-27']);
});

test('یادآوری‌ها بدون خطا و سریع اجرا می‌شوند (حتی با رویدادهای تکرارشونده)', async () => {
  await makeUser(chair, { name: 'مستأجر قرارداددار', accountType: 'resident', unit: '11', phone: '09125555001', roles: [], contractStartDate: '1405-01-12', contractEndDate: '1405-10-12' });
  const t0 = performance.now();
  const r = await runReminders(env, new Date(Date.UTC(2026, 11, 3, 4, 30)));
  assert.equal(typeof r.sent, 'number'); assert.ok(performance.now() - t0 < 3000);
  // یادآوری رویداد فردا: ۱۴۰۵-۰۹-۱۳ هفتگی است (جمعه) → یادآوری در ۱۲ام (۲۰۲۶-۱۲-۰۳ = ۱۴۰۵-۰۹-۱۲)
  const msgs = (await env.DB.prepare("SELECT title FROM messages WHERE automatic_key LIKE 'calendar:%'").all()).results;
  assert.ok(msgs.some(m => m.title.includes('هفتگی')), JSON.stringify(msgs));
  const contract = (await env.DB.prepare("SELECT title FROM messages WHERE automatic_key LIKE 'contract-end:%'").all()).results;
  assert.ok(contract.length >= 1 && contract[0].title.includes('پایان قرارداد'), 'یادآوری پایان قرارداد (یک ماه قبل) ارسال می‌شود');
});

test('جداسازی وظایف فرد: جانشین مدیر اجرایی که خودش مدیر مالی است نمی‌تواند درخواستِ اصلاح‌کرده‌ی خود را بررسی کند', async () => {
  // مدیر اجرایی (S.exec) جانشینش را «مدیر مالی» (S.fin، با رمز جدید) تعیین می‌کند
  const fin = await activate(env, '09125551001', (await chair.post(`/api/admin/users/${S.finId}/reset-password`, { reason: 'آزمون' })).data.tempPassword, 'Fin-Strong-Pass-34');
  const r = await S.exec.post('/api/expense-requests', { fund: 'monthly', amount: 1000, documentTitle: 'هزینه', documentDate: '1405-09-01', description: 'شرح' });
  assert.equal(r.status, 201);
  assert.equal((await S.exec.put('/api/delegations/executive', { enabled: true, delegateId: S.finId })).status, 200);
  const fin2 = await makeUser(chair, { name: 'مالی دوم', accountType: 'staff', phone: '09125551099', roles: ['finance'] });
  const f2 = await activate(env, '09125551099', fin2.tempPassword, 'Fin2-Strong-Pass-1');
  assert.equal((await f2.post(`/api/expense-requests/${r.data.id}/finance-decision`, { status: 'revision', reason: 'اصلاح شود' })).status, 200);
  assert.equal((await fin.patch(`/api/expense-requests/${r.data.id}`, { reason: 'اصلاح توسط جانشین' })).status, 200);
  const blocked = await fin.post(`/api/expense-requests/${r.data.id}/finance-decision`, { status: 'approved' });
  assert.equal(blocked.status, 403); assert.equal(blocked.data.error, 'SELF_APPROVAL');
  assert.equal((await f2.post(`/api/expense-requests/${r.data.id}/finance-decision`, { status: 'approved' })).status, 200);
});

test('پشتیبان‌گیری: رمز هش‌شده و تصویر پروفایل در فایل آرشیو نیست', async () => {
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  await chair.put('/api/avatar', { avatarData: png });
  const res = await chair.call('GET', '/api/backups/export');
  const text = await res.res.text();
  assert.ok(!text.includes('password_hash') && !text.includes('password_salt') && !text.includes('avatar_data') && !text.includes(png.slice(30, 80)));
});

test('پاک‌سازی کامل: نیاز به عبارت تأیید و رمز دارد و با داده‌ی واقعی (درخواست هزینه، جانشینی، پشتیبان) خطا نمی‌دهد', async () => {
  assert.equal((await S.exec.post('/api/admin/reset-test-data', { confirm: 'RESET-ALL-DATA', currentPassword: 'x' })).status, 403);
  assert.equal((await chair.post('/api/admin/reset-test-data', { reason: 'آزمون' })).data.error, 'CONFIRM_REQUIRED');
  assert.equal((await chair.post('/api/admin/reset-test-data', { reason: 'آزمون', confirm: 'RESET-ALL-DATA', currentPassword: 'wrong-wrong-1' })).data.error, 'WRONG_PASSWORD');
  const ok = await chair.post('/api/admin/reset-test-data', { reason: 'آزمون', confirm: 'RESET-ALL-DATA', currentPassword: 'Chair-Strong-Pass-1' });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  const users = (await chair.get('/api/admin/users')).data.users; assert.equal(users.length, 1);
  assert.equal((await chair.get('/api/me')).status, 200, 'رئیس همچنان وارد است');
  const left = await env.DB.prepare('SELECT (SELECT COUNT(*) FROM expense_requests) a,(SELECT COUNT(*) FROM manager_delegations) b,(SELECT COUNT(*) FROM transactions) c').first();
  assert.deepEqual({ ...left }, { a: 0, b: 0, c: 0 });
});

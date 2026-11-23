import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { createDB } from './d1-shim.mjs';

const BASE = 'https://nika.test';
const env = { DB: createDB(), JWT_SECRET: 'x'.repeat(40), BOOTSTRAP_KEY: 'setup-key-123', ENVIRONMENT: 'production', ALLOW_SELF_APPROVAL: 'false', ASSETS: { fetch: () => new Response('asset') } };

class Client {
  constructor(label) { this.label = label; this.cookie = ''; this.ip = '1.1.1.' + Math.floor(Math.random() * 250); }
  async call(method, path, body, extra = {}) {
    const headers = { 'Content-Type': 'application/json', 'X-Nika-Client': '1', 'CF-Connecting-IP': this.ip, ...extra };
    if (this.cookie) headers.Cookie = this.cookie;
    const res = await worker.fetch(new Request(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), env);
    const sc = res.headers.get('Set-Cookie');
    if (sc) this.cookie = sc.startsWith('nika_session=;') ? '' : sc.split(';')[0];
    let data = null; try { data = await res.clone().json(); } catch {}
    return { status: res.status, data, res };
  }
  get(p) { return this.call('GET', p); }
  post(p, b = {}) { return this.call('POST', p, b); }
  patch(p, b = {}) { return this.call('PATCH', p, b); }
  put(p, b = {}) { return this.call('PUT', p, b); }
  del(p) { return this.call('DELETE', p); }
  async login(type, phone, password, unit) { return this.post('/api/login', { accountType: type, unit, phone, password }); }
}

const chair = new Client('chair'), admin = new Client('admin'), fin = new Client('finance'), res1 = new Client('res1'), res2 = new Client('res2'), own = new Client('owner'), exec = new Client('exec');
const CHAIR_PW = 'Chair-Long-Pass-91';
let ids = {};

test('health و تنظیمات', async () => {
  const c = new Client();
  assert.equal((await c.get('/api/health')).status, 200);
  const r = await worker.fetch(new Request(BASE + '/api/me'), { ASSETS: env.ASSETS });
  assert.equal(r.status, 503);
});

test('setup: کلید لازم است، رمز ضعیف رد می‌شود، فقط یک‌بار', async () => {
  assert.equal((await chair.post('/api/setup', { name: 'رئیس', phone: '09120000001', password: CHAIR_PW })).status, 403);
  const bad = { 'X-Setup-Key': 'setup-key-123' };
  assert.equal((await chair.call('POST', '/api/setup', { name: 'رئیس', phone: '09120000001', password: '12345' }, bad)).status, 400);
  assert.equal((await chair.call('POST', '/api/setup', { name: 'رئیس', phone: '09120000001', password: CHAIR_PW }, bad)).status, 201);
  assert.equal((await chair.call('POST', '/api/setup', { name: 'دوم', phone: '09120000002', password: CHAIR_PW }, bad)).status, 409);
});

test('ورود مدیر/کارکنان (بدون شماره واحد) کار می‌کند و کوکی HttpOnly می‌گیرد', async () => {
  const r = await chair.login('staff', '09120000001', CHAIR_PW);
  assert.equal(r.status, 200);
  const sc = r.res.headers.get('Set-Cookie');
  assert.match(sc, /HttpOnly/); assert.match(sc, /SameSite=Strict/); assert.match(sc, /Secure/);
  assert.equal(r.data.user.roles[0], 'chair');
  assert.ok(!('password_hash' in r.data.user) && !('avatar_data' in r.data.user));
  const me = await chair.get('/api/me');
  assert.equal(me.status, 200); assert.ok(!('sid' in me.data.user));
});

test('بدون کوکی/CSRF: درخواست رد می‌شود', async () => {
  const anon = new Client();
  assert.equal((await anon.get('/api/me')).status, 401);
  const noHeader = await worker.fetch(new Request(BASE + '/api/notices', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: chair.cookie }, body: '{}' }), env);
  assert.equal(noHeader.status, 403);
  const badOrigin = await chair.call('POST', '/api/notices', { title: 'x', body: 'y' }, { Origin: 'https://evil.example' });
  assert.equal(badOrigin.status, 403);
});

test('ساخت کاربران توسط رئیس: رمز موقت تصادفی', async () => {
  let r = await chair.post('/api/admin/users', { name: 'مدیر ساختمان', accountType: 'staff', phone: '09120000010', roles: ['building_admin'] });
  assert.equal(r.status, 201); assert.ok(r.data.tempPassword.length >= 12); ids.adminTemp = r.data.tempPassword; ids.adminId = r.data.id;
  r = await chair.post('/api/admin/users', { name: 'مدیر مالی', accountType: 'staff', phone: '09120000011', roles: ['finance'] });
  ids.finTemp = r.data.tempPassword; ids.finId = r.data.id;
  r = await chair.post('/api/admin/users', { name: 'مدیر اجرایی', accountType: 'staff', phone: '09120000012', roles: ['executive'] });
  ids.execTemp = r.data.tempPassword;
  for (const [unit, phone, type] of [['12', '09121111111', 'resident'], ['12', '09122222222', 'owner'], ['13', '09123333333', 'resident']]) {
    r = await chair.post('/api/admin/users', { name: `کاربر ${unit}-${type}`, accountType: type, unit: unit === '12' ? '۱۲' : unit, phone: phone.replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]), roles: [] });
    assert.equal(r.status, 201, JSON.stringify(r.data)); ids[`${unit}-${type}`] = r.data.tempPassword;
  }
  assert.equal((await chair.post('/api/admin/users', { name: 'تکراری', accountType: 'resident', unit: '12', phone: '09121111111', roles: [] })).status, 409);
  assert.equal((await chair.post('/api/admin/users', { name: 'بد', accountType: 'staff', phone: '123', roles: ['finance'] })).status, 400);
});

test('تغییر رمز اجباری: تا قبل از تغییر همه‌ی مسیرها بسته است', async () => {
  assert.equal((await res1.login('resident', '09121111111', ids['12-resident'], '12')).status, 200);
  assert.equal((await res1.login('resident', '09121111111', '09121111111', '12')).status, 401, 'شماره موبایل دیگر رمز نیست');
  const blocked = await res1.get('/api/notices'); assert.equal(blocked.status, 403); assert.equal(blocked.data.error, 'PASSWORD_CHANGE_REQUIRED');
  assert.equal((await res1.get('/api/me')).data.user.must_change_password, true);
  assert.equal((await res1.post('/api/password', { newPassword: '09121111111' })).status, 400);
  assert.equal((await res1.post('/api/password', { newPassword: '1234567890123' })).status, 400);
  assert.equal((await res1.post('/api/password', { newPassword: 'Resident-Pass-22' })).status, 200);
  assert.equal((await res1.get('/api/notices')).status, 200);
  assert.equal((await res1.get('/api/me')).data.user.must_change_password, false);
});

async function activate(client, type, phone, temp, newPw, unit) {
  assert.equal((await client.login(type, phone, temp, unit)).status, 200);
  assert.equal((await client.post('/api/password', { newPassword: newPw })).status, 200);
}
test('فعال‌سازی بقیه‌ی حساب‌ها', async () => {
  await activate(admin, 'staff', '09120000010', ids.adminTemp, 'Admin-Pass-4444');
  await activate(fin, 'staff', '09120000011', ids.finTemp, 'Finance-Pass-555');
  await activate(exec, 'staff', '09120000012', ids.execTemp, 'Exec-Pass-66666');
  await activate(own, 'owner', '09122222222', ids['12-owner'], 'Owner-Pass-7777', '12');
  await activate(res2, 'resident', '09123333333', ids['13-resident'], 'Resident2-Pass-8', '13');
});

test('ارتقای دسترسی: مدیر ساختمان رئیس/مالی نمی‌سازد و همه‌کاره نیست', async () => {
  let r = await admin.post('/api/admin/users', { name: 'هکر', accountType: 'staff', phone: '09129999999', roles: ['chair'] });
  assert.equal(r.status, 403);
  r = await admin.post('/api/admin/users', { name: 'هکر2', accountType: 'staff', phone: '09129999998', roles: ['finance'] });
  assert.equal(r.status, 403);
  r = await admin.post('/api/admin/users', { name: 'اجرایی دوم', accountType: 'staff', phone: '09129999997', roles: ['executive'] });
  assert.equal(r.status, 201);
  assert.equal((await admin.patch(`/api/admin/users/${ids.finId}`, { roles: ['chair'] })).status, 403, 'تغییر کاربر مالی ممنوع');
  assert.equal((await admin.post(`/api/admin/users/${ids.finId}/reset-password`)).status, 403);
  assert.equal((await admin.get('/api/transactions?fund=monthly&scope=all')).status, 403, 'مدیر ساختمان مالی را نمی‌بیند');
  assert.equal((await admin.get('/api/admin/audit')).status, 403);
  assert.equal((await chair.get('/api/admin/audit')).status, 200);
  assert.equal((await res1.get('/api/admin/users')).status, 403);
});

test('کاربر نمی‌تواند خودش را قفل کند یا آخرین رئیس را غیرفعال کند', async () => {
  const me = (await chair.get('/api/me')).data.user;
  assert.equal((await chair.patch(`/api/admin/users/${me.id}`, { active: false })).status, 400);
});

test('محدودیت تلاش ناموفق ورود', async () => {
  const c = new Client(); c.ip = '9.9.9.9';
  for (let i = 0; i < 5; i++) assert.equal((await c.login('staff', '09120000011', 'wrong-password-1')).status, 401);
  const locked = await c.login('staff', '09120000011', 'Finance-Pass-555');
  assert.equal(locked.status, 429);
});

test('پروفایل: تغییر نام/ایمیل، شماره نیاز به رمز دارد، تکراری رد می‌شود', async () => {
  assert.equal((await res1.patch('/api/profile', { name: 'علی', email: 'ali@example.com' })).status, 200);
  assert.equal((await res1.get('/api/me')).data.user.email, 'ali@example.com');
  assert.equal((await res1.patch('/api/profile', { name: 'علی' })).data.user.email, 'ali@example.com', 'ایمیل پاک نمی‌شود');
  assert.equal((await res1.patch('/api/profile', { phone: '09125555555' })).status, 403);
  assert.equal((await res1.patch('/api/profile', { phone: '09125555555', currentPassword: 'Resident-Pass-22' })).status, 200);
  assert.equal((await res1.patch('/api/profile', { email: 'bad' })).status, 400);
  assert.equal((await res1.patch('/api/profile', { email: '' })).status, 200);
  const xss = '<img src=x onerror=alert(1)>';
  assert.equal((await res1.patch('/api/profile', { name: xss })).status, 200); // ذخیره می‌شود؛ رابط آن را escape می‌کند
  await res1.patch('/api/profile', { name: 'علی رضایی' });
});

test('آواتار', async () => {
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  assert.equal((await res1.put('/api/avatar', { avatarData: 'data:text/html;base64,PGI+' })).status, 400);
  assert.equal((await res1.put('/api/avatar', { avatarData: png })).status, 200);
  const g = await res1.get('/api/avatar'); assert.equal(g.status, 200); assert.equal(g.res.headers.get('Content-Type'), 'image/png');
  assert.equal((await res1.get('/api/me')).data.user.has_avatar, true);
});

test('مالی: شارژ → پرداخت → تأیید و جداسازی ثبت‌کننده/تأییدکننده', async () => {
  assert.equal((await res1.post('/api/finance/charges', { fund: 'monthly', period: '1405-09', amount: 4000000 })).status, 403, 'ساکن شارژ نمی‌سازد');
  assert.equal((await res1.post('/api/transactions', { fund: 'monthly', kind: 'charge', amount: 1 })).status, 400);
  assert.equal((await res1.post('/api/transactions', { fund: 'owner', kind: 'payment', amount: 1000 })).status, 403, 'ساکن صندوق مالکانه ندارد');
  let r = await fin.post('/api/finance/charges', { fund: 'monthly', period: '۱۴۰۵-۰۹', amount: 4000000, title: 'شارژ آذر' });
  assert.equal(r.status, 201); assert.equal(r.data.created, 2);
  assert.equal((await fin.post('/api/finance/charges', { fund: 'monthly', period: '1405-09', amount: 4000000, title: 'شارژ آذر' })).data.created, 0, 'تکراری ساخته نمی‌شود');
  assert.equal((await fin.post('/api/finance/charges', { fund: 'owner', period: '1405-09', amount: 9000000, title: 'مالکانه', unitNumbers: ['۱۲'] })).data.created, 0, 'واحد ۱۲ فارسی با ۱۲ یکی نیست مگر نرمال شود');
  r = await fin.post('/api/finance/charges', { fund: 'owner', period: '1405-09', amount: 9000000, title: 'مالکانه', unitNumbers: ['12'] });
  assert.equal(r.data.created, 1);

  r = await res1.get('/api/finance/my?fund=monthly'); assert.equal(r.data.balance, 4000000);
  r = await res1.post('/api/transactions', { fund: 'monthly', kind: 'payment', amount: '۳٬۰۰۰٬۰۰۰', reference: '123456', period: '1405-09' });
  assert.equal(r.status, 201); ids.pay1 = r.data.id;
  assert.equal((await res1.get('/api/finance/my?fund=monthly')).data.balance, 4000000, 'تا تأیید، مانده تغییر نمی‌کند');
  assert.equal((await res1.post(`/api/transactions/${ids.pay1}/decision`, { status: 'approved' })).status, 403, 'ساکن تأیید نمی‌کند');
  assert.equal((await chair.post(`/api/transactions/${ids.pay1}/decision`, { status: 'rejected' })).status, 400, 'دلیل رد لازم است');
  assert.equal((await fin.post(`/api/transactions/${ids.pay1}/decision`, { status: 'approved' })).status, 200);
  assert.equal((await fin.post(`/api/transactions/${ids.pay1}/decision`, { status: 'approved' })).status, 409);
  assert.equal((await res1.get('/api/finance/my?fund=monthly')).data.balance, 1000000);

  // مالک و ساکن واحد ۱۲ مستقل‌اند و فقط صندوق خودشان را می‌بینند
  assert.equal((await own.get('/api/finance/my?fund=owner')).data.balance, 9000000);
  assert.equal((await own.get('/api/finance/my?fund=monthly')).status, 403);
  assert.equal((await res1.get('/api/transactions?fund=owner')).status, 403);
  const mine = (await res2.get('/api/transactions?fund=monthly')).data.transactions;
  assert.ok(mine.every(t => t.unit_number === '13'), 'ساکن واحد ۱۳ تراکنش واحد دیگر را نمی‌بیند');

  // لغو پرداخت در انتظار
  r = await res1.post('/api/transactions', { fund: 'monthly', kind: 'payment', amount: 500000 }); ids.pay2 = r.data.id;
  assert.equal((await res2.del(`/api/transactions/${ids.pay2}`)).status, 404);
  assert.equal((await res1.del(`/api/transactions/${ids.pay2}`)).status, 200);
  // رد با دلیل
  r = await res1.post('/api/transactions', { fund: 'monthly', kind: 'payment', amount: 700000 });
  assert.equal((await fin.post(`/api/transactions/${r.data.id}/decision`, { status: 'rejected', note: 'رسید ناخوانا' })).status, 200);
});

test('هزینه‌ها: ثبت اجرایی، تأیید مالی، عدم خودتأییدی، داشبورد', async () => {
  assert.equal((await res1.post('/api/transactions', { fund: 'monthly', kind: 'expense', amount: 1, title: 'x', period: '1405-09' })).status, 403);
  let r = await exec.post('/api/transactions', { fund: 'monthly', kind: 'expense', amount: 990000, title: 'قبض آب', category: 'آب', period: '1405-09' });
  assert.equal(r.status, 201); const e1 = r.data.id;
  r = await exec.post('/api/transactions', { fund: 'monthly', kind: 'expense', amount: 450000, title: 'قبض برق', category: 'برق', period: '1405-09' }); const e2 = r.data.id;
  assert.equal((await exec.post(`/api/transactions/${e1}/decision`, { status: 'approved' })).status, 403, 'اجرایی مجوز تأیید ندارد');
  assert.equal((await fin.post(`/api/transactions/${e1}/decision`, { status: 'approved' })).status, 200);
  assert.equal((await fin.post(`/api/transactions/${e2}/decision`, { status: 'approved' })).status, 200);
  // خودتأییدی: مدیر مالی هزینه می‌سازد؟ (مجوز ثبت ندارد) → رئیس هزینه می‌سازد و خودش تأیید نمی‌کند
  r = await chair.post('/api/transactions', { fund: 'monthly', kind: 'expense', amount: 1000, title: 'تست', period: '1405-09' }); const e3 = r.data.id;
  assert.equal((await chair.post(`/api/transactions/${e3}/decision`, { status: 'approved' })).data.error, 'SELF_APPROVAL');
  assert.equal((await fin.post(`/api/transactions/${e3}/decision`, { status: 'rejected', note: 'تست' })).status, 200);

  r = await res1.get('/api/dashboard?fund=monthly'); assert.equal(r.status, 200);
  assert.equal(r.data.period, '1405-09'); assert.equal(r.data.expenseTotal, 1440000);
  assert.deepEqual(r.data.expenses.map(x => x.category), ['آب', 'برق']);
  assert.deepEqual({ ...r.data.charges }, { units: 2, total: 8000000, paid: 3000000, paidUnits: 0, unpaid: 5000000, unpaidUnits: 2 });
  assert.equal((await res1.get('/api/dashboard?fund=owner')).status, 403);
  assert.equal((await exec.get('/api/dashboard?fund=monthly')).status, 403);
  assert.equal((await fin.get('/api/dashboard?fund=owner')).status, 200);
  assert.equal((await fin.get('/api/finance/balances?fund=monthly')).data.balances.length, 2);
  assert.equal((await res1.get('/api/finance/balances?fund=monthly')).status, 403);
  const pend = await fin.get('/api/transactions?fund=monthly&scope=all&status=pending'); assert.equal(pend.status, 200);
  assert.equal((await res1.get('/api/transactions?fund=monthly&scope=all')).status, 403);
  const s = (await fin.get('/api/summary')).data; assert.equal(typeof s.pendingApprovals, 'number');
});

test('اطلاعیه، درخواست، پیام و اتصال بین آن‌ها', async () => {
  assert.equal((await res1.post('/api/notices', { title: 'a', body: 'b' })).status, 403);
  assert.equal((await admin.post('/api/notices', { title: 'سرویس آسانسور', body: 'شنبه', kind: 'اطلاعیه' })).status, 201);
  assert.equal((await admin.post('/api/notices', { title: 'فقط مالکان', body: 'x', audience: 'owner' })).status, 201);
  assert.equal((await admin.post('/api/notices', { title: 'x', body: 'y', audience: 'weird' })).status, 400);
  assert.equal((await res1.get('/api/notices')).data.notices.length, 1, 'ساکن اطلاعیه‌ی مالکان را نمی‌بیند');
  assert.equal((await own.get('/api/notices')).data.notices.length, 2);
  assert.equal((await admin.get('/api/notices')).data.notices.length, 2);

  let r = await res1.post('/api/requests', { title: 'لامپ سوخته', body: 'پارکینگ', category: 'تأسیسات و تعمیرات', kind: 'issue', boardRequested: true });
  assert.equal(r.status, 201); const rid = r.data.id;
  assert.equal((await res1.post('/api/requests', { title: 'x', body: 'y', category: 'نامعتبر' })).status, 400);
  assert.equal((await res2.get('/api/requests')).data.requests.length, 0);
  assert.equal((await res1.get('/api/requests?scope=all')).status, 403);
  assert.equal((await exec.get('/api/requests?scope=all')).data.requests.length, 1);
  assert.equal((await exec.patch(`/api/requests/${rid}`, { status: 'in_progress', response: 'در حال بررسی' })).status, 200);
  const msgs = (await res1.get('/api/messages?box=inbox')).data.messages;
  assert.equal(msgs.length, 1); assert.match(msgs[0].title, /لامپ سوخته/); assert.equal(msgs[0].read_at, null);
  assert.equal((await res1.get('/api/summary')).data.unreadMessages, 1);
  await res1.post(`/api/messages/${msgs[0].id}/read`); assert.equal((await res1.get('/api/summary')).data.unreadMessages, 0);
  assert.equal((await exec.post(`/api/requests/${rid}/publish`)).status, 403);
  assert.equal((await admin.post(`/api/requests/${rid}/publish`)).status, 201);
  assert.equal((await admin.post(`/api/requests/${rid}/publish`)).status, 409);
  assert.ok((await res2.get('/api/notices')).data.notices.some(n => n.title === 'لامپ سوخته'));

  // پیام به مدیریت و پاسخ مدیر
  r = await res1.post('/api/messages', { title: 'سؤال', body: 'شارژ؟' }); assert.equal(r.status, 201);
  assert.equal((await res1.post('/api/messages', { title: 'x', body: 'y', recipientId: ids.adminId })).status, 403);
  const inbox = (await admin.get('/api/messages')).data.messages; assert.equal(inbox[0].title, 'سؤال'); assert.equal(inbox[0].sender_unit, '12');
  assert.equal((await res2.get('/api/messages')).data.messages.length, 0);
  const sender = inbox[0].sender_id;
  assert.equal((await admin.post('/api/messages', { title: 'پاسخ', body: 'تا ۵ام', recipientId: sender })).status, 201);
  assert.equal((await res1.get('/api/messages')).data.messages[0].title, 'پاسخ');
  assert.equal((await res1.get('/api/messages?box=sent')).data.messages[0].title, 'سؤال');
  assert.equal((await admin.del(`/api/notices/${(await admin.get('/api/notices')).data.notices[0].id}`)).status, 200);
});

test('محتوای ساختمان: قوانین، مصوبات، رویدادها، اسناد', async () => {
  assert.equal((await res1.post('/api/rules', { title: 'a', body: 'b' })).status, 403);
  let r = await admin.post('/api/rules', { title: 'ساعات سکوت', body: '۲۲ تا ۸', sort_order: '۲' }); assert.equal(r.status, 201);
  assert.equal((await res1.get('/api/rules')).data.items[0].sort_order, 2);
  assert.equal((await admin.put(`/api/rules/${r.data.id}`, { title: 'سکوت', body: 'x' })).status, 200);
  assert.equal((await admin.del(`/api/rules/${r.data.id}`)).status, 200);
  assert.equal((await admin.del(`/api/rules/${r.data.id}`)).status, 404);
  assert.equal((await admin.post('/api/resolutions', { title: 'سرویس', body: 'تصویب', decided_on: '۱۴۰۵/۰۹/۰۱' })).status, 201);
  assert.equal((await admin.post('/api/resolutions', { title: 'سرویس', body: 'تصویب', decided_on: 'دیروز' })).status, 400);
  assert.equal((await admin.post('/api/events', { title: 'جلسه', body: '', event_date: '1405/09/05', event_time: '۱۸:۳۰' })).status, 201);
  assert.equal((await res1.get('/api/events?month=1405-09')).data.items[0].event_date, '1405-09-05');
  assert.equal((await res1.get('/api/events?month=1405-10')).data.items.length, 0);
  assert.equal((await admin.post('/api/documents', { title: 'آیین‌نامه', url: 'http://insecure.example/x.pdf' })).status, 400);
  assert.equal((await admin.post('/api/documents', { title: 'آیین‌نامه', url: 'javascript:alert(1)' })).status, 400);
  assert.equal((await admin.post('/api/documents', { title: 'آیین‌نامه', url: 'https://drive.example.com/x.pdf' })).status, 201);
  assert.equal((await exec.post('/api/resolutions', { title: 'a', body: 'b', decided_on: '1405/09/01' })).status, 403);
});

test('واحدها و بازنشانی رمز و غیرفعال‌سازی', async () => {
  assert.equal((await admin.post('/api/admin/units', { unitNumber: '14', block: 'A', floor: '۳', parking: '۱۴' })).status, 201);
  const units = (await admin.get('/api/admin/units')).data.units; const u14 = units.find(u => u.unit_number === '14');
  assert.equal((await admin.patch(`/api/admin/units/${u14.id}`, { block: 'B', floor: '4', parking: '14' })).status, 200);
  assert.equal((await res1.get('/api/me')).data.user.unit.block, null);
  const list = (await admin.get('/api/admin/users?q=13')).data.users; assert.equal(list.length, 1);
  const id13 = list[0].id;
  let r = await admin.post(`/api/admin/users/${id13}/reset-password`); assert.equal(r.status, 200);
  assert.equal((await res2.get('/api/me')).status, 401, 'نشست‌ها پس از بازنشانی باطل می‌شوند');
  assert.equal((await res2.login('resident', '09123333333', r.data.tempPassword, '13')).status, 200);
  assert.equal((await res2.get('/api/notices')).data.error, 'PASSWORD_CHANGE_REQUIRED');
  assert.equal((await admin.patch(`/api/admin/users/${id13}`, { active: false })).status, 200);
  assert.equal((await res2.get('/api/me')).status, 401);
  assert.equal((await res2.login('resident', '09123333333', r.data.tempPassword, '13')).status, 401);
});

test('تغییر رمز: رمز فعلی لازم است و نشست‌های دیگر باطل می‌شوند', async () => {
  const other = new Client(); await other.login('owner', '09122222222', 'Owner-Pass-7777', '12');
  assert.equal((await own.post('/api/password', { currentPassword: 'wrong-wrong-1', newPassword: 'Another-Pass-9999' })).status, 403);
  assert.equal((await own.post('/api/password', { currentPassword: 'Owner-Pass-7777', newPassword: 'Another-Pass-9999' })).status, 200);
  assert.equal((await other.get('/api/me')).status, 401);
  assert.equal((await own.get('/api/me')).status, 200);
});

test('خروج: کوکی پاک و نشست باطل می‌شود', async () => {
  const cookie = chair.cookie;
  assert.equal((await chair.post('/api/logout')).status, 200);
  const r = await worker.fetch(new Request(BASE + '/api/me', { headers: { Cookie: cookie } }), env);
  assert.equal(r.status, 401);
});

test('مسیرهای ناموجود/متد نامعتبر', async () => {
  assert.equal((await fin.get('/api/nope')).status, 404);
  assert.equal((await fin.call('DELETE', '/api/me')).status, 405);
});

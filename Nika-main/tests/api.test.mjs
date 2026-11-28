import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { createDB } from './d1-shim.mjs';

const BASE = 'https://nika.test';
const env = { DB: createDB(), JWT_SECRET: 'x'.repeat(40), BOOTSTRAP_KEY: 'setup-key-123', ENVIRONMENT: 'production', ALLOW_SELF_APPROVAL: 'false', INITIAL_PASSWORD_MODE: 'phone', ASSETS: { fetch: () => new Response('asset') } };

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
  async login(type, phone, password, unit) { return this.post('/api/login', { identifier: unit || phone, password }); }
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

test('فرم عمومی ثبت اطلاعات بدون JWT کار می‌کند و حساب واقعی نمی‌سازد', async () => {
  const beforeUsers = (await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first()).n;
  const publicEnv = { DB: env.DB, ASSETS: env.ASSETS };
  const payload = {
    unit: '204', userType: 'resident', firstName: 'حبیب', lastName: 'رستگارنیا',
    gender: 'male', phone: '۰۹۱۲۱۲۳۴۵۶۷', secondaryPhone: '',
    contractStartDate: '۱۴۰۵/۰۸/۰۱', contractEndDate: '۱۴۰۶/۰۸/۰۱', website: ''
  };
  const response = await worker.fetch(new Request(BASE + '/api/public/user-submissions', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  }), publicEnv);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  const saved = await env.DB.prepare('SELECT unit_number,user_type,full_name,gender,phone,contract_start_date,contract_end_date FROM public_user_submissions WHERE unit_number=?').bind('204').first();
  assert.equal(saved.full_name, 'حبیب رستگارنیا');
  assert.equal(saved.contract_start_date, '1405/08/01');
  assert.equal(saved.contract_end_date, '1406/08/01');
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first()).n, beforeUsers);
  const invalid = await worker.fetch(new Request(BASE + '/api/public/user-submissions', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, unit: '999' })
  }), publicEnv);
  assert.equal(invalid.status, 400);
});

test('setup: کلید لازم است، رمز ضعیف رد می‌شود، فقط یک‌بار', async () => {
  assert.equal((await chair.post('/api/setup', { name: 'رئیس', phone: '09120000001', password: CHAIR_PW })).status, 403);
  const bad = { 'X-Setup-Key': 'setup-key-123' };
  const setupRes = await chair.call('POST', '/api/setup', {}, bad); assert.equal(setupRes.status, 201); ids.setupTemp = setupRes.data.tempPassword; assert.ok(ids.setupTemp && ids.setupTemp.length >= 12 && ids.setupTemp !== 'admin');
  assert.equal((await chair.call('POST', '/api/setup', { name: 'رئیس', phone: '09120000001', password: CHAIR_PW }, bad)).status, 409);
  assert.equal((await chair.call('POST', '/api/setup', { name: 'دوم', phone: '09120000002', password: CHAIR_PW }, bad)).status, 409);
});

test('ورود مدیر/کارکنان (بدون شماره واحد) کار می‌کند و کوکی HttpOnly می‌گیرد', async () => {
  assert.equal((await new Client().login('staff', 'Admin', 'admin')).status, 401, 'رمز ثابت admin دیگر کار نمی‌کند');
  const r = await chair.login('staff', 'Admin', ids.setupTemp);
  assert.equal((await chair.post('/api/password', { newPassword: CHAIR_PW })).status, 200);
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

test('ساخت کاربران: رمز موقت کارکنان و رمز اولیه شماره موبایل برای مالک/ساکن', async () => {
  let r = await chair.post('/api/admin/users', { name: 'مدیر ساختمان', accountType: 'staff', phone: '09120000010', roles: ['executive'], reason: 'آزمون مجوز مدیریت کاربران' });
  assert.equal(r.status, 201); assert.ok(r.data.tempPassword.length >= 12); ids.adminTemp = r.data.tempPassword; ids.adminId = r.data.id;
  r = await chair.post('/api/admin/users', { name: 'مدیر مالی', accountType: 'staff', phone: '09120000011', roles: ['finance'], reason: 'آزمون مجوز مدیریت کاربران' });
  ids.finTemp = r.data.tempPassword; ids.finId = r.data.id;
  r = await chair.post('/api/admin/users', { name: 'مدیر اجرایی', accountType: 'staff', phone: '09120000012', roles: ['executive'], reason: 'آزمون مجوز مدیریت کاربران' });
  ids.execTemp = r.data.tempPassword;
  for (const [unit, phone, type] of [['12', '09121111111', 'resident'], ['12', '09122222222', 'owner'], ['13', '09123333333', 'resident']]) {
    r = await chair.post('/api/admin/users', { name: `کاربر ${unit}-${type}`, accountType: type, unit: unit === '12' ? '۱۲' : unit, phone: phone.replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]), roles: [], reason: 'آزمون مجوز مدیریت کاربران' });
    assert.equal(r.status, 201, JSON.stringify(r.data)); ids[`${unit}-${type}`] = phone;
  }
  assert.equal((await chair.post('/api/admin/users', { name: 'تکراری', accountType: 'resident', unit: '12', phone: '09121111111', roles: [], reason: 'آزمون مجوز مدیریت کاربران' })).status, 409);
  assert.equal((await chair.post('/api/admin/users', { name: 'بد', accountType: 'staff', phone: '123', roles: ['finance'], reason: 'آزمون مجوز مدیریت کاربران' })).status, 400);
});

test('تغییر رمز اجباری: تا قبل از تغییر همه‌ی مسیرها بسته است', async () => {
  assert.equal((await res1.login('resident', '09121111111', ids['12-resident'], '12')).status, 200);
  const blocked = await res1.get('/api/notices'); assert.equal(blocked.status, 403); assert.equal(blocked.data.error, 'PASSWORD_CHANGE_REQUIRED');
  assert.equal((await res1.get('/api/me')).data.user.must_change_password, true);
  assert.equal((await res1.post('/api/password', { newPassword: '09121111111' })).status, 400);
  assert.equal((await res1.post('/api/password', { newPassword: '1234567890123' })).status, 400);
  assert.equal((await res1.post('/api/password', { newPassword: 'Resident-Pass-22' })).status, 200);
  const oldLogin = new Client(); assert.equal((await oldLogin.login('resident', '09121111111', '09121111111', '12')).status, 401, 'رمز اولیه پس از تغییر دیگر معتبر نیست');
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
  assert.equal(r.status, 403, 'مدیر اجرایی حق تعیین نقش مدیریتی ندارد');
  assert.equal((await admin.patch(`/api/admin/users/${ids.finId}`, { roles: ['chair'] })).status, 403, 'تغییر کاربر مالی ممنوع');
  const chairId = (await chair.get('/api/me')).data.user.id;
  assert.equal((await admin.post(`/api/admin/users/${chairId}/reset-password`)).status, 403);
  assert.equal((await admin.get('/api/transactions?fund=monthly&scope=all')).status, 403, 'مدیر ساختمان مالی را نمی‌بیند');
  assert.equal((await admin.get('/api/admin/audit')).status, 200);
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
  let r = await chair.post('/api/finance/charges', { fund: 'monthly', period: '۱۴۰۵-۰۹', amount: 4000000, title: 'شارژ آذر' });
  assert.equal(r.status, 201); assert.equal(r.data.created, 2);
  assert.equal((await chair.post('/api/finance/charges', { fund: 'monthly', period: '1405-09', amount: 4000000, title: 'شارژ آذر' })).data.created, 0, 'تکراری ساخته نمی‌شود');
  assert.equal((await chair.post('/api/finance/charges', { fund: 'owner', period: '1405', amount: 9000000, title: 'مالکانه', unitNumbers: ['۱۲'] })).data.created, 0, 'واحد ۱۲ فارسی با ۱۲ یکی نیست مگر نرمال شود');
  r = await chair.post('/api/finance/charges', { fund: 'owner', period: '1405', amount: 9000000, title: 'مالکانه', unitNumbers: ['12'] });
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
  // پرداخت مالکانه از صفحه شخصی، سال را از تاریخ تهران می‌گیرد و به period اجباری فرم وابسته نیست.
  r = await own.post('/api/transactions', { fund: 'owner', kind: 'payment', amount: 1000, reference: 'OWN-001' });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal((await own.del('/api/transactions/' + r.data.id)).status, 200, 'پرداخت آزمایشی در انتظار را لغو می‌کنیم تا مانده حساب تغییر نکند');

  // حساب مشترک مالک+ساکن در دیتابیس account_type=owner دارد؛ انتساب پرداخت باید از روی user_roles انجام شود.
  const both = await chair.post('/api/admin/users', { name: 'حساب مشترک آزمون', accountType: 'both', unit: '14', phone: '09124444444', reason: 'آزمون انتساب پرداخت حساب مشترک' });
  assert.equal(both.status, 201, JSON.stringify(both.data));
  await chair.post('/api/finance/charges', { fund: 'monthly', period: '1405-09', amount: 1000, title: 'آزمون واحد ۱۴', unitNumbers: ['14'] });
  const entered = await fin.post('/api/transactions', { fund: 'monthly', kind: 'payment', amount: 1000, unitNumber: '14' });
  assert.equal(entered.status, 201);
  const attribution = await env.DB.prepare('SELECT user_id FROM transactions WHERE id=?').bind(entered.data.id).first();
  assert.equal(attribution.user_id, both.data.id, 'پرداخت باید به حساب دارای نقش resident متصل شود');
  const testUnit = await env.DB.prepare('SELECT id FROM units WHERE unit_number=?').bind('14').first();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM transactions WHERE unit_id=?').bind(testUnit.id),
    env.DB.prepare('DELETE FROM user_roles WHERE user_id=?').bind(both.data.id),
    env.DB.prepare('DELETE FROM users WHERE id=?').bind(both.data.id),
    env.DB.prepare('DELETE FROM units WHERE id=?').bind(testUnit.id)
  ]);

  assert.equal((await own.get('/api/finance/my?fund=monthly')).status, 403);
  assert.equal((await res1.get('/api/transactions?fund=owner')).status, 403);
  const mine = (await res2.get('/api/transactions?fund=monthly')).data.transactions;
  assert.ok(mine.every(t => t.unit_number === '13'), 'ساکن واحد ۱۳ تراکنش واحد دیگر را نمی‌بیند');

  // لغو پرداخت در انتظار
  r = await res1.post('/api/transactions', { fund: 'monthly', kind: 'payment', amount: 500000 }); ids.pay2 = r.data.id;
  assert.equal((await res2.del(`/api/transactions/${ids.pay2}`)).status, 404);
  assert.equal((await res1.del(`/api/transactions/${ids.pay2}`)).status, 200);
  // دو تأیید هم‌زمان نباید یک پرداخت را دوبار نهایی کنند.
  const concurrent = await res1.post('/api/transactions', { fund: 'monthly', kind: 'payment', amount: 1234 });
  const decisions = await Promise.all([
    fin.post(`/api/transactions/${concurrent.data.id}/decision`, { status: 'rejected', note: 'آزمون هم‌زمانی اول' }),
    fin.post(`/api/transactions/${concurrent.data.id}/decision`, { status: 'rejected', note: 'آزمون هم‌زمانی دوم' })
  ]);
  assert.deepEqual(decisions.map(x => x.status).sort(), [200, 409]);
  assert.equal((await res1.get('/api/finance/my?fund=monthly')).data.balance, 1000000, 'رد هم‌زمان نباید مانده مالی را تغییر دهد');

  // تأیید هم‌زمان نیز باید فقط یک‌بار موجودی صندوق را افزایش دهد.
  const cashBefore = (await env.DB.prepare("SELECT cash_balance FROM funds WHERE id='monthly'").first()).cash_balance;
  const concurrentApproval = await res1.post('/api/transactions', { fund: 'monthly', kind: 'payment', amount: 2345 });
  const approvals = await Promise.all([
    fin.post(`/api/transactions/${concurrentApproval.data.id}/decision`, { status: 'approved' }),
    fin.post(`/api/transactions/${concurrentApproval.data.id}/decision`, { status: 'approved' })
  ]);
  assert.deepEqual(approvals.map(x => x.status).sort(), [200, 409]);
  const cashAfter = (await env.DB.prepare("SELECT cash_balance FROM funds WHERE id='monthly'").first()).cash_balance;
  assert.equal(cashAfter, cashBefore + 2345, 'واریز هم‌زمان فقط یک‌بار باید در صندوق منظور شود');
  await env.DB.batch([
    env.DB.prepare('DELETE FROM transactions WHERE id=?').bind(concurrentApproval.data.id),
    env.DB.prepare("UPDATE funds SET cash_balance=? WHERE id='monthly'").bind(cashBefore)
  ]);
  // رد با دلیل
  r = await res1.post('/api/transactions', { fund: 'monthly', kind: 'payment', amount: 700000 });
  assert.equal((await fin.post(`/api/transactions/${r.data.id}/decision`, { status: 'rejected', note: 'رسید ناخوانا' })).status, 200);
});

test('درخواست پرداخت: ثبت، تأیید دومرحله‌ای، کنترل صندوق و سوابق', async () => {
  const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const create = (amount, title) => ({ fund: 'monthly', amount, documentTitle: title, documentDate: '1405-09-01', description: 'سند آزمایشی', files: [{ name: 'invoice.png', data: image }] });
  assert.equal((await exec.put('/api/delegations/executive', { enabled: true, delegateId: ids.finId })).status, 200);
  assert.equal((await res1.post('/api/transactions', { fund: 'monthly', kind: 'expense', amount: 1, title: 'x', period: '1405-09' })).status, 410);
  assert.equal((await exec.post('/api/transactions', { fund: 'monthly', kind: 'expense', amount: 1, title: 'x', period: '1405-09' })).status, 410);

  let r = await exec.post('/api/expense-requests', create(990000, 'قبض آب'));
  assert.equal(r.status, 201, JSON.stringify(r.data)); const first = r.data.id;
  assert.match(r.data.referenceNo, /^1405-\d{6}$/);
  assert.ok((await fin.get('/api/expense-requests?scope=mine')).data.requests.some(q => q.id === first), 'جانشین فعال باید درخواست‌های مدیر اجرایی را ببیند');
  assert.equal((await exec.post(`/api/expense-requests/${first}/finance-decision`, { status: 'approved' })).status, 403);
  let review = await fin.get('/api/expense-requests?scope=review');
  assert.equal(review.data.requests.length, 1); assert.equal(review.data.requests[0].cash_balance, 3000000);
  assert.equal((await fin.get(`/api/expense-requests/${first}`)).data.files.length, 1);
  assert.equal((await fin.post(`/api/expense-requests/${first}/finance-decision`, { status: 'approved' })).data.status, 'pending_chair');
  assert.equal((await fin.post(`/api/expense-requests/${first}/chair-decision`, { status: 'approved' })).status, 403);
  assert.equal((await chair.get('/api/expense-requests?scope=final')).data.requests.length, 1);
  const detail = await chair.get(`/api/expense-requests/${first}`);
  assert.equal(detail.data.history.length, 2);
  const file = await chair.get(detail.data.files[0].url);
  assert.equal(file.status, 200); assert.equal(file.res.headers.get('Content-Type'), 'image/png');
  assert.equal((await exec.post(`/api/expense-requests/${first}/chair-decision`, { status: 'approved' })).status, 403);
  assert.equal((await chair.post(`/api/expense-requests/${first}/chair-decision`, { status: 'revision', reason: 'نیاز به فاکتور خواناتر' })).data.status, 'revision_chair');
  const mine = await exec.get('/api/expense-requests?scope=mine');
  assert.equal(mine.data.requests[0].status, 'revision_chair');
  assert.equal((await fin.patch(`/api/expense-requests/${first}`, { ...create(990000, 'قبض آب اصلاح‌شده'), files: [], reason: 'اصلاح توسط جانشین فعال مدیر اجرایی' })).status, 200);
  // جداسازی وظایف برای «شخص»: جانشینی که درخواست را اصلاح کرده نمی‌تواند همان را بررسی مالی کند
  const selfReview = await fin.post(`/api/expense-requests/${first}/finance-decision`, { status: 'approved' });
  assert.equal(selfReview.status, 403); assert.equal(selfReview.data.error, 'SELF_APPROVAL');
  const mk2 = await chair.post('/api/admin/users', { name: 'مدیر مالی دوم', accountType: 'staff', phone: '09120000099', roles: ['finance'], reason: 'آزمون جداسازی وظایف' });
  const fin2 = new Client('fin2'); await activate(fin2, 'staff', '09120000099', mk2.data.tempPassword, 'Finance2-Pass-555');
  assert.equal((await fin2.post(`/api/expense-requests/${first}/finance-decision`, { status: 'approved' })).data.status, 'pending_chair');
  assert.equal((await chair.post(`/api/expense-requests/${first}/chair-decision`, { status: 'approved' })).status, 200);
  assert.equal((await exec.get(`/api/expense-requests/${first}`)).data.request.status, 'finalized');
  assert.equal((await fin.get('/api/finance/funds')).data.funds.find(f => f.fund_id === 'monthly').balance, 2010000);
  assert.equal((await exec.put('/api/delegations/executive', { enabled: false })).status, 200);
  assert.equal((await fin.get('/api/expense-requests?scope=mine')).status, 403, 'با لغو جانشینی، دسترسی فوراً قطع می‌شود');

  r = await exec.post('/api/expense-requests', create(4000000, 'هزینه بیش از موجودی'));
  assert.equal(r.status, 201);
  await fin.post(`/api/expense-requests/${r.data.id}/finance-decision`, { status: 'approved' });
  const insufficient = await chair.post(`/api/expense-requests/${r.data.id}/chair-decision`, { status: 'approved' });
  assert.equal(insufficient.status, 409); assert.equal(insufficient.data.error, 'INSUFFICIENT_FUNDS');
  assert.equal((await exec.get(`/api/expense-requests/${r.data.id}`)).data.request.status, 'pending_chair');

  const dashboard = await res1.get('/api/dashboard?fund=monthly');
  assert.equal(dashboard.status, 200); assert.equal(dashboard.data.period, '1405-09');
  assert.equal(dashboard.data.expenseTotal, 990000);
  assert.deepEqual({ ...dashboard.data.charges }, { units: 2, total: 8000000, paid: 3000000, paidUnits: 0, unpaid: 5000000, unpaidUnits: 2 });
  assert.equal((await res1.get('/api/dashboard?fund=owner')).status, 403);
  assert.equal((await fin.get('/api/dashboard?fund=owner')).status, 200);
  assert.equal((await fin.get('/api/finance/balances?fund=monthly')).data.balances.length, 2);
  assert.equal((await res1.get('/api/finance/balances?fund=monthly')).status, 403);
  assert.equal((await fin.get('/api/transactions?fund=monthly&scope=all&status=pending')).status, 200);
  assert.equal((await res1.get('/api/transactions?fund=monthly&scope=all')).status, 403);
  assert.equal(typeof (await fin.get('/api/summary')).data.pendingApprovals, 'number');
  const noImage = await exec.post('/api/expense-requests', {
    fund: 'monthly', amount: 1000, documentTitle: 'هزینه بدون تصویر',
    documentDate: '1405-09-02', description: 'ثبت درخواست بدون پیوست', files: []
  });
  assert.equal(noImage.status, 201, 'تصویر فاکتور اختیاری است');
});

test('پشتیبان‌گیری آفلاین: صحت فایل، حذف تصاویر و حفظ سوابق آنلاین', async () => {
  assert.equal((await exec.get('/api/backups/status')).status, 403, 'مدیر اجرایی اجازه بایگانی کامل ندارد');
  assert.equal((await fin.get('/api/backups/export')).status, 403, 'مدیر مالی اجازه بایگانی کامل ندارد');
  const status = await chair.get('/api/backups/status');
  assert.equal(status.status, 200);
  assert.equal(status.data.pendingImages, 2);

  const exported = await chair.get('/api/backups/export');
  assert.equal(exported.status, 200);
  const raw = await exported.res.text();
  const archive = JSON.parse(raw);
  assert.equal(archive.format, 'nika-offline-archive');
  assert.ok(archive.tables.transactions.length > 0);
  assert.ok(archive.tables.expense_requests.length >= 2);
  assert.ok(archive.tables.expense_request_files.some(f => f.data_base64));
  assert.ok(Array.isArray(archive.tables.backup_runs), 'سوابق اجرای پشتیبان‌گیری نیز در آرشیو نگهداری می‌شوند');
  assert.ok(archive.tables.users.every(u => !('password_hash' in u) && !('password_salt' in u)));
  const backupId = exported.res.headers.get('X-Nika-Backup-Id');
  const checksum = exported.res.headers.get('X-Nika-Backup-SHA256');
  assert.ok(backupId && /^[a-f0-9]{64}$/.test(checksum));

  const firstFile = archive.tables.expense_request_files.find(f => f.data_base64);
  const details = await chair.get(`/api/expense-requests/${firstFile.request_id}`);
  assert.equal(details.status, 200);
  assert.ok(details.data.files.some(f => f.id === firstFile.id && f.has_data));

  assert.equal((await chair.post(`/api/backups/${backupId}/confirm`, { checksum: '0'.repeat(64) })).status, 400);
  assert.equal((await chair.get('/api/backups/status')).data.pendingImages, 2, 'با checksum نادرست هیچ تصویری پاک نمی‌شود');

  const beforeRequests = (await chair.get('/api/expense-requests?scope=final')).data.requests.length;
  const confirmed = await chair.post(`/api/backups/${backupId}/confirm`, { checksum });
  assert.equal(confirmed.status, 200, JSON.stringify(confirmed.data));
  assert.equal(confirmed.data.archivedImages, 2);
  assert.equal(confirmed.data.retainedRecords, true);
  assert.equal((await chair.get('/api/backups/status')).data.pendingImages, 0);

  const archivedDetails = await chair.get(`/api/expense-requests/${firstFile.request_id}`);
  const archivedFile = archivedDetails.data.files.find(f => f.id === firstFile.id);
  assert.equal(archivedFile.has_data, false);
  assert.equal((await chair.get(archivedFile.url || `/api/expense-requests/${firstFile.request_id}/files/${firstFile.id}`)).status, 410);
  assert.equal((await chair.get('/api/expense-requests?scope=final')).data.requests.length, beforeRequests);
  assert.equal((await chair.post(`/api/backups/${backupId}/confirm`, { checksum })).status, 409);
});

test('اطلاعیه، درخواست، پیام و اتصال بین آن‌ها', async () => {
  assert.equal((await res1.post('/api/notices', { title: 'a', body: 'b' })).status, 403);
  assert.equal((await chair.post('/api/notices', { title: 'سرویس آسانسور', body: 'شنبه', kind: 'اطلاعیه' })).status, 201);
  assert.equal((await chair.post('/api/notices', { title: 'فقط مالکان', body: 'x', audience: 'owner' })).status, 201);
  assert.equal((await chair.post('/api/notices', { title: 'x', body: 'y', audience: 'weird' })).status, 400);
  assert.equal((await res1.get('/api/notices')).data.notices.length, 1, 'ساکن اطلاعیه‌ی مالکان را نمی‌بیند');
  assert.equal((await own.get('/api/notices')).data.notices.length, 2);
  assert.equal((await chair.get('/api/notices')).data.notices.length, 2);

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
  assert.equal((await chair.post(`/api/requests/${rid}/publish`)).status, 201);
  assert.equal((await chair.post(`/api/requests/${rid}/publish`)).status, 409);
  assert.ok((await res2.get('/api/notices')).data.notices.some(n => n.title === 'لامپ سوخته'));

  // پیام به مدیریت و پاسخ مدیر
  r = await res1.post('/api/messages', { title: 'سؤال', body: 'شارژ؟' }); assert.equal(r.status, 201);
  assert.equal((await res1.post('/api/messages', { title: 'x', body: 'y', recipientId: ids.adminId })).status, 403);
  const inbox = (await chair.get('/api/messages')).data.messages; assert.equal(inbox[0].title, 'سؤال'); assert.equal(inbox[0].sender_unit, '12');
  assert.equal((await res2.get('/api/messages')).data.messages.length, 0);
  const sender = inbox[0].sender_id;
  assert.equal((await chair.post('/api/messages', { title: 'پاسخ', body: 'تا ۵ام', recipientId: sender })).status, 201);
  assert.equal((await res1.get('/api/messages')).data.messages[0].title, 'پاسخ');
  assert.equal((await res1.get('/api/messages?box=sent')).data.messages[0].title, 'سؤال');
  assert.equal((await chair.del(`/api/notices/${(await chair.get('/api/notices')).data.notices[0].id}`)).status, 200);
});

test('محتوای ساختمان: قوانین، مصوبات، رویدادها، اسناد', async () => {
  assert.equal((await res1.post('/api/rules', { title: 'a', body: 'b' })).status, 403);
  let r = await chair.post('/api/rules', { title: 'ساعات سکوت', body: '۲۲ تا ۸', sort_order: '۲' }); assert.equal(r.status, 201);
  assert.equal((await res1.get('/api/rules')).data.items[0].sort_order, 2);
  assert.equal((await chair.put(`/api/rules/${r.data.id}`, { title: 'سکوت', body: 'x' })).status, 200);
  assert.equal((await chair.del(`/api/rules/${r.data.id}`)).status, 200);
  assert.equal((await chair.del(`/api/rules/${r.data.id}`)).status, 404);
  assert.equal((await chair.post('/api/resolutions', { title: 'سرویس', body: 'تصویب', decided_on: '۱۴۰۵/۰۹/۰۱' })).status, 201);
  assert.equal((await chair.post('/api/resolutions', { title: 'سرویس', body: 'تصویب', decided_on: 'دیروز' })).status, 400);
  assert.equal((await exec.post('/api/events', { title: 'جلسه', body: '', event_date: '1405/09/05', event_time: '۱۸:۳۰' })).status, 201);
  assert.equal((await res1.get('/api/events?month=1405-09')).data.items[0].event_date, '1405-09-05');
  assert.ok((await res1.get('/api/events?month=1405-09')).data.items.some(e => e.isHoliday && e.event_date === '1405-09-05' && !e.isOfficialHoliday), 'مناسبت‌های تقویم رسمی نیز نمایش داده می‌شوند');
  assert.ok((await res1.get('/api/events?month=1405-10')).data.items.some(e => e.isHoliday && e.isOfficialHoliday), 'تعطیلات رسمی در تقویم نمایش داده می‌شوند');
  assert.equal((await res1.get('/api/events?month=1405-10')).data.items.filter(e => !e.isHoliday).length, 0);
  const recurring = await exec.post('/api/events', { title: 'نظافت هفتگی', event_date: '1405-09-05', recurrence: 'weekly' });
  assert.equal(recurring.status, 201);
  let occurrences = (await res1.get('/api/events?month=1405-09')).data.items.filter(e => e.id === recurring.data.id);
  assert.deepEqual(occurrences.map(e => e.recurrence_date), ['1405-09-05','1405-09-12','1405-09-19','1405-09-26']);
  assert.ok(occurrences.every(e => e.series_event_date === '1405-09-05'), 'ویرایش سری باید تاریخ پایه را مستقل از نوبت نمایشی نگه دارد');
  assert.equal((await exec.patch(`/api/events/${recurring.data.id}/occurrences/1405-09-12`, { event_date: '1405-09-13', event_time: '10:30' })).status, 200);
  occurrences = (await res1.get('/api/events?month=1405-09')).data.items.filter(e => e.id === recurring.data.id);
  assert.ok(occurrences.some(e => e.recurrence_date === '1405-09-12' && e.event_date === '1405-09-13'), 'جابجایی یک نوبت باید مستقل از نوبت‌های بعدی باشد');
  assert.equal(occurrences.find(e => e.recurrence_date === '1405-09-12').series_event_date, '1405-09-05', 'پس از جابه‌جایی هم تاریخ پایه‌ی سری باید حفظ شود');
  assert.equal((await exec.del(`/api/events/${recurring.data.id}/occurrences/1405-09-19`)).status, 200);
  occurrences = (await res1.get('/api/events?month=1405-09')).data.items.filter(e => e.id === recurring.data.id);
  assert.ok(!occurrences.some(e => e.recurrence_date === '1405-09-19'), 'حذف یک نوبت نباید سری را حذف کند');
  assert.equal((await exec.del(`/api/events/${recurring.data.id}`)).status, 200);
  const residentUser = (await chair.get('/api/admin/users?q=12')).data.users.find(u => u.roles.includes('resident'));
  assert.equal((await chair.patch(`/api/admin/users/${residentUser.id}`, { contractStartDate: '1405-01-01', contractEndDate: '1405-10-01', reason: 'ثبت تاریخ قرارداد برای آزمون' })).status, 200);
  const updatedResident = (await chair.get('/api/admin/users?q=12')).data.users.find(u => u.id === residentUser.id);
  assert.equal(updatedResident.contract_start_date, '1405-01-01');
  assert.equal(updatedResident.contract_end_date, '1405-10-01');
  assert.equal((await chair.patch(`/api/admin/users/${residentUser.id}`, { contractStartDate: '1405-11-01', contractEndDate: '1405-10-01', reason: 'آزمون اعتبارسنجی تاریخ' })).status, 400);
  assert.equal((await chair.post('/api/documents', { title: 'آیین‌نامه', url: 'http://insecure.example/x.pdf' })).status, 400);
  assert.equal((await chair.post('/api/documents', { title: 'آیین‌نامه', url: 'javascript:alert(1)' })).status, 400);
  assert.equal((await chair.post('/api/documents', { title: 'آیین‌نامه', url: 'https://drive.example.com/x.pdf' })).status, 201);
  assert.equal((await exec.post('/api/resolutions', { title: 'a', body: 'b', decided_on: '1405/09/01' })).status, 403);
});

test('واحدها و بازنشانی رمز و غیرفعال‌سازی', async () => {
  assert.equal((await chair.post('/api/admin/units', { unitNumber: '14', block: 'A', floor: '۳', parking: '۱۴' })).status, 201);
  const units = (await chair.get('/api/admin/units')).data.units; const u14 = units.find(u => u.unit_number === '14');
  assert.equal((await chair.patch(`/api/admin/units/${u14.id}`, { block: 'B', floor: '4', parking: '14' })).status, 200);
  assert.equal((await res1.get('/api/me')).data.user.unit.block, null);
  const list = (await admin.get('/api/admin/users?q=13')).data.users; assert.equal(list.length, 1);
  const id13 = list[0].id;
  let r = await admin.post(`/api/admin/users/${id13}/reset-password`); assert.equal(r.status, 200);
  assert.equal((await res2.get('/api/me')).status, 401, 'نشست‌ها پس از بازنشانی باطل می‌شوند');
  assert.equal((await res2.login('resident', '', ids['13-resident'], '13')).status, 200);
  assert.equal((await res2.get('/api/notices')).data.error, 'PASSWORD_CHANGE_REQUIRED');
  assert.equal((await admin.patch(`/api/admin/users/${id13}`, { active: false })).status, 200);
  assert.equal((await res2.get('/api/me')).status, 401);
  assert.equal((await res2.login('resident', '', ids['13-resident'], '13')).status, 401);
});

test('تغییر رمز: رمز فعلی لازم است و نشست‌های دیگر باطل می‌شوند', async () => {
  const other = new Client(); await other.login('owner', '09122222222', 'Owner-Pass-7777', '12');
  assert.equal((await own.post('/api/password', { currentPassword: 'wrong-wrong-1', newPassword: 'Another-Pass-9999' })).status, 403);
  assert.equal((await own.post('/api/password', { currentPassword: 'Owner-Pass-7777', newPassword: 'Another-Pass-9999' })).status, 200);
  assert.equal((await other.get('/api/me')).status, 401);
  assert.equal((await own.get('/api/me')).status, 200);
});

test('خروجی فهرست ثبت‌نام‌ها دسترسی کنترل‌شده دارد', async () => {
  const anonymous = new Client();
  assert.equal((await anonymous.get('/api/public/user-submissions/export')).status, 401);
  assert.equal((await res1.get('/api/public/user-submissions/export')).status, 403);
  const exported = await chair.get('/api/public/user-submissions/export');
  assert.equal(exported.status, 200);
  assert.ok(exported.res.headers.get('Content-Type').includes('text/csv'));
  const csv = await exported.res.text();
  assert.match(csv, /شماره واحد/);
  assert.match(csv, /تاریخ اتمام قرارداد/);
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


test('پیام عمومی بدون تأیید، نقش فعال دیدگاه و حذف محدود به رئیس', async () => {
  const chairForPublic = new Client('chair-public-messages');
  assert.equal((await chairForPublic.login('staff', 'Admin', CHAIR_PW)).status, 200);
  const created = await chairForPublic.post('/api/admin/users', {
    name: 'کاربر آزمایشی واحد ۱۴', accountType: 'resident', unit: '14',
    phone: '09124444414', roles: ['chair'], reason: 'آزمون نقش فعال و حذف پیام عمومی'
  });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const author = new Client('public-message-author');
  await activate(author, 'resident', '09124444414', '09124444414', 'Unit14-Strong-Pass-1', '14');

  const posted = await author.post('/api/public-messages', {
    title: 'پیام فوری بدون تأیید', body: 'این پیام باید بلافاصله در تابلو دیده شود'
  });
  assert.equal(posted.status, 201, JSON.stringify(posted.data));
  const visible = await author.get('/api/public-messages?limit=5');
  const message = visible.data.messages.find(m => m.id === posted.data.id);
  assert.ok(message, 'پیام بلافاصله و بدون تأیید باید در تابلو باشد');
  assert.equal(message.author_label, 'ساکن واحد 14');

  const managerComment = await author.call('POST', `/api/public-messages/${message.id}/comments`,
    { body: 'این دیدگاه در وضعیت رئیس ثبت شده است' }, { 'X-Nika-Workspace': 'manager' });
  assert.equal(managerComment.status, 201, JSON.stringify(managerComment.data));
  const residentComment = await author.call('POST', `/api/public-messages/${message.id}/comments`,
    { body: 'این دیدگاه در وضعیت ساکن ثبت شده است' }, { 'X-Nika-Workspace': 'resident' });
  assert.equal(residentComment.status, 201, JSON.stringify(residentComment.data));

  const reacted = await author.post(`/api/public-messages/${message.id}/reactions`, { reaction: 'heart' });
  assert.equal(reacted.status, 200);
  const discussion = await author.get(`/api/public-messages/${message.id}/discussion`);
  assert.equal(discussion.data.comments[0].author_label, 'رئیس هیأت‌مدیره');
  assert.equal(discussion.data.comments[1].author_label, 'ساکن واحد 14');
  assert.equal(discussion.data.comments[0].actor_role, 'chair');
  assert.equal(discussion.data.myReaction, 'heart');

  assert.equal((await author.call('DELETE', `/api/public-messages/${message.id}`, { reason: 'حذف از فضای کاربر نباید مجاز باشد' })).status, 403);
  assert.equal((await author.call('DELETE', `/api/public-messages/${message.id}`, {}, { 'X-Nika-Workspace': 'manager' })).status, 400,
    'دلیل حذف الزامی است');
  const removed = await author.call('DELETE', `/api/public-messages/${message.id}`, { reason: 'پیام حاوی اطلاعات نادرست بود' }, { 'X-Nika-Workspace': 'manager' });
  assert.equal(removed.status, 200, JSON.stringify(removed.data));
  assert.equal((await author.get(`/api/public-messages/${message.id}/discussion`)).status, 404);
  const audit = await env.DB.prepare("SELECT details,actor_role FROM audit_logs WHERE action='public_message.delete' AND entity_id=?").bind(message.id).first();
  assert.equal(audit.actor_role, 'chair');
  assert.match(audit.details, /اطلاعات نادرست/);

  const second = await author.post('/api/public-messages', { title: 'پیام دوم', body: 'پیام آزمایشی دوم' });
  assert.equal(second.status, 201);
  assert.equal((await exec.call('DELETE', `/api/public-messages/${second.data.id}`, { reason: 'مدیر اجرایی نباید بتواند حذف کند' }, { 'X-Nika-Workspace': 'manager' })).status, 403);
});

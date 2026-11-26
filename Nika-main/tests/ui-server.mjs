// سرور محلی برای تست رابط بدون wrangler: فایل‌های public + API روی D1 شبیه‌سازی‌شده (فقط توسعه)
// اجرا: node --no-warnings tests/ui-server.mjs   ← http://localhost:8787  (داده‌ی نمونه ساخته می‌شود)
import http from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../src/index.js';
import { createDB } from './d1-shim.mjs';

const here = path.dirname(fileURLToPath(import.meta.url)), pub = path.join(here, '..', 'public');
const env = { DB: createDB(), JWT_SECRET: 'dev-secret-'.repeat(5), BOOTSTRAP_KEY: 'dev-setup', ALLOW_SELF_APPROVAL: 'false', ASSETS: { fetch: () => new Response('no', { status: 404 }) } };
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };
const headersFile = readFileSync(path.join(pub, '_headers'), 'utf8').split('\n');
const globalHeaders = []; let inGlobal = false;
for (const l of headersFile) { if (l.startsWith('/*')) inGlobal = true; else if (/^\//.test(l)) inGlobal = false; else if (inGlobal && l.trim()) { const i = l.indexOf(':'); globalHeaders.push([l.slice(0, i).trim(), l.slice(i + 1).trim()]); } }

export function start(port = 8787) {
  const srv = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);
    if (url.pathname.startsWith('/api/')) {
      const chunks = []; for await (const c of req) chunks.push(c);
      const body = chunks.length ? Buffer.concat(chunks) : undefined;
      const r = await worker.fetch(new Request(url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body }), env);
      const h = {}; r.headers.forEach((v, k) => { if (k !== 'set-cookie') h[k] = v; });
      const sc = r.headers.getSetCookie?.() ?? []; if (sc.length) h['set-cookie'] = sc;
      res.writeHead(r.status, h); res.end(Buffer.from(await r.arrayBuffer())); return;
    }
    let f = path.join(pub, url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname));
    if (!f.startsWith(pub) || !existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); res.end('404'); return; }
    const h = { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' };
    for (const [k, v] of globalHeaders) h[k] = v;
    res.writeHead(200, h); res.end(readFileSync(f));
  });
  return new Promise(r => srv.listen(port, () => r(srv)));
}

export async function seed() {
  let cookie = '';
  const call = async (method, p, body, headers = {}) => {
    const r = await worker.fetch(new Request('http://localhost:8787' + p, { method, headers: { 'Content-Type': 'application/json', 'X-Nika-Client': '1', Cookie: cookie, ...headers }, body: body === undefined ? undefined : JSON.stringify(body) }), env);
    const sc = r.headers.get('Set-Cookie'); if (sc) cookie = sc.startsWith('nika_session=;') ? '' : sc.split(';')[0];
    const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(method + ' ' + p + ' ' + r.status + ' ' + JSON.stringify(d)); return d;
  };
  const as = async (identifier, password) => { cookie = ''; await call('POST', '/api/login', { identifier, password }); };
  const R = 'داده‌ی نمونه';
  const out = { chair: { identifier: 'Admin', password: 'Chair-Long-Pass-91' } };
  const setup = await call('POST', '/api/setup', {}, { 'X-Setup-Key': 'dev-setup' });
  await as('Admin', setup.tempPassword); await call('POST', '/api/password', { newPassword: out.chair.password });
  const mk = async b => (await call('POST', '/api/admin/users', { reason: R, ...b })).tempPassword;
  const activate = async (who, newPw) => { await as(who.identifier, who.temp); await call('POST', '/api/password', { newPassword: newPw }); who.password = newPw; delete who.temp; };
  out.fin = { identifier: '09120000011', temp: await mk({ name: 'مدیر مالی', accountType: 'staff', phone: '09120000011', roles: ['finance'] }) };
  out.exec = { identifier: '09120000012', temp: await mk({ name: 'مدیر اجرایی', accountType: 'staff', phone: '09120000012', roles: ['executive'] }) };
  out.res = { identifier: '12', phone: '09121111111', temp: await mk({ name: 'علی رضایی', accountType: 'resident', unit: '12', phone: '09121111111', roles: [] }) };
  out.res2 = { identifier: '13', phone: '09123333333', temp: await mk({ name: 'سارا احمدی', accountType: 'resident', unit: '13', phone: '09123333333', roles: [] }) };
  await activate(out.fin, 'Finance-Pass-555'); await activate(out.exec, 'Exec-Pass-66666');
  await as(out.chair.identifier, out.chair.password);
  await call('POST', '/api/finance/charges', { fund: 'monthly', period: '1405-09', amount: 4000000, title: 'شارژ آذر' });
  await call('POST', '/api/notices', { title: 'اطلاعیه سرویس آسانسور', body: 'سرویس دوره‌ای آسانسور روز شنبه انجام می‌شود.', kind: 'اطلاعیه' });
  await call('POST', '/api/rules', { title: 'ساعات سکوت', body: 'از ساعت ۲۲ تا ۸ صبح از ایجاد سر و صدا خودداری شود.', sort_order: 1 });
  await call('POST', '/api/resolutions', { title: 'سرویس دوره‌ای آسانسور', body: 'سرویس هر سه ماه انجام شود.', decided_on: '1405/08/15' });
  await call('POST', '/api/events', { reason: R, title: 'جلسه هم‌اندیشی', body: 'سالن اجتماعات', event_date: '1405-09-05', event_time: '18:30' });
  await call('POST', '/api/documents', { title: 'آیین‌نامه داخلی', url: 'https://example.com/rules.pdf' });
  // یک پرداخت تأییدشده (برای موجودی صندوق) و یک درخواست هزینه‌ی تأییدشده
  await activate(out.res, 'Resident-Pass-22');
  await as(out.res.identifier, out.res.password);
  const pay = await call('POST', '/api/transactions', { fund: 'monthly', kind: 'payment', amount: 4000000, reference: '123456', period: '1405-09' });
  await as(out.fin.identifier, out.fin.password); await call('POST', `/api/transactions/${pay.id}/decision`, { status: 'approved' });
  await as(out.exec.identifier, out.exec.password);
  const er = await call('POST', '/api/expense-requests', { fund: 'monthly', amount: 990000, documentTitle: 'قبض آب', documentDate: '1405-09-02', description: 'قبض آب آذر' });
  await as(out.fin.identifier, out.fin.password); await call('POST', `/api/expense-requests/${er.id}/finance-decision`, { status: 'approved' });
  await as(out.chair.identifier, out.chair.password); await call('POST', `/api/expense-requests/${er.id}/chair-decision`, { status: 'approved', reason: R });
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const creds = await seed(); await start(8787);
  console.log('http://localhost:8787 آماده است. حساب‌های نمونه:'); console.log(JSON.stringify(creds, null, 2));
}

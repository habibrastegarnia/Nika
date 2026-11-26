import worker from '../src/index.js';
import { createDB } from './d1-shim.mjs';

export const makeEnv = (extra = {}) => ({ DB: createDB(), JWT_SECRET: 'y'.repeat(40), BOOTSTRAP_KEY: 'sec-setup-key', ALLOW_SELF_APPROVAL: 'false', ASSETS: { fetch: () => new Response('asset') }, ...extra });

let ipCounter = 10;
export class Client {
  constructor(env, ip) { this.env = env; this.cookie = ''; this.ip = ip || `10.0.0.${ipCounter++}`; }
  async call(method, path, body, extra = {}) {
    const headers = { 'Content-Type': 'application/json', 'X-Nika-Client': '1', 'CF-Connecting-IP': this.ip, ...extra };
    if (this.cookie) headers.Cookie = this.cookie;
    const res = await worker.fetch(new Request('https://nika.test' + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), this.env);
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
  login(identifier, password) { return this.post('/api/login', { identifier, password }); }
}

// ساخت سامانه‌ی تازه با رئیس فعال‌شده
export async function bootstrap(env) {
  const chair = new Client(env);
  const s = await chair.call('POST', '/api/setup', {}, { 'X-Setup-Key': env.BOOTSTRAP_KEY });
  await chair.login('Admin', s.data.tempPassword);
  await chair.post('/api/password', { newPassword: 'Chair-Strong-Pass-1' });
  return { chair, setup: s };
}
export async function makeUser(chair, body) {
  const r = await chair.post('/api/admin/users', { reason: 'آزمون', ...body });
  if (r.status !== 201) throw new Error('makeUser failed ' + JSON.stringify(r.data));
  return r.data;
}
export async function activate(env, identifier, temp, newPw) {
  const c = new Client(env);
  const l = await c.login(identifier, temp);
  if (l.status !== 200) throw new Error('activate login failed ' + JSON.stringify(l.data));
  const p = await c.post('/api/password', { newPassword: newPw });
  if (p.status !== 200) throw new Error('activate password failed ' + JSON.stringify(p.data));
  return c;
}

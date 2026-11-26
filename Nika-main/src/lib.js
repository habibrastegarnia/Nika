import { jalaliToDate } from './jcal.js';
// ابزارهای مشترک: خطا، پاسخ JSON، اعتبارسنجی ورودی، رمزنگاری
export class ApiError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
export const err = (status, code, message) => new ApiError(status, code, message);

export function reply(data, status = 200, cookies = []) {
  const h = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  for (const c of cookies) h.append('Set-Cookie', c);
  return new Response(JSON.stringify(data), { status, headers: h });
}

export async function readJson(request, limit = 300000) {
  const text = await request.text();
  if (text.length > limit) throw err(413, 'TOO_LARGE', 'حجم درخواست زیاد است');
  if (!text) return {};
  try {
    const v = JSON.parse(text);
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch { throw err(400, 'INVALID_JSON', 'درخواست نامعتبر است'); }
}

// ---------- ورودی‌ها ----------
const PERSIAN = '۰۱۲۳۴۵۶۷۸۹', ARABIC = '٠١٢٣٤٥٦٧٨٩';
export const normDigits = s => String(s ?? '')
  .replace(/[۰-۹]/g, d => PERSIAN.indexOf(d))
  .replace(/[٠-٩]/g, d => ARABIC.indexOf(d));

const BIDI = /[\u202a-\u202e\u2066-\u2069\u200e\u200f]/g;
export function str(v, { max = 200, min = 1, multiline = false, field = 'ورودی' } = {}) {
  if (v == null) v = '';
  if (typeof v !== 'string') throw err(400, 'INVALID_INPUT', `${field} نامعتبر است`);
  let s = v.replace(BIDI, '');
  s = multiline
    ? s.replace(/\r\n/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    : s.replace(/[\u0000-\u001f\u007f]/g, ' ');
  s = s.trim();
  if (s.length < min) throw err(400, 'INVALID_INPUT', `${field} را وارد کنید`);
  if (s.length > max) throw err(400, 'INVALID_INPUT', `${field} حداکثر ${max} کاراکتر باشد`);
  return s;
}
export const optStr = (v, o = {}) => (v == null || String(v).trim() === '') ? null : str(v, { ...o, min: 0 });

export function int(v, { min = 1, max = 1e12, field = 'مقدار' } = {}) {
  const n = typeof v === 'string' ? Number(normDigits(v).replace(/[,٬\s]/g, '')) : v;
  if (!Number.isSafeInteger(n) || n < min || n > max) throw err(400, 'INVALID_INPUT', `${field} نامعتبر است`);
  return n;
}

export function normPhone(v) {
  let s = normDigits(v).replace(/[\s\-()]/g, '');
  if (s.startsWith('+98')) s = '0' + s.slice(3);
  else if (s.startsWith('0098')) s = '0' + s.slice(4);
  else if (/^98\d{10}$/.test(s)) s = '0' + s.slice(2);
  return /^09\d{9}$/.test(s) ? s : null;
}
export function phoneOrFail(v) {
  const p = normPhone(v);
  if (!p) throw err(400, 'INVALID_PHONE', 'شماره موبایل باید به شکل ۰۹۱۲۳۴۵۶۷۸۹ باشد');
  return p;
}
export function unitOrNull(v) {
  const s = normDigits(v).trim();
  return /^[0-9A-Za-z\u0600-\u06FF\-\/]{1,10}$/.test(s) ? s : null;
}
export function unitOrFail(v) {
  const u = unitOrNull(v);
  if (!u) throw err(400, 'INVALID_UNIT', 'شماره واحد نامعتبر است');
  return u;
}
export const PERIOD_RE = /^1[34]\d{2}-(0[1-9]|1[0-2])$/;
export function period(v, required = true) {
  if (v == null || v === '') { if (required) throw err(400, 'INVALID_PERIOD', 'دوره (مثلاً ۱۴۰۵-۰۹) را وارد کنید'); return null; }
  const p = normDigits(v).trim().replace('/', '-');
  if (!PERIOD_RE.test(p)) throw err(400, 'INVALID_PERIOD', 'دوره باید به شکل ۱۴۰۵-۰۹ باشد');
  return p;
}
export function jdate(v, sep) {
  const s = normDigits(v).trim().replace(/[\/\-]/g, sep);
  const re = sep === '/' ? /^1[34]\d{2}\/(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])$/ : /^1[34]\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
  if (!re.test(s)) throw err(400, 'INVALID_DATE', 'تاریخ شمسی باید به شکل ۱۴۰۵/۰۹/۰۱ باشد');
  const [y, m, d] = s.split(sep).map(Number);
  if (!jalaliToDate(y, m, d)) throw err(400, 'INVALID_DATE', 'روز انتخاب‌شده در تقویم شمسی معتبر نیست');
  return s;
}

export function passwordProblem(pw, phone) {
  if (typeof pw !== 'string' || pw.length < 8) return 'رمز عبور حداقل ۸ کاراکتر باشد';
  if (pw.length > 128) return 'رمز عبور بیش از حد طولانی است';
  if (/^\d+$/.test(normDigits(pw))) return 'رمز عبور نباید فقط عدد باشد';
  if (phone && normDigits(pw).includes(phone)) return 'رمز عبور نباید شامل شماره موبایل باشد';
  return null;
}

// ---------- رمزنگاری ----------
export const enc = s => new TextEncoder().encode(s);
export function b64u(buf) {
  const b = new Uint8Array(buf); let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function unb64u(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '=';
  const bin = atob(s), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
// Cloudflare Workers حداکثر ۱۰۰٬۰۰۰ تکرار PBKDF2 را می‌پذیرد
export const PBKDF2_ITERATIONS = 100000;
export async function hashPassword(password, salt) {
  const key = await crypto.subtle.importKey('raw', enc(password), 'PBKDF2', false, ['deriveBits']);
  return b64u(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc(salt), iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' }, key, 256));
}
export const newSalt = () => b64u(crypto.getRandomValues(new Uint8Array(16)));
export function safeEqual(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
const hmacKey = (secret, usage) => crypto.subtle.importKey('raw', enc(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [usage]);
export async function signToken(payload, secret) {
  const data = b64u(enc(JSON.stringify(payload)));
  const sig = b64u(await crypto.subtle.sign('HMAC', await hmacKey(secret, 'sign'), enc(data)));
  return data + '.' + sig;
}
export async function verifyToken(value, secret) {
  try {
    const [data, sig] = String(value).split('.');
    if (!data || !sig) return null;
    if (!await crypto.subtle.verify('HMAC', await hmacKey(secret, 'verify'), unb64u(sig), enc(data))) return null;
    const p = JSON.parse(new TextDecoder().decode(unb64u(data)));
    return p.exp > Date.now() / 1000 ? p : null;
  } catch { return null; }
}
const TEMP_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
export function tempPassword() {
  const r = crypto.getRandomValues(new Uint8Array(12));
  let s = ''; for (const x of r) s += TEMP_ALPHABET[x % TEMP_ALPHABET.length];
  return s + '7a';
}

export async function audit(db, actor, action, type, entity, details = {}, meta = {}) {
  await db.prepare('INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id,details,actor_role,is_delegate,reason) VALUES(?,?,?,?,?,?,?,?,?)')
    .bind(
      crypto.randomUUID(), actor || null, action, type, entity || null, JSON.stringify(details),
      meta.actorRole || null, meta.isDelegate ? 1 : 0, meta.reason || null
    ).run();
}
export const FUNDS = ['owner', 'monthly'];
export const FUND_TITLE = { owner: 'صندوق مالکانه', monthly: 'صندوق شارژ ماهیانه' };

// رمز اولیه‌ی حساب‌های مالک/ساکن: 'random' (پیش‌فرض، امن) یا 'phone' (رمز اولیه = شماره موبایل؛ قبل از فعال‌سازی قابل حدس است)
export const initialPasswordMode = env => env.INITIAL_PASSWORD_MODE === 'phone' ? 'phone' : 'random';
export async function verifyUserPassword(db, userId, password) {
  const row = await db.prepare('SELECT password_hash,password_salt FROM users WHERE id=?').bind(userId).first();
  return !!row && typeof password === 'string' && password.length <= 128 && safeEqual(await hashPassword(password, row.password_salt), row.password_hash);
}

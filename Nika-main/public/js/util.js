// ابزارهای عمومی: escape امن، قالب HTML، ارقام فارسی، تاریخ شمسی
export class Safe { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = s => new Safe(String(s ?? ''));
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const val = v => v == null || v === false ? '' : v instanceof Safe ? v.s : Array.isArray(v) ? v.map(val).join('') : esc(v);
// هر مقدار داخل html`...` به‌طور خودکار escape می‌شود، مگر خودش خروجی html`` یا raw() باشد
export const html = (s, ...v) => new Safe(s.reduce((a, x, i) => a + x + (i < v.length ? val(v[i]) : ''), ''));
// تبدیل آرایه‌ای از html`` به یک رشته‌ی HTML (بدون ویرگول بین عضوها)
export const join = arr => arr.map(String).join('');
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const faFmt = new Intl.NumberFormat('fa-IR'), faPlain = new Intl.NumberFormat('fa-IR', { useGrouping: false });
export const fa = n => faFmt.format(Number(n) || 0);
export const faN = n => faPlain.format(Number(n) || 0);
export const toman = n => fa(n) + ' تومان';
const P = '۰۱۲۳۴۵۶۷۸۹', A = '٠١٢٣٤٥٦٧٨٩';
export const normDigits = s => String(s ?? '').replace(/[۰-۹]/g, d => P.indexOf(d)).replace(/[٠-٩]/g, d => A.indexOf(d));
export const parseAmount = s => { const d = normDigits(s).replace(/\D/g, ''); return d ? Number(d) : NaN; };

// ---------- تقویم شمسی (با Intl مرورگر) ----------
export const JM = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
const jf = new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn', { year: 'numeric', month: 'numeric', day: 'numeric', timeZone: 'UTC' });
export const jOf = d => { const o = {}; for (const p of jf.formatToParts(d)) o[p.type] = p.value; return { y: +o.year, m: +o.month, d: +o.day }; };
const tehran = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit' });
export const todayUTC = () => { const [y, m, d] = tehran.format(new Date()).split('-').map(Number); return new Date(Date.UTC(y, m - 1, d, 12)); };
export const jToday = () => jOf(todayUTC());
const key = j => j.y * 10000 + j.m * 100 + j.d;
// تاریخ میلادی (ظهر UTC) روز اول ماه شمسی
export function monthStart(y, m) {
  let g = new Date(Date.UTC(y + 621, 2, 21 + Math.round((m - 1) * 30.4), 12));
  const t = y * 10000 + m * 100 + 1;
  for (let i = 0; i < 40 && key(jOf(g)) > t; i++) g = new Date(g.getTime() - 864e5);
  for (let i = 0; i < 40 && key(jOf(g)) < t; i++) g = new Date(g.getTime() + 864e5);
  return g;
}
export const monthLen = (y, m) => { const n = m === 12 ? monthStart(y + 1, 1) : monthStart(y, m + 1); return Math.round((n - monthStart(y, m)) / 864e5); };
export const curPeriod = () => { const t = jToday(); return `${t.y}-${String(t.m).padStart(2, '0')}`; };
export const periodLabel = p => { const [y, m] = String(p).split('-').map(Number); return m ? `${JM[m - 1]} ${faN(y)}` : '—'; };

const dtf = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit' });
const ttf = new Intl.DateTimeFormat('fa-IR', { timeZone: 'Asia/Tehran', hour: '2-digit', minute: '2-digit', hour12: false });
const parse = s => new Date(String(s).replace(' ', 'T') + 'Z');
export const fdate = s => s ? dtf.format(parse(s)) : '—';
export const fdt = s => s ? `${dtf.format(parse(s))} · ${ttf.format(parse(s))}` : '—';
export const isRecent = (s, days = 3) => s && Date.now() - parse(s).getTime() < days * 864e5;

// ---------- برچسب‌ها ----------
export const FUND_FA = { owner: 'صندوق مالکانه', monthly: 'صندوق شارژ ماهیانه' };
export const KIND_FA = { charge: 'شارژ', payment: 'پرداخت', expense: 'هزینه', adjustment: 'اعتبار / تعدیل' };
export const TX_STATUS = { pending: ['در انتظار تأیید', 'amber'], approved: ['تأییدشده', 'green'], rejected: ['ردشده', 'red'], paid: ['پرداخت‌شده', 'green'] };
export const REQ_STATUS = { new: ['جدید', 'blue'], in_progress: ['در حال رسیدگی', 'amber'], resolved: ['انجام‌شده', 'green'], rejected: ['ردشده', 'red'] };
export const REQ_KIND = { request: 'درخواست', idea: 'پیشنهاد', issue: 'گزارش خرابی' };
export const REQ_CATEGORIES = ['عمومی', 'تأسیسات و تعمیرات', 'نظافت', 'امنیت', 'مالی', 'سایر'];
export const ROLE_FA = { owner: 'مالک', resident: 'ساکن', chair: 'رئیس هیأت‌مدیره', finance: 'مدیر مالی', board: 'عضو هیأت‌مدیره', executive: 'مدیر اجرایی', system_admin: 'مدیر سامانه', caretaker: 'سرایدار' };
export const ACCOUNT_FA = { owner: 'مالک', resident: 'ساکن', staff: 'مدیر / کارکنان', both: 'مالک/ساکن' };
export const baseRoleKey = user => {
  const roles = Array.isArray(user?.roles) ? user.roles : [];
  if (roles.includes('owner') && roles.includes('resident')) return 'both';
  if (roles.includes('owner')) return 'owner';
  if (roles.includes('resident')) return 'resident';
  return null;
};
export const baseRoleLabel = (user, includeUnit = true) => {
  const key = baseRoleKey(user);
  if (!key) return '';
  const label = key === 'both' ? 'مالک/ساکن' : key === 'owner' ? 'مالک' : 'ساکن';
  return includeUnit && user?.unit_number ? `${label} واحد ${user.unit_number}` : label;
};
export const userRoleLabels = user => {
  const base = baseRoleLabel(user, false);
  const extra = (Array.isArray(user?.roles) ? user.roles : []).filter(role => !['owner','resident'].includes(role)).map(role => ROLE_FA[role] || role);
  return [...(base ? [base] : []), ...extra];
};
export const chip = ([label, color]) => html`<span class="page-chip ${color}">${label}</span>`;

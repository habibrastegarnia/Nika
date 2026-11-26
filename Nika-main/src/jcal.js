// تقویم شمسی سریع و سازگار با ICU (همان تقویمی که مرورگرها برای نمایش تاریخ استفاده می‌کنند).
// جایگزین اسکن روزبه‌روز (تا ۳۷۰ فراخوانی Intl برای هر تاریخ) در نسخه‌ی قبلی.
const DAY = 86400000;
const fmt = tz => new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn', { timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric' });
const utcFmt = fmt('UTC'), tehranFmt = fmt('Asia/Tehran');
const parts = (f, date) => { const o = {}; for (const p of f.formatToParts(date)) o[p.type] = p.value; return { y: +o.year, m: +o.month, d: +o.day }; };
export const jParts = date => parts(utcFmt, date);           // برای تاریخ‌هایی که ظهر UTC ساخته شده‌اند
export const jTehran = (date = new Date()) => parts(tehranFmt, date); // «امروز» به وقت تهران
const key = p => p.y * 10000 + p.m * 100 + p.d;
const pad = n => String(n).padStart(2, '0');
export const fmtJ = p => `${p.y}-${pad(p.m)}-${pad(p.d)}`;
export const splitJ = s => String(s).split('-').map(Number);

const cache = new Map();
// تاریخ میلادی (ظهر UTC) معادل تاریخ شمسی؛ برای تاریخ نامعتبر null
export function jalaliToDate(y, m, d) {
  const ck = y * 10000 + m * 100 + d;
  if (cache.has(ck)) return cache.get(ck);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const doy = (m <= 6 ? (m - 1) * 31 : 186 + (m - 7) * 30) + (d - 1);
  let t = Date.UTC(y + 621, 2, 21, 12) + doy * DAY, p = jParts(new Date(t));
  for (let i = 0; i < 6 && key(p) !== ck; i++) { t += (key(p) < ck ? 1 : -1) * DAY; p = jParts(new Date(t)); }
  const r = key(p) === ck ? new Date(t) : null;
  if (cache.size > 5000) cache.clear();
  cache.set(ck, r);
  return r;
}
export const dateToJalali = date => fmtJ(jParts(date));
export const monthLength = (y, m) => m <= 6 ? 31 : m <= 11 ? 30 : (jalaliToDate(y, 12, 30) ? 30 : 29);
export const daysBetween = (a, b) => Math.round((jalaliToDate(...splitJ(b)) - jalaliToDate(...splitJ(a))) / DAY);

// آیا سری تکرارشونده‌ی رویداد در تاریخ dateStr نوبت دارد؟ (O(1))
// روز ماه همیشه از «روز اصلی» محاسبه می‌شود؛ پس رویداد «۳۱ام هر ماه» در ماه‌های ۳۰روزه به ۳۰ام می‌رود
// و ماه بعد دوباره به ۳۱ام برمی‌گردد (نسخه‌ی قبلی برای همیشه روی ۳۰ یا ۲۹ می‌ماند).
export function occursOn(startStr, recurrence, untilStr, dateStr) {
  if (dateStr < startStr || (untilStr && dateStr > untilStr)) return false;
  if (recurrence === 'none' || !recurrence) return dateStr === startStr;
  const [y0, m0, d0] = splitJ(startStr), [y, m, d] = splitJ(dateStr);
  if (recurrence === 'weekly') { const n = daysBetween(startStr, dateStr); return n >= 0 && n % 7 === 0; }
  if (recurrence === 'monthly') return m !== undefined && d === Math.min(d0, monthLength(y, m));
  if (recurrence === 'yearly') return m === m0 && d === Math.min(d0, monthLength(y, m0));
  return false;
}

// همه‌ی نوبت‌های سری در بازه‌ی [fromStr, endStr) به‌ترتیب زمانی
export function occurrencesBetween(startStr, recurrence, untilStr, fromStr, endStr) {
  const out = [], limit = untilStr && untilStr < endStr ? untilStr : null;
  const ok = s => s >= fromStr && s < endStr && (!limit || s <= limit);
  if (recurrence === 'none' || !recurrence) return ok(startStr) ? [startStr] : [];
  const [y0, m0, d0] = splitJ(startStr);
  if (recurrence === 'weekly') {
    const startG = jalaliToDate(y0, m0, d0), fromG = jalaliToDate(...splitJ(fromStr));
    if (!startG || !fromG) return out;
    let n = Math.max(0, Math.floor((fromG - startG) / (7 * DAY)));
    for (let g = 0; g < 400; g++, n++) {
      const s = dateToJalali(new Date(startG.getTime() + n * 7 * DAY));
      if (s >= endStr || (limit && s > limit)) break;
      if (s >= fromStr) out.push(s);
    }
  } else if (recurrence === 'monthly') {
    const [fy, fm] = splitJ(fromStr);
    for (let k = Math.max(0, (fy - y0) * 12 + (fm - m0)), g = 0; g < 400; g++, k++) {
      const idx = m0 - 1 + k, y = y0 + Math.floor(idx / 12), m = idx % 12 + 1;
      const s = fmtJ({ y, m, d: Math.min(d0, monthLength(y, m)) });
      if (s >= endStr || (limit && s > limit)) break;
      if (s >= startStr && s >= fromStr) out.push(s);
    }
  } else if (recurrence === 'yearly') {
    const [fy] = splitJ(fromStr);
    for (let y = Math.max(y0, fy), g = 0; g < 400; g++, y++) {
      const s = fmtJ({ y, m: m0, d: Math.min(d0, monthLength(y, m0)) });
      if (s >= endStr || (limit && s > limit)) break;
      if (s >= startStr && s >= fromStr) out.push(s);
    }
  }
  return out;
}

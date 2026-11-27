// فرم عمومی گردآوری اولیه اطلاعات مالکان و ساکنان؛ مستقل از حساب‌های واقعی سامانه
import { R } from './router.js';
import { err, reply, readJson, str, phoneOrFail, normDigits, jdate } from './lib.js';

const UNITS = new Set(Array.from({ length: 32 }, (_, i) => String((Math.floor(i / 4) + 1) * 100 + (i % 4) + 1)));

// اعتبارسنجی مستقل شماره‌های فرم عمومی؛ منطق شماره تلفن سایر بخش‌های سامانه تغییر نمی‌کند.
function registrationPhoneOrFail(value) {
  let s = normDigits(value).trim().replace(/[\s().-]/g, '');
  if (s.startsWith('+98') || s.startsWith('0098') || /^98\d{10}$/.test(s) || /^09\d{9}$/.test(s)) {
    return phoneOrFail(s);
  }
  if (s.startsWith('00')) s = '+' + s.slice(2);
  if (/^\+[1-9]\d{7,14}$/.test(s)) return s;
  throw err(400, 'INVALID_PHONE', 'شماره ایران را به شکل ۰۹۱۲۳۴۵۶۷۸۹ و شماره خارجی را همراه با پیش‌شماره کشور، مانند ‎+994501234567، وارد کنید');
}

// خروجی فهرست متمرکز؛ فقط کاربران دارای مجوز مشاهده کاربران می‌توانند دریافت کنند.
R('GET', '/api/public/user-submissions/export', { perm: 'users.read' }, async c => {
  const result = await c.db.prepare(
    "SELECT unit_number,user_type,full_name,gender,phone,secondary_phone,contract_start_date,contract_end_date,strftime('%Y-%m-%d %H:%M', created_at, '+3 hours', '+30 minutes') AS submitted_at FROM public_user_submissions ORDER BY CAST(unit_number AS INTEGER), CASE user_type WHEN 'owner' THEN 0 ELSE 1 END, rowid"
  ).all();
  const headers = ['شماره واحد','نوع کاربر','نام و نام خانوادگی','جنسیت','شماره تماس','شماره تماس پشتیبان','تاریخ شروع قرارداد','تاریخ اتمام قرارداد','تاریخ و ساعت ثبت'];
  const safe = value => {
    let text = String(value ?? '');
    if (/^[=+@\-\t\r]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  };
  const rows = (result.results || []).map(row => [
    row.unit_number,
    row.user_type === 'owner' ? 'مالک' : 'ساکن',
    row.full_name,
    row.gender === 'female' ? 'زن' : 'مرد',
    row.phone,
    row.secondary_phone,
    row.contract_start_date,
    row.contract_end_date,
    row.submitted_at
  ]);
  const csv = '\uFEFF' + [headers, ...rows].map(row => row.map(safe).join(',')).join('\r\n');
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': "attachment; filename=nika-users.csv; filename*=UTF-8''%D9%81%D9%87%D8%B1%D8%B3%D8%AA-%DA%A9%D8%A7%D8%B1%D8%A8%D8%B1%D8%A7%D9%86-%D9%86%DB%8C%DA%A9%D8%A7.csv",
      'Cache-Control': 'no-store'
    }
  });
});


// تعداد ثبت‌نام‌ها به تفکیک روز؛ تاریخ بر اساس ساعت رسمی ایران محاسبه می‌شود.
R('GET', '/api/public/user-submissions/daily-counts', { perm: 'users.read' }, async c => {
  const result = await c.db.prepare(
    "SELECT date(created_at, '+3 hours', '+30 minutes') AS day, COUNT(*) AS total FROM public_user_submissions GROUP BY day ORDER BY day DESC"
  ).all();
  return reply({ days: result.results || [] });
});

R('POST', '/api/public/user-submissions', { public: true }, async c => {
  const x = await readJson(c.request);
  if (x.website) throw err(400, 'INVALID_SUBMISSION', 'اطلاعات ارسالی معتبر نیست');
  const unit = String(x.unit || '').trim();
  if (!UNITS.has(unit)) throw err(400, 'INVALID_UNIT', 'شماره واحد را از فهرست انتخاب کنید');
  if (!['owner', 'resident'].includes(x.userType)) throw err(400, 'INVALID_USER_TYPE', 'نوع کاربر را انتخاب کنید');

  // نام و نام خانوادگی در فرم جدا هستند؛ در پایگاه داده و خروجی اکسل یکپارچه نگهداری می‌شوند.
  const firstName = str(x.firstName, { max: 50, field: 'نام' });
  const lastName = str(x.lastName, { max: 70, field: 'نام خانوادگی' });
  const fullName = str(`${firstName} ${lastName}`, { max: 120, field: 'نام و نام خانوادگی' });
  if (!['female', 'male'].includes(x.gender)) throw err(400, 'INVALID_GENDER', 'جنسیت را انتخاب کنید');
  const phone = registrationPhoneOrFail(x.phone);
  const secondaryPhone = x.secondaryPhone ? registrationPhoneOrFail(x.secondaryPhone) : null;

  // تاریخ‌های قرارداد اختیاری‌اند؛ هر تاریخِ واردشده جداگانه اعتبارسنجی می‌شود.
  const startRaw = x.contractStartDate == null ? '' : String(x.contractStartDate).trim();
  const endRaw = x.contractEndDate == null ? '' : String(x.contractEndDate).trim();
  const contractStartDate = startRaw ? jdate(startRaw, '/') : null;
  const contractEndDate = endRaw ? jdate(endRaw, '/') : null;
  if (contractStartDate && contractEndDate && contractEndDate < contractStartDate) {
    throw err(400, 'INVALID_CONTRACT_RANGE', 'تاریخ اتمام قرارداد نمی‌تواند پیش از تاریخ شروع باشد');
  }

  const id = crypto.randomUUID();
  await c.db.prepare(
    'INSERT INTO public_user_submissions(id,unit_number,user_type,full_name,gender,phone,secondary_phone,contract_start_date,contract_end_date) VALUES(?,?,?,?,?,?,?,?,?)'
  ).bind(id, unit, x.userType, fullName, x.gender, phone, secondaryPhone, contractStartDate, contractEndDate).run();
  return reply({ ok: true });
});

// صفحهٔ مستقل مشاهدهٔ ثبت‌نام‌ها؛ بدون ورود و رمز، طبق درخواست کاربر.
R('GET', '/api/private/user-submissions', { public: true }, async c => {
  const result = await c.db.prepare(
    "SELECT unit_number,user_type,full_name,gender,phone,secondary_phone,contract_start_date,contract_end_date,strftime('%Y-%m-%d %H:%M', created_at, '+3 hours', '+30 minutes') AS submitted_at FROM public_user_submissions ORDER BY CAST(unit_number AS INTEGER), CASE user_type WHEN 'owner' THEN 0 ELSE 1 END, rowid"
  ).all();
  return reply({ total: (result.results || []).length, rows: result.results || [] });
});

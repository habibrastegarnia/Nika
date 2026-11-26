// فرم عمومی گردآوری اولیه اطلاعات مالکان و ساکنان؛ مستقل از حساب‌های واقعی سامانه
import { R } from './router.js';
import { err, reply, readJson, str, phoneOrFail, jdate } from './lib.js';

const UNITS = new Set(Array.from({ length: 32 }, (_, i) => String((Math.floor(i / 4) + 1) * 100 + (i % 4) + 1)));

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
  const phone = phoneOrFail(x.phone);
  const secondaryPhone = x.secondaryPhone ? phoneOrFail(x.secondaryPhone) : null;

  // تاریخ‌های قرارداد برای مالک و ساکن هر دو دریافت و در رکورد اولیه نگهداری می‌شوند.
  const contractStartDate = jdate(x.contractStartDate, '/');
  const contractEndDate = jdate(x.contractEndDate, '/');
  if (contractEndDate < contractStartDate) {
    throw err(400, 'INVALID_CONTRACT_RANGE', 'تاریخ اتمام قرارداد نمی‌تواند پیش از تاریخ شروع باشد');
  }

  const id = crypto.randomUUID();
  await c.db.prepare(
    'INSERT INTO public_user_submissions(id,unit_number,user_type,full_name,gender,phone,secondary_phone,contract_start_date,contract_end_date) VALUES(?,?,?,?,?,?,?,?,?)'
  ).bind(id, unit, x.userType, fullName, x.gender, phone, secondaryPhone, contractStartDate, contractEndDate).run();
  return reply({ ok: true });
});

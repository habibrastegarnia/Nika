// فرم عمومی گردآوری اولیه اطلاعات مالکان و ساکنان؛ مستقل از حساب‌های واقعی سامانه
import { R } from './router.js';
import { err, reply, readJson, str, phoneOrFail, jdate } from './lib.js';

const UNITS = new Set(Array.from({ length: 32 }, (_, i) => String((Math.floor(i / 4) + 1) * 100 + (i % 4) + 1)));

R('POST', '/api/public/user-submissions', { public: true }, async c => {
  const x = await readJson(c.request);
  // Honeypot برای کاهش ارسال‌های خودکار؛ مقدار آن در فرم واقعی خالی می‌ماند.
  if (x.website) throw err(400, 'INVALID_SUBMISSION', 'اطلاعات ارسالی معتبر نیست');
  const unit = String(x.unit || '').trim();
  if (!UNITS.has(unit)) throw err(400, 'INVALID_UNIT', 'شماره واحد را از فهرست انتخاب کنید');
  if (!['owner', 'resident'].includes(x.userType)) throw err(400, 'INVALID_USER_TYPE', 'نوع کاربر را انتخاب کنید');
  const name = str(x.fullName, { max: 100, field: 'نام و نام خانوادگی' });
  if (!['female', 'male'].includes(x.gender)) throw err(400, 'INVALID_GENDER', 'جنسیت را انتخاب کنید');
  const phone = phoneOrFail(x.phone);
  const secondaryPhone = x.secondaryPhone ? phoneOrFail(x.secondaryPhone) : null;
  const contractStartDate = jdate(x.contractStartDate, '/');
  const id = crypto.randomUUID();
  await c.db.prepare(
    'INSERT INTO public_user_submissions(id,unit_number,user_type,full_name,gender,phone,secondary_phone,contract_start_date) VALUES(?,?,?,?,?,?,?,?)'
  ).bind(id, unit, x.userType, name, x.gender, phone, secondaryPhone, contractStartDate).run();
  return reply({ ok: true });
});

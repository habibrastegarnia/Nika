// امور مالی: تراکنش‌ها، شارژ، تأیید، داشبورد و گزارش مانده
// تعریف‌ها: charge = بدهی واحد | payment = پرداخت واحد (پس از تأیید مدیر مالی) | adjustment = اعتبار/تخفیف (کاهش بدهی) | expense = هزینه‌ی ساختمان
import { R } from './router.js';
import { err, reply, readJson, str, optStr, int, period, FUNDS, FUND_TITLE, audit } from './lib.js';
import { can, canAny } from './perms.js';

const fundOf = v => { if (!FUNDS.includes(v)) throw err(400, 'FUND_REQUIRED', 'صندوق نامعتبر است'); return v; };
const ownerYear = v => {
  const y = String(v ?? '').replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).trim();
  // Intl may append an era marker (for example "1405 AP"); extract the four-digit Jalali year.
  const match = y.match(/1[34]\d{2}/);
  if (!match) throw err(400, 'INVALID_PERIOD', 'سال شارژ مالکانه باید به شکل ۱۴۰۵ باشد');
  return match[0];
};
const fundPeriod = (fund, value, required = true) => fund === 'owner'
  ? (value == null || value === '' ? (required ? ownerYear(new Intl.DateTimeFormat('en-u-ca-persian', { timeZone: 'Asia/Tehran', year: 'numeric' }).format(new Date())) : null) : ownerYear(value))
  : period(value, required);
const canReadFund = (u, f) => can(u, `finance.${f}.read`);
const canSeeAggregates = (u, f) => canReadFund(u, f) || canAny(u, ['reports.read', 'finance.reports']);
const privileged = u => canAny(u, ['finance.approve', 'finance.transactions.read', 'expenses.approve']);

const COLS = `t.id,t.fund_id,t.kind,t.amount,t.title,t.period,t.status,t.reference,t.category,t.note,t.created_at,t.approved_at,t.created_by,
              n.unit_number,cu.name created_name,au.name approved_name`;
const FROM = `FROM transactions t LEFT JOIN units n ON n.id=t.unit_id LEFT JOIN users cu ON cu.id=t.created_by LEFT JOIN users au ON au.id=t.approved_by`;

R('GET', '/api/transactions', async c => {
  const q = c.url.searchParams, fund = fundOf(q.get('fund')), u = c.user;
  const all = q.get('scope') === 'all';
  if (all && !privileged(u) && !(q.get('unit') && can(u, 'units.read'))) throw err(403, 'FORBIDDEN', 'دسترسی کافی ندارید');
  if (!all && !(canReadFund(u, fund) || can(u, 'expenses.create'))) throw err(403, 'FORBIDDEN', 'دسترسی کافی ندارید');
  const where = ['t.fund_id=?'], vals = [fund];
  if (!all) { where.push('(t.unit_id=? OR t.created_by=?)'); vals.push(u.unit_id ?? null, u.id); }
  const unitNumber = q.get('unit');
  if (unitNumber) {
    if (!all || !(privileged(u) || can(u, 'units.read'))) throw err(403, 'FORBIDDEN', 'دسترسی کافی ندارید');
    where.push('n.unit_number=?'); vals.push(String(unitNumber));
  }
  for (const [k, col] of [['status', 't.status'], ['kind', 't.kind']]) {
    const v = q.get(k); if (v) { where.push(`${col}=?`); vals.push(v); }
  }
  if (q.get('period')) { where.push('t.period=?'); vals.push(fundPeriod(fund, q.get('period'))); }
  const limit = Math.min(Math.max(Number(q.get('limit')) || 100, 1), 200), offset = Math.max(Number(q.get('offset')) || 0, 0);
  const r = await c.db.prepare(`SELECT ${COLS} ${FROM} WHERE ${where.join(' AND ')} ORDER BY t.created_at DESC,t.rowid DESC LIMIT ? OFFSET ?`).bind(...vals, limit, offset).all();
  return reply({ transactions: r.results });
});

// ثبت پرداخت توسط ساکن/مالک یا ثبت هزینه توسط مدیر اجرایی
R('POST', '/api/transactions', async c => {
  const x = await readJson(c.request), fund = fundOf(x.fund), u = c.user, id = crypto.randomUUID();
  if (x.kind === 'payment') {
    const amount = int(x.amount, { field: 'مبلغ' }), ref = optStr(x.reference, { max: 40, field: 'شماره پیگیری' });
    const title = optStr(x.title, { max: 120, field: 'عنوان' }) || `پرداخت ${FUND_TITLE[fund]}`;
    const note = optStr(x.note, { max: 300, field: 'توضیحات', multiline: true });
    if (x.unitNumber != null && String(x.unitNumber).trim() !== '') {
      if (!can(u, 'finance.approve')) throw err(403, 'FORBIDDEN', 'اجازه‌ی ثبت پرداخت برای واحدها را ندارید');
      const unitNumber = str(x.unitNumber, { max: 20, field: 'شماره واحد' });
      const unit = await c.db.prepare('SELECT id FROM units WHERE unit_number=?').bind(unitNumber).first();
      if (!unit) throw err(404, 'UNIT_NOT_FOUND', 'واحد انتخاب‌شده پیدا نشد');
      const financeRole = u.roles.includes('finance') || (u.delegatedRoles || []).includes('finance');
      const reason = financeRole ? null : str(x.reason, { max: 500, field: 'دلیل ثبت خارج از مسئولیت', multiline: true });
      const payerRole = fund === 'owner' ? 'owner' : 'resident';
      const payer = await c.db.prepare('SELECT u.id FROM users u JOIN user_roles r ON r.user_id=u.id AND r.role=? WHERE u.unit_id=? AND u.active=1 ORDER BY u.created_at DESC LIMIT 1').bind(payerRole, unit.id).first();
      const per = fund === 'owner' ? ownerYear(x.period) : period(x.period, false);
      await c.db.prepare("INSERT INTO transactions(id,unit_id,user_id,fund_id,kind,amount,title,period,status,reference,note,created_by) VALUES(?,?,?,?,'payment',?,?,?,'pending',?,?,?)")
        .bind(id, unit.id, payer?.id || null, fund, amount, title, per, ref, note, u.id).run();
      await audit(c.db, u.id, 'payment.create', 'transaction', id, { fund, amount, unitNumber, enteredForUnit: true }, reason ? { actorRole: u.roles[0] || 'manager', isDelegate: true, reason } : {});
    } else {
      if (!can(u, `finance.${fund}.pay`)) throw err(403, 'FORBIDDEN', 'اجازه‌ی ثبت پرداخت در این صندوق را ندارید');
      if (!u.unit_id) throw err(400, 'NO_UNIT', 'این حساب به واحدی متصل نیست');
      await c.db.prepare("INSERT INTO transactions(id,unit_id,user_id,fund_id,kind,amount,title,period,status,reference,note,created_by) VALUES(?,?,?,?, 'payment',?,?,?,'pending',?,?,?)")
        .bind(id, u.unit_id, u.id, fund, amount, title, fundPeriod(fund, x.period), ref, note, u.id).run();
      await audit(c.db, u.id, 'payment.create', 'transaction', id, { fund, amount });
    }
  } else if (x.kind === 'expense') {
    throw err(410, 'USE_EXPENSE_REQUESTS', 'ثبت هزینه فقط از مسیر درخواست پرداخت و تأیید دومرحله‌ای امکان‌پذیر است');
  } else throw err(400, 'INVALID_INPUT', 'نوع تراکنش نامعتبر است');
  return reply({ ok: true, id }, 201);
});

// تعریف شارژ یا اعتبار برای همه‌ی واحدها (یا فهرست مشخصی از واحدها)
R('POST', '/api/finance/charges', { perm: 'finance.charge' }, async c => {
  const x = await readJson(c.request), fund = fundOf(x.fund);
  const kind = x.kind === 'adjustment' ? 'adjustment' : x.kind === 'charge' || x.kind == null ? 'charge' : null;
  if (!kind) throw err(400, 'INVALID_INPUT', 'نوع نامعتبر است');
  const amount = int(x.amount, { field: 'مبلغ' }), per = fundPeriod(fund, x.period), title = str(x.title || (fund === 'owner' ? `شارژ مالکانه سال ${per}` : `شارژ ${per}`), { max: 120, field: 'عنوان' });
  const nums = Array.isArray(x.unitNumbers) ? x.unitNumbers.map(v => String(v).trim()).filter(Boolean).slice(0, 200) : [];
  const filter = nums.length ? `AND n.unit_number IN (${nums.map(() => '?').join(',')})` : '';
  const q = await c.db.prepare(
    `INSERT INTO transactions(id,unit_id,fund_id,kind,amount,title,period,status,created_by,approved_by,approved_at)
     SELECT lower(hex(randomblob(16))),n.id,?,?,?,?,?,'approved',?,?,CURRENT_TIMESTAMP FROM units n
     WHERE n.id NOT IN (SELECT unit_id FROM transactions WHERE fund_id=? AND period=? AND kind=? AND title=? AND unit_id IS NOT NULL) ${filter}`)
    .bind(fund, kind, amount, title, per, c.user.id, c.user.id, fund, per, kind, title, ...nums).run();
  await audit(c.db, c.user.id, 'charge.create', 'transaction', null, { fund, kind, amount, period: per, title, units: q.meta.changes });
  return reply({ ok: true, created: q.meta.changes }, 201);
});

R('POST', '/api/transactions/:id/decision', async c => {
  const x = await readJson(c.request), t = await c.db.prepare('SELECT id,kind,status,created_by,amount,fund_id FROM transactions WHERE id=?').bind(c.params.id).first();
  if (!t) throw err(404, 'NOT_FOUND', 'تراکنش پیدا نشد');
  if (t.kind === 'expense') throw err(410, 'USE_EXPENSE_REQUESTS', 'هزینه‌ها باید از مسیر درخواست پرداخت و تأیید نهایی رئیس ثبت شوند');
  if (t.status !== 'pending' || t.kind !== 'payment') throw err(409, 'NOT_PENDING', 'این مورد در انتظار تأیید نیست');
  if (!can(c.user, t.kind === 'payment' ? 'finance.approve' : 'expenses.approve')) throw err(403, 'FORBIDDEN', 'اجازه‌ی تأیید این مورد را ندارید');
  const overrideReason = c.user.roles.includes('finance') ? null : str(x.reason, { max: 500, field: 'دلیل انجام خارج از مسئولیت', multiline: true });
  if (t.created_by === c.user.id && c.env.ALLOW_SELF_APPROVAL !== 'true') throw err(403, 'SELF_APPROVAL', 'ثبت‌کننده نمی‌تواند مورد ثبت‌شده‌ی خودش را تأیید یا رد کند');
  if (!['approved', 'rejected'].includes(x.status)) throw err(400, 'INVALID_STATUS', 'وضعیت نامعتبر است');
  const note = x.status === 'rejected' ? str(x.note, { max: 300, field: 'دلیل رد', multiline: true }) : optStr(x.note, { max: 300, field: 'توضیحات', multiline: true });
  const statements = [
    c.db.prepare("UPDATE transactions SET status=?,approved_by=?,approved_at=CURRENT_TIMESTAMP,note=COALESCE(?,note) WHERE id=? AND status='pending' AND kind='payment'")
      .bind(x.status, c.user.id, note, t.id)
  ];
  if (x.status === 'approved') statements.push(
    c.db.prepare('UPDATE funds SET cash_balance=cash_balance+? WHERE id=? AND changes()=1').bind(t.amount, t.fund_id)
  );
  const results = await c.db.batch(statements);
  if (!results[0]?.meta?.changes) throw err(409, 'NOT_PENDING', 'این مورد در انتظار تأیید نیست');
  const actorRole = c.user.roles.includes('finance') ? 'finance' : (c.user.delegatedRoles?.includes('finance') ? 'جانشین finance' : (c.user.roles[0] || 'manager'));
  await audit(c.db, c.user.id, 'transaction.decision', 'transaction', t.id, { status: x.status }, overrideReason ? { actorRole, isDelegate: true, reason: overrideReason } : {});
  return reply({ ok: true });
});

R('DELETE', '/api/transactions/:id', async c => {
  const r = await c.db.prepare("DELETE FROM transactions WHERE id=? AND created_by=? AND status='pending' AND kind IN ('payment','expense')").bind(c.params.id, c.user.id).run();
  if (!r.meta.changes) throw err(404, 'NOT_FOUND', 'مورد قابل لغو پیدا نشد');
  await audit(c.db, c.user.id, 'transaction.cancel', 'transaction', c.params.id);
  return reply({ ok: true });
});

// وضعیت مالی واحد کاربر در یک صندوق
R('GET', '/api/finance/my', async c => {
  const fund = fundOf(c.url.searchParams.get('fund'));
  if (!canReadFund(c.user, fund)) throw err(403, 'FORBIDDEN', 'دسترسی کافی ندارید');
  if (!c.user.unit_id) return reply({ charged: 0, settled: 0, balance: 0, pending: 0, lastPaymentAt: null });
  const r = await c.db.prepare(
    `SELECT COALESCE(SUM(CASE WHEN kind='charge' AND status='approved' THEN amount END),0) charged,
            COALESCE(SUM(CASE WHEN kind IN ('payment','adjustment') AND status='approved' THEN amount END),0) settled,
            COALESCE(SUM(CASE WHEN kind='payment' AND status='pending' THEN amount END),0) pending,
            MAX(CASE WHEN kind='payment' AND status='approved' THEN approved_at END) lastPaymentAt
     FROM transactions WHERE fund_id=? AND unit_id=?`).bind(fund, c.user.unit_id).first();
  let annualBalances = [], unassignedPayments = 0;
  if (fund === 'owner') {
    annualBalances = (await c.db.prepare(
      `SELECT period,
              COALESCE(SUM(CASE WHEN kind='charge' AND status='approved' THEN amount ELSE 0 END),0) charged,
              COALESCE(SUM(CASE WHEN kind IN ('payment','adjustment') AND status='approved' THEN amount ELSE 0 END),0) paid
       FROM transactions WHERE fund_id='owner' AND unit_id=? AND period IS NOT NULL
       GROUP BY period HAVING charged>0 ORDER BY period DESC`).bind(c.user.unit_id).all()).results
      .map(x => ({ ...x, balance: x.charged - x.paid }));
    const legacy = await c.db.prepare(
      `SELECT COALESCE(SUM(amount),0) amount FROM transactions
       WHERE fund_id='owner' AND unit_id=? AND kind='payment' AND status='approved' AND period IS NULL`).bind(c.user.unit_id).first();
    unassignedPayments = legacy?.amount || 0;
  }
  return reply({ ...r, balance: r.charged - r.settled, annualBalances, unassignedPayments });
});

// موجودی نقدی صندوق‌ها برای مدیران دارای دسترسی گزارش مالی
R('GET', '/api/finance/funds', { any: ['finance.reports', 'finance.approve', 'expenses.approve'] }, async c => {
  const r = await c.db.prepare(
    `SELECT f.id fund_id,f.title,f.cash_balance balance,
            COALESCE(SUM(CASE WHEN t.kind='payment' AND t.status='approved' THEN t.amount ELSE 0 END),0) incoming,
            COALESCE(SUM(CASE WHEN t.kind='expense' AND t.status='approved' THEN t.amount ELSE 0 END),0) outgoing
     FROM funds f LEFT JOIN transactions t ON t.fund_id=f.id
     GROUP BY f.id,f.title ORDER BY f.id`).all();
  return reply({ funds: r.results });
});

// مانده‌ی همه‌ی واحدها
R('GET', '/api/finance/balances', { any: ['finance.reports', 'finance.approve', 'units.manage'] }, async c => {
  const fund = fundOf(c.url.searchParams.get('fund'));
  const r = await c.db.prepare(
    `SELECT n.unit_number,
            COALESCE(SUM(CASE WHEN t.kind='charge' AND t.status='approved' THEN t.amount END),0) charged,
            COALESCE(SUM(CASE WHEN t.kind IN ('payment','adjustment') AND t.status='approved' THEN t.amount END),0) settled
     FROM units n LEFT JOIN transactions t ON t.unit_id=n.id AND t.fund_id=?
     GROUP BY n.id ORDER BY CAST(n.unit_number AS INTEGER),n.unit_number`).bind(fund).all();
  return reply({ balances: r.results.map(x => ({ ...x, balance: x.charged - x.settled })) });
});

// داشبورد: هزینه‌های تأییدشده به تفکیک دسته + وضعیت وصول شارژ در یک دوره
R('GET', '/api/dashboard', async c => {
  const fund = fundOf(c.url.searchParams.get('fund') || 'monthly');
  if (!canSeeAggregates(c.user, fund)) throw err(403, 'FORBIDDEN', 'اطلاعات مالی برای نقش شما در دسترس نیست');
  const per = await c.db.prepare("SELECT DISTINCT period FROM transactions WHERE fund_id=? AND period IS NOT NULL AND status='approved' ORDER BY period DESC LIMIT 12").bind(fund).all();
  const periods = per.results.map(p => p.period);
  const asked = c.url.searchParams.get('period');
  const cur = asked ? fundPeriod(fund, asked) : (periods[0] || null);
  let expenses = [], charges = { units: 0, total: 0, paid: 0, unpaid: 0, paidUnits: 0, unpaidUnits: 0 };
  if (cur) {
    expenses = (await c.db.prepare("SELECT COALESCE(category,'سایر') category,SUM(amount) total FROM transactions WHERE fund_id=? AND kind='expense' AND status='approved' AND period=? GROUP BY 1 ORDER BY total DESC").bind(fund, cur).all()).results;
    const s = await c.db.prepare(
      `SELECT COUNT(*) units,COALESCE(SUM(c),0) total,COALESCE(SUM(MIN(p,c)),0) paid,COALESCE(SUM(CASE WHEN p>=c THEN 1 ELSE 0 END),0) paidUnits FROM (
         SELECT unit_id,SUM(CASE WHEN kind='charge' THEN amount ELSE 0 END) c,SUM(CASE WHEN kind IN ('payment','adjustment') THEN amount ELSE 0 END) p
         FROM transactions WHERE fund_id=? AND period=? AND status='approved' AND unit_id IS NOT NULL GROUP BY unit_id HAVING c>0)`).bind(fund, cur).first();
    charges = { ...s, unpaid: s.total - s.paid, unpaidUnits: s.units - s.paidUnits };
  }
  return reply({ fund, periods, period: cur, expenses, expenseTotal: expenses.reduce((a, e) => a + e.total, 0), charges });
});

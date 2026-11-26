// مدیریت کاربران، واحدها و گزارش ممیزی
import { R } from './router.js';
import { err, reply, readJson, str, optStr, phoneOrFail, unitOrFail, tempPassword, hashPassword, newSalt, safeEqual, audit, jdate, initialPasswordMode, verifyUserPassword } from './lib.js';
import { can, EXTRA_ROLES, assignableExtraRoles, canManageTarget } from './perms.js';

const rolesOf = async (db, id) => (await db.prepare('SELECT role FROM user_roles WHERE user_id=?').bind(id).all()).results.map(r => r.role);

function validateExtras(actor, extras) {
  if (!Array.isArray(extras)) throw err(400, 'INVALID_INPUT', 'نقش‌ها نامعتبر است');
  const set = [...new Set(extras)];
  if (set.some(r => !EXTRA_ROLES.includes(r))) throw err(400, 'INVALID_ROLE', 'نقش نامعتبر است');
  const allowed = assignableExtraRoles(actor);
  if (set.some(r => !allowed.includes(r))) throw err(403, 'ROLE_NOT_ASSIGNABLE', 'اجازه‌ی تعیین این نقش را ندارید');
  return set;
}
const extrasOnly = roles => roles.filter(r => EXTRA_ROLES.includes(r));

R('GET', '/api/admin/users', { perm: 'users.read' }, async c => {
  const q = (c.url.searchParams.get('q') || '').trim().slice(0, 50), like = `%${q}%`;
  const r = await c.db.prepare(
    `SELECT u.id,u.name,u.phone,u.secondary_phone,u.account_type,u.active,u.must_change_password,u.contract_start_date,u.contract_end_date,u.created_at,n.unit_number unit,
            (SELECT GROUP_CONCAT(role) FROM user_roles WHERE user_id=u.id) roles
     FROM users u LEFT JOIN units n ON n.id=u.unit_id
     WHERE (?='' OR u.name LIKE ? OR u.phone LIKE ? OR n.unit_number LIKE ?)
     ORDER BY u.created_at DESC LIMIT 500`).bind(q, like, like, like).all();
  return reply({
    users: r.results.map(u => ({ ...u, active: !!u.active, must_change_password: !!u.must_change_password, roles: (u.roles || '').split(',').filter(Boolean) })),
    assignable: assignableExtraRoles(c.user)
  });
});

R('POST', '/api/admin/users', { perm: 'users.manage' }, async c => {
  const x = await readJson(c.request);
  const accountType = x.accountType;
  if (!['owner', 'resident', 'both', 'staff'].includes(accountType)) throw err(400, 'INVALID_INPUT', 'نوع حساب نامعتبر است');
  const name = str(x.name, { max: 100, field: 'نام' }), phone = phoneOrFail(x.phone), gender = x.gender || 'unspecified';
  if (!['female','male','unspecified'].includes(gender)) throw err(400, 'INVALID_GENDER', 'جنسیت نامعتبر است');
  const secondaryPhone = x.secondaryPhone ? phoneOrFail(x.secondaryPhone) : null;
  const contractStartDate = x.contractStartDate ? jdate(x.contractStartDate, '-') : null;
  const contractEndDate = x.contractEndDate ? jdate(x.contractEndDate, '-') : null;
  if (contractStartDate && contractEndDate && contractEndDate < contractStartDate) throw err(400, 'INVALID_CONTRACT_DATES', 'تاریخ پایان قرارداد نمی‌تواند قبل از تاریخ شروع باشد');
  const extras = validateExtras(c.user, x.roles ?? []);
  if (extras.includes('system_admin') && (accountType !== 'staff' || extras.length !== 1)) throw err(400, 'SYSTEM_ADMIN_MUST_BE_STANDALONE', 'مدیر سامانه باید یک حساب مستقل و بدون نقش مدیریتی دیگر باشد');
  if (accountType === 'staff' && !extras.length) throw err(400, 'ROLE_REQUIRED', 'برای حساب مدیر/کارکنان حداقل یک نقش انتخاب کنید');
  const storedType = accountType === 'both' ? 'owner' : accountType;
  const baseRoles = accountType === 'both' ? ['owner', 'resident'] : (accountType === 'staff' ? [] : [accountType]);
  const roles = [...baseRoles, ...extras];
  let unitId = null;
  if (accountType === 'staff') {
    if (await c.db.prepare("SELECT id FROM users WHERE unit_id IS NULL AND account_type='staff' AND phone=?").bind(phone).first()) throw err(409, 'USER_EXISTS', 'این شماره قبلاً ثبت شده است');
  } else {
    const unitNumber = unitOrFail(x.unit);
    let unit = await c.db.prepare('SELECT id FROM units WHERE unit_number=?').bind(unitNumber).first();
    if (!unit) { const q = await c.db.prepare('INSERT INTO units(unit_number) VALUES(?)').bind(unitNumber).run(); unit = { id: q.meta.last_row_id }; }
    unitId = unit.id;
    if (accountType === 'both') {
      if (await c.db.prepare("SELECT id FROM users WHERE unit_id=? AND account_type IN ('owner','resident')").bind(unitId).first()) throw err(409, 'ACCOUNT_EXISTS', 'برای این واحد قبلاً حساب مالک یا ساکن ساخته شده است؛ برای یک شخص مشترک، نقش دوم را به همان حساب اضافه کنید');
    } else if (await c.db.prepare('SELECT id FROM users WHERE unit_id=? AND account_type=?').bind(unitId, accountType).first()) throw err(409, 'ACCOUNT_EXISTS', 'برای این واحد، حسابی با همین نوع (مالک یا ساکن) از قبل ثبت شده است');
    if (initialPasswordMode(c.env) === 'phone' && await c.db.prepare("SELECT id FROM users WHERE unit_id=? AND account_type IN ('owner','resident') AND phone=?").bind(unitId, phone).first()) throw err(409, 'SHARED_INITIAL_PASSWORD', 'شماره موبایل مالک و ساکن یک واحد باید متفاوت باشد');
  }
  const needsTemp = accountType === 'staff' || initialPasswordMode(c.env) === 'random';
  const uid = crypto.randomUUID(), initialPassword = needsTemp ? tempPassword() : phone, salt = newSalt(), ph = await hashPassword(initialPassword, salt);
  await c.db.batch([
    c.db.prepare('INSERT INTO users(id,unit_id,account_type,name,phone,secondary_phone,gender,password_hash,password_salt,must_change_password,contract_start_date,contract_end_date) VALUES(?,?,?,?,?,?,?,?,?,1,?,?)').bind(uid, unitId, storedType, name, phone, secondaryPhone, gender, ph, salt, contractStartDate, contractEndDate),
    ...roles.map(r => c.db.prepare('INSERT INTO user_roles(user_id,role) VALUES(?,?)').bind(uid, r))
  ]);
  await audit(c.db, c.user.id, 'user.create', 'user', uid, { accountType, unit: x.unit || null, roles });
  return reply({ ok: true, id: uid, ...(needsTemp ? { tempPassword: initialPassword } : { initialPasswordIsPhone: true }) }, 201);
});

async function targetOrFail(c) {
  const t = await c.db.prepare('SELECT id,account_type,active FROM users WHERE id=?').bind(c.params.id).first();
  if (!t) throw err(404, 'NOT_FOUND', 'کاربر پیدا نشد');
  t.roles = await rolesOf(c.db, t.id);
  if (!canManageTarget(c.user, t.roles)) throw err(403, 'FORBIDDEN', 'اجازه‌ی مدیریت این حساب را ندارید');
  return t;
}
async function otherActiveChairs(db, exceptId) {
  return (await db.prepare("SELECT COUNT(*) n FROM users u JOIN user_roles r ON r.user_id=u.id WHERE r.role='chair' AND u.active=1 AND u.id!=?").bind(exceptId).first()).n;
}

R('PATCH', '/api/admin/users/:id', { perm: 'users.manage' }, async c => {
  const t = await targetOrFail(c), x = await readJson(c.request), sets = [], vals = [], stmts = [];
  const self = t.id === c.user.id;
  if (self && ('roles' in x || 'active' in x)) throw err(400, 'SELF_CHANGE', 'نقش‌ها یا وضعیت حساب خودتان را نمی‌توانید تغییر دهید');
  if ('name' in x) { sets.push('name=?'); vals.push(str(x.name, { max: 100, field: 'نام' })); }
  if ('contractStartDate' in x || 'contractEndDate' in x) {
    const current = await c.db.prepare('SELECT contract_start_date,contract_end_date FROM users WHERE id=?').bind(t.id).first();
    const start = 'contractStartDate' in x ? (x.contractStartDate ? jdate(x.contractStartDate, '-') : null) : current.contract_start_date;
    const end = 'contractEndDate' in x ? (x.contractEndDate ? jdate(x.contractEndDate, '-') : null) : current.contract_end_date;
    if (start && end && end < start) throw err(400, 'INVALID_CONTRACT_DATES', 'تاریخ پایان قرارداد نمی‌تواند قبل از تاریخ شروع باشد');
    sets.push('contract_start_date=?','contract_end_date=?'); vals.push(start,end);
  }
  if ('gender' in x) { if (!['female','male','unspecified'].includes(x.gender)) throw err(400, 'INVALID_GENDER', 'جنسیت نامعتبر است'); sets.push('gender=?'); vals.push(x.gender); }
  if ('secondaryPhone' in x) { const p = x.secondaryPhone ? phoneOrFail(x.secondaryPhone) : null; sets.push('secondary_phone=?'); vals.push(p); }
  if ('phone' in x) {
    const phone = phoneOrFail(x.phone);
    const u = await c.db.prepare('SELECT unit_id,account_type FROM users WHERE id=?').bind(t.id).first();
    const dup = u.unit_id
      ? await c.db.prepare("SELECT id FROM users WHERE unit_id=? AND account_type IN ('owner','resident') AND phone=? AND id!=?").bind(u.unit_id, phone, t.id).first()
      : await c.db.prepare("SELECT id FROM users WHERE unit_id IS NULL AND account_type='staff' AND phone=? AND id!=?").bind(phone, t.id).first();
    if (dup) throw err(409, 'PHONE_EXISTS', 'این شماره قبلاً ثبت شده است');
    sets.push('phone=?'); vals.push(phone);
  }
  if ('active' in x) {
    if (t.roles.includes('chair') && !x.active && !await otherActiveChairs(c.db, t.id)) throw err(400, 'LAST_CHAIR', 'حداقل یک رئیس فعال باید باقی بماند');
    sets.push('active=?'); vals.push(x.active ? 1 : 0);
    if (!x.active) stmts.push(c.db.prepare('DELETE FROM sessions WHERE user_id=?').bind(t.id));
  }
  if ('addBaseRoles' in x) {
    if (!Array.isArray(x.addBaseRoles) || x.addBaseRoles.some(r => !['owner', 'resident'].includes(r))) throw err(400, 'INVALID_ROLE', 'نقش پایه نامعتبر است');
    if (t.account_type === 'staff') throw err(400, 'INVALID_ROLE', 'برای حساب کارکنان نمی‌توان نقش مالک یا ساکن ثبت کرد');
    const additions = [...new Set(x.addBaseRoles)].filter(r => !t.roles.includes(r));
    for (const role of additions) stmts.push(c.db.prepare('INSERT OR IGNORE INTO user_roles(user_id,role) VALUES(?,?)').bind(t.id, role));
  }
  if ('roles' in x) {
    if (!can(c.user, 'roles.assign')) throw err(403, 'ROLE_ASSIGN_FORBIDDEN', 'تغییر نقش‌های مدیریتی فقط در اختیار رئیس هیئت‌مدیره است');
    const extras = validateExtras(c.user, x.roles);
    if (extras.includes('system_admin') && (t.account_type !== 'staff' || extras.length !== 1)) throw err(400, 'SYSTEM_ADMIN_MUST_BE_STANDALONE', 'مدیر سامانه باید یک حساب مستقل و بدون نقش مدیریتی دیگر باشد');
    if (t.account_type === 'staff' && !extras.length) throw err(400, 'ROLE_REQUIRED', 'حساب مدیر/کارکنان باید حداقل یک نقش داشته باشد');
    if (t.roles.includes('chair') && !extras.includes('chair') && !await otherActiveChairs(c.db, t.id)) throw err(400, 'LAST_CHAIR', 'حداقل یک رئیس فعال باید باقی بماند');
    const base = [...new Set([...t.roles.filter(r => !EXTRA_ROLES.includes(r)), ...(Array.isArray(x.addBaseRoles) ? x.addBaseRoles.filter(r => ['owner', 'resident'].includes(r)) : [])])];
    stmts.push(c.db.prepare('DELETE FROM user_roles WHERE user_id=?').bind(t.id), ...[...base, ...extras].map(r => c.db.prepare('INSERT INTO user_roles(user_id,role) VALUES(?,?)').bind(t.id, r)));
  }
  if (sets.length) stmts.unshift(c.db.prepare(`UPDATE users SET ${sets.join(',')},updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(...vals, t.id));
  if (stmts.length) await c.db.batch(stmts);
  await audit(c.db, c.user.id, 'user.update', 'user', t.id, { fields: Object.keys(x) });
  return reply({ ok: true });
});

R('POST', '/api/admin/users/:id/reset-password', { perm: 'users.manage' }, async c => {
  const t = await targetOrFail(c);
  if (t.id === c.user.id) throw err(400, 'SELF_CHANGE', 'رمز خودتان را از بخش تنظیمات تغییر دهید');
  const row = await c.db.prepare('SELECT phone,account_type FROM users WHERE id=?').bind(t.id).first();
  const needsTemp = row.account_type === 'staff' || initialPasswordMode(c.env) === 'random';
  const initialPassword = needsTemp ? tempPassword() : row.phone;
  if (!needsTemp) {
    const other = await c.db.prepare("SELECT password_hash,password_salt FROM users WHERE unit_id=(SELECT unit_id FROM users WHERE id=?) AND account_type IN ('owner','resident') AND id!=? AND active=1 LIMIT 1").bind(t.id, t.id).first();
    if (other && safeEqual(await hashPassword(initialPassword, other.password_salt), other.password_hash)) throw err(409, 'SHARED_UNIT_PASSWORD', 'رمز فعلی مالک یا ساکن دیگر با این شماره موبایل یکسان است؛ ابتدا رمز آن حساب را تغییر دهید');
  }
  const salt = newSalt(), ph = await hashPassword(initialPassword, salt);
  await c.db.batch([
    c.db.prepare('UPDATE users SET password_hash=?,password_salt=?,must_change_password=1,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(ph, salt, t.id),
    c.db.prepare('DELETE FROM sessions WHERE user_id=?').bind(t.id)
  ]);
  await audit(c.db, c.user.id, 'user.reset_password', 'user', t.id);
  return reply({ ok: true, ...(needsTemp ? { tempPassword: initialPassword } : { initialPasswordIsPhone: true }) });
});

// غیرفعال‌سازی حساب؛ سوابق مالی و مدیریتی کاربر حفظ می‌شوند.
R('DELETE', '/api/admin/users/:id', { perm: 'users.delete' }, async c => {
  const t = await targetOrFail(c);
  if (t.id === c.user.id) throw err(400, 'SELF_DELETE', 'حسابی که با آن وارد شده‌اید قابل غیرفعال‌سازی نیست');
  if (t.roles.includes('chair') && !can(c.user, 'roles.assign')) throw err(403, 'FORBIDDEN', 'فقط رئیس هیئت‌مدیره می‌تواند حساب رئیس را مدیریت کند');
  if (t.roles.includes('chair') && !await otherActiveChairs(c.db, t.id)) throw err(400, 'LAST_CHAIR', 'آخرین رئیس هیئت‌مدیره را نمی‌توان غیرفعال کرد');
  await c.db.batch([
    c.db.prepare("UPDATE users SET active=0,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(t.id),
    c.db.prepare('DELETE FROM sessions WHERE user_id=?').bind(t.id)
  ]);
  await audit(c.db, c.user.id, 'user.deactivate', 'user', t.id);
  return reply({ ok: true });
});

// بازنشانی کامل داده‌های دوره آزمایشی؛ فقط مدیر سامانه مستقل مجاز است.
// واحدهای ساختمان و صندوق‌های پایه حفظ می‌شوند؛ تمام داده‌ها و تنظیمات قابل تغییر پاک می‌شوند.
R('POST', '/api/admin/reset-test-data', { perm: 'users.manage' }, async c => {
  if (c.user.account_type !== 'staff' || c.user.roles.length !== 1 || c.user.roles[0] !== 'system_admin') {
    throw err(403, 'FORBIDDEN', 'فقط حساب مستقل مدیر سامانه اجازه‌ی بازنشانی اطلاعات آزمایشی را دارد');
  }
  const x = await readJson(c.request);
  if (x.confirm !== 'RESET-NIKA-TEST-DATA') throw err(400, 'CONFIRM_REQUIRED', 'عبارت تأیید بازنشانی کامل وارد نشده است');
  if (!await verifyUserPassword(c.db, c.user.id, x.currentPassword)) throw err(403, 'WRONG_PASSWORD', 'رمز عبور فعلی مدیر سامانه نادرست است');
  const chair = await c.db.prepare("SELECT u.id FROM users u JOIN user_roles r ON r.user_id=u.id WHERE r.role='chair' AND u.active=1 ORDER BY u.created_at LIMIT 1").first();
  if (!chair) throw err(409, 'CHAIR_REQUIRED', 'برای بازنشانی، باید یک حساب فعال رئیس هیئت‌مدیره وجود داشته باشد');
  await c.db.batch([
    c.db.prepare('DELETE FROM expense_request_files'),
    c.db.prepare('DELETE FROM expense_request_history'),
    c.db.prepare('DELETE FROM expense_request_versions'),
    c.db.prepare('DELETE FROM expense_requests'),
    c.db.prepare('DELETE FROM backup_runs'),
    c.db.prepare('DELETE FROM event_occurrences'),
    c.db.prepare('DELETE FROM manager_delegations'),
    c.db.prepare('DELETE FROM finance_settings'),
    c.db.prepare('DELETE FROM transactions'),
    c.db.prepare('DELETE FROM messages'),
    c.db.prepare('DELETE FROM requests'),
    c.db.prepare('DELETE FROM notices'),
    c.db.prepare('DELETE FROM rules'),
    c.db.prepare('DELETE FROM resolutions'),
    c.db.prepare('DELETE FROM events'),
    c.db.prepare('DELETE FROM documents'),
    c.db.prepare('DELETE FROM sessions WHERE user_id!=?').bind(c.user.id),
    c.db.prepare('DELETE FROM login_attempts'),
    c.db.prepare('DELETE FROM audit_logs'),
    c.db.prepare('DELETE FROM user_roles WHERE user_id NOT IN (?,?)').bind(c.user.id, chair.id),
    c.db.prepare("DELETE FROM user_roles WHERE user_id=? AND role!='system_admin'").bind(c.user.id),
    c.db.prepare("DELETE FROM user_roles WHERE user_id=? AND role!='chair'").bind(chair.id),
    c.db.prepare("INSERT OR IGNORE INTO user_roles(user_id,role) VALUES(?,'system_admin')").bind(c.user.id),
    c.db.prepare("INSERT OR IGNORE INTO user_roles(user_id,role) VALUES(?,'chair')").bind(chair.id),
    c.db.prepare('DELETE FROM users WHERE id NOT IN (?,?)').bind(c.user.id, chair.id),
    c.db.prepare('UPDATE funds SET cash_balance=0'),
    c.db.prepare('UPDATE expense_request_sequences SET next_value=1')
  ]);
  await audit(c.db, c.user.id, 'system.test_data_reset', 'system', null);
  const unitCount = await c.db.prepare('SELECT COUNT(*) n FROM units').first();
  return reply({ ok: true, preservedUser: c.user.id, preservedChair: chair.id, preservedUnits: Number(unitCount?.n || 0) });
});
// ---------- واحدها ----------
R('GET', '/api/admin/units', { perm: 'units.read' }, async c => {
  const r = await c.db.prepare(
    `SELECT n.id,n.unit_number,n.block,n.floor,n.parking,n.notes,(SELECT COUNT(*) FROM users u WHERE u.unit_id=n.id AND u.active=1) accounts
     FROM units n ORDER BY CAST(n.unit_number AS INTEGER),n.unit_number`).all();
  return reply({ units: r.results });
});
const unitFields = x => ({ block: optStr(x.block, { max: 20, field: 'بلوک' }), floor: optStr(x.floor, { max: 20, field: 'طبقه' }), parking: optStr(x.parking, { max: 40, field: 'پارکینگ' }), notes: optStr(x.notes, { max: 300, field: 'توضیحات', multiline: true }) });
R('POST', '/api/admin/units', { perm: 'units.manage' }, async c => {
  const x = await readJson(c.request), number = unitOrFail(x.unitNumber), f = unitFields(x);
  if (await c.db.prepare('SELECT id FROM units WHERE unit_number=?').bind(number).first()) throw err(409, 'UNIT_EXISTS', 'این واحد قبلاً ثبت شده است');
  const q = await c.db.prepare('INSERT INTO units(unit_number,block,floor,parking,notes) VALUES(?,?,?,?,?)').bind(number, f.block, f.floor, f.parking, f.notes).run();
  await audit(c.db, c.user.id, 'unit.create', 'unit', String(q.meta.last_row_id), { number });
  return reply({ ok: true, id: q.meta.last_row_id }, 201);
});
R('PATCH', '/api/admin/units/:id', { perm: 'units.manage' }, async c => {
  const x = await readJson(c.request), f = unitFields(x);
  const q = await c.db.prepare('UPDATE units SET block=?,floor=?,parking=?,notes=? WHERE id=?').bind(f.block, f.floor, f.parking, f.notes, c.params.id).run();
  if (!q.meta.changes) throw err(404, 'NOT_FOUND', 'واحد پیدا نشد');
  await audit(c.db, c.user.id, 'unit.update', 'unit', c.params.id);
  return reply({ ok: true });
});

// ---------- گزارش عملکرد بر اساس حوزه مسئولیت ----------
R('GET', '/api/admin/audit', { perm: 'audit.read' }, async c => {
  const roles = [...c.user.roles, ...(c.user.delegatedRoles || [])];
  const limit = Math.min(Math.max(Number(c.url.searchParams.get('limit')) || 100, 1), 300);
  let where = '1=1';
  if (!(roles.includes('chair') || roles.includes('board'))) {
    const scopes = [];
    if (roles.includes('finance')) scopes.push(`(a.action LIKE 'payment.%' OR a.action LIKE 'expense.%' OR a.action LIKE 'expense_request.%' OR a.action LIKE 'charge.%' OR a.action LIKE 'finance.%' OR a.action='transaction.decision' OR a.action='manager.override_action')`);
    if (roles.includes('executive')) scopes.push(`(a.action LIKE 'user.%' OR a.action LIKE 'request.%' OR a.action LIKE 'expense_request.create' OR a.action LIKE 'expense_request.resubmit' OR a.action LIKE 'expense_request.cancel' OR a.action LIKE 'message.%' OR a.action LIKE 'event.%' OR a.action LIKE 'notice.%' OR a.action LIKE 'delegation.%' OR a.action='manager.override_action')`);
    if (!scopes.length) throw err(403, 'FORBIDDEN', 'گزارش عملکرد برای این نقش فعال نیست');
    where = '(' + scopes.join(' OR ') + ')';
  }
  const r = await c.db.prepare(
    `SELECT a.id,a.action,a.entity_type,a.entity_id,a.details,a.actor_role,a.is_delegate,a.reason,a.created_at,
            u.name actor,(SELECT GROUP_CONCAT(role) FROM user_roles ur WHERE ur.user_id=a.actor_id) actor_roles
     FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id
     WHERE ${where} ORDER BY a.created_at DESC,a.rowid DESC LIMIT ?`).bind(limit).all();
  return reply({ logs: r.results });
});

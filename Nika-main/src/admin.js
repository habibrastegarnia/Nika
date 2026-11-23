// مدیریت کاربران، واحدها و گزارش ممیزی
import { R } from './router.js';
import { err, reply, readJson, str, optStr, phoneOrFail, unitOrFail, tempPassword, hashPassword, newSalt, safeEqual, audit } from './lib.js';
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

R('GET', '/api/admin/users', { perm: 'users.manage' }, async c => {
  const q = (c.url.searchParams.get('q') || '').trim().slice(0, 50), like = `%${q}%`;
  const r = await c.db.prepare(
    `SELECT u.id,u.name,u.phone,u.email,u.account_type,u.active,u.must_change_password,u.created_at,n.unit_number unit,
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
  const name = str(x.name, { max: 100, field: 'نام' }), phone = phoneOrFail(x.phone);
  const email = optStr(x.email, { max: 120, field: 'ایمیل' });
  const extras = validateExtras(c.user, x.roles ?? []);
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
    if (await c.db.prepare("SELECT id FROM users WHERE unit_id=? AND account_type IN ('owner','resident') AND phone=?").bind(unitId, phone).first()) throw err(409, 'SHARED_INITIAL_PASSWORD', 'شماره موبایل مالک و ساکن یک واحد باید متفاوت باشد');
  }
  const uid = crypto.randomUUID(), initialPassword = accountType === 'staff' ? tempPassword() : phone, salt = newSalt(), ph = await hashPassword(initialPassword, salt);
  await c.db.batch([
    c.db.prepare('INSERT INTO users(id,unit_id,account_type,name,phone,email,password_hash,password_salt,must_change_password) VALUES(?,?,?,?,?,?,?,?,1)').bind(uid, unitId, storedType, name, phone, email, ph, salt),
    ...roles.map(r => c.db.prepare('INSERT INTO user_roles(user_id,role) VALUES(?,?)').bind(uid, r))
  ]);
  await audit(c.db, c.user.id, 'user.create', 'user', uid, { accountType, unit: x.unit || null, roles });
  return reply({ ok: true, id: uid, ...(accountType === 'staff' ? { tempPassword: initialPassword } : { initialPasswordIsPhone: true }) }, 201);
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
  if ('email' in x) { sets.push('email=?'); vals.push(optStr(x.email, { max: 120, field: 'ایمیل' })); }
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
  if ('roles' in x) {
    const extras = validateExtras(c.user, x.roles);
    if (t.account_type === 'staff' && !extras.length) throw err(400, 'ROLE_REQUIRED', 'حساب مدیر/کارکنان باید حداقل یک نقش داشته باشد');
    if (t.roles.includes('chair') && !extras.includes('chair') && !await otherActiveChairs(c.db, t.id)) throw err(400, 'LAST_CHAIR', 'حداقل یک رئیس فعال باید باقی بماند');
    const base = t.roles.filter(r => !EXTRA_ROLES.includes(r));
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
  const initialPassword = row.account_type === 'staff' ? tempPassword() : row.phone;
  if (t.account_type !== 'staff') {
    const other = await c.db.prepare("SELECT password_hash,password_salt FROM users WHERE unit_id=(SELECT unit_id FROM users WHERE id=?) AND account_type IN ('owner','resident') AND id!=? AND active=1 LIMIT 1").bind(t.id, t.id).first();
    if (other && safeEqual(await hashPassword(initialPassword, other.password_salt), other.password_hash)) throw err(409, 'SHARED_UNIT_PASSWORD', 'رمز فعلی مالک یا ساکن دیگر با این شماره موبایل یکسان است؛ ابتدا رمز آن حساب را تغییر دهید');
  }
  const salt = newSalt(), ph = await hashPassword(initialPassword, salt);
  await c.db.batch([
    c.db.prepare('UPDATE users SET password_hash=?,password_salt=?,must_change_password=1,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(ph, salt, t.id),
    c.db.prepare('DELETE FROM sessions WHERE user_id=?').bind(t.id)
  ]);
  await audit(c.db, c.user.id, 'user.reset_password', 'user', t.id);
  return reply({ ok: true, ...(row.account_type === 'staff' ? { tempPassword: initialPassword } : { initialPasswordIsPhone: true }) });
});

// ---------- واحدها ----------
R('GET', '/api/admin/units', { perm: 'units.manage' }, async c => {
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

// ---------- ممیزی (فقط رئیس) ----------
R('GET', '/api/admin/audit', { perm: 'audit.read' }, async c => {
  const limit = Math.min(Math.max(Number(c.url.searchParams.get('limit')) || 100, 1), 300);
  const r = await c.db.prepare(
    `SELECT a.id,a.action,a.entity_type,a.entity_id,a.details,a.created_at,u.name actor FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.created_at DESC,a.rowid DESC LIMIT ?`).bind(limit).all();
  return reply({ logs: r.results });
});

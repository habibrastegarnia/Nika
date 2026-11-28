// احراز هویت، نشست، پروفایل، رمز عبور، آواتار و خلاصه‌ی نشان‌ها
import { R } from './router.js';
import { err, reply, readJson, str, optStr, phoneOrFail, normPhone, unitOrNull, passwordProblem, hashPassword, newSalt, safeEqual, signToken, verifyToken, audit, tempPassword } from './lib.js';
import { userPerms, delegatedPerms, can } from './perms.js';

const SESSION_TTL = 60 * 60 * 24 * 7;
const COOKIE = 'nika_session';
const WINDOW = 900, MAX_ID_FAILS = 5, MAX_ID_GLOBAL_FAILS = 25, MAX_IP_FAILS = 30;
const DUMMY_SALT = 'nika-dummy-salt-for-timing';

export const sessionCookie = (value, secure, maxAge) =>
  `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;

export async function loadUser(db, id) {
  const u = await db.prepare(
    `SELECT u.id,u.unit_id,u.account_type,u.name,u.phone,u.email,u.gender,u.must_change_password,u.updated_at,
            (u.avatar_data IS NOT NULL) has_avatar,
            n.unit_number,n.block,n.floor,n.parking,n.notes unit_notes
     FROM users u LEFT JOIN units n ON n.id=u.unit_id WHERE u.id=? AND u.active=1`).bind(id).first();
  if (!u) return null;
  const rr = await db.prepare(
    `SELECT role,0 delegated FROM user_roles WHERE user_id=?
     UNION ALL
     SELECT d.delegator_role role,1 delegated
     FROM manager_delegations d
     JOIN users owner ON owner.id=d.delegator_user_id AND owner.active=1
     JOIN user_roles owner_role ON owner_role.user_id=owner.id AND owner_role.role=d.delegator_role
     WHERE d.delegate_user_id=? AND d.enabled=1
       AND EXISTS (SELECT 1 FROM user_roles dr WHERE dr.user_id=d.delegate_user_id
                   AND dr.role IN ('chair','finance','board','executive'))`).bind(id,id).all();
  const roles = rr.results.filter(r => !r.delegated).map(r => r.role);
  const delegatedRoles = rr.results.filter(r => r.delegated).map(r => r.role);
  const ownPerms = userPerms(roles), delegated = delegatedPerms(delegatedRoles);
  return {
    id: u.id, unit_id: u.unit_id, unit_number: u.unit_number || null,
    unit: u.unit_number ? { number: u.unit_number, block: u.block, floor: u.floor, parking: u.parking, notes: u.unit_notes } : null,
    account_type: u.account_type, name: u.name, phone: u.phone, email: u.email, gender: u.gender || 'unspecified',
    must_change_password: !!u.must_change_password, has_avatar: !!u.has_avatar, avatar_v: u.updated_at,
    roles, delegatedRoles, ownPerms, delegatedPerms: delegated,
    perms: [...new Set([...ownPerms, ...delegated])]
  };
}

export async function authenticate(c) {
  const ck = c.request.headers.get('Cookie') || '';
  const m = ck.match(/(?:^|;\s*)nika_session=([^;]+)/);
  if (!m) return null;
  const p = await verifyToken(m[1], c.env.JWT_SECRET);
  if (!p || !p.sid || !p.sub) return null;
  const s = await c.db.prepare('SELECT id FROM sessions WHERE id=? AND user_id=? AND expires_at>?').bind(p.sid, p.sub, c.now).first();
  if (!s) return null;
  const u = await loadUser(c.db, p.sub);
  if (!u) return null;
  u.sid = p.sid;
  return u;
}

// ---------- محدودیت تلاش ورود ----------
async function assertNotLocked(db, keys, now) {
  const row = await db.prepare(`SELECT MAX(locked_until) l FROM login_attempts WHERE key IN (${keys.map(() => '?').join(',')})`).bind(...keys).first();
  if (row && row.l > now) throw err(429, 'TOO_MANY_ATTEMPTS', `تلاش‌های ناموفق زیاد بود؛ ${Math.ceil((row.l - now) / 60)} دقیقه دیگر دوباره امتحان کنید`);
}
async function registerFailure(db, key, max, now) {
  const r = await db.prepare('SELECT count,window_start FROM login_attempts WHERE key=?').bind(key).first();
  let count = 1, start = now;
  if (r && now - r.window_start < WINDOW) { count = r.count + 1; start = r.window_start; }
  await db.prepare('INSERT OR REPLACE INTO login_attempts(key,count,window_start,locked_until) VALUES(?,?,?,?)')
    .bind(key, count, start, count >= max ? now + WINDOW : 0).run();
}

async function issueSession(c, userRow) {
  const sid = crypto.randomUUID(), exp = c.now + SESSION_TTL;
  await c.db.prepare('DELETE FROM sessions WHERE expires_at<?').bind(c.now).run();
  await c.db.prepare('DELETE FROM login_attempts WHERE window_start<? AND locked_until<?').bind(c.now - 86400, c.now).run();
  await c.db.prepare('INSERT INTO sessions(id,user_id,expires_at) VALUES(?,?,?)').bind(sid, userRow.id, exp).run();
  const token = await signToken({ sub: userRow.id, sid, exp }, c.env.JWT_SECRET);
  const user = await loadUser(c.db, userRow.id);
  return reply({ user }, 200, [sessionCookie(token, c.url.protocol === 'https:', SESSION_TTL)]);
}

R('POST', '/api/setup', { public: true }, async c => {
  const key = c.request.headers.get('X-Setup-Key') || '';
  if (!c.env.BOOTSTRAP_KEY || !safeEqual(key, c.env.BOOTSTRAP_KEY)) throw err(403, 'FORBIDDEN', 'کلید فعال‌سازی نادرست است');
  // رمز موقت تصادفی است و فقط همین یک‌بار نمایش داده می‌شود؛ رمز ثابت «admin» حذف شد
  // (هر کسی که آدرس سایت را می‌دانست می‌توانست پیش از مالک با Admin/admin وارد شود).
  const uid = crypto.randomUUID(), salt = newSalt(), temp = tempPassword(), ph = await hashPassword(temp, salt);
  const created = await c.db.prepare(
    "INSERT INTO users(id,unit_id,account_type,name,phone,email,password_hash,password_salt,must_change_password) SELECT ?,NULL,'staff','مدیر اصلی','00000000000','admin',?,?,1 WHERE NOT EXISTS (SELECT 1 FROM users)"
  ).bind(uid, ph, salt).run();
  if (!created.meta.changes) throw err(409, 'ALREADY_INITIALIZED', 'سامانه قبلاً راه‌اندازی شده است');
  await c.db.prepare('INSERT INTO user_roles(user_id,role) VALUES(?,?)').bind(uid, 'chair').run();
  await audit(c.db, uid, 'bootstrap', 'user', uid, { username: 'Admin', forcedPasswordChange: true });
  return reply({ ok: true, username: 'Admin', tempPassword: temp, message: 'حساب مدیر اصلی ساخته شد. رمز موقت را همین حالا یادداشت کنید (دوباره نمایش داده نمی‌شود)، با نام کاربری Admin وارد شوید و رمز را تغییر دهید.' }, 201);
});

R('POST', '/api/login', { public: true }, async c => {
  const x = await readJson(c.request);
  const identifier = typeof x.identifier === 'string' ? x.identifier.trim() : '';
  const password = typeof x.password === 'string' ? x.password : '';
  if (!identifier || !password || password.length > 128) throw err(400, 'INVALID_INPUT', 'شناسه ورود و رمز عبور را وارد کنید');
  const isRootAdmin = identifier.toLowerCase() === 'admin';
  const normalizedPhone = /^\+?[0-9۰-۹٠-٩]{8,15}$/.test(identifier) ? normPhone(identifier) : null;
  const unit = unitOrNull(identifier);
  const ip = c.request.headers.get('CF-Connecting-IP') || 'unknown';
  // قفل سه‌گانه: (شناسه+IP) سخت‌گیر، شناسه به‌تنهایی با سقف بالاتر، و IP به‌تنهایی.
  // قفل فقط بر اساس شناسه به مهاجم اجازه می‌داد با ۵ تلاش اشتباه از هر جا، حساب یک واحد را ۱۵ دقیقه قفل کند.
  const idLower = identifier.toLowerCase().slice(0, 64), idIpKey = `idip:${idLower}:${ip}`, idKey = `id:unified:${idLower}`, ipKey = `ip:${ip}`;
  await assertNotLocked(c.db, [idIpKey, idKey, ipKey], c.now);
  let candidates = [];
  if (isRootAdmin) {
    const root = await c.db.prepare("SELECT * FROM users WHERE unit_id IS NULL AND account_type='staff' AND lower(email) IN ('admin','admin@nika.com') AND active=1").first();
    if (root) candidates.push(root);
  } else {
    if (unit) {
      const members = await c.db.prepare("SELECT u.* FROM users u JOIN units n ON n.id=u.unit_id WHERE n.unit_number=? AND u.account_type IN ('owner','resident') AND u.active=1 ORDER BY u.created_at").bind(unit).all();
      candidates.push(...members.results);
    }
    if (normalizedPhone) {
      const staff = await c.db.prepare("SELECT * FROM users WHERE unit_id IS NULL AND account_type='staff' AND phone=? AND active=1").bind(normalizedPhone).all();
      candidates.push(...staff.results);
    }
    const staffByUsername = await c.db.prepare("SELECT * FROM users WHERE unit_id IS NULL AND account_type='staff' AND lower(email)=lower(?) AND active=1").bind(identifier).all();
    candidates.push(...staffByUsername.results);
  }
  let u = null;
  for (const candidate of candidates) {
    const candidateHash = await hashPassword(password, candidate.password_salt);
    if (safeEqual(candidateHash, candidate.password_hash)) { u = candidate; break; }
  }
  if (!candidates.length) await hashPassword(password, DUMMY_SALT);
  if (!u) {
    await registerFailure(c.db, idIpKey, MAX_ID_FAILS, c.now);
    await registerFailure(c.db, idKey, MAX_ID_GLOBAL_FAILS, c.now);
    await registerFailure(c.db, ipKey, MAX_IP_FAILS, c.now);
    throw err(401, 'INVALID_CREDENTIALS', 'شناسه یا رمز عبور صحیح نیست');
  }
  await c.db.prepare('DELETE FROM login_attempts WHERE key=?').bind(idIpKey).run();
  await audit(c.db, u.id, 'login', 'user', u.id);
  return issueSession(c, u);
});
R('POST', '/api/logout', { public: true }, async c => {
  const u = await authenticate(c);
  if (u) await c.db.prepare('DELETE FROM sessions WHERE id=?').bind(u.sid).run();
  return reply({ ok: true }, 200, [sessionCookie('', c.url.protocol === 'https:', 0)]);
});

R('GET', '/api/me', c => { const { sid, ...user } = c.user; return reply({ user }); });

R('PATCH', '/api/profile', c => updateProfile(c));
async function updateProfile(c) {
  const x = await readJson(c.request), sets = [], vals = [];
  if ('name' in x) { sets.push('name=?'); vals.push(str(x.name, { max: 100, field: 'نام' })); }
  if ('gender' in x) { if (!['female','male','unspecified'].includes(x.gender)) throw err(400, 'INVALID_GENDER', 'جنسیت نامعتبر است'); sets.push('gender=?'); vals.push(x.gender); }
  if ('email' in x) {
    const e = optStr(x.email, { max: 120, field: 'ایمیل' });
    if (e && !/^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(e)) throw err(400, 'INVALID_EMAIL', 'ایمیل نامعتبر است');
    sets.push('email=?'); vals.push(e);
  }
  if ('phone' in x) {
    const phone = phoneOrFail(x.phone);
    if (phone !== c.user.phone) {
      const row = await c.db.prepare('SELECT password_hash,password_salt FROM users WHERE id=?').bind(c.user.id).first();
      const ok = typeof x.currentPassword === 'string' && safeEqual(await hashPassword(x.currentPassword, row.password_salt), row.password_hash);
      if (!ok) throw err(403, 'PASSWORD_REQUIRED', 'برای تغییر شماره موبایل رمز عبور فعلی را درست وارد کنید');
      const dup = c.user.unit_id
        ? await c.db.prepare("SELECT id FROM users WHERE unit_id=? AND account_type IN ('owner','resident') AND phone=? AND id!=?").bind(c.user.unit_id, phone, c.user.id).first()
        : await c.db.prepare("SELECT id FROM users WHERE unit_id IS NULL AND account_type='staff' AND phone=? AND id!=?").bind(phone, c.user.id).first();
      if (dup) throw err(409, 'PHONE_EXISTS', 'این شماره قبلاً برای حساب دیگری ثبت شده است');
      sets.push('phone=?'); vals.push(phone);
    }
  }
  if (!sets.length) return reply({ ok: true });
  await c.db.prepare(`UPDATE users SET ${sets.join(',')},updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(...vals, c.user.id).run();
  await audit(c.db, c.user.id, 'profile.update', 'user', c.user.id, { fields: Object.keys(x).filter(k => k !== 'currentPassword') }, { ...(c.user.activeRole ? { actorRole: c.user.activeRole } : {}) });
  return reply({ ok: true, user: await loadUser(c.db, c.user.id) });
}

R('POST', '/api/password', async c => {
  const x = await readJson(c.request);
  // محدودیت تلاش: بدون آن می‌شد رمز فعلی را حدس زد، و بررسی «رمز مالک و ساکن یک واحد نباید یکسان باشد»
  // مثل یک oracle عمل می‌کرد (۴۰۹ یعنی رمزِ حساب دیگرِ واحد دقیقاً همین است).
  const pwKey = `pw:${c.user.id}`;
  await assertNotLocked(c.db, [pwKey], c.now);
  const row = await c.db.prepare('SELECT password_hash,password_salt,phone FROM users WHERE id=?').bind(c.user.id).first();
  if (!c.user.must_change_password) {
    const ok = typeof x.currentPassword === 'string' && x.currentPassword.length <= 128 && safeEqual(await hashPassword(x.currentPassword, row.password_salt), row.password_hash);
    if (!ok) { await registerFailure(c.db, pwKey, MAX_ID_FAILS, c.now); throw err(403, 'WRONG_PASSWORD', 'رمز عبور فعلی نادرست است'); }
  }
  const prob = passwordProblem(x.newPassword, row.phone);
  if (prob) throw err(400, 'WEAK_PASSWORD', prob);
  if (x.newPassword === x.currentPassword) throw err(400, 'SAME_PASSWORD', 'رمز جدید باید با رمز قبلی متفاوت باشد');
  if (c.user.unit_id) {
    const other = await c.db.prepare("SELECT password_hash,password_salt FROM users WHERE unit_id=? AND account_type IN ('owner','resident') AND id!=? AND active=1 LIMIT 1").bind(c.user.unit_id, c.user.id).first();
    if (other && safeEqual(await hashPassword(x.newPassword, other.password_salt), other.password_hash)) {
      await registerFailure(c.db, pwKey, MAX_ID_FAILS, c.now);
      throw err(409, 'SHARED_UNIT_PASSWORD', 'این رمز قابل استفاده نیست؛ رمز دیگری انتخاب کنید');
    }
  }
  const salt = newSalt(), ph = await hashPassword(x.newPassword, salt);
  await c.db.batch([
    c.db.prepare('UPDATE users SET password_hash=?,password_salt=?,must_change_password=0,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(ph, salt, c.user.id),
    c.db.prepare('DELETE FROM sessions WHERE user_id=? AND id!=?').bind(c.user.id, c.user.sid),
    c.db.prepare('DELETE FROM login_attempts WHERE key=?').bind(pwKey)
  ]);
  await audit(c.db, c.user.id, 'password.change', 'user', c.user.id, {}, { ...(c.user.activeRole ? { actorRole: c.user.activeRole } : {}) });
  return reply({ ok: true, user: await loadUser(c.db, c.user.id) });
});

// ---------- آواتار (تصویر کوچک‌شده در D1؛ برای مقیاس بزرگ‌تر R2 پیشنهاد می‌شود) ----------
const AVATAR_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
R('PUT', '/api/avatar', async c => {
  const x = await readJson(c.request, 260000);
  if (typeof x.avatarData !== 'string' || x.avatarData.length > 200000 || !AVATAR_RE.test(x.avatarData)) throw err(400, 'INVALID_IMAGE', 'تصویر نامعتبر یا بیش از حد بزرگ است');
  await c.db.prepare('UPDATE users SET avatar_data=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(x.avatarData, c.user.id).run();
  return reply({ ok: true, user: await loadUser(c.db, c.user.id) });
});
R('DELETE', '/api/avatar', async c => {
  await c.db.prepare('UPDATE users SET avatar_data=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(c.user.id).run();
  return reply({ ok: true, user: await loadUser(c.db, c.user.id) });
});
R('GET', '/api/avatar', async c => {
  const r = await c.db.prepare('SELECT avatar_data FROM users WHERE id=?').bind(c.user.id).first();
  const m = r && r.avatar_data && /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(r.avatar_data);
  if (!m) throw err(404, 'NOT_FOUND', 'تصویری ثبت نشده است');
  const bin = atob(m[2]), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Response(bytes, { headers: { 'Content-Type': m[1], 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff' } });
});

// ---------- نشان‌ها ----------
R('GET', '/api/summary', async c => {
  const u = c.user, out = { unreadMessages: 0, pendingApprovals: 0, newRequests: 0 };
  const mgr = can(u, 'messages.manage') ? 1 : 0;
  out.unreadMessages = (await c.db.prepare(`SELECT COUNT(*) n FROM messages m WHERE m.read_at IS NULL AND m.sender_id<>? AND (m.recipient_id=? OR (m.recipient_id IS NULL AND m.recipient_role IS NULL AND ?=1) OR (m.recipient_role='executive' AND EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id=? AND r.role='executive')) OR (m.recipient_role='chair' AND EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id=? AND r.role='chair')) OR (m.recipient_role='board' AND EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id=? AND r.role IN ('chair','finance','board'))))`).bind(u.id,u.id,mgr,u.id,u.id,u.id).first()).n;
  const kinds = [];
  if (can(u, 'finance.approve')) kinds.push('payment');
  if (can(u, 'expenses.approve')) kinds.push('expense');
  if (kinds.length) out.pendingApprovals = (await c.db.prepare(`SELECT COUNT(*) n FROM transactions WHERE status='pending' AND kind IN (${kinds.map(() => '?').join(',')})`).bind(...kinds).first()).n;
  if (can(u, 'expenses.approve')) out.pendingApprovals += (await c.db.prepare("SELECT COUNT(*) n FROM expense_requests WHERE status='pending_finance'").first()).n;
  if (can(u, 'expenses.finalize')) out.pendingApprovals += (await c.db.prepare("SELECT COUNT(*) n FROM expense_requests WHERE status='pending_chair'").first()).n;
  if (can(u, 'requests.manage')) out.newRequests = (await c.db.prepare("SELECT COUNT(*) n FROM requests WHERE status='new'").first()).n;
  return reply(out);
});

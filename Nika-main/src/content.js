// اطلاعیه‌ها، درخواست‌ها، پیام‌ها و محتوای ساختمان (مقررات، مصوبات، رویدادها، اسناد)
import { R } from './router.js';
import { err, reply, readJson, str, optStr, int, jdate, audit } from './lib.js';
import { can } from './perms.js';

// ---------- اطلاعیه‌ها ----------
const NOTICE_KINDS = ['اطلاعیه', 'جلسه', 'عمومی', 'فوری'];
const AUDIENCES = ['all', 'owner', 'resident', 'staff'];

R('GET', '/api/notices', async c => {
  const limit = Math.min(Math.max(Number(c.url.searchParams.get('limit')) || 100, 1), 100), t = c.user.account_type;
  const r = await c.db.prepare(
    `SELECT id,title,body,audience,kind,created_at FROM notices WHERE (?='staff' OR audience IN ('all',?)) ORDER BY created_at DESC,rowid DESC LIMIT ?`).bind(t, t, limit).all();
  return reply({ notices: r.results });
});
R('POST', '/api/notices', { perm: 'notices.manage' }, async c => {
  const x = await readJson(c.request), id = crypto.randomUUID();
  const audience = x.audience ?? 'all', kind = x.kind ?? 'اطلاعیه';
  if (!AUDIENCES.includes(audience) || !NOTICE_KINDS.includes(kind)) throw err(400, 'INVALID_INPUT', 'مخاطب یا نوع اطلاعیه نامعتبر است');
  await c.db.prepare('INSERT INTO notices(id,title,body,audience,kind,created_by) VALUES(?,?,?,?,?,?)')
    .bind(id, str(x.title, { max: 120, field: 'عنوان' }), str(x.body, { max: 2000, multiline: true, field: 'متن' }), audience, kind, c.user.id).run();
  await audit(c.db, c.user.id, 'notice.create', 'notice', id);
  return reply({ ok: true, id }, 201);
});
R('DELETE', '/api/notices/:id', { perm: 'notices.manage' }, async c => {
  const r = await c.db.prepare('DELETE FROM notices WHERE id=?').bind(c.params.id).run();
  if (!r.meta.changes) throw err(404, 'NOT_FOUND', 'اطلاعیه پیدا نشد');
  await audit(c.db, c.user.id, 'notice.delete', 'notice', c.params.id);
  return reply({ ok: true });
});

// ---------- درخواست‌ها ----------
const REQ_KINDS = ['request', 'idea', 'issue'];
const REQ_STATUS = ['new', 'in_progress', 'resolved', 'rejected'];
const REQ_CATEGORIES = ['عمومی', 'تأسیسات و تعمیرات', 'نظافت', 'امنیت', 'مالی', 'سایر'];

R('GET', '/api/requests', async c => {
  const all = c.url.searchParams.get('scope') === 'all';
  if (all && !can(c.user, 'requests.manage')) throw err(403, 'FORBIDDEN', 'دسترسی کافی ندارید');
  const st = c.url.searchParams.get('status');
  const where = [], vals = [];
  if (!all) { where.push('r.user_id=?'); vals.push(c.user.id); }
  if (st) { where.push('r.status=?'); vals.push(st); }
  const r = await c.db.prepare(
    `SELECT r.id,r.title,r.body,r.category,r.kind,r.status,r.response,r.board_requested,r.created_at,r.updated_at,u.name user_name,n.unit_number
     FROM requests r JOIN users u ON u.id=r.user_id LEFT JOIN units n ON n.id=u.unit_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY r.created_at DESC,r.rowid DESC LIMIT 300`).bind(...vals).all();
  return reply({ requests: r.results });
});
R('POST', '/api/requests', { perm: 'requests.create' }, async c => {
  const x = await readJson(c.request), id = crypto.randomUUID();
  const kind = x.kind ?? 'request', category = x.category ?? 'عمومی';
  if (!REQ_KINDS.includes(kind) || !REQ_CATEGORIES.includes(category)) throw err(400, 'INVALID_INPUT', 'نوع یا دسته‌بندی نامعتبر است');
  await c.db.prepare('INSERT INTO requests(id,user_id,title,body,category,kind,board_requested) VALUES(?,?,?,?,?,?,?)')
    .bind(id, c.user.id, str(x.title, { max: 120, field: 'موضوع' }), str(x.body, { max: 2000, multiline: true, field: 'شرح' }), category, kind, x.boardRequested === true ? 1 : 0).run();
  await audit(c.db, c.user.id, 'request.create', 'request', id, { kind, category });
  return reply({ ok: true, id }, 201);
});
R('PATCH', '/api/requests/:id', { perm: 'requests.manage' }, async c => {
  const x = await readJson(c.request);
  const r = await c.db.prepare('SELECT id,user_id,title,status,response FROM requests WHERE id=?').bind(c.params.id).first();
  if (!r) throw err(404, 'NOT_FOUND', 'درخواست پیدا نشد');
  const status = x.status ?? r.status;
  if (!REQ_STATUS.includes(status)) throw err(400, 'INVALID_STATUS', 'وضعیت نامعتبر است');
  const response = 'response' in x ? optStr(x.response, { max: 1000, multiline: true, field: 'پاسخ' }) : r.response;
  const stmts = [c.db.prepare('UPDATE requests SET status=?,response=?,assigned_to=COALESCE(assigned_to,?),updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(status, response, c.user.id, r.id)];
  if (response && response !== r.response) {
    stmts.push(c.db.prepare('INSERT INTO messages(id,sender_id,recipient_id,title,body) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(), c.user.id, r.user_id, `پاسخ به درخواست: ${r.title}`.slice(0, 120), response));
  }
  await c.db.batch(stmts);
  await audit(c.db, c.user.id, 'request.update', 'request', r.id, { status });
  return reply({ ok: true });
});
R('POST', '/api/requests/:id/publish', { perm: 'notices.manage' }, async c => {
  const r = await c.db.prepare('SELECT id,title,body,board_requested FROM requests WHERE id=?').bind(c.params.id).first();
  if (!r) throw err(404, 'NOT_FOUND', 'درخواست پیدا نشد');
  if (r.board_requested !== 1) throw err(409, 'NOT_REQUESTED', 'این مورد برای نمایش در تابلو درخواست نشده یا قبلاً منتشر شده است');
  const nid = crypto.randomUUID();
  await c.db.batch([
    c.db.prepare("INSERT INTO notices(id,title,body,audience,kind,created_by) VALUES(?,?,?,'all','عمومی',?)").bind(nid, r.title, r.body, c.user.id),
    c.db.prepare('UPDATE requests SET board_requested=2 WHERE id=?').bind(r.id)
  ]);
  await audit(c.db, c.user.id, 'request.publish', 'request', r.id, { notice: nid });
  return reply({ ok: true, id: nid }, 201);
});

// ---------- پیام‌ها (بدون گیرنده = پیام به مدیریت) ----------
R('GET', '/api/messages', { perm: 'messages.use' }, async c => {
  const box = c.url.searchParams.get('box') === 'sent' ? 'sent' : 'inbox', mgr = can(c.user, 'messages.manage') ? 1 : 0;
  const cols = 'm.*,su.name sender_name,sn.unit_number sender_unit,ru.name recipient_name';
  const from = 'FROM messages m JOIN users su ON su.id=m.sender_id LEFT JOIN units sn ON sn.id=su.unit_id LEFT JOIN users ru ON ru.id=m.recipient_id';
  const r = box === 'sent'
    ? await c.db.prepare(`SELECT ${cols} ${from} WHERE m.sender_id=? ORDER BY m.created_at DESC,m.rowid DESC LIMIT 200`).bind(c.user.id).all()
    : await c.db.prepare(`SELECT ${cols} ${from} WHERE (m.recipient_id=? OR (m.recipient_id IS NULL AND ?=1)) ORDER BY m.created_at DESC,m.rowid DESC LIMIT 200`).bind(c.user.id, mgr).all();
  return reply({ box, messages: r.results });
});
R('POST', '/api/messages', { perm: 'messages.use' }, async c => {
  const x = await readJson(c.request), id = crypto.randomUUID();
  let recipient = null;
  if (x.recipientId) {
    if (!can(c.user, 'messages.manage')) throw err(403, 'FORBIDDEN', 'فقط مدیریت می‌تواند به کاربر مشخصی پیام بدهد');
    if (!await c.db.prepare('SELECT id FROM users WHERE id=? AND active=1').bind(String(x.recipientId)).first()) throw err(404, 'NOT_FOUND', 'گیرنده پیدا نشد');
    recipient = String(x.recipientId);
  }
  await c.db.prepare('INSERT INTO messages(id,sender_id,recipient_id,title,body) VALUES(?,?,?,?,?)')
    .bind(id, c.user.id, recipient, str(x.title, { max: 120, field: 'عنوان' }), str(x.body, { max: 2000, multiline: true, field: 'متن پیام' })).run();
  return reply({ ok: true, id }, 201);
});
R('POST', '/api/messages/:id/read', { perm: 'messages.use' }, async c => {
  await c.db.prepare('UPDATE messages SET read_at=COALESCE(read_at,CURRENT_TIMESTAMP) WHERE id=? AND (recipient_id=? OR (recipient_id IS NULL AND ?=1))')
    .bind(c.params.id, c.user.id, can(c.user, 'messages.manage') ? 1 : 0).run();
  return reply({ ok: true });
});

// ---------- محتوای ساختمان: CRUD عمومی ----------
const shortTime = v => { const s = String(v ?? '').trim(); if (!s) return null; const t = s.replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)); if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) throw err(400, 'INVALID_TIME', 'ساعت باید به شکل ۱۸:۳۰ باشد'); return t; };
const httpsUrl = v => { const s = String(v ?? '').trim(); try { const u = new URL(s); if (u.protocol !== 'https:' || s.length > 500) throw 0; return u.href; } catch { throw err(400, 'INVALID_URL', 'نشانی باید با https شروع شود'); } };
const CONTENT = {
  rules: { perm: 'content.manage', order: 'sort_order ASC,created_at ASC', parse: x => ({ title: str(x.title, { max: 120, field: 'عنوان' }), body: str(x.body, { max: 2000, multiline: true, field: 'متن' }), sort_order: x.sort_order == null || x.sort_order === '' ? 0 : int(x.sort_order, { min: 0, max: 9999 }) }) },
  resolutions: { perm: 'resolutions.manage', order: 'decided_on DESC,created_at DESC', parse: x => ({ title: str(x.title, { max: 120, field: 'عنوان' }), body: str(x.body, { max: 2000, multiline: true, field: 'متن' }), decided_on: jdate(x.decided_on, '/') }) },
  events: { perm: 'content.manage', order: 'event_date ASC,event_time ASC', parse: x => ({ title: str(x.title, { max: 120, field: 'عنوان' }), body: optStr(x.body, { max: 1000, multiline: true, field: 'توضیحات' }), event_date: jdate(x.event_date, '-'), event_time: shortTime(x.event_time) }) },
  documents: { perm: 'content.manage', order: 'created_at DESC', parse: x => ({ title: str(x.title, { max: 120, field: 'عنوان' }), description: optStr(x.description, { max: 300, field: 'توضیحات' }), url: httpsUrl(x.url) }) }
};
for (const [name, def] of Object.entries(CONTENT)) {
  R('GET', `/api/${name}`, async c => {
    const month = c.url.searchParams.get('month');
    const filter = name === 'events' && month && /^1[34]\d{2}-\d{2}$/.test(month) ? 'WHERE event_date LIKE ?' : '';
    const st = c.db.prepare(`SELECT * FROM ${name} ${filter} ORDER BY ${def.order} LIMIT 500`);
    const r = await (filter ? st.bind(month + '-%') : st).all();
    return reply({ items: r.results });
  });
  R('POST', `/api/${name}`, { perm: def.perm }, async c => {
    const f = def.parse(await readJson(c.request)), id = crypto.randomUUID(), keys = Object.keys(f);
    await c.db.prepare(`INSERT INTO ${name}(id,${keys.join(',')},created_by) VALUES(?,${keys.map(() => '?').join(',')},?)`).bind(id, ...keys.map(k => f[k]), c.user.id).run();
    await audit(c.db, c.user.id, `${name}.create`, name, id);
    return reply({ ok: true, id }, 201);
  });
  R('PUT', `/api/${name}/:id`, { perm: def.perm }, async c => {
    const f = def.parse(await readJson(c.request)), keys = Object.keys(f);
    const r = await c.db.prepare(`UPDATE ${name} SET ${keys.map(k => k + '=?').join(',')} WHERE id=?`).bind(...keys.map(k => f[k]), c.params.id).run();
    if (!r.meta.changes) throw err(404, 'NOT_FOUND', 'مورد پیدا نشد');
    await audit(c.db, c.user.id, `${name}.update`, name, c.params.id);
    return reply({ ok: true });
  });
  R('DELETE', `/api/${name}/:id`, { perm: def.perm }, async c => {
    const r = await c.db.prepare(`DELETE FROM ${name} WHERE id=?`).bind(c.params.id).run();
    if (!r.meta.changes) throw err(404, 'NOT_FOUND', 'مورد پیدا نشد');
    await audit(c.db, c.user.id, `${name}.delete`, name, c.params.id);
    return reply({ ok: true });
  });
}

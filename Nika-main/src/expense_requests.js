// گردش‌کار دومرحله‌ای درخواست پرداخت هزینه با نگهداری اسناد در R2
import { R } from './router.js';
import { err, reply, readJson, str, optStr, int, jdate, audit } from './lib.js';
import { can } from './perms.js';

const FUNDS = ['owner', 'monthly'];
const fundOf = value => {
  if (!FUNDS.includes(value)) throw err(400, 'FUND_REQUIRED', 'صندوق پرداخت را انتخاب کنید');
  return value;
};
const statusLabel = {
  pending_finance: 'در انتظار بررسی مدیر مالی',
  revision_finance: 'نیازمند اصلاح توسط مدیر اجرایی',
  pending_chair: 'در انتظار تأیید نهایی رئیس هیئت‌مدیره',
  revision_chair: 'نیازمند اصلاح پس از بررسی رئیس هیئت‌مدیره',
  finalized: 'تأیید نهایی و قطعی‌شده',
  cancelled: 'منتفی‌شده توسط مدیر اجرایی'
};
const canSeeRequest = (user, row) =>
  row.created_by === user.id || can(user, 'expenses.approve') || can(user, 'expenses.finalize');

function actorMeta(user, ownerRole, reason) {
  const delegated = user.delegatedRoles?.includes(ownerRole);
  const actorRole = delegated ? `جانشین ${ownerRole}` : (user.roles[0] || 'manager');
  return { actorRole, isDelegate: !!reason && !user.roles.includes(ownerRole), reason: reason || null };
}

function decodeImage(file) {
  if (!file || typeof file.data !== 'string') throw err(400, 'INVALID_FILE', 'تصویر سند نامعتبر است');
  const match = file.data.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw err(400, 'INVALID_FILE', 'فقط تصویر JPG، PNG یا WebP پذیرفته می‌شود');
  const binary = atob(match[2]);
  if (!binary.length || binary.length > 450000) throw err(413, 'FILE_TOO_LARGE', 'حجم هر تصویر پس از فشرده‌سازی باید کمتر از ۴۵۰ کیلوبایت باشد');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const filename = String(file.name || 'document.jpg').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100) || 'document.jpg';
  return { bytes, contentType: match[1], filename };
}

async function storeFiles(env, requestId, versionNo, files) {
  if (!files?.length) return [];
  if (!env.FILES) throw err(503, 'FILE_STORAGE_NOT_CONFIGURED', 'فضای ذخیره‌سازی اسناد هنوز در Cloudflare پیکربندی نشده است');
  if (files.length > 4) throw err(400, 'TOO_MANY_FILES', 'حداکثر چهار تصویر برای هر نسخه قابل ثبت است');
  const stored = [];
  try {
    for (const file of files) {
      const decoded = decodeImage(file);
      const id = crypto.randomUUID(), key = `expense-requests/${requestId}/${id}`;
      await env.FILES.put(key, decoded.bytes, { httpMetadata: { contentType: decoded.contentType } });
      stored.push({ id, request_id: requestId, version_no: versionNo, object_key: key, filename: decoded.filename, content_type: decoded.contentType, size: decoded.bytes.length });
    }
    return stored;
  } catch (e) {
    await Promise.all(stored.map(f => env.FILES.delete(f.object_key).catch(() => {})));
    throw e;
  }
}

async function saveVersion(db, requestId, versionNo, snapshot, actorId, reason, files) {
  const statements = [
    db.prepare('INSERT INTO expense_request_versions(id,request_id,version_no,snapshot,changed_by,reason) VALUES(?,?,?,?,?,?)')
      .bind(crypto.randomUUID(), requestId, versionNo, JSON.stringify(snapshot), actorId, reason || null)
  ];
  for (const f of files) statements.push(
    db.prepare('INSERT INTO expense_request_files(id,request_id,version_no,object_key,filename,content_type,size) VALUES(?,?,?,?,?,?,?)')
      .bind(f.id, f.request_id, f.version_no, f.object_key, f.filename, f.content_type, f.size)
  );
  await db.batch(statements);
}

R('POST', '/api/expense-requests', { perm: 'expenses.create' }, async c => {
  const x = await readJson(c.request, 2500000);
  const fund = fundOf(x.fund), amount = int(x.amount, { field: 'مبلغ درخواست' });
  const title = str(x.documentTitle, { max: 120, field: 'عنوان سند' });
  const documentDate = jdate(x.documentDate, '-');
  const description = str(x.description, { max: 2000, multiline: true, field: 'شرح درخواست' });
  if (!Array.isArray(x.files) || !x.files.length) throw err(400, 'DOCUMENT_REQUIRED', 'تصویر حداقل یک سند پشتیبان را بارگذاری کنید');

  const sequence = await c.db.prepare('UPDATE expense_request_sequences SET next_value=next_value+1 WHERE id=1 RETURNING next_value-1 value').first();
  if (!sequence) throw err(500, 'SEQUENCE_NOT_CONFIGURED', 'شمارنده درخواست‌ها پیکربندی نشده است');
  const year = new Intl.DateTimeFormat('en-US-u-ca-persian', { timeZone: 'Asia/Tehran', year: 'numeric' })
    .formatToParts(new Date()).find(p => p.type === 'year')?.value || '1405';
  const referenceNo = `${year}-${String(sequence.value).padStart(6, '0')}`;
  const id = crypto.randomUUID(), versionNo = 1;
  const files = await storeFiles(c.env, id, versionNo, x.files);
  const snapshot = { fund, amount, documentTitle: title, documentDate, description };
  try {
    await c.db.batch([
      c.db.prepare(`INSERT INTO expense_requests(id,reference_no,fund_id,amount,document_title,document_date,description,status,created_by)
                    VALUES(?,?,?,?,?,?,?,'pending_finance',?)`).bind(id, referenceNo, fund, amount, title, documentDate, description, c.user.id),
      c.db.prepare('INSERT INTO expense_request_versions(id,request_id,version_no,snapshot,changed_by,reason) VALUES(?,?,?,?,?,?)')
        .bind(crypto.randomUUID(), id, versionNo, JSON.stringify(snapshot), c.user.id, x.reason || null),
      ...files.map(f => c.db.prepare('INSERT INTO expense_request_files(id,request_id,version_no,object_key,filename,content_type,size) VALUES(?,?,?,?,?,?,?)')
        .bind(f.id, id, f.version_no, f.object_key, f.filename, f.content_type, f.size)),
      c.db.prepare('INSERT INTO expense_request_history(id,request_id,actor_id,stage,action,reason) VALUES(?,?,?,?,?,?)')
        .bind(crypto.randomUUID(), id, c.user.id, 'executive', 'created', x.reason || null)
    ]);
  } catch (e) {
    await Promise.all(files.map(f => c.env.FILES.delete(f.object_key).catch(() => {})));
    throw e;
  }
  await audit(c.db, c.user.id, 'expense_request.create', 'expense_request', id,
    { referenceNo, fund, amount }, c.overrideReason ? actorMeta(c.user, 'executive', c.overrideReason) : { actorRole: 'executive' });
  return reply({ ok: true, id, referenceNo, status: 'pending_finance' }, 201);
});

R('GET', '/api/expense-requests', async c => {
  const scope = c.url.searchParams.get('scope') || 'mine';
  let where = '', values = [];
  if (scope === 'mine') {
    if (!can(c.user, 'expenses.create')) throw err(403, 'FORBIDDEN', 'دسترسی کافی ندارید');
    where = 'er.created_by=?'; values = [c.user.id];
  } else if (scope === 'review') {
    if (!can(c.user, 'expenses.approve')) throw err(403, 'FORBIDDEN', 'دسترسی بررسی مالی ندارید');
    where = "er.status='pending_finance'";
  } else if (scope === 'final') {
    if (!can(c.user, 'expenses.finalize')) throw err(403, 'FORBIDDEN', 'دسترسی تأیید نهایی ندارید');
    where = "er.status='pending_chair'";
  } else throw err(400, 'INVALID_SCOPE', 'فیلتر درخواست نامعتبر است');

  const r = await c.db.prepare(
    `SELECT er.id,er.reference_no,er.fund_id,f.title fund_title,f.cash_balance,
            er.amount,er.document_title,er.document_date,er.description,er.status,
            er.created_by,er.created_at,er.updated_at,er.finalized_at,u.name creator_name,
            (SELECT COUNT(*) FROM expense_request_files x WHERE x.request_id=er.id) file_count
     FROM expense_requests er JOIN funds f ON f.id=er.fund_id
     JOIN users u ON u.id=er.created_by
     WHERE ${where} ORDER BY er.created_at DESC LIMIT 150`).bind(...values).all();
  return reply({ requests: r.results.map(row => ({ ...row, statusLabel: statusLabel[row.status] || row.status })) });
});

R('GET', '/api/expense-requests/:id', async c => {
  const row = await c.db.prepare(
    `SELECT er.*,f.title fund_title,f.cash_balance,u.name creator_name
     FROM expense_requests er JOIN funds f ON f.id=er.fund_id JOIN users u ON u.id=er.created_by
     WHERE er.id=?`).bind(c.params.id).first();
  if (!row) throw err(404, 'NOT_FOUND', 'درخواست پیدا نشد');
  if (!canSeeRequest(c.user, row)) throw err(403, 'FORBIDDEN', 'دسترسی کافی ندارید');
  const [versions, history, files] = await Promise.all([
    c.db.prepare('SELECT version_no,snapshot,changed_by,reason,created_at FROM expense_request_versions WHERE request_id=? ORDER BY version_no DESC').bind(row.id).all(),
    c.db.prepare('SELECT h.stage,h.action,h.reason,h.created_at,u.name actor FROM expense_request_history h LEFT JOIN users u ON u.id=h.actor_id WHERE h.request_id=? ORDER BY h.created_at DESC').bind(row.id).all(),
    c.db.prepare('SELECT id,version_no,filename,content_type,size,created_at FROM expense_request_files WHERE request_id=? ORDER BY version_no DESC,created_at DESC').bind(row.id).all()
  ]);
  return reply({
    request: { ...row, statusLabel: statusLabel[row.status] || row.status },
    versions: versions.results.map(v => ({ ...v, snapshot: JSON.parse(v.snapshot) })),
    history: history.results,
    files: files.results.map(f => ({ ...f, url: `/api/expense-requests/${row.id}/files/${f.id}` }))
  });
});

R('GET', '/api/expense-requests/:id/files/:fileId', async c => {
  const row = await c.db.prepare(
    `SELECT er.created_by,ef.object_key,ef.filename,ef.content_type
     FROM expense_request_files ef JOIN expense_requests er ON er.id=ef.request_id
     WHERE er.id=? AND ef.id=?`).bind(c.params.id, c.params.fileId).first();
  if (!row) throw err(404, 'NOT_FOUND', 'تصویر سند پیدا نشد');
  if (!canSeeRequest(c.user, row)) throw err(403, 'FORBIDDEN', 'دسترسی کافی ندارید');
  if (!c.env.FILES) throw err(503, 'FILE_STORAGE_NOT_CONFIGURED', 'فضای ذخیره‌سازی اسناد پیکربندی نشده است');
  const object = await c.env.FILES.get(row.object_key);
  if (!object) throw err(404, 'FILE_NOT_FOUND', 'فایل سند پیدا نشد');
  return new Response(object.body, { headers: {
    'Content-Type': row.content_type,
    'Content-Disposition': `inline; filename="${row.filename.replace(/["\\\\]/g, '')}"`,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff'
  }});
});

R('PATCH', '/api/expense-requests/:id', { perm: 'expenses.create' }, async c => {
  const x = await readJson(c.request, 2500000);
  const row = await c.db.prepare('SELECT * FROM expense_requests WHERE id=?').bind(c.params.id).first();
  if (!row) throw err(404, 'NOT_FOUND', 'درخواست پیدا نشد');
  if (row.created_by !== c.user.id) throw err(403, 'FORBIDDEN', 'فقط ثبت‌کننده می‌تواند درخواست را اصلاح کند');
  if (!['revision_finance', 'revision_chair'].includes(row.status)) throw err(409, 'NOT_EDITABLE', 'این درخواست در وضعیت قابل اصلاح نیست');

  const fund = fundOf(x.fund ?? row.fund_id), amount = int(x.amount ?? row.amount, { field: 'مبلغ درخواست' });
  const title = str(x.documentTitle ?? row.document_title, { max: 120, field: 'عنوان سند' });
  const documentDate = jdate(x.documentDate ?? row.document_date, '-');
  const description = str(x.description ?? row.description, { max: 2000, multiline: true, field: 'شرح درخواست' });
  const versionNo = await c.db.prepare('SELECT COALESCE(MAX(version_no),0)+1 version_no FROM expense_request_versions WHERE request_id=?').bind(row.id).first();
  const files = await storeFiles(c.env, row.id, versionNo.version_no, Array.isArray(x.files) ? x.files : []);
  const snapshot = { fund, amount, documentTitle: title, documentDate, description };
  const reason = optStr(x.reason, { max: 500, multiline: true, field: 'توضیح اصلاح' });
  try {
    const statements = [
      c.db.prepare(`UPDATE expense_requests SET fund_id=?,amount=?,document_title=?,document_date=?,description=?,
                    status='pending_finance',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status IN ('revision_finance','revision_chair')`)
        .bind(fund, amount, title, documentDate, description, row.id),
      c.db.prepare('INSERT INTO expense_request_versions(id,request_id,version_no,snapshot,changed_by,reason) VALUES(?,?,?,?,?,?)')
        .bind(crypto.randomUUID(), row.id, versionNo.version_no, JSON.stringify(snapshot), c.user.id, reason)
    ];
    for (const f of files) statements.push(
      c.db.prepare('INSERT INTO expense_request_files(id,request_id,version_no,object_key,filename,content_type,size) VALUES(?,?,?,?,?,?,?)')
        .bind(f.id, f.request_id, f.version_no, f.object_key, f.filename, f.content_type, f.size)
    );
    statements.push(c.db.prepare('INSERT INTO expense_request_history(id,request_id,actor_id,stage,action,reason) VALUES(?,?,?,?,?,?)')
      .bind(crypto.randomUUID(), row.id, c.user.id, 'executive', 'resubmitted', reason));
    await c.db.batch(statements);
  } catch (e) {
    await Promise.all(files.map(f => c.env.FILES.delete(f.object_key).catch(() => {})));
    throw e;
  }
  await audit(c.db, c.user.id, 'expense_request.resubmit', 'expense_request', row.id, { referenceNo: row.reference_no, version: versionNo.version_no });
  return reply({ ok: true, status: 'pending_finance' });
});

R('POST', '/api/expense-requests/:id/cancel', { perm: 'expenses.create' }, async c => {
  const x = await readJson(c.request);
  const row = await c.db.prepare('SELECT id,created_by,status,reference_no FROM expense_requests WHERE id=?').bind(c.params.id).first();
  if (!row) throw err(404, 'NOT_FOUND', 'درخواست پیدا نشد');
  if (row.created_by !== c.user.id) throw err(403, 'FORBIDDEN', 'فقط ثبت‌کننده می‌تواند درخواست را منتفی کند');
  if (!['revision_finance', 'revision_chair'].includes(row.status)) throw err(409, 'NOT_CANCELLABLE', 'فقط درخواست نیازمند اصلاح قابل منتفی‌کردن است');
  const reason = optStr(x.reason, { max: 500, multiline: true, field: 'دلیل منتفی‌کردن' });
  await c.db.batch([
    c.db.prepare("UPDATE expense_requests SET status='cancelled',cancelled_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status IN ('revision_finance','revision_chair')").bind(row.id),
    c.db.prepare('INSERT INTO expense_request_history(id,request_id,actor_id,stage,action,reason) VALUES(?,?,?,?,?,?)')
      .bind(crypto.randomUUID(), row.id, c.user.id, 'executive', 'cancelled', reason)
  ]);
  await audit(c.db, c.user.id, 'expense_request.cancel', 'expense_request', row.id, { referenceNo: row.reference_no, reason });
  return reply({ ok: true, status: 'cancelled' });
});

R('POST', '/api/expense-requests/:id/finance-decision', { perm: 'expenses.approve' }, async c => {
  const x = await readJson(c.request);
  if (!['approved', 'revision'].includes(x.status)) throw err(400, 'INVALID_STATUS', 'وضعیت نامعتبر است');
  const row = await c.db.prepare('SELECT id,created_by,status,reference_no FROM expense_requests WHERE id=?').bind(c.params.id).first();
  if (!row) throw err(404, 'NOT_FOUND', 'درخواست پیدا نشد');
  if (row.status !== 'pending_finance') throw err(409, 'NOT_PENDING', 'این درخواست در انتظار بررسی مدیر مالی نیست');
  if (row.created_by === c.user.id && c.env.ALLOW_SELF_APPROVAL !== 'true') throw err(403, 'SELF_APPROVAL', 'ثبت‌کننده نمی‌تواند درخواست خودش را بررسی کند');
  const reason = x.status === 'revision' ? str(x.reason, { max: 500, multiline: true, field: 'دلیل نیاز به اصلاح' }) : optStr(x.reason, { max: 500, multiline: true });
  const next = x.status === 'approved' ? 'pending_chair' : 'revision_finance';
  const r = await c.db.prepare('UPDATE expense_requests SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status=\'pending_finance\'').bind(next, row.id).run();
  if (!r.meta.changes) throw err(409, 'NOT_PENDING', 'وضعیت درخواست تغییر کرده است');
  await c.db.prepare('INSERT INTO expense_request_history(id,request_id,actor_id,stage,action,reason) VALUES(?,?,?,?,?,?)')
    .bind(crypto.randomUUID(), row.id, c.user.id, 'finance', x.status === 'approved' ? 'approved' : 'revision', reason).run();
  await audit(c.db, c.user.id, 'expense_request.finance_decision', 'expense_request', row.id,
    { referenceNo: row.reference_no, status: next }, c.overrideReason ? actorMeta(c.user, 'finance', c.overrideReason) : { actorRole: 'finance', reason });
  return reply({ ok: true, status: next });
});

R('POST', '/api/expense-requests/:id/chair-decision', { perm: 'expenses.finalize' }, async c => {
  const x = await readJson(c.request);
  if (!['approved', 'revision'].includes(x.status)) throw err(400, 'INVALID_STATUS', 'وضعیت نامعتبر است');
  const row = await c.db.prepare('SELECT * FROM expense_requests WHERE id=?').bind(c.params.id).first();
  if (!row) throw err(404, 'NOT_FOUND', 'درخواست پیدا نشد');
  if (row.status !== 'pending_chair') throw err(409, 'NOT_PENDING', 'این درخواست در انتظار تأیید نهایی نیست');
  if (row.created_by === c.user.id && c.env.ALLOW_SELF_APPROVAL !== 'true') throw err(403, 'SELF_APPROVAL', 'ثبت‌کننده نمی‌تواند درخواست خودش را تأیید نهایی کند');

  if (x.status === 'revision') {
    const reason = str(x.reason, { max: 500, multiline: true, field: 'دلیل نیاز به اصلاح' });
    const r = await c.db.prepare("UPDATE expense_requests SET status='revision_chair',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='pending_chair'").bind(row.id).run();
    if (!r.meta.changes) throw err(409, 'NOT_PENDING', 'وضعیت درخواست تغییر کرده است');
    await c.db.prepare('INSERT INTO expense_request_history(id,request_id,actor_id,stage,action,reason) VALUES(?,?,?,?,?,?)')
      .bind(crypto.randomUUID(), row.id, c.user.id, 'chair', 'revision', reason).run();
    await audit(c.db, c.user.id, 'expense_request.chair_revision', 'expense_request', row.id,
      { referenceNo: row.reference_no }, c.overrideReason ? actorMeta(c.user, 'chair', c.overrideReason) : { actorRole: 'chair', reason });
    return reply({ ok: true, status: 'revision_chair' });
  }

  const period = row.fund_id === 'owner' ? row.document_date.slice(0, 4) : row.document_date.slice(0, 7);
  const results = await c.db.batch([
    c.db.prepare(`UPDATE funds SET cash_balance=cash_balance-?
                   WHERE id=? AND cash_balance>=?
                     AND EXISTS(SELECT 1 FROM expense_requests WHERE id=? AND status='pending_chair')`)
      .bind(row.amount, row.fund_id, row.amount, row.id),
    c.db.prepare(`INSERT INTO transactions(id,unit_id,user_id,fund_id,kind,amount,title,period,status,reference,category,note,created_by,approved_by,approved_at)
                  SELECT ?,NULL,er.created_by,er.fund_id,'expense',?,er.document_title,?,'approved',?,'درخواست پرداخت',?,er.created_by,?,CURRENT_TIMESTAMP
                  FROM expense_requests er WHERE er.id=? AND er.status='pending_chair' AND changes()=1`)
      .bind(crypto.randomUUID(), row.amount, period, row.reference_no, row.description, c.user.id, row.id),
    c.db.prepare("UPDATE expense_requests SET status='finalized',finalized_by=?,finalized_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='pending_chair' AND changes()=1")
      .bind(c.user.id, row.id),
    c.db.prepare('INSERT INTO expense_request_history(id,request_id,actor_id,stage,action,reason) SELECT ?,?,?,?, ?,? WHERE changes()=1')
      .bind(crypto.randomUUID(), row.id, c.user.id, 'chair', 'finalized', c.overrideReason || null)
  ]);
  if (!results[0]?.meta?.changes) {
    const fund = await c.db.prepare('SELECT cash_balance FROM funds WHERE id=?').bind(row.fund_id).first();
    if (Number(fund?.cash_balance || 0) < Number(row.amount)) {
      throw err(409, 'INSUFFICIENT_FUNDS', `موجودی صندوق کافی نیست. موجودی فعلی: ${Number(fund?.cash_balance || 0)} تومان`);
    }
    throw err(409, 'NOT_PENDING', 'وضعیت درخواست تغییر کرده است');
  }
  await audit(c.db, c.user.id, 'expense_request.finalized', 'expense_request', row.id,
    { referenceNo: row.reference_no, fund: row.fund_id, amount: row.amount },
    c.overrideReason ? actorMeta(c.user, 'chair', c.overrideReason) : { actorRole: 'chair' });
  return reply({ ok: true, status: 'finalized' });
});

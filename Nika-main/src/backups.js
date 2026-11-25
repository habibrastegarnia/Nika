// تهیه نسخه پشتیبان آفلاین؛ فقط تصاویر پیوست پس از تأیید فایل دانلودشده پاک می‌شوند.
import { R } from './router.js';
import { err, reply, readJson, audit } from './lib.js';

const ARCHIVE_TABLES = [
  'units', 'users', 'user_roles', 'funds', 'transactions',
  'notices', 'requests', 'messages', 'audit_logs', 'rules',
  'resolutions', 'events', 'documents', 'finance_settings',
  'manager_delegations', 'expense_request_sequences',
  'expense_requests', 'expense_request_versions',
  'expense_request_files', 'expense_request_history', 'backup_runs'
];

function hex(buffer) {
  return [...new Uint8Array(buffer)].map(v => v.toString(16).padStart(2, '0')).join('');
}
async function sha256(value) {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
}

R('GET', '/api/backups/status', { perm: 'backup.manage' }, async c => {
  const [images, latest] = await Promise.all([
    c.db.prepare('SELECT COUNT(*) count FROM expense_request_files WHERE data_base64 IS NOT NULL').first(),
    c.db.prepare("SELECT confirmed_at FROM backup_runs WHERE status='confirmed' ORDER BY confirmed_at DESC LIMIT 1").first()
  ]);
  return reply({ pendingImages: Number(images?.count || 0), lastConfirmedAt: latest?.confirmed_at || null });
});

R('GET', '/api/backups/export', { perm: 'backup.manage' }, async c => {
  const tables = {};
  for (const table of ARCHIVE_TABLES) {
    let rows = [];
    if (table === 'expense_request_files') {
      // هر صفحه حداکثر ۵۰ تصویر دارد تا نتیجه یک Query از سقف ۵۰ مگابایت D1 عبور نکند.
      // سقف اندازه فایل در API نیز ۴۵۰ کیلوبایت است؛ این صفحه حدود ۳۰ مگابایت داده تصویری خواهد داشت.
      const pageSize = 50;
      for (let offset = 0; ; offset += pageSize) {
        const page = await c.db.prepare(
          'SELECT * FROM expense_request_files ORDER BY created_at,id LIMIT ? OFFSET ?'
        ).bind(pageSize, offset).all();
        const pageRows = page.results || [];
        rows.push(...pageRows);
        if (pageRows.length < pageSize) break;
      }
    } else {
      const result = await c.db.prepare(`SELECT * FROM ${table}`).all();
      rows = result.results || [];
    }
    // فایل آرشیو برای گزارش‌گیری است؛ هیچ اعتبارنامه یا رمز هش‌شده‌ای وارد آن نمی‌شود.
    if (table === 'users') {
      rows = rows.map(({ password_hash, password_salt, ...user }) => user);
    }
    tables[table] = rows;
  }

  const imageIds = (tables.expense_request_files || [])
    .filter(file => typeof file.data_base64 === 'string' && file.data_base64.length > 0)
    .map(file => file.id);
  const exportedAt = new Date().toISOString();
  const recordCounts = Object.fromEntries(Object.entries(tables).map(([name, rows]) => [name, rows.length]));
  const payload = {
    format: 'nika-offline-archive',
    formatVersion: 1,
    exportedAt,
    backupId: crypto.randomUUID(),
    recordCounts,
    includedImageCount: imageIds.length,
    tables
  };
  const body = JSON.stringify(payload);
  const checksum = await sha256(body);
  await c.db.prepare(
    "INSERT INTO backup_runs(id,created_by,checksum,file_ids_json,image_count,status) VALUES(?,?,?,?,?,'pending')"
  ).bind(payload.backupId, c.user.id, checksum, JSON.stringify(imageIds), imageIds.length).run();

  return new Response(body, { status: 200, headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Disposition': `attachment; filename="nika-backup-${exportedAt.slice(0, 10)}.json"`,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Nika-Backup-Id': payload.backupId,
    'X-Nika-Backup-SHA256': checksum
  }});
});

R('POST', '/api/backups/:id/confirm', { perm: 'backup.manage' }, async c => {
  const x = await readJson(c.request, 20000);
  if (typeof x.checksum !== 'string' || !/^[a-f0-9]{64}$/.test(x.checksum)) {
    throw err(400, 'INVALID_CHECKSUM', 'کد صحت فایل پشتیبان معتبر نیست');
  }
  const run = await c.db.prepare(
    "SELECT id,checksum,file_ids_json,status,created_at,datetime(created_at) < datetime('now','-7 days') expired FROM backup_runs WHERE id=? AND created_by=?"
  ).bind(c.params.id, c.user.id).first();
  if (!run) throw err(404, 'BACKUP_NOT_FOUND', 'درخواست پشتیبان پیدا نشد');
  if (run.status !== 'pending') throw err(409, 'BACKUP_ALREADY_PROCESSED', 'این فایل پشتیبان قبلاً تعیین تکلیف شده است');
  if (run.expired) {
    await c.db.prepare("UPDATE backup_runs SET status='expired' WHERE id=? AND status='pending'").bind(run.id).run();
    throw err(410, 'BACKUP_EXPIRED', 'برای پاک‌سازی تصاویر، فایل پشتیبان تازه‌ای تهیه کنید');
  }
  if (x.checksum !== run.checksum) throw err(400, 'CHECKSUM_MISMATCH', 'صحت فایل پشتیبان تأیید نشد؛ هیچ تصویری حذف نشده است');

  const results = await c.db.batch([
    c.db.prepare("UPDATE backup_runs SET status='confirmed',confirmed_at=CURRENT_TIMESTAMP WHERE id=? AND created_by=? AND checksum=? AND status='pending'")
      .bind(run.id, c.user.id, run.checksum),
    c.db.prepare(`UPDATE expense_request_files SET data_base64=NULL,archived_at=CURRENT_TIMESTAMP
                  WHERE data_base64 IS NOT NULL
                    AND id IN (SELECT value FROM json_each(?))
                    AND EXISTS(SELECT 1 FROM backup_runs WHERE id=? AND status='confirmed')`)
      .bind(run.file_ids_json, run.id)
  ]);
  if (!results[0]?.meta?.changes) throw err(409, 'BACKUP_ALREADY_PROCESSED', 'این فایل پشتیبان هم‌زمان تعیین تکلیف شده است');

  await audit(c.db, c.user.id, 'backup.confirm', 'backup', run.id,
    { archivedImages: Number(results[1]?.meta?.changes || 0), checksum: run.checksum });
  return reply({ ok: true, archivedImages: Number(results[1]?.meta?.changes || 0), retainedRecords: true });
});

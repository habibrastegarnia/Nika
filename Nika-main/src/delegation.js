// جانشینی مسئولیت‌های مدیریتی با امکان لغو فوری
import { R } from './router.js';
import { err, reply, readJson, audit } from './lib.js';

const MANAGER_ROLES = ['chair', 'finance', 'board', 'executive'];

R('GET', '/api/delegations', async c => {
  const ownRoles = c.user.roles.filter(r => MANAGER_ROLES.includes(r));
  if (!ownRoles.length) throw err(403, 'FORBIDDEN', 'برای حساب شما مسئولیت مدیریتی قابل واگذاری تعریف نشده است');

  const placeholders = ownRoles.map(() => '?').join(',');
  const [available, current] = await Promise.all([
    c.db.prepare(
      `SELECT u.id,u.name,GROUP_CONCAT(r.role) roles
       FROM users u JOIN user_roles r ON r.user_id=u.id
       WHERE u.active=1 AND u.id<>? AND r.role IN ('chair','finance','board','executive')
       GROUP BY u.id,u.name ORDER BY u.name LIMIT 100`
    ).bind(c.user.id).all(),
    c.db.prepare(
      `SELECT d.delegator_role,d.delegate_user_id,d.enabled,u.name delegate_name
       FROM manager_delegations d LEFT JOIN users u ON u.id=d.delegate_user_id
       WHERE d.delegator_user_id=? AND d.delegator_role IN (${placeholders})`
    ).bind(c.user.id, ...ownRoles).all()
  ]);
  return reply({
    roles: ownRoles,
    available: available.results.map(u => ({ ...u, roles: (u.roles || '').split(',').filter(Boolean) })),
    delegations: current.results.map(d => ({ ...d, enabled: !!d.enabled }))
  });
});

R('PUT', '/api/delegations/:role', async c => {
  const role = c.params.role;
  if (!MANAGER_ROLES.includes(role) || !c.user.roles.includes(role)) {
    throw err(403, 'FORBIDDEN', 'شما فقط می‌توانید برای مسئولیت مدیریتی خودتان جانشین تعیین کنید');
  }
  const x = await readJson(c.request);
  if (typeof x.enabled !== 'boolean') throw err(400, 'INVALID_INPUT', 'وضعیت جانشینی نامعتبر است');

  if (!x.enabled) {
    await c.db.prepare(
      'UPDATE manager_delegations SET enabled=0,updated_at=CURRENT_TIMESTAMP WHERE delegator_user_id=? AND delegator_role=?'
    ).bind(c.user.id, role).run();
    await audit(c.db, c.user.id, 'delegation.disable', 'delegation', role, { role });
    return reply({ ok: true, enabled: false });
  }

  const delegateId = typeof x.delegateId === 'string' ? x.delegateId.trim() : '';
  if (!delegateId || delegateId === c.user.id) throw err(400, 'INVALID_DELEGATE', 'یک جانشین از میان مدیران ساختمان انتخاب کنید');
  const target = await c.db.prepare(
    `SELECT u.id FROM users u
     WHERE u.id=? AND u.active=1
       AND EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id=u.id
                   AND r.role IN ('chair','finance','board','executive'))`
  ).bind(delegateId).first();
  if (!target) throw err(400, 'INVALID_DELEGATE', 'جانشین باید یک مدیر فعال ساختمان باشد');

  await c.db.prepare(
    `INSERT INTO manager_delegations(delegator_user_id,delegator_role,delegate_user_id,enabled)
     VALUES(?,?,?,1)
     ON CONFLICT(delegator_user_id,delegator_role) DO UPDATE SET
       delegate_user_id=excluded.delegate_user_id,enabled=1,updated_at=CURRENT_TIMESTAMP`
  ).bind(c.user.id, role, delegateId).run();
  await audit(c.db, c.user.id, 'delegation.enable', 'delegation', role, { role, delegateId });
  return reply({ ok: true, enabled: true, delegateId });
});

// نقطه‌ی ورود Worker: مسیریابی، احراز هویت، CSRF و کنترل دسترسی
import { match } from './router.js';
import { ApiError, err, reply, audit } from './lib.js';
import { can, canAny, PERMISSION_OWNER } from './perms.js';
import { authenticate } from './auth.js';
import './admin.js';
import './finance.js';
import './expense_requests.js';
import './backups.js';
import './delegation.js';
import './content.js';
import './registration.js';
import { runReminders } from './reminders.js';

const ALLOWED_WHILE_FORCED = ['/api/me', '/api/password', '/api/logout'];

async function handle(request, env, url) {
  if (url.pathname === '/api/health') return reply({ ok: true, app: 'nika' });
  // وضعیت پیکربندی فقط پیش از راه‌اندازی اولیه نمایش داده می‌شود؛ بعد از آن اطلاعاتی درباره‌ی Secretها فاش نمی‌شود.
  if (url.pathname === '/api/config-check') {
    let initialized = false;
    try { initialized = !!env.DB && (await env.DB.prepare('SELECT COUNT(*) n FROM users').first()).n > 0; } catch {}
    if (initialized) return reply({ ok: true, initialized: true });
    return reply({ db: !!env.DB, jwt: typeof env.JWT_SECRET === 'string' && env.JWT_SECRET.length >= 32, bootstrap: typeof env.BOOTSTRAP_KEY === 'string' && env.BOOTSTRAP_KEY.length > 0, initialized: false });
  }
  if (!env.DB) throw err(503, 'SERVER_NOT_CONFIGURED', 'پایگاه داده هنوز پیکربندی نشده است');
  const { route, params, pathOnly } = match(request.method, url.pathname);
  if (!route) throw pathOnly ? err(405, 'METHOD_NOT_ALLOWED', 'متد مجاز نیست') : err(404, 'NOT_FOUND', 'مسیر پیدا نشد');
  // مسیرهای عمومی مانند فرم گردآوری اطلاعات به نشست و JWT نیاز ندارند.
  // مسیرهای خصوصی همچنان بدون Secret معتبر اجرا نمی‌شوند.
  if (!route.opts.public && !env.JWT_SECRET) throw err(503, 'SERVER_NOT_CONFIGURED', 'سرور هنوز پیکربندی نشده است');

  const mutating = !['GET', 'HEAD'].includes(request.method);
  const origin = request.headers.get('Origin');
  if (mutating && origin && origin !== url.origin) throw err(403, 'BAD_ORIGIN', 'درخواست از مبدأ نامعتبر');

  const c = { request, env, db: env.DB, url, params, now: Math.floor(Date.now() / 1000), user: null };
  let ownerRoles = [];
  if (!route.opts.public) {
    if (mutating && request.headers.get('X-Nika-Client') !== '1') throw err(403, 'BAD_ORIGIN', 'درخواست نامعتبر');
    c.user = await authenticate(c);
    if (!c.user) throw err(401, 'UNAUTHENTICATED', 'لطفاً وارد شوید');
    if (c.user.must_change_password && !ALLOWED_WHILE_FORCED.includes(url.pathname)) throw err(403, 'PASSWORD_CHANGE_REQUIRED', 'ابتدا رمز عبور خود را تغییر دهید');
    const { perm, any } = route.opts;
    if ((perm && !can(c.user, perm)) || (any && !canAny(c.user, any))) throw err(403, 'FORBIDDEN', 'دسترسی کافی ندارید');

    // اگر انجام‌دهنده مسئول اصلی این مجوز نباشد، ثبت دلیل پیش از عملیات الزامی است.
    const ownerRole = mutating && perm ? PERMISSION_OWNER[perm] : null;
    ownerRoles = Array.isArray(ownerRole) ? ownerRole : (ownerRole ? [ownerRole] : []);
    if (ownerRoles.length && !ownerRoles.some(role => c.user.roles.includes(role))) {
      let body = {};
      try { body = await request.clone().json(); } catch {}
      const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
      if (!reason) throw err(400, 'OVERRIDE_REASON_REQUIRED', 'برای انجام این عملیات خارج از مسئولیت خود، ثبت دلیل الزامی است');
      if (reason.length > 500) throw err(400, 'INVALID_REASON', 'شرح دلیل حداکثر ۵۰۰ نویسه باشد');
      c.overrideReason = reason;
      c.overrideRole = ownerRoles.join(',');
      c.overridePermission = perm;
    }
  }
  const response = await route.handler(c);
  if (c.overrideReason) {
    const delegatedOwner = ownerRoles.find(role => c.user.delegatedRoles?.includes(role));
    const actorRole = delegatedOwner ? `جانشین ${delegatedOwner}` : (c.user.roles[0] || 'manager');
    await audit(c.db, c.user.id, 'manager.override_action', 'permission', url.pathname, {
      permission: c.overridePermission, responsibleRole: c.overrideRole
    }, { actorRole, isDelegate: true, reason: c.overrideReason });
  }
  return response;
}

export default {
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(runReminders(env).catch(e => console.error('finance reminders failed', e)));
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    try {
      return await handle(request, env, url);
    } catch (e) {
      if (e instanceof ApiError) return reply({ error: e.code, message: e.message }, e.status);
      console.error(e);
      return reply({ error: 'SERVER_ERROR', message: 'خطای داخلی سرور' }, 500);
    }
  }
};

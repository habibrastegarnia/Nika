// نقطه‌ی ورود Worker: مسیریابی، احراز هویت، CSRF و کنترل دسترسی
import { match } from './router.js';
import { ApiError, err, reply } from './lib.js';
import { can, canAny } from './perms.js';
import { authenticate } from './auth.js';
import './admin.js';
import './finance.js';
import './delegation.js';
import './content.js';
import { runReminders } from './reminders.js';

const ALLOWED_WHILE_FORCED = ['/api/me', '/api/password', '/api/logout'];

async function handle(request, env, url) {
  if (url.pathname === '/api/health') return reply({ ok: true, app: 'nika' });
  if (url.pathname === '/api/config-check') return reply({ db: !!env.DB, jwt: typeof env.JWT_SECRET === 'string' && env.JWT_SECRET.length > 0, bootstrap: typeof env.BOOTSTRAP_KEY === 'string' && env.BOOTSTRAP_KEY.length > 0, test: env.TEST_DB === 'nika-test' });
  if (!env.DB || !env.JWT_SECRET) throw err(503, 'SERVER_NOT_CONFIGURED', 'سرور هنوز پیکربندی نشده است');
  const { route, params, pathOnly } = match(request.method, url.pathname);
  if (!route) throw pathOnly ? err(405, 'METHOD_NOT_ALLOWED', 'متد مجاز نیست') : err(404, 'NOT_FOUND', 'مسیر پیدا نشد');

  const mutating = !['GET', 'HEAD'].includes(request.method);
  const origin = request.headers.get('Origin');
  if (mutating && origin && origin !== url.origin) throw err(403, 'BAD_ORIGIN', 'درخواست از مبدأ نامعتبر');

  const c = { request, env, db: env.DB, url, params, now: Math.floor(Date.now() / 1000), user: null };
  if (!route.opts.public) {
    if (mutating && request.headers.get('X-Nika-Client') !== '1') throw err(403, 'BAD_ORIGIN', 'درخواست نامعتبر');
    c.user = await authenticate(c);
    if (!c.user) throw err(401, 'UNAUTHENTICATED', 'لطفاً وارد شوید');
    if (c.user.must_change_password && !ALLOWED_WHILE_FORCED.includes(url.pathname)) throw err(403, 'PASSWORD_CHANGE_REQUIRED', 'ابتدا رمز عبور خود را تغییر دهید');
    const { perm, any } = route.opts;
    if ((perm && !can(c.user, perm)) || (any && !canAny(c.user, any))) throw err(403, 'FORBIDDEN', 'دسترسی کافی ندارید');
  }
  return route.handler(c);
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

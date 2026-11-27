import { S } from './state.js';
// ارتباط با API؛ نشست در کوکی HttpOnly نگه‌داری می‌شود (توکن هرگز در دسترس جاوااسکریپت نیست)
const hooks = { authLost: () => {}, forcePassword: () => {} };
export const setHooks = h => Object.assign(hooks, h);

export async function api(path, { method = 'GET', body } = {}) {
  let r;
  try {
    r = await fetch('/api' + path, {
      method, credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-Nika-Client': '1', 'X-Nika-Workspace': (S.workspace || 'resident') },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch { throw Object.assign(new Error('ارتباط با سرور برقرار نشد؛ اینترنت را بررسی کنید'), { code: 'NETWORK' }); }
  let d = {};
  try { d = await r.json(); } catch {}
  if (!r.ok) {
    const e = Object.assign(new Error(d.message || 'خطا در ارتباط با سرور'), { code: d.error, status: r.status });
    if (r.status === 401 && !['/login', '/me'].includes(path)) hooks.authLost();
    if (d.error === 'PASSWORD_CHANGE_REQUIRED') hooks.forcePassword();
    throw e;
  }
  return d;
}

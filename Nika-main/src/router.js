export const routes = [];
export function R(method, path, opts, handler) {
  if (typeof opts === 'function') { handler = opts; opts = {}; }
  const keys = [];
  const re = new RegExp('^' + path.replace(/:([a-zA-Z]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  routes.push({ method, re, keys, opts, handler });
}
export function match(method, pathname) {
  let pathOnly = false;
  for (const r of routes) {
    const m = r.re.exec(pathname);
    if (!m) continue;
    if (r.method !== method) { pathOnly = true; continue; }
    const params = {};
    r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
    return { route: r, params };
  }
  return { route: null, pathOnly };
}

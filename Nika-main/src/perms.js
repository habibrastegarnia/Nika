// نقش‌ها و مجوزها. کنترل دسترسی همیشه سمت سرور انجام می‌شود.
export const ROLES = ['owner', 'resident', 'executive', 'finance', 'board', 'chair', 'building_admin'];
export const EXTRA_ROLES = ['executive', 'finance', 'board', 'building_admin', 'chair'];
const BASE = ['notices.read', 'requests.create', 'messages.use', 'profile.write'];
export const ROLE_PERMS = {
  owner: ['finance.owner.read', 'finance.owner.pay'],
  resident: ['finance.monthly.read', 'finance.monthly.pay'],
  executive: ['expenses.create', 'requests.manage'],
  finance: ['finance.owner.read', 'finance.monthly.read', 'finance.approve', 'finance.charge', 'expenses.approve', 'finance.reports'],
  board: ['board.read', 'reports.read', 'resolutions.manage'],
  building_admin: ['users.manage', 'roles.assign', 'notices.manage', 'messages.manage', 'units.manage', 'requests.manage', 'expenses.create', 'content.manage', 'resolutions.manage'],
  chair: ['*']
};
export function userPerms(roles) {
  const s = new Set(BASE);
  for (const r of roles) for (const p of ROLE_PERMS[r] || []) s.add(p);
  return [...s];
}
export const can = (user, perm) => !!user && (user.perms.includes('*') || user.perms.includes(perm));
export const canAny = (user, perms) => perms.some(p => can(user, p));
// نقش‌هایی که این کاربر اجازه دارد به دیگران بدهد یا از آن‌ها بگیرد
export function assignableExtraRoles(user) {
  if (can(user, '*')) return EXTRA_ROLES;
  return can(user, 'roles.assign') ? ['executive'] : [];
}
// آیا کاربر می‌تواند حسابی با این نقش‌ها را مدیریت کند؟ (مدیر ساختمان نمی‌تواند هیأت‌مدیره/مالی/رئیس را تغییر دهد)
export function canManageTarget(actor, targetRoles) {
  if (can(actor, '*')) return true;
  return targetRoles.every(r => ['owner', 'resident', 'executive'].includes(r));
}

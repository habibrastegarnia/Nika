// نقش‌ها و مجوزها. کنترل دسترسی همیشه سمت سرور انجام می‌شود.
export const ROLES = ['owner', 'resident', 'chair', 'finance', 'board', 'executive', 'system_admin', 'caretaker'];
export const EXTRA_ROLES = ['chair', 'finance', 'board', 'executive', 'system_admin', 'caretaker'];
const BASE = ['notices.read', 'requests.create', 'messages.use', 'profile.write'];
export const ROLE_PERMS = {
  owner: ['finance.owner.read', 'finance.owner.pay'],
  resident: ['finance.monthly.read', 'finance.monthly.pay'],
  executive: ['expenses.create', 'requests.manage'],
  finance: ['finance.owner.read', 'finance.monthly.read', 'finance.approve', 'finance.charge', 'expenses.approve', 'finance.reports'],
  board: ['board.read', 'reports.read', 'resolutions.manage'],
  system_admin: ['users.manage', 'roles.assign', 'notices.manage', 'messages.manage', 'units.manage', 'requests.manage', 'expenses.create', 'content.manage', 'resolutions.manage', 'finance.owner.read', 'finance.owner.pay', 'finance.monthly.read', 'finance.monthly.pay', 'finance.approve', 'finance.charge', 'expenses.approve', 'finance.reports', 'board.read', 'reports.read', 'audit.read', 'system.settings'],
  caretaker: [],
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
  if (user?.roles?.includes('system_admin')) return EXTRA_ROLES.filter(r => r !== 'chair');
  return can(user, 'roles.assign') ? ['executive'] : [];
}
// آیا کاربر می‌تواند حسابی با این نقش‌ها را مدیریت کند؟ (مدیر ساختمان نمی‌تواند هیأت‌مدیره/مالی/رئیس را تغییر دهد)
export function canManageTarget(actor, targetRoles) {
  if (can(actor, '*')) return true;
  if (actor?.roles?.includes('system_admin')) return !targetRoles.includes('chair');
  return targetRoles.every(r => ['owner', 'resident', 'executive'].includes(r));
}

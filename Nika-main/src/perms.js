// نقش‌ها و مجوزها. کنترل دسترسی همیشه سمت سرور انجام می‌شود.
export const ROLES = ['owner', 'resident', 'chair', 'finance', 'board', 'executive', 'system_admin', 'caretaker'];
export const EXTRA_ROLES = ['chair', 'finance', 'board', 'executive', 'system_admin', 'caretaker'];

const BASE = ['notices.read', 'requests.create', 'messages.use', 'profile.write'];
export const ROLE_PERMS = {
  owner: ['finance.owner.read', 'finance.owner.pay'],
  resident: ['finance.monthly.read', 'finance.monthly.pay'],

  // مدیر اجرایی: مدیریت اطلاعات کاربران بدون اختیار تغییر نقش‌ها،
  // مشاهده اطلاعات مالی و واحدها، ثبت هزینه و مدیریت رویدادهای تقویم.
  executive: ['users.read', 'users.manage', 'units.read', 'finance.reports', 'expenses.create', 'requests.manage', 'events.manage'],

  // مدیر مالی: مشاهده کاربران و واحدها، رسیدگی مالی و گزارش‌گیری؛ بدون تغییر تنظیمات شارژ.
  finance: ['users.read', 'units.read', 'finance.owner.read', 'finance.monthly.read', 'finance.approve', 'expenses.approve', 'finance.reports'],

  // عضو هیئت‌مدیره فقط مشاهده‌گر است.
  board: ['units.read', 'finance.reports', 'reports.read'],

  // مدیر سامانه فقط اختیارات فنی دارد و وارد عملیات مدیریتی ساختمان نمی‌شود.
  system_admin: ['users.read', 'users.manage', 'system.settings', 'system.data.manage', 'audit.read'],

  caretaker: [],

  // رئیس هیئت‌مدیره بالاترین اختیار مدیریتی ساختمان را دارد.
  // مجوزهای فنیِ اختصاصی مدیر سامانه در این wildcard قرار نمی‌گیرند.
  chair: ['*']
};

export function userPerms(roles) {
  const s = new Set(BASE);
  // مدیر سامانه‌ای که نقش ساکن/مالک ندارد، مجوزهای عمومی ساختمان را نمی‌گیرد.
  if (roles.includes('system_admin') && !roles.some(r => ['owner', 'resident', 'chair'].includes(r))) {
    for (const p of ['notices.read', 'requests.create', 'messages.use']) s.delete(p);
  }
  for (const r of roles) for (const p of ROLE_PERMS[r] || []) s.add(p);
  return [...s];
}

export const can = (user, perm) => !!user && (user.perms.includes('*') || user.perms.includes(perm));
export const canAny = (user, perms) => perms.some(p => can(user, p));

// فقط رئیس هیئت‌مدیره می‌تواند نقش‌ها و مسئولیت‌های مدیریتی را واگذار کند.
export function assignableExtraRoles(user) {
  return can(user, 'roles.assign') ? EXTRA_ROLES : [];
}

// مدیران دارای مجوز مدیریت کاربران می‌توانند اطلاعات حساب‌ها را مدیریت کنند؛
// اما حساب رئیس هیئت‌مدیره و نقش‌های مدیریتی فقط با اختیار رئیس قابل تغییر است.
export function canManageTarget(actor, targetRoles) {
  if (!can(actor, 'users.manage')) return false;
  return !targetRoles.includes('chair') || can(actor, 'roles.assign');
}

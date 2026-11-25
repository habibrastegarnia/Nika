// نقش‌ها و مجوزها. کنترل دسترسی همیشه سمت سرور انجام می‌شود.
export const ROLES = ['owner', 'resident', 'chair', 'finance', 'board', 'executive', 'system_admin', 'caretaker'];
export const EXTRA_ROLES = ['chair', 'finance', 'board', 'executive', 'system_admin', 'caretaker'];

const BASE = ['notices.read', 'requests.create', 'messages.use', 'profile.write'];
export const ROLE_PERMS = {
  owner: ['finance.owner.read', 'finance.owner.pay'],
  resident: ['finance.monthly.read', 'finance.monthly.pay'],

  // مدیر اجرایی: مدیریت حساب کاربران، مشاهده امور مالی و واحدها،
  // ثبت/پیگیری امور هزینه و مدیریت رویدادهای تقویم.
  executive: ['users.read', 'users.manage', 'users.delete', 'units.read', 'finance.reports', 'expenses.create', 'requests.manage', 'events.manage', 'audit.read'],

  // مدیر مالی: مشاهده کاربران و واحدها، رسیدگی به پرداخت‌ها و گزارش‌گیری؛ بدون تغییر تنظیمات شارژ.
  finance: ['users.read', 'units.read', 'finance.owner.read', 'finance.monthly.read', 'finance.approve', 'expenses.approve', 'finance.reports', 'audit.read'],

  // عضو هیئت‌مدیره فقط مشاهده‌گر است.
  board: ['units.read', 'finance.reports', 'reports.read', 'audit.read'],

  // مدیر سامانه فقط اختیارات فنی و مدیریت حساب‌ها را دارد؛ نه عملیات ساختمان و نه تعیین نقش.
  system_admin: ['users.read', 'users.manage', 'users.delete', 'system.settings', 'system.data.manage', 'backup.manage'],

  caretaker: [],

  // اختیارات مدیریتی رئیس به‌صورت صریح تعریف شده‌اند تا مجوزهای فنی مدیر سامانه منتقل نشوند.
  chair: [
    'users.read', 'users.manage', 'users.delete', 'roles.assign',
    'units.read', 'units.manage',
    'finance.settings', 'finance.charge', 'finance.approve', 'expenses.create', 'expenses.approve', 'expenses.finalize',
    'finance.owner.read', 'finance.monthly.read', 'finance.reports',
    'requests.manage', 'messages.manage', 'notices.manage',
    'rules.manage', 'resolutions.manage', 'events.manage', 'documents.manage',
    'reports.read', 'audit.read', 'backup.manage'
  ]
};

// اختیاراتی که با جانشینی واگذار می‌شوند. جانشین رئیس فقط مشاهده و تأیید دارد.
export const DELEGATE_PERMS = {
  chair: [
    'users.read', 'units.read', 'finance.owner.read', 'finance.monthly.read',
    'finance.reports', 'finance.approve', 'expenses.approve', 'expenses.finalize',
    'reports.read', 'audit.read', 'rules.read', 'resolutions.read', 'events.read'
  ],
  finance: ROLE_PERMS.finance,
  executive: ROLE_PERMS.executive,
  board: ROLE_PERMS.board
};
export function delegatedPerms(roles) {
  return [...new Set(roles.flatMap(role => DELEGATE_PERMS[role] || []))];
}

// مسئول اصلی هر عملیات برای الزام ثبت دلیل در زمان اقدام خارج از مسئولیت
export const PERMISSION_OWNER = {
  'users.manage': ['executive', 'system_admin'],
  'users.delete': ['executive', 'system_admin'],
  'finance.approve': 'finance',
  'expenses.approve': 'finance',
  'expenses.finalize': 'chair',
  'expenses.create': 'executive',
  'events.manage': 'executive',
  'requests.manage': 'executive',
  'messages.manage': 'chair',
  'notices.manage': 'chair',
  'units.manage': 'chair',
  'finance.charge': 'chair',
  'finance.settings': 'chair',
  'roles.assign': 'chair',
  'rules.manage': 'chair',
  'resolutions.manage': 'chair',
  'documents.manage': 'chair'
};

export function userPerms(roles) {
  const s = new Set(BASE);
  // مدیر سامانه‌ای که نقش ساکن/مالک ندارد، مجوزهای عمومی ساختمان را نمی‌گیرد.
  if (roles.includes('system_admin') && !roles.some(r => ['owner', 'resident'].includes(r))) {
    for (const p of ['notices.read', 'requests.create', 'messages.use']) s.delete(p);
  }
  for (const r of roles) for (const p of ROLE_PERMS[r] || []) s.add(p);
  return [...s];
}

export const can = (user, perm) => !!user && user.perms.includes(perm);
export const canAny = (user, perms) => perms.some(p => can(user, p));

// فقط رئیس هیئت‌مدیره می‌تواند نقش‌ها و مسئولیت‌های مدیریتی را واگذار کند.
export function assignableExtraRoles(user) {
  return can(user, 'roles.assign') ? EXTRA_ROLES : [];
}

// مدیران دارای مجوز مدیریت کاربران می‌توانند اطلاعات حساب‌ها را مدیریت کنند؛
// حساب رئیس هیئت‌مدیره فقط توسط خود رئیس قابل مدیریت است.
export function canManageTarget(actor, targetRoles) {
  if (!can(actor, 'users.manage')) return false;
  return !targetRoles.includes('chair') || can(actor, 'roles.assign');
}

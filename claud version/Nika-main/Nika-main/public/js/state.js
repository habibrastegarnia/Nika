export const S = { user: null, fund: 'monthly', summary: { unreadMessages: 0, pendingApprovals: 0, newRequests: 0 } };
export const can = p => !!S.user && (S.user.perms.includes('*') || S.user.perms.includes(p));
export const canAny = ps => ps.some(can);
export const ADMIN_PERMS = ['users.manage', 'units.manage', 'finance.charge', 'finance.approve', 'expenses.approve', 'expenses.create', 'finance.reports', 'requests.manage', 'messages.manage', 'notices.manage', 'content.manage', 'resolutions.manage', 'audit.read'];
export const isManager = () => canAny(ADMIN_PERMS);
export const readableFunds = () => ['monthly', 'owner'].filter(f => can(`finance.${f}.read`));
export const dashFunds = () => ['monthly', 'owner'].filter(f => can(`finance.${f}.read`) || canAny(['reports.read', 'finance.reports']));

// راه‌اندازی برنامه: ورود، تغییر رمز اجباری، ناوبری اصلی، اسلایدر خانه
import { api, setHooks } from './api.js';
import { S, can, canAny, isManager } from './state.js';
import { $, $, normDigits, fa } from './util.js';
import { iconMarkup, applyIcons } from './icons.js';
import { toast, initModal, initRouter, open, showHome, resetRouter, setNav } from './ui.js';
import * as P from './pages.js?v=6';
import { showAdmin, hideAdmin, showResidentMode, adminAvailable } from './admin.js?v=18';

let managerMode = false;
const show = id => { for (const s of ['#nikaGate', '#nikaForce']) $(s).classList.toggle('nika-hide', s !== id); $('.phone').classList.toggle('nika-hide', id !== '#app'); $('#nikaAdmin').classList.add('nika-hide'); };

// ---------- ورود ----------
function initGate() {
  $('#loginForm').onsubmit = async e => {
    e.preventDefault();
    const err = $('#loginError'), btn = $('#nikaLogin'); err.textContent = ''; btn.disabled = true;
    try {
      const r = await api('/login', { method: 'POST', body: { identifier: $('#nikaIdentifier').value.trim(), password: $('#nikaPassword').value } });
      $('#nikaPassword').value = ''; await enter(r.user);
    } catch (e2) { err.textContent = e2.message; } finally { btn.disabled = false; }
  };
  $('#forceForm').onsubmit = async e => {
    e.preventDefault(); const err = $('#forceError'); err.textContent = '';
    const a = $('#fpNew').value, b = $('#fpNew2').value;
    if (a !== b) { err.textContent = 'تکرار رمز با رمز جدید یکسان نیست'; return; }
    try { const r = await api('/password', { method: 'POST', body: { newPassword: a } }); $('#fpNew').value = $('#fpNew2').value = ''; toast('رمز عبور ذخیره شد'); await enter(r.user); }
    catch (e2) { err.textContent = e2.message; }
  };
  $('#forceLogout').onclick = logout;
}
function forcePassword() { show('#nikaForce'); }

async function enter(user) {
  S.user = user;
  if (user.must_change_password) return forcePassword();
  managerMode = false; show('#app'); resetRouter(); showHome(); setupNav();
  await P.loadHome(); P.refreshSummary();
}
async function logout() {
  try { await api('/logout', { method: 'POST' }); } catch {}
  S.user = null; resetRouter(); show('#nikaGate'); $('#nikaIdentifier')?.focus();
}

// ---------- ناوبری ----------
function setupNav() {
  const nav = $('.bottom-nav');
  const hasAdminWorkspace = isManager() && adminAvailable();
  const workspaceToggle = $('#workspaceToggle');
  workspaceToggle.classList.toggle('nika-hide', !hasAdminWorkspace);
  workspaceToggle.classList.remove('is-admin');
  workspaceToggle.onclick = () => {
    managerMode = !managerMode;
    if (managerMode) {
      showHome();
      $('#pageView').classList.add('nika-dashboard-hidden');
      showAdmin();
    } else {
      showResidentMode();
      $('#pageView').classList.remove('nika-dashboard-hidden');
      showHome();
    }
  };
  const shortcutHost = $('.categories');
  $$('.category[data-admin-tab]', shortcutHost).forEach(el => el.remove());
  const adminShortcuts = [
    ['settings', 'تنظیمات', canAny(['finance.settings.read', 'finance.settings']), 'sliders-horizontal'],
    ['finance', 'مالی', canAny(['finance.approve', 'expenses.approve', 'expenses.create', 'finance.reports']), 'chart-no-axes-combined'],
    ['users', 'کاربران', can('users.read'), 'users'],
    ['units', 'واحدها', can('units.read'), 'building-2'],
    ['reports', 'گزارش عملکرد', can('audit.read'), 'chart-no-axes-column-increasing'],
    ['archive', 'پشتیبان‌گیری', can('backup.manage'), 'database-backup']
  ];
  for (const [key, label, allowed, iconName] of adminShortcuts) {
    if (!allowed) continue;
    const b = document.createElement('button');
    b.className = 'category nika-manager-shortcut nika-hide'; b.dataset.adminTab = key;
    b.innerHTML = '<span class="cat-icon">' + iconMarkup(iconName) + '</span><span>' + label + '</span>';
    b.onclick = () => showAdmin(key);
    shortcutHost.appendChild(b);
  }
  const shortcutByKey = new Map();
  $$('.category[data-admin-tab]', shortcutHost).forEach(b => shortcutByKey.set(b.dataset.adminTab, b));
  $$('.category[data-menu]', shortcutHost).forEach(b => shortcutByKey.set(b.dataset.menu, b));
  const order = [
    ...(canAny(['finance.settings.read', 'finance.settings']) ? ['settings'] : []),
    ...(canAny(['finance.approve', 'expenses.approve', 'expenses.create', 'finance.reports']) ? ['finance'] : []),
    ...(can('users.read') ? ['users'] : []),
    ...(can('units.read') ? ['units'] : []),
    ...(can('audit.read') ? ['reports'] : []),
    ...(can('backup.manage') ? ['archive'] : []),
  ];
  order.forEach(key => { const b = shortcutByKey.get(key); if (b) shortcutHost.appendChild(b); });
  $('#admNavBtn')?.remove();
  nav.style.gridTemplateColumns = '';
}
function initNav() {
  $$('.nav-item').forEach(b => { if (b.id === 'admNavBtn') return; b.onclick = () => {
    const n = b.dataset.nav;
    if (managerMode) hideAdmin();
    if (n === 'خانه') { showHome(); P.loadHome(); }
    else if (n === 'حساب من') open(P.profilePage, { root: true });
    else if (n === 'مالی') open(() => P.financePage(), { root: true });
    else if (n === 'پیام‌ها') open(() => P.messagesPage(), { root: true });
  }; });
  $('#headerLogout').onclick = logout;
  $$('.category[data-menu]').forEach(b => b.onclick = () => {
    if (managerMode) { hideAdmin(); $('#pageView').classList.remove('nika-dashboard-hidden'); }
    const m = b.dataset.menu;
    open({ rules: P.rulesPage, requests: P.requestsPage, calendar: () => P.calendarPage(), resolutions: P.resolutionsPage }[m], { root: true });
  });
  $('#boardAll').onclick = $('#noticeAll').onclick = $('#noticeCard').onclick = () => open(P.boardPage, { root: true });
  $('#noticeCard').onkeydown = e => { if (e.key === 'Enter') open(P.boardPage, { root: true }); };
  $('#expMonth').onchange = e => P.loadDashboard('exp', e.target.value).catch(x => toast(x.message));
  $('#finMonth').onchange = e => P.loadDashboard('fin', e.target.value).catch(x => toast(x.message));
  document.addEventListener('nika:logout', logout);
  document.addEventListener('nika:admin', e => showAdmin(e.detail));

}
function initCarousel() {
  const track = $('#track'), dots = $$('.slide-dot'); let i = 0, x0 = null;
  const go = n => { i = (n + 3) % 3; track.style.transform = `translate3d(${i * 100}%,0,0)`; dots.forEach((d, j) => d.classList.toggle('active', j === i)); };
  $('#next').onclick = () => go(i + 1); $('#prev').onclick = () => go(i - 1); dots.forEach(d => d.onclick = () => go(+d.dataset.index));
  const c = $('#carousel');
  c.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
  c.addEventListener('touchend', e => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 40) go(i + (dx > 0 ? 1 : -1)); x0 = null; });
}

// ---------- شروع ----------
function applySavedTheme() {
  let theme = 'dark';
  try { if (localStorage.getItem('nika-theme') === 'light') theme = 'light'; } catch {}
  document.documentElement.setAttribute('data-theme', theme);
}
async function boot() {
  applySavedTheme();
  applyIcons(document);
  initModal(); initRouter(); initGate(); initNav(); initCarousel();
  setHooks({
    authLost: () => { if (S.user) { S.user = null; resetRouter(); show('#nikaGate'); $('#loginError').textContent = 'نشست شما پایان یافت؛ دوباره وارد شوید.'; } },
    forcePassword
  });
  try { const { user } = await api('/me'); await enter(user); }
  catch { show('#nikaGate'); }
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
}
boot();

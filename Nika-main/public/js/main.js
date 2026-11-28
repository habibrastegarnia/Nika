// راه‌اندازی برنامه: ورود، تغییر رمز اجباری، ناوبری اصلی، اسلایدر خانه
import { api, setHooks } from './api.js?v=2';
import { S, can, canAny, isManager } from './state.js';
import { $, $$, normDigits, fa } from './util.js';
import { iconMarkup, applyIcons } from './icons.js?v=3';
import { toast, initModal, initRouter, open, back, showHome, resetRouter, setNav } from './ui.js?v=3';
import * as P from './pages.js?v=25';
import { showAdmin, hideAdmin, showResidentMode, adminAvailable } from './admin.js?v=28';

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
  S.workspace = 'resident';
  if (user.must_change_password) return forcePassword();
  managerMode = false; show('#app'); resetRouter(); showHome(); setupNav();
  await P.loadHome(); P.refreshSummary();
}
async function logout() {
  try { await api('/logout', { method: 'POST' }); } catch {}
  S.user = null; S.workspace = 'resident'; resetRouter(); show('#nikaGate'); $('#nikaIdentifier')?.focus();
}

// ---------- ناوبری ----------
function setupNav() {
  const nav = $('.bottom-nav');
  const hasAdminWorkspace = isManager() && adminAvailable();
  const workspaceToggle = $('#workspaceToggle');
  workspaceToggle.classList.toggle('nika-hide', !hasAdminWorkspace);
  $('.header').classList.toggle('has-workspace', hasAdminWorkspace);
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
    b.onclick = () => open(() => showAdmin(key), { root: true });
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
    if (n === 'مالی' && managerMode) { open(() => showAdmin('finance'), { root: true }); return; }
    if (managerMode) hideAdmin();
    if (n === 'خانه') { showHome(); P.loadHome(); }
    else if (n === 'حساب من') open(P.profilePage, { root: true });
    else if (n === 'مالی') open(() => P.financePage(), { root: true });
    else if (n === 'پیام‌ها') open(() => P.messagesPage(), { root: true });
  }; });
  $('#headerLogout').onclick = logout;
  $('#hdrAvatar').onclick = () => open(P.profilePage, { root: true });
  $$('.category[data-menu]').forEach(b => b.onclick = () => {
    if (managerMode) { hideAdmin(); $('#pageView').classList.remove('nika-dashboard-hidden'); }
    const m = b.dataset.menu;
    open({ rules: P.rulesPage, requests: P.requestsPage, calendar: () => P.calendarPage(), resolutions: P.resolutionsPage }[m], { root: true });
  });
  $('#boardAll').onclick = () => open(P.boardPage, { root: true });
  $('#noticeAll').onclick = () => open(P.publicMessagesPage, { root: true });
  $('#finMonth').onchange = e => P.loadDashboard('fin', e.target.value).catch(x => toast(x.message));
  document.addEventListener('nika:logout', logout);
  document.addEventListener('nika:admin', e => open(() => showAdmin(e.detail), { root: true }));

}
function initCarousel() {
  const track = $('#track'), carousel = $('#carousel');
  const next = $('#next'), prev = $('#prev');
  if (!track || !carousel || !next || !prev) {
    console.warn('Nika: عناصر اسلایدر در HTML پیدا نشدند؛ راه‌اندازی اسلایدر رد شد.');
    return;
  }

  const originalSlides = Array.from(track.children).filter(el => el.classList.contains('slide'));
  const count = originalSlides.length;
  if (count < 2) return;

  // نقاط ناوبری همیشه از تعداد واقعی اسلایدها ساخته می‌شوند.
  const dotsHost = document.querySelector('.slide-dots');
  if (dotsHost) {
    dotsHost.replaceChildren();
    for (let i = 0; i < count; i++) {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'slide-dot';
      dot.dataset.index = String(i);
      dot.setAttribute('aria-label', `رفتن به اسلاید ${fa(i + 1)}`);
      dotsHost.appendChild(dot);
    }
  }
  const dots = Array.from(document.querySelectorAll('.slide-dot'));

  // دو نسخهٔ کمکی در ابتدا و انتها، برای حلقهٔ پیوسته بدون پرش
  const makeClone = slide => {
    const clone = slide.cloneNode(true);
    clone.setAttribute('aria-hidden', 'true');
    clone.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
    clone.removeAttribute('id');
    return clone;
  };
  track.insertBefore(makeClone(originalSlides[count - 1]), track.firstChild);
  track.appendChild(makeClone(originalSlides[0]));

  let index = 1;
  let pointerStart = null;
  let movedBySwipe = false;
  const setPosition = (animate = true) => {
    track.style.transition = animate ? '' : 'none';
    track.style.width = '100%';
    track.style.transform = `translate3d(${-index * carousel.clientWidth}px,0,0)`;
    const activeIndex = (index - 1 + count) % count;
    dots.forEach((dot, j) => {
      const active = j === activeIndex;
      dot.classList.toggle('active', active);
      dot.setAttribute('aria-current', active ? 'true' : 'false');
    });
  };
  const go = direction => {
    index += direction;
    setPosition(true);
  };

  setPosition(false);
  requestAnimationFrame(() => requestAnimationFrame(() => { track.style.transition = ''; }));

  track.addEventListener('transitionend', event => {
    if (event.target !== track || event.propertyName !== 'transform') return;
    if (index === 0) {
      index = count;
      setPosition(false);
    } else if (index === count + 1) {
      index = 1;
      setPosition(false);
    }
  });

  next.addEventListener('click', () => go(1));
  prev.addEventListener('click', () => go(-1));
  dots.forEach((dot, j) => dot.addEventListener('click', () => {
    index = j + 1;
    setPosition(true);
  }));

  carousel.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (event.target.closest('button, select, input, textarea, a')) return;
    pointerStart = { id: event.pointerId, x: event.clientX, y: event.clientY };
    movedBySwipe = false;
  });
  carousel.addEventListener('pointerup', event => {
    if (!pointerStart || event.pointerId !== pointerStart.id) return;
    const dx = event.clientX - pointerStart.x;
    const dy = event.clientY - pointerStart.y;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      // حرکت بصری اسلاید باید هم‌جهت با کشیدن انگشت باشد.
      go(dx < 0 ? 1 : -1);
      movedBySwipe = true;
    }
    pointerStart = null;
  });
  carousel.addEventListener('pointercancel', () => { pointerStart = null; });
  window.addEventListener('resize', () => setPosition(false));
  carousel.addEventListener('click', event => {
    if (!movedBySwipe) return;
    event.preventDefault();
    event.stopPropagation();
    movedBySwipe = false;
  }, true);
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

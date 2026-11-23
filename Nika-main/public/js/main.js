// راه‌اندازی برنامه: ورود، تغییر رمز اجباری، ناوبری اصلی، اسلایدر خانه
import { api, setHooks } from './api.js';
import { S, can, isManager } from './state.js';
import { $, $$, normDigits, fa } from './util.js';
import { toast, initModal, initRouter, open, showHome, resetRouter, setNav } from './ui.js';
import * as P from './pages.js';
import { showAdmin, hideAdmin, adminAvailable } from './admin.js';

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
  show('#app'); resetRouter(); showHome(); setupNav();
  await P.loadHome(); P.refreshSummary();
}
async function logout() {
  try { await api('/logout', { method: 'POST' }); } catch {}
  S.user = null; resetRouter(); show('#nikaGate'); $('#nikaPhone').focus();
}

// ---------- ناوبری ----------
function setupNav() {
  const nav = $('.bottom-nav');
  $('#admNavBtn')?.remove();
  if (isManager() && adminAvailable()) {
    nav.insertAdjacentHTML('beforeend', '<button class="nav-item" id="admNavBtn" data-nav="مدیریت"><svg viewBox="0 0 24 24"><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/></svg><span>مدیریت</span><i class="nav-badge" id="admBadge" style="display:none"></i></button>');
    nav.style.gridTemplateColumns = 'repeat(5,1fr)';
    $('#admNavBtn').onclick = () => showAdmin();
  } else nav.style.gridTemplateColumns = '';
}
function initNav() {
  $$('.nav-item').forEach(b => { if (b.id === 'admNavBtn') return; b.onclick = () => {
    const n = b.dataset.nav;
    if (n === 'خانه') { showHome(); P.loadHome(); }
    else if (n === 'حساب من') open(P.profilePage, { root: true });
    else if (n === 'مالی') open(() => P.financePage(), { root: true });
    else if (n === 'پیام‌ها') open(() => P.messagesPage(), { root: true });
  }; });
  $('#profileShortcut').onclick = logout;
  $$('.category').forEach(b => b.onclick = () => {
    const m = b.dataset.menu;
    open({ rules: P.rulesPage, requests: P.requestsPage, calendar: () => P.calendarPage(), resolutions: P.resolutionsPage }[m], { root: true });
  });
  $('#boardAll').onclick = $('#noticeAll').onclick = $('#noticeCard').onclick = () => open(P.boardPage, { root: true });
  $('#noticeCard').onkeydown = e => { if (e.key === 'Enter') open(P.boardPage, { root: true }); };
  $('#expMonth').onchange = e => P.loadDashboard('exp', e.target.value).catch(x => toast(x.message));
  $('#finMonth').onchange = e => P.loadDashboard('fin', e.target.value).catch(x => toast(x.message));
  document.addEventListener('nika:logout', logout);
  document.addEventListener('nika:admin', e => showAdmin(e.detail));
  $('#adminBack').onclick = hideAdmin; $('#adminExit').onclick = logout;
}
function initCarousel() {
  const track = $('#track'), dots = $$('.slide-dot'); let i = 0, x0 = null;
  const go = n => { i = (n + 3) % 3; track.style.transform = `translateX(${i * 100}%)`; dots.forEach((d, j) => d.classList.toggle('active', j === i)); };
  $('#next').onclick = () => go(i + 1); $('#prev').onclick = () => go(i - 1); dots.forEach(d => d.onclick = () => go(+d.dataset.index));
  const c = $('#carousel');
  c.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
  c.addEventListener('touchend', e => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 40) go(i + (dx > 0 ? 1 : -1)); x0 = null; });
}

// ---------- شروع ----------
async function boot() {
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

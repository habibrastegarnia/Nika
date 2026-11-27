// پنل مدیریت: کاربران، واحدها، مالی، درخواست‌ها، پیام‌ها، اطلاعیه‌ها، محتوا و ممیزی
import { api } from './api.js';
import { S, can, canAny } from './state.js';
import { html, raw, join, $, $$, fa, toman, fdate, fdt, parseAmount, periodLabel, curPeriod, normDigits, JM, monthStart, monthLen, jToday, FUND_FA, KIND_FA, TX_STATUS, REQ_STATUS, REQ_KIND, ROLE_FA, ACCOUNT_FA, chip } from './util.js';
import { toast, openModal, closeModal, ask, promptText, showSecret, fields, onSubmit } from './ui.js';
import { refreshSummary, loadLatestNotice } from './pages.js?v=15';
import { applyIcons, iconMarkup } from './icons.js?v=3';

const card = (title, body) => html`<div class="nika-admincard"><h3>${title}</h3>${body}</div>`;
const empty = t => html`<p>${t}</p>`;
let tab = 'users', sub = {};

const TABS = () => [
  ['settings', 'تنظیمات', canAny(['finance.settings.read', 'finance.settings'])],
  ['users', 'کاربران', can('users.read')],
  ['units', 'واحدها', can('units.read')],
  ['finance', 'مالی', canAny(['finance.settings', 'finance.approve', 'expenses.approve', 'expenses.create', 'finance.reports'])],
  ['reports', 'گزارش عملکرد', can('audit.read')],
  ['archive', 'پشتیبان‌گیری', can('backup.manage')],
  ['system', 'مدیریت سامانه', can('system.data.manage')],
].filter(t => t[2]);

let managerHome = false;
export function adminAvailable() { return TABS().length > 0; }
export function canSwitchWorkspace() { return !!S.user && (['owner', 'resident', 'both'].includes(S.user.account_type) || (Array.isArray(S.user.roles) && S.user.roles.some(r => ['owner', 'resident'].includes(r)))) && adminAvailable(); }

function updateWorkspaceToggle(manager) {
  const toggle = $('#workspaceToggle');
  toggle.classList.toggle('is-admin', manager);
  toggle.setAttribute('aria-label', manager ? 'نمایش امکانات مدیر' : 'نمایش امکانات ساکن');
  toggle.title = manager ? 'نمایش امکانات مدیر' : 'نمایش امکانات ساکن';
  toggle.querySelector('.workspace-label-left').textContent = 'ساکن';
  toggle.querySelector('.workspace-label-right').textContent = 'مدیر';
}
function showManagerShortcuts(show) {
  $('.phone').classList.toggle('is-manager-home', show);
  $('.categories').classList.toggle('is-manager', show);
  const roles = [...(S.user?.roles || []), ...(S.user?.delegatedRoles || [])];
  const technicalOnly = roles.includes('system_admin') && !roles.some(r => ['chair', 'finance', 'board', 'executive'].includes(r));
  document.querySelectorAll('.category[data-admin-tab]').forEach(el => el.classList.toggle('nika-hide', !show));
  document.querySelectorAll('.category[data-menu]').forEach(el => {
    const isManagerCalendar = el.dataset.menu === 'calendar' && can('events.manage');
    el.classList.toggle('nika-hide', show ? !isManagerCalendar : false);
  });
  $('#noticeHead')?.classList.toggle('nika-hide', show);
  $('#noticeCard')?.classList.toggle('nika-hide', show);
}
export function showAdmin(want) {
  managerHome = true;
  S.workspace = 'manager';
  updateWorkspaceToggle(true);
  showManagerShortcuts(true);
  if (!want) {
    $('#nikaAdmin').classList.add('nika-hide');
    $('.phone > .page-view').classList.add('nika-dashboard-hidden');
    $('.phone > .categories').classList.remove('nika-dashboard-hidden');
    $('.phone > .categories').style.display = '';
    showManagerShortcuts(true);
    return;
  }
  const tabs = TABS(); if (!tabs.some(t => t[0] === want)) return;
  tab = want;
  $('#nikaAdmin').classList.add('nika-hide');
  const box = $('.phone > .page-view');
  box.classList.remove('nika-dashboard-hidden');
  box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', 'مدیریت');
  box.classList.add('active');
  loadTab();
}
export function hideAdmin() {
  $('#nikaAdmin').classList.add('nika-hide');
  $('.phone > .carousel').classList.remove('nika-dashboard-hidden');
  $('.phone > .slide-controls').classList.remove('nika-dashboard-hidden');
  $('.phone > .categories').classList.remove('nika-dashboard-hidden');
  $('#noticeHead')?.classList.toggle('nika-hide', managerHome);
  $('#noticeCard')?.classList.toggle('nika-hide', managerHome);
  $('#noticeHead')?.classList.remove('nika-dashboard-hidden');
  $('#noticeCard')?.classList.remove('nika-dashboard-hidden');
  $('.phone > .page-view').classList.remove('active');
  $('.phone > .page-view').classList.add('nika-dashboard-hidden');
  showManagerShortcuts(managerHome);
  updateWorkspaceToggle(managerHome);
  if (!managerHome) { refreshSummary(); loadLatestNotice().catch(() => {}); }
}
export function showResidentMode() {
  managerHome = false;
  S.workspace = 'resident';
  hideAdmin();
}
async function loadTab() {
  const box = $('.phone > .page-view');
  box.innerHTML = '<div class="page-top"><div class="page-heading"><h2>در حال بارگذاری…</h2></div><button class="page-close" type="button" data-page-close aria-label="بستن پنجره"><span data-icon="x"></span></button></div>'; applyIcons(box);
  box.querySelector('[data-page-close]').onclick = () => history.back();
  try {
    const out = await RENDER[tab]();
    box.innerHTML = '<div class="page-top"><div class="page-heading"><h2>' + ({settings:'تنظیمات',users:'کاربران',units:'واحدها',finance:'مالی',reports:'گزارش عملکرد',archive:'پشتیبان‌گیری',system:'مدیریت سامانه'}[tab] || 'مدیریت') + '</h2></div><button class="page-close" type="button" data-page-close aria-label="بستن پنجره"><span data-icon="x"></span></button></div><div class="manager-page-content">' + String(out.html) + '</div>'; applyIcons(box);
    box.querySelector('[data-page-close]').onclick = () => history.back();
    out.bind && out.bind(box);
  } catch (e) { box.innerHTML = '<div class="page-top"><div class="page-heading"><h2>خطا</h2></div><button class="page-close" type="button" data-page-close aria-label="بستن پنجره"><span data-icon="x"></span></button></div>' + String(card('خطا', empty(e.message))); applyIcons(box); box.querySelector('[data-page-close]').onclick=() => history.back(); }
}
const reload = () => { closeModal(); return loadTab(); };
const act = (box, sel, fn) => $$(sel, box).forEach(b => b.onclick = () => fn(b).catch(e => toast(e.message)));

// ====================== کاربران ======================
const EXTRA_OPTS = ['chair', 'finance', 'board', 'executive', 'system_admin', 'caretaker'].map(r => [r, ROLE_FA[r]]);
const UNIT_OPTIONS = Array.from({ length: 8 }, (_, floor) => Array.from({ length: 4 }, (_, n) => { const unit = `${floor + 1}0${n + 1}`; return [unit, unit]; })).flat();
async function usersTab() {
  const { users, assignable } = await api('/admin/users'), opts = EXTRA_OPTS.filter(([r]) => assignable.includes(r));
  const canManageUsers = can('users.manage');
  const canAssignRoles = can('roles.assign');
  const createCard = canManageUsers ? card('حساب جدید', html`<form id="uNew" novalidate><div class="nika-user-unit-row"><div class="nika-user-unit-select">${fields([{ name: 'unit', label: 'انتخاب واحد', type: 'select', value: '101', options: UNIT_OPTIONS }], 'nika')}</div><div class="nika-user-unit-checks">${fields([{ name: 'owner', label: 'مالک', type: 'checkbox', value: false }, { name: 'resident', label: 'ساکن', type: 'checkbox', value: false }], 'nika')}</div></div>${fields([
      { name: 'name', label: 'نام و نام خانوادگی', required: true },
      { name: 'gender', label: 'جنسیت', type: 'select', value: 'unspecified', options: [['female','خانم'],['male','آقا'],['unspecified','تمایلی به اعلام ندارم']] },
      { name: 'phone', label: 'شماره تلفن همراه', required: true, inputmode: 'tel', dir: 'ltr' },
      { name: 'secondaryPhone', label: 'شماره تماس پشتیبان', inputmode: 'tel', dir: 'ltr', hint: 'اختیاری؛ برای تماس اضطراری یا مواقع عدم دسترسی به شماره اصلی.' },
      { name: 'contractStartDate', label: 'تاریخ شروع قرارداد (شمسی)', type: 'date', dateSeparator: '-', dir: 'ltr' },
      { name: 'contractEndDate', label: 'تاریخ پایان قرارداد (شمسی)', type: 'date', dateSeparator: '-', dir: 'ltr' },
      ...(opts.length ? [{ name: 'roles', label: 'نقش‌های انتخابی', type: 'checks', options: opts, value: [] }] : [])], 'nika')}
      <div class="nika-footnote">برای حساب مالک یا ساکن، گزینه مربوط را انتخاب کنید. تعیین نقش‌های مدیریتی فقط در اختیار رئیس هیئت‌مدیره است.</div>
      <div class="nika-actions"><button class="nika-primary" type="submit">ساخت حساب</button></div></form>`) : '';
  return {
    html: html`<div class="nika-admincard">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px">
        <h3 style="margin:0">فهرست کاربران</h3>
        <button type="button" id="uAdd" class="nika-secondary sm" ${canManageUsers ? '' : 'disabled'} style="display:inline-flex;align-items:center;gap:7px;opacity:${canManageUsers ? '1' : '.45'};cursor:${canManageUsers ? 'pointer' : 'not-allowed'}">
          <span style="color:#36C98F;display:inline-flex">${raw(iconMarkup('user-round-plus'))}</span><span>ثبت کاربر جدید</span>
        </button>
      </div>
      <input class="nika-input" id="uSearch" placeholder="جست‌وجوی نام، شماره یا واحد">
      <div class="nika-users" id="uList">${users.length ? users.map(userCard) : empty('کاربری ثبت نشده است.')}</div>
    </div>`,
    bind(box) {
      const add = $('#uAdd', box);
      if (add && canManageUsers) add.onclick = () => {
        const modal = openModal('ثبت کاربر جدید', createCard);
        const form = $('#uNew', modal);
        if (form) onSubmit(form, async d => {
          if (!d.owner && !d.resident) throw new Error('نوع حساب را مشخص کنید: مالک یا ساکن.');
          const accountType = d.owner && d.resident ? 'both' : (d.owner ? 'owner' : 'resident');
          const body = { unit: d.unit, name: d.name, gender: d.gender, phone: d.phone, secondaryPhone: d.secondaryPhone, contractStartDate: d.contractStartDate, contractEndDate: d.contractEndDate, accountType, roles: d.roles || [] };
          await api('/admin/users', { method: 'POST', body });
          closeModal(); toast('حساب ساخته شد؛ نام کاربری شماره واحد و رمز اولیه شماره موبایل ثبت‌شده است.'); reload();
        });
      };
      const search = $('#uSearch', box);
      if (search) search.oninput = e => { const q = normDigits(e.target.value).toLowerCase(); $$('#uList .nika-usercard', box).forEach(c => c.style.display = c.dataset.q.includes(q) ? '' : 'none'); };
      act(box, '[data-open-user]', async b => showUserDetails(users.find(u => u.id === b.dataset.openUser), opts));
    }
  };
}
const userCard = u => html`<button type="button" class="nika-usercard" data-open-user="${u.id}" data-q="${normDigits(`${u.name} ${u.phone} ${u.unit || ''}`).toLowerCase()}" style="width:100%;text-align:right;color:inherit;cursor:pointer;border:1px solid #ffffff10">
  <strong>${u.name} ${u.active ? '' : html`<span class="page-chip red">غیرفعال</span>`} ${u.must_change_password ? html`<span class="page-chip amber">تغییر رمز الزامی</span>` : ''}</strong>
  <small>${u.roles.includes('owner') && u.roles.includes('resident') ? 'مالک و ساکن' : ACCOUNT_FA[u.account_type]}${u.unit ? ' · واحد ' + u.unit : ''} · ${u.phone}</small>
  <span class="nika-rolechips">${u.roles.map(r => html`<span>${ROLE_FA[r] || r}</span>`)}</span>
</button>`;
function showUserDetails(u, opts) {
  if (!u) return;
  const privileged = u.roles.some(r => ['chair','finance','board','executive','system_admin'].includes(r));
  const canManageTarget = can('users.manage') && (can('roles.assign') || !privileged);
  const canReset = canManageTarget && u.id !== S.user.id && u.account_type !== 'staff' && !u.roles.includes('system_admin');
  const canDelete = can('users.delete') && can('roles.assign') && u.id !== S.user.id && !u.roles.includes('system_admin');
  const modal = openModal('اطلاعات کاربر', html`<div class="profile-panel">
    <div class="profile-cover"><div><strong>${u.name}</strong><small>${u.roles.map(r => ROLE_FA[r] || r).join('، ') || ACCOUNT_FA[u.account_type]}</small></div></div>
    <div class="profile-details">
      <div class="profile-detail"><small>شماره واحد</small><strong>${u.unit || '—'}</strong></div>
      <div class="profile-detail"><small>نوع حساب</small><strong>${u.roles.includes('owner') && u.roles.includes('resident') ? 'مالک و ساکن' : ACCOUNT_FA[u.account_type]}</strong></div>
      <div class="profile-detail"><small>شماره موبایل</small><strong>${u.phone || '—'}</strong></div>
      <div class="profile-detail"><small>شماره تماس پشتیبان</small><strong>${u.secondary_phone || '—'}</strong></div>
      <div class="profile-detail"><small>جنسیت</small><strong>${({female:'خانم',male:'آقا',unspecified:'اعلام نشده'})[u.gender] || '—'}</strong></div>
      <div class="profile-detail"><small>وضعیت حساب</small><strong>${u.active ? 'فعال' : 'غیرفعال'}</strong></div>
      <div class="profile-detail"><small>شروع قرارداد</small><strong>${u.contract_start_date || '—'}</strong></div>
      <div class="profile-detail"><small>پایان قرارداد</small><strong>${u.contract_end_date || '—'}</strong></div>
    </div>
  </div>
  <div class="profile-actions">
    <button type="button" class="page-row" data-profile-edit ${canManageTarget ? '' : 'disabled'} style="opacity:${canManageTarget ? '1' : '.42'};cursor:${canManageTarget ? 'pointer' : 'not-allowed'}">
      <span class="profile-action-icon" style="background:transparent;color:#65A9F5">${raw(iconMarkup('user-round-pen'))}</span><span class="page-row-main"><strong>ویرایش اطلاعات</strong><small>مشخصات و نقش‌های مجاز کاربر</small></span><span class="page-row-tail">›</span>
    </button>
    <button type="button" class="page-row" data-profile-reset ${canReset ? '' : 'disabled'} style="opacity:${canReset ? '1' : '.42'};cursor:${canReset ? 'pointer' : 'not-allowed'}">
      <span class="profile-action-icon" style="background:transparent;color:#D6A64A">${raw(iconMarkup('key-round'))}</span><span class="page-row-main"><strong>بازنشانی رمز عبور</strong><small>تعیین رمز جدید و بستن نشست‌های قبلی</small></span><span class="page-row-tail">›</span>
    </button>
    <button type="button" class="page-row" data-profile-delete disabled title="چرخه حذف سه‌روزه و بازیابی هنوز آماده نیست" style="opacity:${canDelete ? '.55' : '.35'};cursor:not-allowed">
      <span class="profile-action-icon" style="background:transparent;color:#E66B79">${raw(iconMarkup('user-round-x'))}</span><span class="page-row-main"><strong>حذف کاربر</strong><small>${canDelete ? 'پس از آماده‌شدن حذف سه‌روزه فعال می‌شود' : 'فقط رئیس هیأت‌مدیره مجاز خواهد بود'}</small></span><span class="page-row-tail">›</span>
    </button>
  </div>`);
  const edit = $('[data-profile-edit]', modal);
  if (edit && canManageTarget) edit.onclick = () => { closeModal(); editUser(u, opts); };
  const reset = $('[data-profile-reset]', modal);
  if (reset && canReset) reset.onclick = () => {
    closeModal();
    const resetModal = openModal('تعیین رمز جدید برای ' + u.name, html`<form class="nika-form" novalidate>${fields([
      { name: 'newPassword', label: 'رمز عبور جدید', type: 'password', required: true, dir: 'ltr', autocomplete: 'new-password' },
      { name: 'confirmPassword', label: 'تکرار رمز عبور جدید', type: 'password', required: true, dir: 'ltr', autocomplete: 'new-password' }
    ], 'nika')}<p class="nika-footnote">رمز باید حداقل ۸ کاراکتر داشته باشد، فقط عدد نباشد و شماره موبایل کاربر را در بر نگیرد. این رمز را پس از ثبت به خود کاربر تحویل دهید.</p><div class="nika-actions"><button class="nika-primary" type="submit">ثبت رمز جدید</button></div></form>`);
    onSubmit($('form', resetModal), async data => {
      if (data.newPassword !== data.confirmPassword) throw new Error('رمز جدید و تکرار آن یکسان نیستند.');
      await api('/admin/users/' + u.id + '/reset-password', { method: 'POST', body: { newPassword: data.newPassword, confirmPassword: data.confirmPassword } });
      closeModal(); toast('رمز جدید ثبت شد؛ نشست‌های قبلی کاربر بسته شدند. رمز را به خود کاربر تحویل دهید.'); reload();
    });
  };
}
function editUser(u, opts) {
  const baseOptions = u.account_type === 'staff' ? [] : [['owner', 'مالک'], ['resident', 'ساکن']].filter(([r]) => !u.roles.includes(r));
  const m = openModal('ویرایش حساب', html`<form class="nika-form" novalidate>${fields([
    { name: 'name', label: 'نام و نام خانوادگی', value: u.name, required: true }, { name: 'gender', label: 'جنسیت', type: 'select', value: u.gender || 'unspecified', options: [['female','خانم'],['male','آقا'],['unspecified','تمایلی به اعلام ندارم']] }, { name: 'phone', label: 'شماره تلفن همراه', value: u.phone, dir: 'ltr', inputmode: 'tel' }, { name: 'secondaryPhone', label: 'شماره تماس پشتیبان', value: u.secondary_phone || '', dir: 'ltr', inputmode: 'tel' },
    { name: 'contractStartDate', label: 'تاریخ شروع قرارداد (شمسی)', type: 'date', dateSeparator: '-', dir: 'ltr', value: u.contract_start_date || '' },
    { name: 'contractEndDate', label: 'تاریخ پایان قرارداد (شمسی)', type: 'date', dateSeparator: '-', dir: 'ltr', value: u.contract_end_date || '' },
    ...(baseOptions.length ? [{ name: 'addBaseRoles', label: 'افزودن نقش پایه به همین حساب', type: 'checks', options: baseOptions, value: [] }] : []),
    ...(opts.length ? [{ name: 'roles', label: 'نقش‌های مدیریتی', type: 'checks', options: opts, value: u.roles }] : []),
    { name: 'active', label: 'حساب فعال باشد', type: 'checkbox', value: u.active }], 'nika')}<div class="nika-actions"><button class="nika-primary" type="submit">ذخیره</button></div></form>`);
  onSubmit($('form', m), async d => {
    const body = { name: d.name, gender: d.gender, phone: d.phone, secondaryPhone: d.secondaryPhone, contractStartDate: d.contractStartDate, contractEndDate: d.contractEndDate };
    if (baseOptions.length && d.addBaseRoles?.length) body.addBaseRoles = d.addBaseRoles;
    if (opts.length) body.roles = d.roles; if (d.active !== u.active) body.active = d.active;
    if (!can('roles.assign') && !S.user.roles.includes('executive') && !(S.user.delegatedRoles || []).includes('executive')) { const reason = await promptText('ثبت دلیل انجام خارج از مسئولیت', 'چرا این اطلاعات را به‌جای مسئول اصلی مدیریت کاربران تغییر می‌دهید؟', 'ثبت دلیل'); if (!reason) return; body.reason = reason; }
    await api(`/admin/users/${u.id}`, { method: 'PATCH', body }); closeModal(); toast('ذخیره شد؛ تغییرات نقش اعمال شد.'); reload();
  });
}

// ====================== واحدها ======================
async function unitsTab() {
  const [{ units }, monthly, owner] = await Promise.all([
    api('/admin/units'), api('/finance/balances?fund=monthly'), api('/finance/balances?fund=owner')
  ]);
  const byNumber = Object.fromEntries(units.map(u => [String(u.unit_number), u]));
  const monthlyByNumber = Object.fromEntries(monthly.balances.map(x => [String(x.unit_number), x]));
  const ownerByNumber = Object.fromEntries(owner.balances.map(x => [String(x.unit_number), x]));
  const allUnits = Array.from({ length: 32 }, (_, i) => {
    const number = String(Math.floor(i / 4) + 1) + '0' + String(i % 4 + 1);
    const m = monthlyByNumber[number] || { charged: 0, settled: 0, balance: 0 };
    const o = ownerByNumber[number] || { charged: 0, settled: 0, balance: 0 };
    return { number, unit: byNumber[number] || null, monthly: m, owner: o, balance: Number(m.balance || 0) + Number(o.balance || 0) };
  });
  const statusOf = b => b > 0 ? 'debt' : b < 0 ? 'credit' : 'settled';
  const statusLabel = { debt: 'بدهکار', credit: 'بستانکار', settled: 'تسویه' };
  const unitTile = x => html`<button type="button" class="nika-building-unit ${statusOf(x.balance)}" data-unit-detail="${x.number}" aria-label="نمایش اطلاعات واحد ${x.number}"><span>${fa(x.number)}</span></button>`;
  const floors = Array.from({ length: 8 }, (_, i) => 8 - i).map(floor => {
    const row = allUnits.filter(x => x.number.startsWith(String(floor)));
    const left = row.filter(x => ['3','4'].includes(x.number.slice(-1)));
    const right = row.filter(x => ['1','2'].includes(x.number.slice(-1)));
    return html`<div class="nika-building-floor" aria-label="طبقه ${fa(floor)}">${unitTile(left[1])}${unitTile(left[0])}<div class="nika-building-core"><span>${fa(floor)}</span><i></i></div>${unitTile(right[0])}${unitTile(right[1])}</div>`;
  });
  return {
    html: html`<div class="nika-units-page" dir="rtl">
      <section class="nika-building-panel">
        <div class="nika-building-heading"><strong>نمای ساختمان نیکا</strong><span>برای مشاهده جزئیات مالی، واحد را انتخاب کنید</span></div>
        <div class="nika-building-legend"><span><i class="debt"></i>بدهکار</span><span><i class="settled"></i>تسویه</span><span><i class="credit"></i>بستانکار</span></div>
        <div class="nika-building-roof"></div><div class="nika-building-floors">${floors}</div>
        <div class="nika-building-ground"><span>ورودی ساختمان نیکا</span></div>
      </section>
    </div>`,
    bind(box) {
      act(box, '[data-unit-detail]', async b => {
        const x = allUnits.find(item => item.number === b.dataset.unitDetail), overall = x.balance, state = statusOf(overall);
        const amountLine = (label, value) => html`<div class="nika-unit-fin-row"><span>${label}</span><strong class="${value > 0 ? 'debt-text' : value < 0 ? 'credit-text' : 'settled-text'}">${value > 0 ? 'بدهی ' + toman(value) : value < 0 ? 'بستانکاری ' + toman(-value) : 'تسویه · ۰ تومان'}</strong></div>`;
        const content = html`<div class="nika-unit-detail" dir="rtl">
          <div class="nika-unit-detail-status ${state}"><span>وضعیت مالی واحد</span><strong>${statusLabel[state]}</strong></div>
          <div class="nika-unit-total ${state}"><small>مانده کل</small><strong>${overall > 0 ? 'بدهی ' + toman(overall) : overall < 0 ? 'بستانکاری ' + toman(-overall) : '۰ تومان · تسویه'}</strong></div>
          <div class="nika-unit-fin-section"><h4>جزئیات صندوق‌ها</h4>${amountLine('شارژ ماهیانه', Number(x.monthly.balance || 0))}${amountLine('شارژ مالکانه', Number(x.owner.balance || 0))}</div>
          <div class="nika-footnote">مبالغ بر اساس تراکنش‌های تأییدشده محاسبه شده‌اند.</div>
          <div class="row-actions"><button type="button" class="nika-secondary sm" id="showUnitTransactions">ریز سوابق مالی واحد</button></div>
        </div>`;
        const m = openModal('اطلاعات واحد ' + fa(x.number), content), historyButton = $('#showUnitTransactions', m);
        historyButton.onclick = async () => {
          historyButton.disabled = true; historyButton.textContent = 'در حال دریافت سوابق…';
          try {
            const [monthlyHistory, ownerHistory] = await Promise.all([
              api('/transactions?fund=monthly&scope=all&unit=' + encodeURIComponent(x.number) + '&limit=200'),
              api('/transactions?fund=owner&scope=all&unit=' + encodeURIComponent(x.number) + '&limit=200')
            ]);
            const history = [...monthlyHistory.transactions, ...ownerHistory.transactions].sort((p,q) => String(q.created_at || '').localeCompare(String(p.created_at || '')));
            const historyBox = document.createElement('div');
            historyBox.className = 'nika-unit-history';
            const statusText = { approved: 'تأییدشده', pending: 'در انتظار تأیید', rejected: 'ردشده' };
            const kindText = { payment: 'پرداخت', charge: 'شارژ', adjustment: 'اعتبار / تخفیف', expense: 'هزینه' };
            historyBox.innerHTML = history.length ? String(html`<div class="nika-unit-fin-section"><h4>تمام سوابق مالی (${fa(history.length)})</h4><div class="nika-unit-history-list">${history.map(t => html`<article class="nika-unit-history-item"><strong>${t.title || kindText[t.kind] || 'تراکنش'} · ${toman(t.amount)}</strong><small>${kindText[t.kind] || t.kind} · ${FUND_FA[t.fund_id] || t.fund_id} · ${statusText[t.status] || t.status}</small><small>${t.period ? (t.fund_id === 'owner' ? fa(t.period) : periodLabel(t.period)) + ' · ' : ''}${fdt(t.created_at)}${t.reference ? ' · پیگیری ' + t.reference : ''}</small>${t.note ? html`<p>${t.note}</p>` : ''}</article>` )}</div></div>` ) : '<div class="nika-footnote">برای این واحد هنوز سابقه مالی ثبت نشده است.</div>';
            const detail = $('.nika-unit-detail', m);
            const oldHistory = $('.nika-unit-history', detail); if (oldHistory) oldHistory.remove();
            detail.appendChild(historyBox);
            historyButton.textContent = 'به‌روزرسانی سوابق مالی';
          } catch (e) { toast(e.message); historyButton.textContent = 'تلاش دوباره برای نمایش سوابق'; }
          finally { historyButton.disabled = false; }
        };
      });
    }
  };
}
// ====================== گزارش عملکرد ======================
const ACTION_FA = {
  'user.create':'ایجاد حساب کاربر','user.update':'ویرایش حساب کاربر','user.deactivate':'غیرفعال‌سازی حساب',
  'user.reset_password':'بازنشانی رمز','payment.create':'ثبت پرداخت','expense.create':'ثبت هزینه',
  'charge.create':'ثبت شارژ','transaction.decision':'بررسی تراکنش مالی',
  'manager.override_action':'اقدام خارج از مسئولیت','delegation.enable':'فعال‌سازی جانشین',
  'delegation.disable':'لغو جانشین','event.create':'ثبت رویداد','event.update':'ویرایش رویداد',
  'event.delete':'حذف رویداد','request.update':'رسیدگی به درخواست','message.create':'ثبت پیام',
  'notice.create':'ثبت اطلاعیه'
};
async function reportsTab() {
  const { logs } = await api('/admin/audit?limit=150');
  const roleName = value => {
    if (!value) return 'مدیر';
    const delegated = value.startsWith('جانشین ');
    const key = delegated ? value.slice(7) : value;
    return (delegated ? 'جانشین ' : '') + (ROLE_FA[key] || key);
  };
  return {
    html: card('سوابق عملیات مدیریتی', logs.length ? html`<div class="nika-users">${logs.map(log => html`<div class="nika-usercard ${log.is_delegate ? 'nika-override-action' : ''}">
      <strong>${log.actor || 'کاربر غیرفعال'}</strong>
      <small>${ACTION_FA[log.action] || log.action} · ${fdt(log.created_at)}</small>
      <div class="nika-rolechips"><span class="page-chip ${log.is_delegate ? 'amber' : ''}">${roleName(log.actor_role || (log.actor_roles || '').split(',')[0])}</span>${log.is_delegate ? html`<span class="page-chip amber">خارج از مسئولیت اصلی</span>` : ''}</div>
      ${log.reason ? html`<p class="nika-footnote">دلیل: ${log.reason}</p>` : ''}
    </div>` )}</div>` : empty('سابقه‌ای برای نمایش وجود ندارد.')),
  };
}

// ====================== مالی ======================
const fundOpts = [['monthly', FUND_FA.monthly], ['owner', FUND_FA.owner]];
function financeNumberField(name,label,value){
 const digits=normDigits(value??'').replace(/\D/g,''); const formatted=digits?Number(digits).toLocaleString('en-US'):'';
 return html`<div class="finance-field"><label class="nika-label">${label}</label><input class="nika-input" name="${name}" value="${formatted}" inputmode="numeric" required autocomplete="off"></div>`;
}
function jalaliDateControl(name,label,value){
 const p=String(value||'').split(/[-/]/).map(Number), t=jToday(), y=p[0]||t.y, m=p[1]||t.m, d=p[2]||t.d;
 const date=[y,String(m).padStart(2,'0'),String(d).padStart(2,'0')];
 return html`<div class="finance-date-field jalali-date-field" data-jpicker><label class="nika-label">${label}</label><input class="nika-input" type="text" readonly data-jdisplay data-jalali-date data-jalali-separator="-" value="${fa(y)}/${fa(m).padStart(2,'۰')}/${fa(d).padStart(2,'۰')}" aria-label="${label}"><input type="hidden" name="${name}" data-jvalue value="${date.join('-')}"></div>`;
}
function bindGroupedMoneyInputs(root){
 root.querySelectorAll('input[inputmode="numeric"]').forEach(input=>{
  const format=()=>{const digits=normDigits(input.value).replace(/\D/g,'');input.value=digits?Number(digits).toLocaleString('en-US'):'';};
  format(); input.addEventListener('input',format);
 });
}
async function systemTab() {
  return {
    html: card('بازنشانی کامل اطلاعات آزمایشی', html`
      <p>این عملیات برای پایان دوره آزمایشی است و تمام اطلاعات ثبت‌شده در این دوره را به‌صورت غیرقابل‌بازگشت پاک می‌کند.</p>
      <div class="nika-usercard">
        <strong>مواردی که پاک می‌شوند</strong>
        <small>تمام کاربران آزمایشی به‌جز دو حساب پایه‌ی مدیر سامانه و رئیس هیئت‌مدیره، سوابق مالی و تراکنش‌ها، تنظیمات مالی، پیام‌ها، درخواست‌ها، اطلاعیه‌ها، مصوبات، رویدادها، اسناد، جانشینی‌ها، فایل‌های پیوست، سوابق پشتیبان و گزارش‌های ممیزی.</small>
      </div>
      <div class="nika-usercard">
        <strong>مواردی که حفظ می‌شوند</strong>
        <small>ساختار و مشخصات واحدهای ساختمان، صندوق‌های پایه، حساب مستقل مدیر سامانه و حساب رئیس هیئت‌مدیره.</small>
      </div>
      <form id="systemResetForm" novalidate>
        ${fields([
          { name: 'confirm', label: 'عبارت تأیید را دقیقاً وارد کنید', placeholder: 'RESET-NIKA-TEST-DATA', required: true, dir: 'ltr' },
          { name: 'currentPassword', label: 'رمز عبور فعلی مدیر سامانه', type: 'password', required: true, dir: 'ltr', autocomplete: 'current-password' }
        ], 'nika')}
        <div class="nika-actions"><button class="nika-secondary danger" type="submit">بازنشانی کامل اطلاعات آزمایشی</button></div>
      </form>
      <p class="nika-footnote">این امکان فقط برای مدیر سامانه مستقل نمایش داده می‌شود. پس از بازنشانی، کاربران و تنظیمات واقعی را از ابتدا ثبت کنید.</p>
    `),
    bind(box) {
      onSubmit($('#systemResetForm', box), async data => {
        if (data.confirm !== 'RESET-NIKA-TEST-DATA') throw new Error('عبارت تأیید را دقیقاً و بدون تغییر وارد کنید.');
        if (!await ask('بازنشانی غیرقابل‌بازگشت سامانه', 'تمام اطلاعات آزمایشی و تنظیمات مالی پاک می‌شوند. فقط حساب‌های پایه‌ی مدیر سامانه و رئیس هیئت‌مدیره، واحدهای ساختمان و صندوق‌های پایه باقی می‌مانند. آیا مطمئن هستید؟', 'پاک‌سازی کامل', true)) return;
        const result = await api('/admin/reset-test-data', { method: 'POST', body: { confirm: data.confirm, currentPassword: data.currentPassword } });
        toast(`بازنشانی انجام شد؛ ${fa(result.preservedUnits)} واحد ساختمان و دو حساب پایه حفظ شدند.`);
        reload();
      });
    }
  };
}

async function settingsTab() {
 const editable = can('finance.settings');
 const { settings } = await api('/finance/reminder-settings');
 const t = jToday(), today = `${t.y}-${String(t.m).padStart(2,'0')}-${String(t.d).padStart(2,'0')}`;
 if (!editable) {
  const dateText = value => value ? fa(String(value).replace(/-/g,'/')) : '—';
  const valueText = value => value == null || value === '' ? '—' : fa(String(value));
  return {
   html: html`<div class="nika-admin-grid finance-settings-grid">
    ${card('تعاریف اولیه مالی', html`
     <section class="finance-setting-block"><h4>شارژ ماهیانه</h4><div class="finance-setting-row">
      <div class="finance-field"><label class="nika-label">مبلغ شارژ (تومان)</label><div class="nika-input" aria-readonly="true">${valueText(settings?.monthly_amount)}</div></div>
      <div class="finance-field"><label class="nika-label">روز سررسید ماهیانه</label><div class="nika-input" aria-readonly="true">${valueText(settings?.monthly_due_day)}</div></div>
     </div><div class="finance-field"><label class="nika-label">تاریخ مصوب اجرا</label><div class="nika-input" aria-readonly="true">${dateText(settings?.monthly_effective_from || settings?.effective_from)}</div></div></section>
     <section class="finance-setting-block"><h4>شارژ مالکانه</h4><div class="finance-setting-row">
      <div class="finance-field"><label class="nika-label">مبلغ شارژ (تومان)</label><div class="nika-input" aria-readonly="true">${valueText(settings?.owner_amount)}</div></div>
      <div class="finance-field"><label class="nika-label">تاریخ سررسید پرداخت</label><div class="nika-input" aria-readonly="true">${dateText(settings?.owner_due_date)}</div></div>
     </div><div class="finance-field"><label class="nika-label">تاریخ مصوب اجرا</label><div class="nika-input" aria-readonly="true">${dateText(settings?.owner_effective_from || settings?.effective_from)}</div></div></section>
     <p class="nika-footnote">این تعاریف فقط توسط رئیس هیئت‌مدیره قابل تغییر هستند.</p>`)}
   </div>`
  };
 }
 return {
  html: html`<div class="nika-admin-grid finance-settings-grid">${card('تعاریف اولیه مالی', html`<form id="financeSettings" novalidate>
   <section class="finance-setting-block"><h4>شارژ ماهیانه</h4><div class="finance-setting-row">${financeNumberField('monthlyAmount','مبلغ شارژ (تومان)',settings?.monthly_amount)}${financeNumberField('monthlyDueDay','روز چندم ماه (سررسید)',settings?.monthly_due_day)}</div>${jalaliDateControl('monthlyEffectiveFrom','تاریخ مصوب اجرا',settings?.monthly_effective_from||settings?.effective_from||today)}</section>
   <section class="finance-setting-block"><h4>شارژ مالکانه</h4><div class="finance-setting-row finance-owner-row">${financeNumberField('ownerAmount','مبلغ شارژ (تومان)',settings?.owner_amount)}${jalaliDateControl('ownerDueDate','تاریخ سررسید پرداخت',settings?.owner_due_date||today)}</div>${jalaliDateControl('ownerEffectiveFrom','تاریخ مصوب اجرا',settings?.owner_effective_from||settings?.effective_from||today)}</section>
   <div class="nika-actions"><button class="nika-primary" type="submit">ثبت مصوبه جدید</button></div></form><div class="nika-footnote">با رسیدن تاریخ اجرای مصوبه، شارژها به‌صورت خودکار ثبت می‌شوند؛ سوابق مصوبه‌ها و بدهی‌های قبلی محفوظ می‌مانند.</div>`)}
  </div>`,
  bind(box) {
   bindGroupedMoneyInputs(box);
   const fs = $('#financeSettings', box);
   if (fs) onSubmit(fs, async d => {
    const num = v => parseAmount(v);
    await api('/finance/reminder-settings', { method: 'POST', body: {
     monthlyAmount: num(d.monthlyAmount), monthlyDueDay: num(d.monthlyDueDay),
     ownerAmount: num(d.ownerAmount), monthlyEffectiveFrom: normDigits(d.monthlyEffectiveFrom),
     ownerEffectiveFrom: normDigits(d.ownerEffectiveFrom), ownerDueDate: normDigits(d.ownerDueDate)
    }});
    toast('مصوبه مالی جدید ثبت شد؛ شارژها طبق تاریخ اجرا به‌صورت خودکار ثبت می‌شوند'); reload();
   });
  }
 };
}
function financeSection(id, title, content) {
 return html`<section class="nika-admincard" data-finance-panel="${id}" hidden style="margin-top:14px">
  <h3>${title}</h3>
  <div style="padding-top:8px">${content}</div>
 </section>`;
}
async function financeTab() {
 const approvalsAllowed = canAny(['finance.approve','expenses.approve']);
 const expenseAllowed = can('expenses.create');
 const reportsAllowed = can('finance.reports');
 const shortcuts = [], actions = [];
 let fundsCard = '';
 let paymentOut = null, approvalsOut = null, expenseOut = null, reviewOut = null, finalOut = null;
 if (reportsAllowed) {
  const { funds } = await api('/finance/funds');
  fundsCard = card('موجودی صندوق‌ها', html`<div class="nika-users">${funds.map(f => html`<div class="nika-usercard"><strong>${f.title}</strong><div class="page-stat-grid"><div class="page-stat"><small>موجودی فعلی</small><strong class="${f.balance < 0 ? 'debt-text' : 'credit-text'}">${toman(f.balance)}</strong></div><div class="page-stat"><small>دریافتی تأییدشده</small><strong>${toman(f.incoming)}</strong></div><div class="page-stat"><small>هزینه قطعی‌شده</small><strong>${toman(f.outgoing)}</strong></div></div></div>` )}</div>`);
 }
 const addShortcut = (id, title, iconName) => shortcuts.push(html`<button type="button" class="category nika-finance-shortcut" data-finance-toggle="${id}" aria-haspopup="dialog"><span class="cat-icon">${raw(iconMarkup(iconName))}</span><span>${title}</span></button>`);
 if (can('finance.approve')) { paymentOut = await registerUnitPaymentTab(); addShortcut('unit-payment', 'ثبت شارژ واحدها', 'wallet'); actions.push({ id:'unit-payment', title:'ثبت شارژ واحدها', view:paymentOut }); }
 if (approvalsAllowed) { approvalsOut = await financeApprovalsTab(); addShortcut('payment-approvals', 'تأیید پرداخت‌ها', 'badge-check'); actions.push({ id:'payment-approvals', title:'تأیید پرداخت‌ها', view:approvalsOut }); }
 if (expenseAllowed) { expenseOut = await expenseRequestsTab(); addShortcut('expense-create', 'ثبت هزینه', 'receipt-text'); actions.push({ id:'expense-create', title:'ثبت هزینه', view:expenseOut }); }
 if (can('expenses.approve')) { reviewOut = await expenseReviewTab(); addShortcut('expense-review', 'بررسی درخواست‌های هزینه', 'clipboard-list'); actions.push({ id:'expense-review', title:'بررسی درخواست‌های هزینه', view:reviewOut }); }
 if (can('expenses.finalize')) { finalOut = await chairFinalReviewTab(); addShortcut('expense-finalize', 'تأیید نهایی هزینه‌ها', 'shield-check'); actions.push({ id:'expense-finalize', title:'تأیید نهایی هزینه‌ها', view:finalOut }); }
 if (!shortcuts.length && !reportsAllowed) return {html:empty('امکان مشاهده بخش مالی برای شما فعال نیست.')};
 return {
  html:html`<div class="manager-finance-page">${fundsCard}<div class="categories is-manager nika-finance-shortcuts">${raw(join(shortcuts))}</div></div>`,
  bind(box) {
   $$('[data-finance-toggle]',box).forEach(button=>button.addEventListener('click',()=>{
    const action = actions.find(item => item.id === button.dataset.financeToggle);
    if (!action?.view) return;
    const modal = openModal(action.title, action.view.html);
    action.view.bind?.(modal);
   }));
  }
 };
}
async function registerUnitPaymentTab() {
 const { units } = await api('/admin/units');
 const options = units.map(u => [u.unit_number, 'واحد ' + u.unit_number]);
 if (!options.length) return { html: card('ثبت پرداخت واحد', empty('ابتدا واحدهای ساختمان را ثبت کنید.')) };
 return {
  html: card('ثبت پرداخت به‌جای واحد', html`<form id="unitPaymentNew" novalidate>
   ${fields([
    { name:'unitNumber', label:'انتخاب واحد', type:'select', value:options[0][0], options },
    { name:'fund', label:'نوع شارژ', type:'select', value:'monthly', options:[['monthly','شارژ ماهیانه'],['owner','شارژ مالکانه']] },
    { name:'amount', label:'مبلغ پرداخت (تومان)', inputmode:'numeric', dir:'ltr', required:true },
    { name:'period', label:'دوره / سال شارژ (شمسی)', value:curPeriod(), required:true, dir:'ltr' },
    { name:'reference', label:'شماره پیگیری / توضیحات بانکی', dir:'ltr' },
    { name:'note', label:'توضیحات (اختیاری)', type:'textarea', rows:2 }
   ], 'nika')}
   <p class="nika-footnote">پرداخت پس از ثبت، در فهرست تأیید پرداخت‌ها قرار می‌گیرد و تا زمان تأیید در مانده صندوق منظور نمی‌شود.</p>
   <div class="nika-actions"><button class="nika-primary" type="submit">ثبت پرداخت واحد</button></div>
  </form>`)
 ,
  bind(box) {
   const form = $('#unitPaymentNew', box);
   if (!form) return;
   const fund = $('select[name="fund"]', form), periodField = $('input[name="period"]', form);
   if (!fund || !periodField) return;
   fund.addEventListener('change', () => { periodField.value = fund.value === 'owner' ? String(jToday().y) : curPeriod(); });
   onSubmit(form, async d => {
    const body = { kind:'payment', unitNumber:d.unitNumber, fund:d.fund, amount:parseAmount(d.amount), period:d.period, reference:d.reference, note:d.note };
    if (!body.amount) throw new Error('مبلغ را به‌صورت عدد وارد کنید');
    await api('/transactions', { method:'POST', body });
    toast('پرداخت واحد ثبت شد و برای تأیید ارسال شد');
    reload();
   });
  }
 };
}
async function financeApprovalsTab() {
 const pend=await api('/transactions?fund=monthly&scope=all&status=pending').then(a=>api('/transactions?fund=owner&scope=all&status=pending').then(b=>[...a.transactions,...b.transactions]));
 const pending=pend.filter(t=>t.kind==='payment' && can('finance.approve'));
 return {
  html:card('در انتظار تأیید',pending.length?html`<div class="nika-users">${pending.map(t=>html`<div class="nika-usercard"><strong>${t.title} · ${toman(t.amount)}</strong><small>${KIND_FA[t.kind]} · ${FUND_FA[t.fund_id]}${t.unit_number?' · واحد '+t.unit_number:''}${t.category?' · '+t.category:''}${t.period?' · '+(t.fund_id==='owner'?fa(t.period):periodLabel(t.period)):''}${t.reference?' · پیگیری '+t.reference:''} · ثبت: ${t.created_name} · ${fdt(t.created_at)}${t.note?' · '+t.note:''}</small><div class="row-actions"><button class="page-btn sm ok" data-ok="${t.id}">تأیید</button><button class="page-btn sm danger" data-no="${t.id}">رد</button></div></div>` )}</div>`:empty('موردی در انتظار تأیید وجود ندارد.')),
  bind(box){
   act(box,'[data-ok]',async b=>{await api(`/transactions/${b.dataset.ok}/decision`,{method:'POST',body:{status:'approved'}});toast('تأیید شد');reload();});
   act(box,'[data-no]',async b=>{const note=await promptText('رد مورد','دلیل رد را بنویسید (برای کاربر نمایش داده می‌شود)','ثبت رد');if(!note)return;await api(`/transactions/${b.dataset.no}/decision`,{method:'POST',body:{status:'rejected',note}});toast('رد شد');reload();});
  }
 };
}
async function toDocumentImage(file) {
 if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('فقط تصویر JPG، PNG یا WebP پذیرفته می‌شود');
 const bitmap = await createImageBitmap(file);
 let scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
 const canvas = document.createElement('canvas');
 const ctx = canvas.getContext('2d');
 const qualities = [0.76, 0.68, 0.60, 0.52];
 for (let pass = 0; pass < 4; pass++) {
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  for (const quality of qualities) {
   const data = canvas.toDataURL('image/jpeg', quality);
   const base64 = data.slice(data.indexOf(',') + 1);
   const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
   const size = Math.floor(base64.length * 3 / 4) - padding;
   if (size <= 280000) {
    if (bitmap.close) bitmap.close();
    const stem = (file.name || 'document').replace(/\.[^.]+$/, '');
    return { name: stem + '.jpg', data, size, width: canvas.width, height: canvas.height };
   }
  }
  scale *= 0.82;
 }
 if (bitmap.close) bitmap.close();
 throw new Error('حجم تصویر پس از فشرده‌سازی هنوز زیاد است؛ تصویر دیگری انتخاب کنید');
}

async function expenseRequestsTab() {
 const [{ funds }, { requests }] = await Promise.all([api('/finance/funds'), api('/expense-requests?scope=mine')]);
 const fundOptions = funds.map(f => [f.fund_id, f.title]);
 const expenseCategoryOptions = [['قبوض و خدمات','قبوض و خدمات'],['حقوق و دستمزد','حقوق و دستمزد'],['نظافت و نگهداری','نظافت و نگهداری'],['تعمیرات و تأسیسات','تعمیرات و تأسیسات'],['سایر هزینه‌ها','سایر هزینه‌ها']];
 const statusClass = s => s === 'finalized' ? 'green' : s.startsWith('revision') ? 'amber' : s === 'cancelled' ? 'red' : 'blue';
 return {
  html: html`<div class="manager-finance-page">
   ${card('ثبت درخواست پرداخت', html`<form id="expenseRequestNew" novalidate>${fields([
     { name: 'fund', label: 'صندوق پرداخت', type: 'select', value: 'monthly', options: fundOptions },
     { name: 'amount', label: 'مبلغ درخواست (تومان)', inputmode: 'numeric', dir: 'ltr', required: true },
     { name: 'documentTitle', label: 'عنوان سند', required: true },
     { name: 'documentDate', label: 'تاریخ سند', type: 'date', dateSeparator: '-', required: true },
     { name: 'description', label: 'شرح درخواست', type: 'textarea', rows: 3, required: true }
   ], 'nika')}
   <div id="expenseCategoryWrap">${fields([{ name: 'category', label: 'دسته‌بندی هزینه', type: 'select', value: 'سایر هزینه‌ها', options: expenseCategoryOptions }], 'nika')}</div>
   <div class="nika-footnote" id="expenseFundBalance"></div>
   <label class="nika-label">تصویر فاکتور، پیش‌فاکتور یا مدارک پشتیبان (اختیاری)</label>
   <input class="nika-input" type="file" id="expenseFiles" accept="image/jpeg,image/png,image/webp" multiple>
   <div class="nika-footnote" id="expenseFilesStatus">تصاویر هنگام انتخاب، در همین دستگاه کوچک و فشرده می‌شوند؛ حداکثر ۴ تصویر.</div>
   <div class="nika-footnote">نسخه اصلی تصویر ارسال نمی‌شود؛ نسخه فشرده پس از ثبت در دیتابیس ذخیره خواهد شد و پس از پشتیبان‌گیری آفلاین قابل پاک‌سازی است.</div>
   <div class="nika-actions"><button class="nika-primary" type="submit">ثبت و ارسال برای مدیر مالی</button></div></form>`)}
   ${card('پیگیری درخواست‌ها', requests.length ? html`<div class="nika-users">${requests.map(q => html`<div class="nika-usercard">
     <strong>${q.reference_no} · ${q.document_title}</strong>
     <small>${q.fund_title} · ${toman(q.amount)} · ${q.document_date} · ${fdt(q.created_at)}</small>
     <div class="row-actions"><span class="page-chip ${statusClass(q.status)}">${q.statusLabel}</span><button class="nika-secondary sm" data-request-open="${q.id}">جزئیات و سوابق</button>
       ${['revision_finance','revision_chair'].includes(q.status) ? html`<button class="nika-secondary sm" data-request-edit="${q.id}">اصلاح درخواست</button><button class="nika-secondary sm danger" data-request-cancel="${q.id}">منتفی‌کردن</button>` : ''}
     </div>
   </div>`)}</div>` : empty('هنوز درخواستی ثبت نشده است.'))}
  </div>`,
  bind(box) {
   const form = $('#expenseRequestNew', box), fundSelect = $('select[name="fund"]', box), balanceLabel = $('#expenseFundBalance', box);
   const categoryWrap = $('#expenseCategoryWrap', box);
   const fileInput = $('#expenseFiles', box), fileStatus = $('#expenseFilesStatus', box);
   let preparedFiles = [], filePreparation = Promise.resolve(), filePreparationError = null;
   if (fileInput) fileInput.addEventListener('change', () => {
    preparedFiles = []; filePreparationError = null;
    const selected = Array.from(fileInput.files || []);
    if (selected.length > 4) { filePreparationError = new Error('حداکثر چهار تصویر قابل ارسال است'); fileInput.value = ''; fileStatus.textContent = filePreparationError.message; return; }
    if (!selected.length) { fileStatus.textContent = 'تصویری انتخاب نشده است.'; return; }
    fileStatus.textContent = 'در حال کاهش حجم و آماده‌سازی تصاویر در همین دستگاه…';
    fileInput.disabled = true;
    filePreparation = Promise.all(selected.map(toDocumentImage)).then(files => {
     preparedFiles = files;
     const total = files.reduce((sum, f) => sum + f.size, 0);
     fileStatus.textContent = `${files.length} تصویر آماده شد؛ حجم مجموع نسخه‌های فشرده: ${Math.round(total / 1024)} کیلوبایت.`;
    }).catch(error => {
     filePreparationError = error; fileInput.value = ''; fileStatus.textContent = error.message;
    }).finally(() => { fileInput.disabled = false; });
   });
   const updateBalance = () => { const f = funds.find(x => x.fund_id === fundSelect.value); balanceLabel.textContent = f ? `موجودی فعلی ${f.title}: ${toman(f.balance)}` : ''; };
   const updateCategoryVisibility = () => { if (categoryWrap) categoryWrap.style.display = fundSelect?.value === 'monthly' ? '' : 'none'; };
   if (fundSelect) { fundSelect.onchange = () => { updateBalance(); updateCategoryVisibility(); }; updateBalance(); updateCategoryVisibility(); }
   onSubmit(form, async d => {
    await filePreparation;
    if (filePreparationError) throw filePreparationError;
    const files = preparedFiles;
    const body = { ...d, files };
    if (!S.user.roles.includes('executive')) { const reason = await promptText('دلیل انجام خارج از مسئولیت', 'چرا این درخواست را به‌جای مدیر اجرایی ثبت می‌کنید؟', 'ثبت دلیل'); if (!reason) return; body.reason = reason; }
    const result = await api('/expense-requests', { method: 'POST', body });
    toast(`درخواست ${result.referenceNo} ثبت و برای مدیر مالی ارسال شد`); reload();
   });
   act(box, '[data-request-open]', async b => showExpenseRequestDetails(b.dataset.requestOpen));
   act(box, '[data-request-edit]', async b => editExpenseRequest(requests.find(q => q.id === b.dataset.requestEdit)));
   act(box, '[data-request-cancel]', async b => {
    const q = requests.find(x => x.id === b.dataset.requestCancel);
    if (!await ask('منتفی‌کردن درخواست', `درخواست ${q.reference_no} منتفی شود؟ سوابق آن حفظ خواهد شد.`, 'منتفی‌کردن', true)) return;
    const body = {};
    if (!S.user.roles.includes('executive')) { const reason = await promptText('دلیل منتفی‌کردن', 'چرا این درخواست را به‌جای مدیر اجرایی منتفی می‌کنید؟', 'ثبت دلیل'); if (!reason) return; body.reason = reason; }
    await api(`/expense-requests/${q.id}/cancel`, { method: 'POST', body }); toast('درخواست منتفی شد'); reload();
   });
  }
 };
}

async function showExpenseRequestDetails(id) {
 const data = await api(`/expense-requests/${id}`), q = data.request;
 const actionFa = { created:'ثبت اولیه',approved:'تأیید مرحله مالی',revision:'درخواست اصلاح',resubmitted:'ارسال مجدد',finalized:'تأیید نهایی و قطعی‌شدن',cancelled:'منتفی‌شدن' };
 const stageFa = { executive:'مدیر اجرایی',finance:'مدیر مالی',chair:'رئیس هیئت‌مدیره' };
 openModal(`درخواست ${q.reference_no}`, html`<div class="nika-users">
  <div class="nika-usercard"><strong>${q.document_title}</strong><small>${q.fund_title} · ${toman(q.amount)} · ${q.document_date}</small><p>دسته‌بندی: ${q.fund_id === 'owner' ? 'بر اساس عنوان سند' : (q.category || 'دسته‌بندی قدیمی/ثبت‌نشده')}</p><p>${q.description}</p><span class="page-chip ${q.status === 'finalized' ? 'green' : q.status.startsWith('revision') ? 'amber' : 'blue'}">${q.statusLabel}</span></div>
  <div class="nika-usercard"><strong>تصاویر اسناد</strong>${data.files.length ? html`<div class="row-actions">${data.files.map(f => f.has_data ? html`<a class="page-btn sm secondary" href="${f.url}" target="_blank" rel="noopener">${f.filename} · نسخه ${f.version_no}</a>` : html`<span class="page-chip">${f.filename} · نسخه ${f.version_no} · در بایگانی آفلاین</span>`)}</div>` : empty('تصویری ثبت نشده است.')}</div>
  <div class="nika-usercard"><strong>سوابق بررسی و اصلاح</strong>${data.history.length ? data.history.map(h => html`<div class="page-event"><strong>${stageFa[h.stage] || h.stage} · ${actionFa[h.action] || h.action}</strong><small>${h.actor || 'سامانه'} · ${fdt(h.created_at)}</small>${h.reason ? html`<p>دلیل: ${h.reason}</p>` : ''}</div>`) : empty('سابقه‌ای ثبت نشده است.')}</div>
  <div class="nika-usercard"><strong>نسخه‌های سند</strong>${data.versions.map(v => html`<div class="page-event"><strong>نسخه ${v.version_no}</strong><small>${fdt(v.created_at)}</small>${v.reason ? html`<p>${v.reason}</p>` : ''}</div>`)}</div>
 </div>`);
}

async function editExpenseRequest(q) {
 const files = [{ name:'fund',label:'صندوق پرداخت',type:'select',value:q.fund_id,options:[['monthly','صندوق شارژ ماهیانه'],['owner','صندوق مالکانه']] },
  { name:'amount',label:'مبلغ درخواست (تومان)',value:q.amount,inputmode:'numeric',dir:'ltr',required:true },
  { name:'documentTitle',label:'عنوان سند',value:q.document_title,required:true },
  { name:'documentDate',label:'تاریخ سند',type:'date',dateSeparator:'-',value:q.document_date,required:true },
  { name:'description',label:'شرح درخواست',type:'textarea',rows:3,value:q.description,required:true }];
 const modal = openModal(`اصلاح درخواست ${q.reference_no}`, html`<form class="nika-form" novalidate>${fields(files,'nika')}<div id="expenseEditCategoryWrap">${fields([{name:'category',label:'دسته‌بندی هزینه',type:'select',value:q.category || 'سایر هزینه‌ها',options:[['قبوض و خدمات','قبوض و خدمات'],['حقوق و دستمزد','حقوق و دستمزد'],['نظافت و نگهداری','نظافت و نگهداری'],['تعمیرات و تأسیسات','تعمیرات و تأسیسات'],['سایر هزینه‌ها','سایر هزینه‌ها']]}],'nika')}</div><label class="nika-label">تصاویر جدید (اختیاری)</label><input class="nika-input" id="expenseEditFiles" type="file" accept="image/jpeg,image/png,image/webp" multiple><div class="nika-footnote" id="expenseEditFilesStatus">تصاویر هنگام انتخاب، در همین دستگاه کوچک و فشرده می‌شوند؛ حداکثر ۴ تصویر.</div><div class="nika-actions"><button class="nika-primary" type="submit">اصلاح و ارسال مجدد</button></div></form>`);
 const editInput = $('#expenseEditFiles', modal), editStatus = $('#expenseEditFilesStatus', modal);
 const editFundSelect = $('select[name="fund"]', modal), editCategoryWrap = $('#expenseEditCategoryWrap', modal);
 const updateEditCategoryVisibility = () => { if (editCategoryWrap) editCategoryWrap.style.display = editFundSelect?.value === 'monthly' ? '' : 'none'; };
 if (editFundSelect) { editFundSelect.addEventListener('change', updateEditCategoryVisibility); updateEditCategoryVisibility(); }
 if (!editInput || !editStatus) { console.warn('Nika: عناصر پیوست فرم اصلاح درخواست پیدا نشدند.'); return; }
 let editPreparedFiles = [], editPreparation = Promise.resolve(), editPreparationError = null;
 editInput.addEventListener('change', () => {
  editPreparedFiles = []; editPreparationError = null;
  const selected = Array.from(editInput.files || []);
  if (selected.length > 4) { editPreparationError = new Error('حداکثر چهار تصویر قابل ارسال است'); editInput.value = ''; editStatus.textContent = editPreparationError.message; return; }
  if (!selected.length) { editStatus.textContent = 'تصویر جدیدی انتخاب نشده است.'; return; }
  editStatus.textContent = 'در حال کاهش حجم و آماده‌سازی تصاویر در همین دستگاه…';
  editInput.disabled = true;
  editPreparation = Promise.all(selected.map(toDocumentImage)).then(result => {
   editPreparedFiles = result;
   editStatus.textContent = `${result.length} تصویر آماده شد؛ حجم مجموع نسخه‌های فشرده: ${Math.round(result.reduce((sum, f) => sum + f.size, 0) / 1024)} کیلوبایت.`;
  }).catch(error => { editPreparationError = error; editInput.value = ''; editStatus.textContent = error.message; }).finally(() => { editInput.disabled = false; });
 });
 onSubmit($('form',modal), async d => {
  await editPreparation;
  if (editPreparationError) throw editPreparationError;
  const body={...d,files:editPreparedFiles};
  if(!S.user.roles.includes('executive')) { const reason=await promptText('دلیل اصلاح خارج از مسئولیت','چرا این درخواست را به‌جای مدیر اجرایی اصلاح می‌کنید؟','ثبت دلیل'); if(!reason)return; body.reason=reason; }
  await api(`/expense-requests/${q.id}`,{method:'PATCH',body}); closeModal(); toast('درخواست اصلاح و دوباره برای مدیر مالی ارسال شد'); reload();
 });
}

async function expenseReviewTab() {
 const { requests } = await api('/expense-requests?scope=review');
 return {
  html: card('درخواست‌های در انتظار بررسی مدیر مالی', requests.length ? html`<div class="nika-users">${requests.map(q => html`<div class="nika-usercard">
   <strong>${q.reference_no} · ${q.document_title}</strong><small>${q.fund_title} · ${toman(q.amount)} · موجودی فعلی صندوق: ${toman(q.cash_balance)} · ثبت‌کننده: ${q.creator_name}</small>
   <p>دسته‌بندی: ${q.fund_id === 'owner' ? 'بر اساس عنوان سند' : (q.category || 'دسته‌بندی قدیمی/ثبت‌نشده')}</p><p>${q.description}</p><div class="row-actions"><button class="nika-secondary sm" data-exp-open="${q.id}">مشاهده اسناد</button><button class="nika-primary sm" data-exp-finance-ok="${q.id}">تأیید و ارجاع به رئیس</button><button class="nika-secondary sm danger" data-exp-finance-revision="${q.id}">نیازمند اصلاح</button></div>
  </div>`)}</div>` : empty('درخواستی در انتظار بررسی مدیر مالی نیست.')),
  bind(box) {
   act(box,'[data-exp-open]',async b=>showExpenseRequestDetails(b.dataset.expOpen));
   act(box,'[data-exp-finance-ok]',async b=>{
    const body={status:'approved'};
    if(!S.user.roles.includes('finance')){const reason=await promptText('دلیل انجام خارج از مسئولیت','چرا این درخواست را به‌جای مدیر مالی تأیید می‌کنید؟','ثبت دلیل');if(!reason)return;body.reason=reason;}
    await api(`/expense-requests/${b.dataset.expFinanceOk}/finance-decision`,{method:'POST',body});toast('درخواست برای تأیید نهایی به رئیس هیئت‌مدیره ارجاع شد');reload();
   });
   act(box,'[data-exp-finance-revision]',async b=>{
    const reason=await promptText('درخواست اصلاح','دلیل نیاز به اصلاح سند را بنویسید','ثبت دلیل');if(!reason)return;
    await api(`/expense-requests/${b.dataset.expFinanceRevision}/finance-decision`,{method:'POST',body:{status:'revision',reason}});toast('درخواست برای اصلاح به مدیر اجرایی بازگشت');reload();
   });
  }
 };
}

async function chairFinalReviewTab() {
 const { requests } = await api('/expense-requests?scope=final');
 return {
  html: card('درخواست‌های در انتظار تأیید نهایی رئیس هیئت‌مدیره', requests.length ? html`<div class="nika-users">${requests.map(q => {
   const enough = Number(q.cash_balance) >= Number(q.amount);
   return html`<div class="nika-usercard">
    <strong>${q.reference_no} · ${q.document_title}</strong><small>${q.fund_title} · ${toman(q.amount)} · موجودی فعلی صندوق: ${toman(q.cash_balance)} · ثبت‌کننده: ${q.creator_name}</small>
    <p>دسته‌بندی: ${q.fund_id === 'owner' ? 'بر اساس عنوان سند' : (q.category || 'دسته‌بندی قدیمی/ثبت‌نشده')}</p><p>${q.description}</p>
    ${!enough ? html`<div class="page-chip red">هشدار: موجودی صندوق برای این پرداخت کافی نیست.</div>` : ''}
    <div class="row-actions"><button class="nika-secondary sm" data-chair-open="${q.id}">مشاهده اسناد</button><button class="nika-primary sm" data-chair-final="${q.id}" ${enough ? '' : raw('disabled')}>تأیید نهایی و برداشت</button><button class="nika-secondary sm danger" data-chair-revision="${q.id}">نیازمند اصلاح</button></div>
   </div>`;
  })}</div>` : empty('درخواستی در انتظار تأیید نهایی نیست.')),
  bind(box) {
   act(box,'[data-chair-open]',async b=>showExpenseRequestDetails(b.dataset.chairOpen));
   act(box,'[data-chair-final]',async b=>{
    const body={status:'approved'};
    if(!S.user.roles.includes('chair')){const reason=await promptText('دلیل انجام خارج از مسئولیت','چرا این تأیید نهایی را به‌جای رئیس هیئت‌مدیره انجام می‌دهید؟','ثبت دلیل');if(!reason)return;body.reason=reason;}
    try { await api(`/expense-requests/${b.dataset.chairFinal}/chair-decision`,{method:'POST',body});toast('سند قطعی شد و از صندوق برداشت شد');reload(); }
    catch(e){toast(e.message);reload();}
   });
   act(box,'[data-chair-revision]',async b=>{
    const reason=await promptText('درخواست اصلاح','دلیل نیاز به اصلاح سند را بنویسید','ثبت دلیل');if(!reason)return;
    await api(`/expense-requests/${b.dataset.chairRevision}/chair-decision`,{method:'POST',body:{status:'revision',reason}});toast('درخواست برای اصلاح به مدیر اجرایی بازگشت');reload();
   });
  }
 };
}
// ====================== درخواست‌ها ======================
async function requestsTab() {
  const st = sub.reqStatus || '', { requests } = await api('/requests?scope=all' + (st ? `&status=${st}` : ''));
  return {
    html: html`${card('درخواست‌ها و پیشنهادها', html`<div class="nika-subnav">${[['', 'همه'], ...Object.entries(REQ_STATUS).map(([k, v]) => [k, v[0]])].map(([k, l]) => html`<button class="${k === st ? 'on' : ''}" data-st="${k}">${l}</button>`)}</div>
    <div class="nika-users">${requests.length ? requests.map(r => html`<div class="nika-usercard"><strong>${r.title} ${chip(REQ_STATUS[r.status] || [r.status, ''])}</strong><small>${REQ_KIND[r.kind]} · ${r.category || 'عمومی'} · ${r.user_name}${r.unit_number ? ' (واحد ' + r.unit_number + ')' : ''} · ${fdt(r.created_at)}</small><p style="white-space:pre-wrap">${r.body}</p>
      <select class="nika-input" data-status="${r.id}">${Object.entries(REQ_STATUS).map(([k, v]) => html`<option value="${k}" ${k === r.status ? raw('selected') : ''}>${v[0]}</option>`)}</select>
      <textarea class="nika-input" data-resp="${r.id}" rows="2" placeholder="پاسخ برای ساکن (به‌صورت پیام ارسال می‌شود)">${r.response || ''}</textarea>
      <div class="row-actions"><button class="nika-primary sm" data-save="${r.id}">ذخیره</button>${r.board_requested === 1 && can('notices.manage') ? html`<button class="nika-secondary sm" data-pub="${r.id}">انتشار در تابلو</button>` : r.board_requested === 2 ? html`<span class="page-chip green">منتشرشده</span>` : ''}</div></div>`) : empty('موردی وجود ندارد.')}</div>`)}`,
    bind(box) {
      act(box, '[data-st]', async b => { sub.reqStatus = b.dataset.st; reload(); });
      act(box, '[data-save]', async b => { const id = b.dataset.save; await api(`/requests/${id}`, { method: 'PATCH', body: { status: $(`[data-status="${id}"]`, box).value, response: $(`[data-resp="${id}"]`, box).value } }); toast('ذخیره شد'); reload(); });
      act(box, '[data-pub]', async b => { if (await ask('انتشار در تابلو', 'این درخواست به‌عنوان اطلاعیه‌ی عمومی منتشر شود؟', 'انتشار')) { await api(`/requests/${b.dataset.pub}/publish`, { method: 'POST' }); toast('منتشر شد'); reload(); } });
    }
  };
}

// ====================== پیام‌ها ======================
async function messagesTab() {
  const { messages } = await api('/messages?box=inbox');
  return {
    html: card('پیام‌های رسیده به مدیریت', html`<div class="nika-users">${messages.length ? messages.map(m => html`<div class="nika-usercard"><strong>${m.title} ${m.read_at ? '' : html`<span class="page-chip blue">جدید</span>`}</strong><small>از ${m.sender_name}${m.sender_unit ? ' (واحد ' + m.sender_unit + ')' : ''} · ${fdt(m.created_at)}</small><p style="white-space:pre-wrap">${m.body}</p>${m.sender_id !== S.user.id ? html`<div class="row-actions"><button class="nika-secondary sm" data-reply="${m.id}">پاسخ</button></div>` : ''}</div>`) : empty('پیامی وجود ندارد.')}</div>`),
    bind(box) {
      messages.filter(m => !m.read_at).forEach(m => api(`/messages/${m.id}/read`, { method: 'POST' }).catch(() => {})); setTimeout(refreshSummary, 600);
      act(box, '[data-reply]', async b => {
        const m = messages.find(x => x.id === b.dataset.reply), el = openModal('پاسخ به ' + m.sender_name, html`<form novalidate>${fields([{ name: 'title', label: 'عنوان', value: 'Re: ' + m.title, required: true }, { name: 'body', label: 'متن پاسخ', type: 'textarea', required: true }], 'nika')}<div class="nika-actions"><button class="nika-primary" type="submit">ارسال</button></div></form>`);
        onSubmit($('form', el), async d => { await api('/messages', { method: 'POST', body: { ...d, recipientId: m.sender_id } }); closeModal(); toast('ارسال شد'); });
      });
    }
  };
}

// ====================== اطلاعیه‌ها ======================
async function noticesTab() {
  const { notices } = await api('/notices');
  return {
    html: html`<div class="nika-admin-grid">${card('اطلاعیه‌ی جدید', html`<form id="nNew" novalidate>${fields([
      { name: 'title', label: 'عنوان', required: true }, { name: 'body', label: 'متن', type: 'textarea', required: true },
      { name: 'kind', label: 'نوع', type: 'select', value: 'اطلاعیه', options: ['اطلاعیه', 'جلسه', 'عمومی', 'فوری'].map(x => [x, x]) },
      { name: 'audience', label: 'مخاطب', type: 'select', value: 'all', options: [['all', 'همه'], ['owner', 'مالکان'], ['resident', 'ساکنان'], ['staff', 'مدیران و کارکنان']] }], 'nika')}<div class="nika-actions"><button class="nika-primary" type="submit">انتشار</button></div></form>`)}
    ${card('اطلاعیه‌های منتشرشده', html`<div class="nika-users">${notices.length ? notices.map(n => html`<div class="nika-usercard"><strong>${n.title} <span class="page-chip blue">${n.kind}</span></strong><small>${fdt(n.created_at)} · مخاطب: ${{ all: 'همه', owner: 'مالکان', resident: 'ساکنان', staff: 'مدیران' }[n.audience]}</small><p style="white-space:pre-wrap">${n.body}</p><div class="row-actions"><button class="nika-secondary sm danger" data-del="${n.id}">حذف</button></div></div>`) : empty('اطلاعیه‌ای نیست.')}</div>`)}</div>`,
    bind(box) {
      onSubmit($('#nNew', box), async d => { await api('/notices', { method: 'POST', body: d }); toast('منتشر شد'); reload(); });
      act(box, '[data-del]', async b => { if (await ask('حذف اطلاعیه', 'این اطلاعیه حذف شود؟', 'حذف', true)) { await api(`/notices/${b.dataset.del}`, { method: 'DELETE' }); toast('حذف شد'); reload(); } });
    }
  };
}

// ====================== محتوا (مقررات، مصوبات، رویدادها، اسناد) ======================
const CONTENT = {
  rules: { label: 'مقررات', perm: 'rules.manage', fields: [{ name: 'title', label: 'عنوان', required: true }, { name: 'body', label: 'متن', type: 'textarea', required: true }, { name: 'sort_order', label: 'ترتیب نمایش (عدد)', inputmode: 'numeric', value: '0' }], line: r => r.body },
  resolutions: { label: 'مصوبات', perm: 'resolutions.manage', fields: [{ name: 'title', label: 'عنوان', required: true }, { name: 'body', label: 'متن مصوبه', type: 'textarea', required: true }, { name: 'decided_on', label: 'تاریخ مصوبه', type: 'date', dateSeparator: '/', dir: 'ltr', required: true }], line: r => `${r.decided_on} · ${r.body}` },
  events: { label: 'رویدادها', perm: 'events.manage', fields: [{ name: 'title', label: 'عنوان', required: true }, { name: 'event_date', label: 'تاریخ (شمسی)', type: 'date', dateSeparator: '-', dir: 'ltr', required: true }, { name: 'event_time', label: 'ساعت (اختیاری)', dir: 'ltr', placeholder: '18:30' }, { name: 'body', label: 'توضیحات', type: 'textarea', rows: 2 }, { name: 'recurrence', label: 'تکرار', type: 'select', value: 'none', options: [['none','بدون تکرار'],['weekly','هفتگی'],['monthly','ماهانه'],['yearly','سالانه']] }, { name: 'recurrenceUntil', label: 'پایان تکرار (اختیاری)', type: 'date', dateSeparator: '-', dir: 'ltr' }], line: r => `${r.event_date}${r.event_time ? ' ' + r.event_time : ''}${r.recurrence && r.recurrence !== 'none' ? ' · تکرار: ' + r.recurrence : ''}${r.body ? ' · ' + r.body : ''}` },
  documents: { label: 'اسناد', perm: 'documents.manage', fields: [{ name: 'title', label: 'عنوان', required: true }, { name: 'url', label: 'پیوند (https)', dir: 'ltr', required: true, placeholder: 'https://…' }, { name: 'description', label: 'توضیحات (اختیاری)' }], line: r => r.url }
};
async function contentTab() {
  const kinds = Object.entries(CONTENT).filter(([, c]) => can(c.perm)), k = kinds.some(([n]) => n === sub.content) ? sub.content : kinds[0][0], def = CONTENT[k];
  const { items } = await api(`/${k}`);
  return {
    html: html`<div class="nika-subnav">${kinds.map(([n, c]) => html`<button class="${n === k ? 'on' : ''}" data-k="${n}">${c.label}</button>`)}</div><div class="nika-admin-grid">${card(`افزودن به ${def.label}`, html`<form id="cNew" novalidate>${fields(def.fields, 'nika')}<div class="nika-actions"><button class="nika-primary" type="submit">افزودن</button></div></form>`)}
    ${card(`${def.label} (${fa(items.length)})`, html`<div class="nika-users">${items.length ? items.map(i => html`<div class="nika-usercard"><strong>${i.title}</strong><small style="white-space:pre-wrap">${def.line(i)}</small><div class="row-actions"><button class="nika-secondary sm" data-edit="${i.id}">ویرایش</button><button class="nika-secondary sm danger" data-del="${i.id}">حذف</button></div></div>`) : empty('موردی ثبت نشده است.')}</div>`)}</div>`,
    bind(box) {
      act(box, '[data-k]', async b => { sub.content = b.dataset.k; reload(); });
      onSubmit($('#cNew', box), async d => { await api(`/${k}`, { method: 'POST', body: d }); toast('افزوده شد'); reload(); });
      act(box, '[data-del]', async b => { if (await ask('حذف', 'این مورد حذف شود؟', 'حذف', true)) { await api(`/${k}/${b.dataset.del}`, { method: 'DELETE' }); toast('حذف شد'); reload(); } });
      act(box, '[data-edit]', async b => {
        const it = items.find(x => x.id === b.dataset.edit), m = openModal('ویرایش', html`<form novalidate>${fields(def.fields.map(f => ({ ...f, value: f.name === 'recurrenceUntil' ? (it.recurrence_until || '') : (it[f.name] ?? '') })), 'nika')}<div class="nika-actions"><button class="nika-primary" type="submit">ذخیره</button></div></form>`);
        onSubmit($('form', m), async d => { await api(`/${k}/${it.id}`, { method: 'PUT', body: d }); closeModal(); toast('ذخیره شد'); reload(); });
      });
    }
  };
}

// ====================== ممیزی ======================
async function auditTab() {
  const { logs } = await api('/admin/audit?limit=150');
  return { html: card('گزارش ممیزی (۱۵۰ رویداد اخیر)', html`<table class="nika-table"><tr><th>زمان</th><th>کاربر</th><th>رویداد</th><th>جزئیات</th></tr>${logs.map(l => html`<tr><td>${fdt(l.created_at)}</td><td>${l.actor || '—'}</td><td dir="ltr" style="text-align:left">${l.action}</td><td dir="ltr" style="text-align:left;font-size:9px;overflow-wrap:anywhere">${l.details && l.details !== '{}' ? l.details : ''}</td></tr>`)}</table>`) };
}

async function archiveTab() {
 const status = await api('/backups/status');
 let pendingBackup = null;
 return {
  html: card('پشتیبان‌گیری ماهانه و بایگانی آفلاین', html`
   <p>فایل پشتیبان شامل سوابق کاربران، واحدها، امور مالی، درخواست‌ها، گردش تأییدها، گزارش‌ها و تصاویر موجود است. رمزهای عبور و نشست‌های ورود در فایل قرار نمی‌گیرند.</p>
   <div class="nika-usercard">
    <strong>وضعیت بایگانی</strong>
    <small id="backupSummary">تصاویر آماده بایگانی: ${fa(status.pendingImages)} · آخرین پشتیبان تأییدشده: ${status.lastConfirmedAt ? fdt(status.lastConfirmedAt) : 'هنوز تهیه نشده است'}</small>
   </div>
   <div class="nika-footnote">فایل را روی رایانه و ترجیحاً یک حافظه جداگانه ذخیره کنید. پس از دانلود، فایل را نگه دارید و فقط در صورت اطمینان از ذخیره‌شدن آن، پاک‌سازی تصاویر آنلاین را تأیید کنید. تمام سوابق متنی و مالی در سامانه باقی می‌مانند.</div>
   <div class="nika-actions"><a class="page-btn sm secondary" href="/offline-archive.html" download>دانلود برنامه دسکتاپ آفلاین</a></div>
   <div class="nika-actions"><button class="nika-primary" type="button" data-backup-download>تهیه و دانلود فایل پشتیبان</button>
    <button class="nika-secondary" type="button" data-backup-confirm hidden>فایل ذخیره شد؛ تأیید و پاک‌سازی تصاویر</button></div>
   <p class="nika-footnote" id="backupMessage">تهیه فایل به‌صورت دستی انجام می‌شود تا بتوانید نسخه آن را روی رایانه خود نگهداری کنید.</p>
  `),
  bind(box) {
   act(box, '[data-backup-download]', async button => {
    button.disabled = true;
    try {
     const response = await fetch('/api/backups/export', { credentials: 'same-origin' });
     if (!response.ok) {
      let message = 'تهیه فایل پشتیبان ناموفق بود';
      try { message = (await response.json()).message || message; } catch {}
      throw new Error(message);
     }
     const blob = await response.blob();
     const buffer = await blob.arrayBuffer();
     const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', buffer))]
       .map(v => v.toString(16).padStart(2, '0')).join('');
     const backupId = response.headers.get('X-Nika-Backup-Id');
     const expected = response.headers.get('X-Nika-Backup-SHA256');
     if (!backupId || !expected || digest !== expected) throw new Error('صحت فایل پشتیبان تأیید نشد؛ هیچ تصویری حذف نشده است');
     const url = URL.createObjectURL(new Blob([buffer], { type: 'application/json' }));
     const link = document.createElement('a');
     link.href = url;
     link.download = 'nika-backup-' + new Date().toISOString().slice(0, 10) + '.json';
     document.body.appendChild(link); link.click(); link.remove();
     setTimeout(() => URL.revokeObjectURL(url), 10000);
     pendingBackup = { id: backupId, checksum: digest };
     $('[data-backup-confirm]', box).hidden = false;
     $('#backupMessage', box).textContent = 'فایل تولید و صحت آن بررسی شد. پس از اطمینان از ذخیره‌شدن فایل در رایانه، دکمه تأیید پاک‌سازی را بزنید.';
     toast('فایل پشتیبان دانلود شد؛ برای حذف تصاویر، ذخیره فایل را تأیید کنید');
    } catch (e) { toast(e.message); }
    finally { button.disabled = false; }
   });
   act(box, '[data-backup-confirm]', async button => {
    if (!pendingBackup) return;
    if (!await ask('تأیید بایگانی آفلاین', 'آیا فایل پشتیبان را روی رایانه ذخیره کرده‌اید؟ فقط تصاویر پیوست‌شده حذف می‌شوند و تمام سوابق و اطلاعات مالی آنلاین باقی می‌مانند.', 'تأیید و پاک‌سازی', true)) return;
    button.disabled = true;
    try {
     const result = await api(`/backups/${pendingBackup.id}/confirm`, { method: 'POST', body: { checksum: pendingBackup.checksum } });
     toast(`${fa(result.archivedImages)} تصویر به بایگانی آفلاین منتقل شد؛ سوابق سامانه باقی ماندند`);
     pendingBackup = null; reload();
    } catch (e) { toast(e.message); button.disabled = false; }
   });
  }
 };
}

const RENDER = { settings: settingsTab, users: usersTab, units: unitsTab, finance: financeTab, reports: reportsTab, archive: archiveTab, system: systemTab };

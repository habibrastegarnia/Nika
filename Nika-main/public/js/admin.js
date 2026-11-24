// پنل مدیریت: کاربران، واحدها، مالی، درخواست‌ها، پیام‌ها، اطلاعیه‌ها، محتوا و ممیزی
import { api } from './api.js';
import { S, can, canAny } from './state.js';
import { html, raw, join, $, $$, fa, toman, fdate, fdt, parseAmount, periodLabel, curPeriod, normDigits, FUND_FA, KIND_FA, TX_STATUS, REQ_STATUS, REQ_KIND, ROLE_FA, ACCOUNT_FA, chip } from './util.js';
import { toast, openModal, closeModal, ask, promptText, showSecret, fields, onSubmit } from './ui.js';
import { refreshSummary, loadLatestNotice } from './pages.js';

const card = (title, body) => html`<div class="nika-admincard"><h3>${title}</h3>${body}</div>`;
const empty = t => html`<p>${t}</p>`;
let tab = 'users', sub = {};

const TABS = () => [
  ['users', 'کاربران', can('users.manage')],
  ['units', 'واحدها', can('units.manage')],
  ['finance', 'مالی', canAny(['finance.charge', 'finance.approve', 'expenses.approve', 'expenses.create', 'finance.reports'])],
  ['requests', 'درخواست‌ها', can('requests.manage')],
  ['messages', 'پیام‌ها', can('messages.manage')],
  ['notices', 'اطلاعیه‌ها', can('notices.manage')],
  ['content', 'محتوا', canAny(['content.manage', 'resolutions.manage'])],
  ['audit', 'ممیزی', can('audit.read')]
].filter(t => t[2]);

export function adminAvailable() { return TABS().length > 0; }
export function canSwitchWorkspace() { return !!S.user && (['owner', 'resident', 'both'].includes(S.user.account_type) || (Array.isArray(S.user.roles) && S.user.roles.some(r => ['owner', 'resident'].includes(r)))) && adminAvailable(); }
export function showAdmin(want) {
  const tabs = TABS(); if (!tabs.length) return;
  tab = tabs.some(t => t[0] === want) ? want : tabs[0][0];
  $('#adminWho').textContent = `${S.user.name} · ${S.user.roles.map(r => ROLE_FA[r]).join('، ')}`;
  const personal = canSwitchWorkspace(), back = $('#adminBack');
  $('#adminAvatar').classList.toggle('nika-hide', !personal);
  $('#adminAvatar').src = S.user.has_avatar ? `/api/avatar?v=${encodeURIComponent(S.user.avatar_v || '')}` : 'assets/avatar.jpg';
  if (personal) {
    back.className = 'header-action workspace-toggle is-admin';
    back.title = 'بازگشت به فضای شخصی'; back.setAttribute('aria-label', 'بازگشت به فضای شخصی');
    back.innerHTML = '<span class="workspace-label workspace-label-left">ساکن</span><span class="workspace-label workspace-label-right">مدیر اجرایی</span><span class="workspace-thumb"></span>';
  } else { back.className = 'nika-secondary sm'; back.textContent = 'بازگشت به برنامه'; }
  $('#nikaAdmin').classList.remove('nika-hide'); $('.phone').classList.add('nika-hide'); renderNav(); loadTab();
}
export function hideAdmin() { $('#nikaAdmin').classList.add('nika-hide'); $('.phone').classList.remove('nika-hide'); refreshSummary(); loadLatestNotice().catch(() => {}); }
function renderNav() {
  $('#adminNav').innerHTML = join(TABS().map(([k, l]) => html`<button class="${k === tab ? 'selected' : ''}" data-tab="${k}">${l}</button>`));
  $$('#adminNav [data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; renderNav(); loadTab(); });
}
async function loadTab() {
  const box = $('#nikaAdminContent'); box.innerHTML = '<div class="nika-admincard"><p>در حال بارگذاری…</p></div>';
  try { const out = await RENDER[tab](); box.innerHTML = String(out.html); out.bind && out.bind(box); }
  catch (e) { box.innerHTML = String(card('خطا', empty(e.message))); }
}
const reload = () => loadTab();
const act = (box, sel, fn) => $$(sel, box).forEach(b => b.onclick = () => fn(b).catch(e => toast(e.message)));

// ====================== کاربران ======================
const EXTRA_OPTS = ['chair', 'finance', 'board', 'executive', 'system_admin', 'caretaker'].map(r => [r, ROLE_FA[r]]);
const UNIT_OPTIONS = Array.from({ length: 8 }, (_, floor) => Array.from({ length: 4 }, (_, n) => { const unit = `${floor + 1}0${n + 1}`; return [unit, unit]; })).flat();
async function usersTab() {
  const { users, assignable } = await api('/admin/users'), opts = EXTRA_OPTS.filter(([r]) => assignable.includes(r));
  return {
    html: html`<div class="nika-admin-grid">${card('حساب جدید', html`<form id="uNew" novalidate><div class="nika-user-unit-row"><div class="nika-user-unit-select">${fields([{ name: 'unit', label: 'انتخاب واحد', type: 'select', value: '101', options: UNIT_OPTIONS }], 'nika')}</div><div class="nika-user-unit-checks">${fields([{ name: 'owner', label: 'مالک', type: 'checkbox', value: false }, { name: 'resident', label: 'ساکن', type: 'checkbox', value: false }], 'nika')}</div></div>${fields([
      { name: 'name', label: 'نام و نام خانوادگی', required: true },
      { name: 'phone', label: 'شماره تلفن همراه', required: true, inputmode: 'tel', dir: 'ltr' },
      { name: 'secondaryPhone', label: 'شماره تماس پشتیبان', inputmode: 'tel', dir: 'ltr', hint: 'اختیاری؛ برای تماس اضطراری یا مواقع عدم دسترسی به شماره اصلی.' },
      ...(opts.length ? [{ name: 'roles', label: 'نقش‌های انتخابی', type: 'checks', options: opts, value: [] }] : [])], 'nika')}
      <div class="nika-footnote">برای حساب مالک یا ساکن، گزینه مربوط را انتخاب کنید. حساب‌های مدیریتی و سرایدار می‌توانند بدون اتصال به واحد ساخته شوند. برای حساب‌های متصل به واحد، نام کاربری شماره واحد و رمز اولیه شماره موبایل است؛ برای حساب مستقل، رمز موقت صادر می‌شود.</div>
      <div class="nika-actions"><button class="nika-primary" type="submit">ساخت حساب</button></div></form>`)}
${can('*') ? card('پاک‌سازی اطلاعات آزمایشی', html`<p>تمام تراکنش‌ها، درخواست‌ها، پیام‌ها، اطلاعیه‌ها، محتوا، واحدها و حساب‌های دیگر حذف می‌شوند. حساب رئیس فعلی و دسترسی او باقی می‌ماند.</p><div class="nika-actions"><button class="nika-secondary sm danger" id="wipeTestData">پاک‌سازی کامل اطلاعات و کاربران</button></div>`) : ''}</div>`,
    bind(box) {
      onSubmit($('#uNew', box), async d => {
        const accountType = d.owner && d.resident ? 'both' : (d.owner ? 'owner' : (d.resident ? 'resident' : 'staff'));
        if (accountType === 'staff' && !(d.roles || []).length) throw new Error('برای حساب مستقل، حداقل یک نقش انتخاب کنید.');
        const body = { unit: d.unit, name: d.name, phone: d.phone, secondaryPhone: d.secondaryPhone, accountType, roles: d.roles || [] };
        const r = await api('/admin/users', { method: 'POST', body });
        if (r.tempPassword) showSecret('حساب ساخته شد', 'این رمز موقت را به کاربر بدهید. پس از بستن این پنجره دیگر نمایش داده نمی‌شود.', r.tempPassword);
        else toast(accountType === 'staff' ? 'حساب مستقل ساخته شد.' : 'حساب ساخته شد؛ نام کاربری شماره واحد و رمز اولیه شماره موبایل ثبت‌شده است.'); reload();
      });
      $('#uSearch', box).oninput = e => { const q = normDigits(e.target.value).toLowerCase(); $$('#uList .nika-usercard', box).forEach(c => c.style.display = c.dataset.q.includes(q) ? '' : 'none'); };
      act(box, '[data-edit]', async b => editUser(users.find(u => u.id === b.dataset.edit), opts));
      act(box, '[data-delete-user]', async b => {
        if (!await ask('حذف حساب کاربر', 'حساب این کاربر و سوابق وابسته به آن حذف شود؟ این کار برگشت‌پذیر نیست.', 'حذف حساب', true)) return;
        await api(`/admin/users/${b.dataset.deleteUser}`, { method: 'DELETE' }); toast('حساب و سوابق وابسته حذف شد'); reload();
      });
      const wipe = $('#wipeTestData', box); if (wipe) wipe.onclick = async () => {
        if (!await ask('پاک‌سازی کامل', 'همه اطلاعات آزمایشی و همه کاربران به‌جز حساب رئیس فعلی حذف می‌شوند. ادامه می‌دهید؟', 'ادامه', true)) return;
        const phrase = await promptText('تأیید نهایی', 'برای تأیید، عبارت «پاک‌سازی نیکا» را دقیقاً وارد کنید.', 'پاک‌سازی');
        if (phrase !== 'پاک‌سازی نیکا') { if (phrase) toast('عبارت تأیید صحیح نبود'); return; }
        await api('/admin/reset-test-data', { method: 'POST' }); toast('اطلاعات آزمایشی و کاربران دیگر پاک شدند'); reload();
      };
      act(box, '[data-reset]', async b => {
        if (!await ask('بازنشانی رمز', 'رمز به شماره موبایل ثبت‌شده کاربر برمی‌گردد و همه‌ی نشست‌های او بسته می‌شود. ادامه می‌دهید؟', 'بازنشانی')) return;
        const r = await api(`/admin/users/${b.dataset.reset}/reset-password`, { method: 'POST' });
        if (r.tempPassword) showSecret('رمز موقت جدید', 'این رمز را به کاربر بدهید؛ فقط همین یک‌بار نمایش داده می‌شود.', r.tempPassword);
        else toast('رمز به شماره موبایل ثبت‌شده کاربر بازنشانی شد.');
      });
    }
  };
}
const userCard = u => html`<div class="nika-usercard" data-q="${normDigits(`${u.name} ${u.phone} ${u.unit || ''}`).toLowerCase()}"><strong>${u.name} ${u.active ? '' : html`<span class="page-chip red">غیرفعال</span>`} ${u.must_change_password ? html`<span class="page-chip amber">تغییر رمز الزامی</span>` : ''}</strong><small>${u.roles.includes('owner') && u.roles.includes('resident') ? 'مالک و ساکن' : ACCOUNT_FA[u.account_type]}${u.unit ? ' · واحد ' + u.unit : ''} · ${u.phone}${u.secondary_phone ? ' · تماس پشتیبان: ' + u.secondary_phone : ''}</small><div class="nika-rolechips">${u.roles.map(r => html`<span>${ROLE_FA[r] || r}</span>`)}</div><div class="row-actions"><button class="nika-secondary sm" data-edit="${u.id}">ویرایش</button><button class="nika-secondary sm" data-reset="${u.id}">بازنشانی رمز</button>${(can('*') || S.user.roles.includes('system_admin')) && u.id !== S.user.id ? html`<button class="nika-secondary sm danger" data-delete-user="${u.id}">حذف حساب</button>` : ''}</div></div>`;
function editUser(u, opts) {
  const baseOptions = u.account_type === 'staff' ? [] : [['owner', 'مالک'], ['resident', 'ساکن']].filter(([r]) => !u.roles.includes(r));
  const m = openModal('ویرایش حساب', html`<form class="nika-form" novalidate>${fields([
    { name: 'name', label: 'نام و نام خانوادگی', value: u.name, required: true }, { name: 'phone', label: 'شماره تلفن همراه', value: u.phone, dir: 'ltr', inputmode: 'tel' }, { name: 'secondaryPhone', label: 'شماره تماس پشتیبان', value: u.secondary_phone || '', dir: 'ltr', inputmode: 'tel' },
    ...(baseOptions.length ? [{ name: 'addBaseRoles', label: 'افزودن نقش پایه به همین حساب', type: 'checks', options: baseOptions, value: [] }] : []),
    ...(opts.length ? [{ name: 'roles', label: 'نقش‌های مدیریتی', type: 'checks', options: opts, value: u.roles }] : []),
    { name: 'active', label: 'حساب فعال باشد', type: 'checkbox', value: u.active }], 'nika')}<div class="nika-actions"><button class="nika-primary" type="submit">ذخیره</button></div></form>`);
  onSubmit($('form', m), async d => {
    const body = { name: d.name, phone: d.phone, secondaryPhone: d.secondaryPhone };
    if (baseOptions.length && d.addBaseRoles?.length) body.addBaseRoles = d.addBaseRoles;
    if (opts.length) body.roles = d.roles; if (d.active !== u.active) body.active = d.active;
    await api(`/admin/users/${u.id}`, { method: 'PATCH', body }); closeModal(); toast('ذخیره شد؛ نقش جدید به همین حساب افزوده شد.'); reload();
  });
}

// ====================== واحدها ======================
async function unitsTab() {
  const [{ units }, monthly, owner] = await Promise.all([
    api('/admin/units'), api('/finance/balances?fund=monthly'), api('/finance/balances?fund=owner')
  ]);
  const f = (u = {}) => fields([{ name: 'block', label: 'بلوک', value: u.block || '' }, { name: 'floor', label: 'طبقه', value: u.floor || '' }, { name: 'parking', label: 'پارکینگ', value: u.parking || '' }, { name: 'notes', label: 'توضیحات', type: 'textarea', rows: 2, value: u.notes || '' }], 'nika');
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
  const debtCount = allUnits.filter(x => statusOf(x.balance) === 'debt').length;
  const creditCount = allUnits.filter(x => statusOf(x.balance) === 'credit').length;
  const settledCount = allUnits.length - debtCount - creditCount;
  return {
    html: html`<div class="nika-units-page" dir="rtl">
      <section class="nika-building-panel">
        <div class="nika-building-heading"><strong>نمای ساختمان نیکا</strong><span>برای مشاهده جزئیات مالی، واحد را انتخاب کنید</span></div>
        <div class="nika-building-legend"><span><i class="debt"></i>بدهکار</span><span><i class="settled"></i>تسویه</span><span><i class="credit"></i>بستانکار</span></div>
        <div class="nika-building-roof"></div><div class="nika-building-floors">${floors}</div>
        <div class="nika-building-ground"><span>ورودی ساختمان نیکا</span></div>
      </section>
      <div class="nika-building-counts"><div><i class="debt"></i><strong>${fa(debtCount)}</strong><small>بدهکار</small></div><div><i class="settled"></i><strong>${fa(settledCount)}</strong><small>تسویه</small></div><div><i class="credit"></i><strong>${fa(creditCount)}</strong><small>بستانکار</small></div></div>
      ${card('ثبت مشخصات واحد جدید', html`<form id="unNew" novalidate>${fields([{ name: 'unitNumber', label: 'شماره واحد', required: true, inputmode: 'numeric' }], 'nika')}${f()}<div class="nika-actions"><button class="nika-primary" type="submit">افزودن واحد</button></div></form><div class="nika-footnote">با ساخت حساب برای یک شماره واحد جدید نیز واحد خودکار ساخته می‌شود؛ این بخش برای ثبت مشخصات است.</div>`)}
    </div>`,
    bind(box) {
      onSubmit($('#unNew', box), async d => { await api('/admin/units', { method: 'POST', body: d }); toast('واحد افزوده شد'); reload(); });
      act(box, '[data-unit-detail]', async b => {
        const x = allUnits.find(item => item.number === b.dataset.unitDetail), overall = x.balance, state = statusOf(overall);
        const amountLine = (label, value) => html`<div class="nika-unit-fin-row"><span>${label}</span><strong class="${value > 0 ? 'debt-text' : value < 0 ? 'credit-text' : 'settled-text'}">${value > 0 ? 'بدهی ' + toman(value) : value < 0 ? 'بستانکاری ' + toman(-value) : 'تسویه · ۰ تومان'}</strong></div>`;
        const content = html`<div class="nika-unit-detail" dir="rtl">
          <div class="nika-unit-detail-status ${state}"><span>وضعیت مالی واحد</span><strong>${statusLabel[state]}</strong></div>
          <div class="nika-unit-total ${state}"><small>مانده کل</small><strong>${overall > 0 ? 'بدهی ' + toman(overall) : overall < 0 ? 'بستانکاری ' + toman(-overall) : '۰ تومان · تسویه'}</strong></div>
          <div class="nika-unit-fin-section"><h4>جزئیات صندوق‌ها</h4>${amountLine('شارژ ماهیانه', Number(x.monthly.balance || 0))}${amountLine('شارژ مالکانه', Number(x.owner.balance || 0))}</div>
          <div class="nika-footnote">مبالغ بر اساس تراکنش‌های تأییدشده محاسبه شده‌اند.</div>
          ${x.unit ? html`<div class="row-actions"><button type="button" class="nika-secondary sm" id="editUnitInfo">ویرایش مشخصات واحد</button></div>` : html`<div class="nika-footnote">این شماره هنوز در فهرست واحدهای ثبت‌شده وجود ندارد.</div>`}
        </div>`;
        const m = openModal('اطلاعات واحد ' + fa(x.number), content), edit = $('#editUnitInfo', m);
        if (edit) edit.onclick = () => {
          const u = x.unit, form = openModal('ویرایش مشخصات واحد ' + fa(x.number), html`<form novalidate>${f(u)}<div class="nika-actions"><button class="nika-primary" type="submit">ذخیره</button></div></form>`);
          onSubmit($('form', form), async d => { await api('/admin/units/' + u.id, { method: 'PATCH', body: d }); closeModal(); closeModal(); toast('مشخصات واحد ذخیره شد'); reload(); });
        };
      });
    }
  };
}
// ====================== مالی ======================
const fundOpts = [['monthly', FUND_FA.monthly], ['owner', FUND_FA.owner]];
async function financeTab() {
  const canApprove = canAny(['finance.approve', 'expenses.approve']), fund = sub.fund || 'monthly';
  const [pend, bal] = await Promise.all([
    canApprove ? api('/transactions?fund=monthly&scope=all&status=pending').then(a => api('/transactions?fund=owner&scope=all&status=pending').then(b => [...a.transactions, ...b.transactions])) : [],
    canAny(['finance.reports', 'finance.approve']) ? api(`/finance/balances?fund=${fund}`) : null]);
  const pending = pend.filter(t => t.kind === 'payment' ? can('finance.approve') : can('expenses.approve'));
  const sections = [];
  if (can('*') || can('system.settings')) {
    const { settings } = await api('/finance/reminder-settings');
    sections.push(card('تنظیمات پایدار شارژ و سررسید', html`<form id="financeSettings" novalidate>${fields([
      { name: 'monthlyAmount', label: 'مبلغ شارژ ماهیانه هر واحد (تومان)', value: settings?.monthly_amount ?? '', inputmode: 'numeric', required: true, dir: 'ltr', money: true },
      { name: 'monthlyDueDay', label: 'روز سررسید شارژ ماهیانه', value: settings?.monthly_due_day ?? '', inputmode: 'numeric', required: true, dir: 'ltr' },
      { name: 'ownerAmount', label: 'مبلغ شارژ مالکانه سالیانه هر واحد (تومان)', value: settings?.owner_amount ?? '', inputmode: 'numeric', required: true, dir: 'ltr', money: true },
      { name: 'ownerDueMonth', label: 'ماه سررسید شارژ مالکانه (۱ تا ۱۲ شمسی)', value: settings?.owner_due_month ?? '', inputmode: 'numeric', required: true, dir: 'ltr' },
      { name: 'ownerDueDay', label: 'روز سررسید شارژ مالکانه', value: settings?.owner_due_day ?? '', inputmode: 'numeric', required: true, dir: 'ltr' },
      { name: 'effectiveFrom', label: 'تاریخ اجرای مصوبه (شمسی)', value: settings?.effective_from ?? (curPeriod() + '-01'), required: true, dir: 'ltr', hint: 'تنظیم جدید از این تاریخ اجرا می‌شود؛ سوابق قبلی محفوظ می‌مانند.' }
    ], 'nika')}<div class="nika-actions"><button class="nika-primary" type="submit">ثبت مصوبه جدید</button></div></form><div class="nika-footnote">مقادیر و سررسیدها تا ثبت مصوبه بعدی معتبر می‌مانند. یادآوری‌ها: دو روز قبل، روز سررسید، دو روز بعد، هفت روز بعد و سپس روزانه تا تسویه.</div>`));
  }
  if (canApprove) sections.push(card(`در انتظار تأیید (${fa(pending.length)})`, pending.length ? html`<div class="nika-users">${pending.map(t => html`<div class="nika-usercard"><strong>${t.title} · ${toman(t.amount)}</strong><small>${KIND_FA[t.kind]} · ${FUND_FA[t.fund_id]}${t.unit_number ? ' · واحد ' + t.unit_number : ''}${t.category ? ' · ' + t.category : ''}${t.period ? ' · ' + (t.fund_id === 'owner' ? fa(t.period) : periodLabel(t.period)) : ''}${t.reference ? ' · پیگیری ' + t.reference : ''} · ثبت: ${t.created_name} · ${fdt(t.created_at)}${t.note ? ' · ' + t.note : ''}</small><div class="row-actions"><button class="page-btn sm ok" data-ok="${t.id}">تأیید</button><button class="page-btn sm danger" data-no="${t.id}">رد</button></div></div>`)}</div>` : empty('مورد در انتظاری وجود ندارد.')));
  if (can('finance.charge')) sections.push(card('تعریف شارژ / اعتبار', html`<form id="chNew" novalidate>${fields([
    { name: 'fund', label: 'صندوق', type: 'select', value: 'monthly', options: fundOpts },
    { name: 'kind', label: 'نوع', type: 'select', value: 'charge', options: [['charge', 'شارژ (افزایش بدهی)'], ['adjustment', 'اعتبار / تخفیف (کاهش بدهی)']] },
    { name: 'period', label: 'سال / دوره', value: curPeriod(), dir: 'ltr', required: true, hint: 'شارژ مالکانه: ۱۴۰۵ · شارژ ماهیانه: ۱۴۰۵-۰۹' },
    { name: 'title', label: 'عنوان', placeholder: 'مثلاً شارژ آذر', required: true },
    { name: 'amount', label: 'مبلغ برای هر واحد (تومان)', inputmode: 'numeric', required: true, dir: 'ltr' },
    { name: 'units', label: 'فقط این واحدها (اختیاری، با ویرگول جدا کنید)', placeholder: 'خالی = همه‌ی واحدها' }], 'nika')}<div class="nika-actions"><button class="nika-primary" type="submit">ثبت برای واحدها</button></div></form><div class="nika-footnote">اگر شارژی با همین عنوان و دوره قبلاً برای واحدی ثبت شده باشد، دوباره ثبت نمی‌شود.</div>`));
  if (can('expenses.create')) sections.push(card('ثبت هزینه‌ی ساختمان', html`<form id="exNew" novalidate>${fields([
    { name: 'fund', label: 'صندوق', type: 'select', value: 'monthly', options: fundOpts },
    { name: 'period', label: 'دوره', value: curPeriod(), dir: 'ltr', required: true },
    { name: 'category', label: 'دسته‌بندی', value: 'سایر', required: true, placeholder: 'آب، برق، نظافت، تعمیرات…' },
    { name: 'title', label: 'عنوان هزینه', required: true },
    { name: 'amount', label: 'مبلغ (تومان)', inputmode: 'numeric', required: true, dir: 'ltr' },
    { name: 'reference', label: 'شماره سند / فاکتور (اختیاری)', dir: 'ltr' }], 'nika')}<div class="nika-actions"><button class="nika-primary" type="submit">ثبت هزینه</button></div></form><div class="nika-footnote">هزینه پس از تأیید مدیر مالی در داشبورد ساکنان نمایش داده می‌شود. ثبت‌کننده نمی‌تواند هزینه‌ی خود را تأیید کند.</div>`));
  if (bal) sections.push(card('مانده‌ی واحدها', html`<div class="nika-subnav">${fundOpts.map(([k, l]) => html`<button class="${k === fund ? 'on' : ''}" data-fund="${k}">${l}</button>`)}</div><table class="nika-table"><tr><th>واحد</th><th>شارژ</th><th>تسویه</th><th>مانده</th></tr>${bal.balances.map(b => html`<tr><td>${b.unit_number}</td><td>${fa(b.charged)}</td><td>${fa(b.settled)}</td><td class="${b.balance > 0 ? 'nika-pos' : 'nika-zero'}">${b.balance < 0 ? 'اعتبار ' + fa(-b.balance) : fa(b.balance)}</td></tr>`)}</table>`));
  return {
    html: html`<div class="nika-admin-grid">${sections}</div>`,
    bind(box) {
      const fs = $('#financeSettings', box);
      if (fs) onSubmit(fs, async d => {
        const num = v => parseAmount(v);
        await api('/finance/reminder-settings', { method: 'POST', body: {
          monthlyAmount: num(d.monthlyAmount), monthlyDueDay: num(d.monthlyDueDay),
          ownerAmount: num(d.ownerAmount), ownerDueMonth: num(d.ownerDueMonth),
          ownerDueDay: num(d.ownerDueDay), effectiveFrom: normDigits(d.effectiveFrom)
        }});
        toast('مصوبه مالی جدید ثبت شد؛ تنظیمات قبلی محفوظ ماند'); reload();
      });
      act(box, '[data-ok]', async b => { await api(`/transactions/${b.dataset.ok}/decision`, { method: 'POST', body: { status: 'approved' } }); toast('تأیید شد'); reload(); });
      act(box, '[data-no]', async b => { const note = await promptText('رد مورد', 'دلیل رد را بنویسید (برای کاربر نمایش داده می‌شود)', 'ثبت رد'); if (!note) return; await api(`/transactions/${b.dataset.no}/decision`, { method: 'POST', body: { status: 'rejected', note } }); toast('رد شد'); reload(); });
      act(box, '[data-fund]', async b => { sub.fund = b.dataset.fund; reload(); });
      const ch = $('#chNew', box); if (ch) {
        const fundInput = ch.elements.fund, periodInput = ch.elements.period;
        fundInput.addEventListener('change', () => {
          if (fundInput.value === 'owner') {
            periodInput.value = curPeriod().slice(0, 4);
            periodInput.placeholder = '۱۴۰۵';
          } else {
            periodInput.value = curPeriod();
            periodInput.placeholder = '۱۴۰۵-۰۹';
          }
        });
        onSubmit(ch, async d => {
        const amount = parseAmount(d.amount); if (!amount) throw new Error('مبلغ را به‌صورت عدد وارد کنید');
        const unitNumbers = d.units.split(/[,،\s]+/).map(s => normDigits(s).trim()).filter(Boolean);
        const r = await api('/finance/charges', { method: 'POST', body: { fund: d.fund, kind: d.kind, period: d.period, title: d.title, amount, unitNumbers } });
        toast(r.created ? `برای ${fa(r.created)} واحد ثبت شد` : 'موردی ثبت نشد (تکراری یا واحد نامعتبر)'); reload();
        });
      }
      const ex = $('#exNew', box); if (ex) onSubmit(ex, async d => {
        const amount = parseAmount(d.amount); if (!amount) throw new Error('مبلغ را به‌صورت عدد وارد کنید');
        await api('/transactions', { method: 'POST', body: { kind: 'expense', fund: d.fund, period: d.period, category: d.category, title: d.title, amount, reference: d.reference || undefined } }); toast('هزینه ثبت شد و در انتظار تأیید است'); reload();
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
  rules: { label: 'مقررات', perm: 'content.manage', fields: [{ name: 'title', label: 'عنوان', required: true }, { name: 'body', label: 'متن', type: 'textarea', required: true }, { name: 'sort_order', label: 'ترتیب نمایش (عدد)', inputmode: 'numeric', value: '0' }], line: r => r.body },
  resolutions: { label: 'مصوبات', perm: 'resolutions.manage', fields: [{ name: 'title', label: 'عنوان', required: true }, { name: 'body', label: 'متن مصوبه', type: 'textarea', required: true }, { name: 'decided_on', label: 'تاریخ مصوبه', dir: 'ltr', required: true, placeholder: '1405/09/01' }], line: r => `${r.decided_on} · ${r.body}` },
  events: { label: 'رویدادها', perm: 'content.manage', fields: [{ name: 'title', label: 'عنوان', required: true }, { name: 'event_date', label: 'تاریخ (شمسی)', dir: 'ltr', required: true, placeholder: '1405-09-05' }, { name: 'event_time', label: 'ساعت (اختیاری)', dir: 'ltr', placeholder: '18:30' }, { name: 'body', label: 'توضیحات', type: 'textarea', rows: 2 }], line: r => `${r.event_date}${r.event_time ? ' ' + r.event_time : ''}${r.body ? ' · ' + r.body : ''}` },
  documents: { label: 'اسناد', perm: 'content.manage', fields: [{ name: 'title', label: 'عنوان', required: true }, { name: 'url', label: 'پیوند (https)', dir: 'ltr', required: true, placeholder: 'https://…' }, { name: 'description', label: 'توضیحات (اختیاری)' }], line: r => r.url }
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
        const it = items.find(x => x.id === b.dataset.edit), m = openModal('ویرایش', html`<form novalidate>${fields(def.fields.map(f => ({ ...f, value: it[f.name] ?? '' })), 'nika')}<div class="nika-actions"><button class="nika-primary" type="submit">ذخیره</button></div></form>`);
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

const RENDER = { users: usersTab, units: unitsTab, finance: financeTab, requests: requestsTab, messages: messagesTab, notices: noticesTab, content: contentTab, audit: auditTab };

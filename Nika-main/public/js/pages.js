// صفحه‌های کاربری: خانه، مقررات، مصوبات، تقویم، تابلو، درخواست‌ها، مالی، پیام‌ها، پروفایل، تنظیمات
import { api } from './api.js';
import { S, can, readableFunds, dashFunds, isManager } from './state.js';
import { html, raw, join, $, $$, fa, toman, fdate, fdt, isRecent, parseAmount, periodLabel, curPeriod, JM, jOf, jToday, monthStart, monthLen, faN, normDigits,
  FUND_FA, KIND_FA, TX_STATUS, REQ_STATUS, REQ_CATEGORIES, ROLE_FA, chip } from './util.js';
import { toast, openModal, closeModal, ask, route, open, fields, onSubmit } from './ui.js';
import { iconMarkup } from './icons.js?v=2';

// ====================== خانه ======================
const COLORS = ['#7886d8', '#58c9a5', '#e8a65d', '#d77d9b', '#78baff', '#b79cf0', '#9ac96b'];
const CIRC = 2 * Math.PI * 56;
export const canDash = () => dashFunds().length > 0;

function avatarMarkup(user, extraClass = '') {
  if (user.has_avatar) return `<img class="${extraClass}" src="/api/avatar?v=${encodeURIComponent(user.avatar_v || '')}" alt="تصویر پروفایل">`;
  const mark = user.gender === 'female' ? iconMarkup('venus') : user.gender === 'male' ? iconMarkup('mars') : '';
  return `<span class="nika-avatar ${extraClass}" aria-label="آواتار ${user.gender === 'female' ? 'خانم' : user.gender === 'male' ? 'آقا' : 'کاربر'}">${iconMarkup('user-round')}${mark ? `<i>${mark}</i>` : ''}</span>`;
}

export function fillHeader() {
  const u = S.user;
  $('#hdrName').textContent = u.name;
  const baseRoleText = u.unit_number ? `واحد ${u.unit_number} · ${u.account_type === 'owner' ? 'مالک' : 'ساکن'}` : u.roles.map(r => ROLE_FA[r]).join('، ');
  const delegatedText = (u.delegatedRoles || []).map(r => `جانشین ${ROLE_FA[r]}`).join('، ');
  $('#hdrSub').textContent = [baseRoleText, delegatedText].filter(Boolean).join(' · ');
  $('#hdrAvatar').innerHTML = avatarMarkup(u);
}

function renderExpenses(d) {
  $('#expenseTotal').textContent = toman(d.expenseTotal);
  $('#expTitle').textContent = 'توزیع هزینه‌ها' + (dashFunds().length > 1 ? ` · ${d.fund === 'owner' ? 'مالکانه' : 'شارژ'}` : '');
  const g = $('#expenseDonut'), lg = $('#expenseLegend'); g.innerHTML = ''; lg.innerHTML = '';
  if (!d.expenses.length) { lg.innerHTML = '<div class="legend-row"><span class="legend-name">هزینه‌ی تأییدشده‌ای ثبت نشده است</span></div>'; return; }
  let off = 0;
  d.expenses.forEach((e, i) => {
    const len = CIRC * e.total / d.expenseTotal, col = COLORS[i % COLORS.length];
    const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    for (const [k, v] of Object.entries({ cx: 80, cy: 80, r: 56, fill: 'none', stroke: col, 'stroke-width': 24, 'stroke-dasharray': `${Math.max(len - 1.5, 0.5)} ${CIRC}`, 'stroke-dashoffset': -off })) c.setAttribute(k, v);
    g.appendChild(c); off += len;
  });
  lg.innerHTML = join(d.expenses.map((e, i) => html`<div class="legend-row"><span class="legend-dot" style="background:${COLORS[i % COLORS.length]}"></span><span class="legend-name">${e.category}</span><span class="legend-value">${fa(e.total)} تومان</span></div>`));
}
function renderCharges(d) {
  const c = d.charges, pct = c.total ? Math.min(100, Math.round(c.paid / c.total * 100)) : 0;
  $('#chargeTotal').textContent = toman(c.total);
  $('#finTitle').textContent = 'وضعیت مالی' + (dashFunds().length > 1 ? ` · ${d.fund === 'owner' ? 'مالکانه' : 'شارژ'}` : '');
  $('#paidArc').setAttribute('stroke-dasharray', `${CIRC * pct / 100} ${CIRC}`);
  $('#paidPct').textContent = `${fa(pct)}٪`; $('#unpaidPct').textContent = c.total ? `${fa(100 - pct)}٪` : '—';
  $('#paidDetail').textContent = `${fa(c.paidUnits)} واحد · ${fa(c.paid)} تومان`;
  $('#unpaidDetail').textContent = `${fa(c.unpaidUnits)} واحد · ${fa(c.unpaid)} تومان`;
  $('#unitCount').textContent = `${fa(c.units)} واحد`;
}
function fillMonths(d) {
  const list = d.periods.length ? d.periods : [d.period || curPeriod()];
  for (const id of ['#expMonth', '#finMonth']) {
    const s = $(id); s.innerHTML = join(list.map(p => html`<option value="${p}">${d.fund === 'owner' ? fa(p) : periodLabel(p)}</option>`)); s.value = d.period || list[0];
  }
}
export async function loadDashboard(which, period) {
  if (!canDash()) {
    $('#expenseLegend').innerHTML = '<div class="legend-row"><span class="legend-name">اطلاعات مالی برای نقش شما نمایش داده نمی‌شود</span></div>';
    $('#paidDetail').textContent = 'بدون دسترسی'; $('#expMonth').innerHTML = $('#finMonth').innerHTML = ''; return;
  }
  const funds = dashFunds(); if (!funds.includes(S.fund)) S.fund = funds[0];
  const d = await api(`/dashboard?fund=${S.fund}${period ? '&period=' + period : ''}`);
  if (!which) { fillMonths(d); renderExpenses(d); renderCharges(d); }
  else if (which === 'exp') { renderExpenses(d); $('#expMonth').value = d.period; }
  else { renderCharges(d); $('#finMonth').value = d.period; }
}
export async function loadLatestNotice() {
  const { notices } = await api('/notices?limit=3'), n = notices[0];
  $('#boardDate').textContent = n ? fdt(n.created_at) : '';
  $('#boardTitle').textContent = n ? n.title : 'اطلاعیه‌ای ثبت نشده است';
  $('#boardText').textContent = n ? n.body.slice(0, 140) : '';
  $('#ntDate').textContent = n ? fdt(n.created_at) : '';
  $('#ntTitle').textContent = n ? n.title : 'اطلاعیه‌ای ثبت نشده است';
  $('#ntText').textContent = n ? n.body.slice(0, 160) : 'هر زمان مدیریت اطلاعیه‌ای منتشر کند اینجا نمایش داده می‌شود.';
  $('#ntNew').style.display = n && isRecent(n.created_at) ? '' : 'none';
}
export async function loadHome() {
  fillHeader();
  await Promise.allSettled([loadDashboard(), loadLatestNotice()]);
}

// ====================== مقررات و مصوبات ======================
const lineIcon = name => raw(iconMarkup(name));
const FACILITY_ICONS = ['building-2', 'car-front', 'lightbulb', 'trash-2', 'shield-check'];
export async function rulesPage() {
  const { items } = await api('/rules');
  route('خانه', 'مقررات ساختمان', 'قوانین و ضوابط مصوب برای همه‌ی ساکنان', html`<div class="page-list">${items.length ? items.map((r, i) => html`<div class="page-card"><div class="page-row" style="background:none;border:0;padding:0"><div class="page-row-icon">${lineIcon('file-text')}</div><div class="page-row-main"><strong>${r.title}</strong><p>${r.body}</p></div></div></div>`) : html`<div class="page-card"><div class="page-empty">هنوز مقرراتی ثبت نشده است.</div></div>`}</div>`);
}
export async function resolutionsPage() {
  const { items } = await api('/resolutions');
  route('خانه', 'مصوبات', 'تصمیم‌های ثبت‌شده‌ی هیأت‌مدیره و مجمع', html`<div class="page-list">${items.length ? items.map(r => html`<div class="page-card"><h3>${r.title}</h3><p>${r.body}</p><div class="page-kicker">تاریخ مصوبه: ${r.decided_on.replace(/[0-9]/g, d => '۰۱۲۳۴۵۶۷۸۹'[d])}</div></div>`) : html`<div class="page-card"><div class="page-empty">هنوز مصوبه‌ای ثبت نشده است.</div></div>`}</div>`);
}

// ====================== تقویم ======================
export async function calendarPage(y, m) {
  const t = jToday(); y ??= t.y; m ??= t.m;
  const mm = String(m).padStart(2, '0'), response = await api(`/events?month=${y}-${mm}`);
  // پاسخ خالی/ناقص API نباید مانع بازشدن تقویم شود.
  const items = Array.isArray(response?.items) ? response.items : [];
  const canEdit = can('events.manage');
  const byDay = {}; items.forEach(e => (byDay[+e.event_date.slice(8, 10)] ||= []).push(e));
  const start = monthStart(y, m), len = Math.round(((m === 12 ? monthStart(y + 1, 1) : monthStart(y, m + 1)) - start) / 864e5), lead = (start.getUTCDay() + 1) % 7;
  const cells = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'].map(d => html`<span class="dow">${d}</span>`);
  for (let i = 0; i < lead; i++) cells.push(html`<span class="blank"></span>`);
  for (let d = 1; d <= len; d++) cells.push(html`<span class="${byDay[d] ? 'event' : ''} ${y === t.y && m === t.m && d === t.d ? 'today' : ''}" ${byDay[d] ? raw(`data-day="${d}"`) : ''}>${faN(d)}</span>`);
  const prev = m === 1 ? [y - 1, 12] : [y, m - 1], next = m === 12 ? [y + 1, 1] : [y, m + 1];
  const eventFields = [
    { name: 'title', label: 'عنوان رویداد', required: true },
    { name: 'event_date', label: 'تاریخ رویداد', type: 'date', dateSeparator: '-', dir: 'ltr', required: true },
    { name: 'event_time', label: 'ساعت (اختیاری)', dir: 'ltr', placeholder: '18:30' },
    { name: 'body', label: 'توضیحات', type: 'textarea', rows: 2 },
    { name: 'recurrence', label: 'تکرار رویداد', type: 'select', value: 'none', options: [['none','بدون تکرار'],['weekly','هفتگی'],['monthly','ماهانه'],['yearly','سالانه']] },
    { name: 'recurrenceUntil', label: 'پایان تکرار (اختیاری)', type: 'date', dateSeparator: '-', dir: 'ltr' }
  ];
  const v = route('خانه', 'تقویم ساختمان', 'جلسات، سرویس‌ها و رویدادهای پیش‌رو', html`${canEdit ? html`<div class="page-card"><h3>ثبت رویداد جدید</h3><form id="eventNew" class="page-form" novalidate>${fields(eventFields)}<button class="page-btn full" type="submit">ثبت رویداد</button></form></div>` : ''}
    <div class="page-card"><div class="cal-nav"><button class="page-btn sm secondary" id="calPrev">‹ ماه قبل</button><strong>${JM[m - 1]} ${faN(y)}</strong><button class="page-btn sm secondary" id="calNext">ماه بعد ›</button></div><div class="page-calendar">${cells}</div></div>
    <div class="page-card"><h3>رویدادهای ${JM[m - 1]}</h3>${items.length ? html`<div class="page-timeline">${items.map(e => html`<div class="page-event"><strong>${e.title}</strong><small>${faN(+e.event_date.slice(8, 10))} ${JM[m - 1]}${e.event_time ? ' · ' + normFa(e.event_time) : ''}${e.isHoliday ? ' · ' + (e.isOfficialHoliday ? 'تعطیل رسمی' : 'مناسبت') : ''}</small>${e.body ? html`<p>${e.body}</p>` : ''}${canEdit && !e.isHoliday ? html`<div class="row-actions">${e.recurrence !== 'none' ? html`<button class="page-btn sm secondary" data-event-edit-occ="${e.id}" data-occ-date="${e.recurrence_date}">ویرایش این نوبت</button><button class="page-btn sm danger" data-event-delete-occ="${e.id}" data-occ-date="${e.recurrence_date}">حذف این نوبت</button>` : ''}<button class="page-btn sm secondary" data-event-edit="${e.id}">ویرایش ${e.recurrence !== 'none' ? 'سری' : 'رویداد'}</button><button class="page-btn sm danger" data-event-delete="${e.id}">حذف ${e.recurrence !== 'none' ? 'کل سری' : 'رویداد'}</button></div>` : ''}</div>` )}</div>` : html`<div class="page-empty">رویدادی برای این ماه ثبت نشده است.</div>`}</div>`);
  $('#calPrev', v).onclick = () => open(() => calendarPage(...prev), { replace: true });
  $('#calNext', v).onclick = () => open(() => calendarPage(...next), { replace: true });
  const form = $('#eventNew', v);
  if (form) onSubmit(form, async d => {
    const body = { ...d };
    if (!S.user.roles.includes('executive')) { const reason = await promptText('ثبت دلیل انجام خارج از مسئولیت', 'چرا این رویداد را به‌جای مدیر اجرایی ثبت می‌کنید؟', 'ثبت دلیل'); if (!reason) return; body.reason = reason; }
    await api('/events', { method: 'POST', body });
    toast('رویداد ثبت شد');
    open(() => calendarPage(y, m), { replace: true });
  });
  $$('[data-event-edit-occ]', v).forEach(b => b.onclick = () => {
    const event=items.find(e=>e.id===b.dataset.eventEditOcc&&e.recurrence_date===b.dataset.occDate);
    const occurrenceFields=eventFields.slice(0,4).map(f=>({...f,value:f.name==='event_date'?event.event_date:(event[f.name]??'')}));
    const modal=openModal('تغییر یک نوبت رویداد',html`<form class="page-form" novalidate>${fields(occurrenceFields)}<button class="page-btn full" type="submit">ذخیره تغییر تاریخ</button></form>`);
    onSubmit($('form',modal),async d=>{
      const body={...d};if(!S.user.roles.includes('executive')){const reason=await promptText('ثبت دلیل انجام خارج از مسئولیت','چرا این نوبت را به‌جای مدیر اجرایی تغییر می‌دهید؟','ثبت دلیل');if(!reason)return;body.reason=reason;}
      await api(`/events/${event.id}/occurrences/${event.recurrence_date}`,{method:'PATCH',body});
      closeModal();toast('تغییر این نوبت ثبت شد');open(()=>calendarPage(y,m),{replace:true});
    });
  });
  $$('[data-event-delete-occ]',v).forEach(b=>b.onclick=async()=>{
    if(!await ask('حذف یک نوبت','فقط این نوبت حذف شود و نوبت‌های بعدی باقی بمانند؟','حذف',true))return;
    const event=items.find(e=>e.id===b.dataset.eventDeleteOcc&&e.recurrence_date===b.dataset.occDate),body={};
    if(!S.user.roles.includes('executive')){const reason=await promptText('ثبت دلیل انجام خارج از مسئولیت','چرا این نوبت را به‌جای مدیر اجرایی حذف می‌کنید؟','ثبت دلیل');if(!reason)return;body.reason=reason;}
    await api(`/events/${event.id}/occurrences/${event.recurrence_date}`,{method:'DELETE',body});
    toast('این نوبت حذف شد');open(()=>calendarPage(y,m),{replace:true});
  });
  $$('[data-event-edit]', v).forEach(b => b.onclick = () => {
    const event = items.find(e => e.id === b.dataset.eventEdit);
    const modal = openModal('ویرایش رویداد', html`<form class="page-form" novalidate>${fields(eventFields.map(f => ({ ...f, value: f.name === 'event_date' ? (event.series_event_date || event.event_date) : f.name === 'event_time' ? (event.series_event_time ?? event.event_time ?? '') : f.name === 'title' ? (event.series_title || event.title) : f.name === 'body' ? (event.series_body ?? event.body ?? '') : f.name === 'recurrenceUntil' ? (event.series_recurrence_until || event.recurrence_until || '') : (event[f.name] ?? '') })))}<button class="page-btn full" type="submit">ذخیره تغییرات</button></form>`);
    onSubmit($('form', modal), async d => {
      const body = { ...d };
      if (!S.user.roles.includes('executive')) { const reason = await promptText('ثبت دلیل انجام خارج از مسئولیت', 'چرا این رویداد را به‌جای مدیر اجرایی ویرایش می‌کنید؟', 'ثبت دلیل'); if (!reason) return; body.reason = reason; }
      await api(`/events/${event.id}`, { method: 'PUT', body });
      closeModal(); toast('رویداد ویرایش شد');
      open(() => calendarPage(y, m), { replace: true });
    });
  });
  $$('[data-event-delete]', v).forEach(b => b.onclick = async () => {
    if (!await ask('حذف رویداد', 'این رویداد از تقویم حذف شود؟', 'حذف', true)) return;
    const body = {};
    if (!S.user.roles.includes('executive')) { const reason = await promptText('ثبت دلیل انجام خارج از مسئولیت', 'چرا این رویداد را به‌جای مدیر اجرایی حذف می‌کنید؟', 'ثبت دلیل'); if (!reason) return; body.reason = reason; }
    await api(`/events/${b.dataset.eventDelete}`, { method: 'DELETE', body });
    toast('رویداد حذف شد');
    open(() => calendarPage(y, m), { replace: true });
  });
}

const normFa = s => String(s).replace(/[0-9]/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);

// ====================== تابلو و اسناد ======================
export async function boardPage() {
  const { notices } = await api('/notices');
  route('خانه', 'تابلوی ساختمان', 'اطلاعیه‌های مدیریت و مطالب تأییدشده', html`<div class="page-list">${notices.length ? notices.map(n => html`<div class="page-card"><div class="notice-meta"><span>${fdt(n.created_at)}</span><span class="page-chip ${n.kind === 'فوری' ? 'red' : 'blue'}">${n.kind}</span></div><h3 class="notice-title">${n.title}</h3><p>${n.body}</p></div>`) : html`<div class="page-card"><div class="page-empty">اطلاعیه‌ای ثبت نشده است.</div></div>`}</div>`);
}
export async function documentsPage() {
  const { items } = await api('/documents');
  route('حساب من', 'اسناد و فرم‌ها', 'پیوند اسناد منتشرشده توسط مدیریت', html`<div class="page-list">${items.length ? items.map(d => html`<div class="page-row"><div class="page-row-icon">${lineIcon('file-text')}</div><div class="page-row-main"><strong>${d.title}</strong>${d.description ? html`<small>${d.description}</small>` : ''}</div><a class="page-row-tail" href="${d.url}" target="_blank" rel="noopener noreferrer">باز کردن ←</a></div>`) : html`<div class="page-card"><div class="page-empty">سندی ثبت نشده است.</div></div>`}</div>`);
}
export function facilitiesPage() {
  const items = [['آسانسور', 'تأسیسات و تعمیرات'], ['پارکینگ', 'عمومی'], ['روشنایی مشاعات', 'تأسیسات و تعمیرات'], ['نظافت و پسماند', 'نظافت'], ['امنیت و دوربین‌ها', 'امنیت']];
  const v = route('حساب من', 'امکانات و تأسیسات', 'برای هر مورد می‌توانید خرابی یا مشکل را گزارش دهید', html`<div class="page-list">${items.map(([n, c], i) => html`<div class="page-row clickable" data-i="${i}"><div class="page-row-icon">${lineIcon(FACILITY_ICONS[i % FACILITY_ICONS.length])}</div><div class="page-row-main"><strong>${n}</strong><small>گزارش مشکل یا درخواست رسیدگی</small></div><span class="page-row-tail">گزارش ←</span></div>`)}</div>`);
  $$('[data-i]', v).forEach(r => r.onclick = () => open(() => composePage('issue', items[r.dataset.i][1], items[r.dataset.i][0])));
}

// ====================== درخواست‌ها ======================
export async function requestsPage() {
  const { requests } = await api('/requests');
  const openCount = requests.filter(r => ['new', 'in_progress'].includes(r.status)).length;
  const v = route('خانه', 'درخواست‌ها', 'ثبت و پیگیری درخواست‌ها', html`<div class="page-stat-grid"><div class="page-stat"><small>کل موارد</small><strong>${fa(requests.length)}</strong></div><div class="page-stat"><small>در جریان</small><strong class="blue">${fa(openCount)}</strong></div></div>
    <button class="page-btn full" id="rqNew" style="margin:0 0 12px">+ ثبت درخواست</button>
    <div class="page-list">${requests.length ? requests.map(r => html`<div class="page-card"><div class="page-row" style="background:none;border:0;padding:0"><div class="page-row-main"><strong>${r.title}</strong><small>${r.category || 'عمومی'} · ${fdate(r.created_at)}</small></div>${chip(REQ_STATUS[r.status] || [r.status, ''])}</div><p>${r.body}</p>${r.response ? html`<div class="page-divider"></div><div class="page-kicker">پاسخ مدیریت</div><p>${r.response}</p>` : ''}${r.board_requested === 1 ? html`<span class="page-chip">در انتظار انتشار در تابلو</span>` : r.board_requested === 2 ? html`<span class="page-chip green">منتشرشده در تابلو</span>` : ''}</div>`) : html`<div class="page-card"><div class="page-empty">هنوز موردی ثبت نکرده‌اید.</div></div>`}</div>`);
  $('#rqNew', v).onclick = () => open(() => composePage('request'));
}
export function composePage(kind = 'request', category = 'عمومی', subject = '') {
  const v = route('خانه', kind === 'issue' ? 'گزارش مشکل' : 'ثبت درخواست', 'پیام شما برای مدیریت ساختمان ارسال می‌شود', html`<form class="page-card page-form" novalidate>${fields([
    { name: 'category', label: 'دسته‌بندی', type: 'select', value: category, options: REQ_CATEGORIES.map(c => [c, c]) },
    { name: 'title', label: 'موضوع', value: subject ? `مشکل ${subject}` : '', required: true, placeholder: 'عنوان کوتاه' },
    { name: 'body', label: 'شرح', type: 'textarea', required: true, placeholder: 'توضیح کامل را بنویسید' },
    { name: 'boardRequested', label: 'نمایش در تابلوی ساختمان (پس از تأیید مدیریت)', type: 'checkbox' }])}<button class="page-btn full" type="submit">ارسال</button></form>`);
  onSubmit($('form', v), async d => {
    await api('/requests', { method: 'POST', body: { ...d, kind: 'request' } });
    toast('ثبت شد'); open(requestsPage, { replace: true }); refreshSummary();
  });
}

// ====================== مالی ======================
const txRow = (t, mine) => html`<div class="page-row"><div class="page-row-icon">${lineIcon(t.kind === 'payment' ? 'wallet' : t.kind === 'expense' ? 'receipt-text' : 'circle-dot')}</div><div class="page-row-main"><strong>${t.title}</strong><small>${KIND_FA[t.kind]}${t.period ? ' · ' + (t.fund_id === 'owner' ? fa(t.period) : periodLabel(t.period)) : ''} · ${fdate(t.created_at)}${t.reference ? ' · پیگیری ' + t.reference : ''}${t.unit_number && !mine ? ' · واحد ' + t.unit_number : ''}</small>${t.status === 'rejected' && t.note ? html`<small style="color:#ee9bae">دلیل رد: ${t.note}</small>` : ''}</div><div style="text-align:left"><div class="page-row-tail" style="color:#e6edf9">${toman(t.amount)}</div>${chip(TX_STATUS[t.status] || [t.status, ''])}${mine && t.status === 'pending' && t.created_by === S.user.id ? html`<div><button class="page-btn sm secondary" data-cancel="${t.id}" style="margin-top:5px">لغو</button></div>` : ''}</div></div>`;

export async function financePage(fund) {
  const funds = readableFunds();
  if (!funds.length) return route('مالی', 'امور مالی', '', html`<div class="page-card"><div class="page-empty">برای حساب شما صندوق مالی تعریف نشده است.${can('expenses.create') || isManager() ? html`<br>مدیریت مالی از «مدیریت» در منوی پایین در دسترس است.` : ''}</div></div>`);
  fund = funds.includes(fund) ? fund : funds.includes(S.fund) ? S.fund : funds[0]; S.fund = fund;
  const [my, tx, dash] = await Promise.all([api(`/finance/my?fund=${fund}`), api(`/transactions?fund=${fund}&limit=60`), dashFunds().includes(fund) ? api(`/dashboard?fund=${fund}`) : null]);
  const pct = dash && dash.charges.total ? Math.min(100, Math.round(dash.charges.paid / dash.charges.total * 100)) : null;
  const v = route('مالی', 'امور مالی', FUND_FA[fund], html`${funds.length > 1 ? html`<div class="seg">${funds.map(f => html`<button class="${f === fund ? 'on' : ''}" data-fund="${f}">${FUND_FA[f]}</button>`)}</div>` : ''}
    <div class="page-stat-grid"><div class="page-stat"><small>مانده بدهی واحد</small><strong class="${my.balance > 0 ? '' : 'green'}">${toman(Math.max(my.balance, 0))}</strong></div><div class="page-stat"><small>${my.balance < 0 ? 'اعتبار واحد' : 'در انتظار تأیید'}</small><strong class="blue">${toman(my.balance < 0 ? -my.balance : my.pending)}</strong></div><div class="page-stat"><small>کل شارژ</small><strong>${toman(my.charged)}</strong></div><div class="page-stat"><small>آخرین پرداخت</small><strong style="font-size:13px">${my.lastPaymentAt ? fdate(my.lastPaymentAt) : '—'}</strong></div></div>
    ${can(`finance.${fund}.pay`) && S.user.unit_id ? html`<button class="page-btn full" id="payBtn" style="margin:0 0 12px">ثبت پرداخت و ارسال رسید</button>` : ''}
    ${pct != null ? html`<div class="page-card"><h3>وصول شارژ ساختمان · ${(fund === 'owner' ? fa(dash.period || jToday().y) : periodLabel(dash.period || curPeriod()))}</h3><div class="bar"><div style="width:${pct}%"></div></div><p>${fa(pct)}٪ وصول‌شده · ${fa(dash.charges.paidUnits)} از ${fa(dash.charges.units)} واحد تسویه‌اند</p></div>` : ''}
    <div class="page-card"><h3>تراکنش‌های واحد شما</h3><div class="page-list">${tx.transactions.length ? tx.transactions.map(t => txRow(t, true)) : html`<div class="page-empty">تراکنشی ثبت نشده است.</div>`}</div></div>
    ${can('finance.approve') || can('expenses.approve') ? html`<button class="page-btn secondary full" id="goApprove">رفتن به تأیید پرداخت‌ها در بخش مدیریت</button>` : ''}`);
  $$('[data-fund]', v).forEach(b => b.onclick = () => open(() => financePage(b.dataset.fund), { replace: true }));
  const pb = $('#payBtn', v); if (pb) pb.onclick = () => open(() => payPage(fund, my.balance));
  $$('[data-cancel]', v).forEach(b => b.onclick = async () => { if (await ask('لغو پرداخت', 'این پرداخت در انتظار تأیید لغو شود؟', 'لغو پرداخت', true)) { await api(`/transactions/${b.dataset.cancel}`, { method: 'DELETE' }); toast('لغو شد'); open(() => financePage(fund), { replace: true }); } });
  const ga = $('#goApprove', v); if (ga) ga.onclick = () => document.dispatchEvent(new CustomEvent('nika:admin', { detail: 'finance' }));
}
function payPage(fund, balance) {
  const v = route('مالی', 'ثبت پرداخت', FUND_FA[fund], html`<form class="page-card page-form" novalidate><p>پس از پرداخت (کارت‌به‌کارت یا واریز)، مبلغ و شماره پیگیری را ثبت کنید. پرداخت پس از بررسی مدیر مالی در حساب شما اعمال می‌شود.</p>${fields([
    { name: 'amount', label: 'مبلغ (تومان)', inputmode: 'numeric', required: true, value: balance > 0 ? fa(balance).replace(/٬/g, '') : '', dir: 'ltr' },
    { name: 'reference', label: 'شماره پیگیری / ۴ رقم آخر کارت', required: true, dir: 'ltr' },
    ...(fund === 'owner' ? [] : [{ name: 'period', label: 'بابت دوره', type: 'select', value: curPeriod(), options: JM.map((month, i) => [`${curPeriod().slice(0, 4)}-${String(i + 1).padStart(2, '0')}`, month]) }]),
    { name: 'note', label: 'توضیحات (اختیاری)', type: 'textarea', rows: 3 }])}<button class="page-btn full" type="submit">ثبت پرداخت</button></form>`);
  onSubmit($('form', v), async d => {
    const amount = parseAmount(d.amount); if (!amount) throw new Error('مبلغ را به‌صورت عدد وارد کنید');
    await api('/transactions', { method: 'POST', body: { kind: 'payment', fund, amount, reference: d.reference, ...(fund === 'owner' ? {} : { period: d.period || undefined }), note: d.note || undefined } });
    toast('پرداخت ثبت شد و در انتظار تأیید است'); open(() => financePage(fund), { replace: true }); refreshSummary();
  });
}

// ====================== پیام‌ها ======================
export async function messagesPage(box = 'inbox') {
  const { messages } = await api(`/messages?box=${box}`);
  const mgr = can('messages.manage');
  const v = route('پیام‌ها', 'پیام‌ها', mgr ? 'پیام‌های مدیریت و گفتگو با ساکنان' : 'گفتگو با مدیریت ساختمان', html`<div class="seg"><button class="${box === 'inbox' ? 'on' : ''}" data-box="inbox">دریافتی</button><button class="${box === 'sent' ? 'on' : ''}" data-box="sent">ارسالی</button></div>
    <button class="page-btn full" id="msgNew" style="margin:0 0 12px">+ پیام جدید به مدیریت</button>
    <div class="page-list">${messages.length ? messages.map((m, i) => html`<div dir="rtl" class="page-row clickable nika-message-row tone-${m.tone || 'info'} ${box === 'inbox' && !m.read_at ? 'unread' : ''}" data-i="${i}"><div class="page-row-icon">${lineIcon('mail')}</div><div class="page-row-main"><strong>${m.title}</strong><small>${box === 'sent' ? 'به: ' + (m.recipient_name || 'مدیریت') : 'از: ' + m.sender_name + (m.sender_unit ? ' (واحد ' + m.sender_unit + ')' : '')} · ${fdt(m.created_at)}</small></div></div>`) : html`<div class="page-card"><div class="page-empty">پیامی وجود ندارد.</div></div>`}</div>`);
  $$('[data-box]', v).forEach(b => b.onclick = () => open(() => messagesPage(b.dataset.box), { replace: true }));
  $('#msgNew', v).onclick = () => open(() => messageComposePage());
  $$('[data-i]', v).forEach(r => r.onclick = async () => {
    const m = messages[r.dataset.i];
    const el = openModal(m.title, html`<p class="page-kicker">${box === 'sent' ? 'به: ' + (m.recipient_name || 'مدیریت') : 'از: ' + m.sender_name} · ${fdt(m.created_at)}</p><p dir="rtl" class="nika-message-body tone-${m.tone}" style="white-space:pre-wrap;text-align:right;direction:rtl">${m.body}</p>${box === 'inbox' && m.sender_id !== S.user.id && !can('messages.manage') ? html`<div class="row-actions"><button class="page-btn sm" data-reply>پاسخ</button></div>` : ''}`);
    const rp = $('[data-reply]', el); if (rp) rp.onclick = () => { closeModal(); open(() => messageComposePage('Re: ' + m.title)); };
    if (box === 'inbox' && !m.read_at) { api(`/messages/${m.id}/read`, { method: 'POST' }).then(refreshSummary).catch(() => {}); r.classList.remove('unread'); m.read_at = 1; }
  });
}
export function messageComposePage(title = '') {
  const v = route('پیام‌ها', 'پیام جدید', 'ارسال به مدیریت ساختمان', html`<form class="page-card page-form" novalidate>${fields([{ name: 'title', label: 'عنوان', value: title, required: true }, { name: 'body', label: 'متن پیام', type: 'textarea', required: true }])}<button class="page-btn full" type="submit">ارسال</button></form>`);
  onSubmit($('form', v), async d => { await api('/messages', { method: 'POST', body: d }); toast('پیام ارسال شد'); open(() => messagesPage('sent'), { replace: true }); });
}

// ====================== حساب من ======================
export async function refreshSummary() {
  try {
    S.summary = await api('/summary');
    const b = $('#msgBadge'); b.textContent = fa(S.summary.unreadMessages); b.style.display = S.summary.unreadMessages ? '' : 'none';
    const a = $('#admBadge'); if (a) { const n = S.summary.pendingApprovals + S.summary.newRequests; a.textContent = fa(n); a.style.display = n ? '' : 'none'; }
  } catch {}
}
export function profilePage() {
  const u = S.user, unit = u.unit;
  const details = [
    ['شماره موبایل', normFa(u.phone)],
    ['ایمیل', u.email || '—'],
    ['نوع حساب', u.account_type === 'staff' ? 'مدیر / کارکنان' : u.account_type === 'owner' ? 'مالک' : 'ساکن'],
    ...(unit ? [['شماره واحد', unit.number]] : [])
  ];
  const v = route('حساب من', 'حساب من', '', html`<section class="profile-panel">
      <div class="profile-cover">${raw(avatarMarkup(u, 'profile-avatar'))}<div><strong>${u.name}</strong><small>${u.roles.map(r => ROLE_FA[r]).join(' · ')}</small></div></div>
      <div class="profile-details">${details.map(([k, val]) => html`<div class="profile-detail"><small>${k}</small><strong>${val}</strong></div>`)}</div>
    </section>
    <div class="profile-actions">
      <button class="page-row clickable" data-go="edit"><span class="profile-action-icon">${lineIcon('user-round-pen')}</span><span class="page-row-main"><strong>ویرایش پروفایل</strong><small>اطلاعات تماس و تصویر</small></span><span class="page-row-tail">←</span></button>
      <button class="page-row clickable" data-go="set"><span class="profile-action-icon">${lineIcon('settings')}</span><span class="page-row-main"><strong>تنظیمات و امنیت</strong><small>تغییر رمز عبور</small></span><span class="page-row-tail">←</span></button>
    </div>`);
  const map = { edit: editProfilePage, set: settingsPage };
  $$('[data-go]', v).forEach(r => r.onclick = () => open(map[r.dataset.go]));
}
// کوچک‌کردن تصویر در مرورگر (حداکثر ۲۵۶ پیکسل) پیش از ارسال
async function toAvatar(file) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('فقط تصویر JPG، PNG یا WebP پذیرفته می‌شود');
  const bmp = await createImageBitmap(file), s = Math.min(bmp.width, bmp.height), c = document.createElement('canvas'); c.width = c.height = 256;
  c.getContext('2d').drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, 256, 256);
  return c.toDataURL('image/jpeg', 0.82);
}
export function editProfilePage() {
  const u = S.user;
  const v = route('حساب من', 'ویرایش پروفایل', '', html`<form class="page-card page-form" novalidate>${fields([
    { name: 'name', label: 'نام و نام خانوادگی', value: u.name, required: true },
    { name: 'email', label: 'ایمیل (اختیاری)', type: 'email', value: u.email || '', dir: 'ltr' },
    { name: 'phone', label: 'شماره موبایل (نام کاربری ورود)', value: u.phone, inputmode: 'tel', dir: 'ltr' },
    { name: 'gender', label: 'جنسیت', type: 'select', value: u.gender || 'unspecified', options: [['female','خانم'],['male','آقا'],['unspecified','تمایلی به اعلام ندارم']] },
    { name: 'currentPassword', label: 'رمز فعلی (فقط هنگام تغییر شماره موبایل)', type: 'password', dir: 'ltr', autocomplete: 'current-password' }])}<button class="page-btn full" type="submit">ذخیره تغییرات</button></form>
    <div class="page-card"><h3>تصویر پروفایل</h3><input type="file" id="avFile" accept="image/jpeg,image/png,image/webp" class="page-input"><div class="row-actions">${u.has_avatar ? html`<button class="page-btn sm danger" id="avDel">حذف تصویر</button>` : ''}</div><p class="form-error" id="avErr"></p></div>`);
  onSubmit($('form', v), async d => {
    const body = { name: d.name, email: d.email, gender: d.gender }; if (d.phone && d.phone !== u.phone) { body.phone = d.phone; body.currentPassword = d.currentPassword; }
    const r = await api('/profile', { method: 'PATCH', body }); S.user = r.user; fillHeader(); toast('ذخیره شد'); open(profilePage, { replace: true });
  });
  $('#avFile', v).onchange = async e => {
    try { const f = e.target.files[0]; if (!f) return; const r = await api('/avatar', { method: 'PUT', body: { avatarData: await toAvatar(f) } }); S.user = r.user; fillHeader(); toast('تصویر ذخیره شد'); open(profilePage, { replace: true }); }
    catch (err) { $('#avErr').textContent = err.message; }
  };
  const del = $('#avDel', v); if (del) del.onclick = async () => { S.user = (await api('/avatar', { method: 'DELETE' })).user; fillHeader(); toast('حذف شد'); open(profilePage, { replace: true }); };
}
export async function settingsPage() {
  const currentTheme = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  const managerRoles = ['chair', 'finance', 'board', 'executive'];
  const canDelegate = S.user.roles.some(r => managerRoles.includes(r));
  let delegationData = { roles: [], available: [], delegations: [] };
  if (canDelegate) delegationData = await api('/delegations');
  const roleLabels = { chair: 'رئیس هیئت‌مدیره', finance: 'مدیر مالی', board: 'عضو هیئت‌مدیره', executive: 'مدیر اجرایی' };
  const currentFor = role => delegationData.delegations.find(d => d.delegator_role === role);
  const delegationCard = canDelegate ? html`<section class="page-card"><h3>جانشین مسئولیت‌ها</h3><p class="nika-footnote">برای هر مسئولیت فقط خودِ مسئول اصلی می‌تواند جانشین تعیین کند. با غیرفعال‌کردن گزینه، دسترسی جانشین فوراً قطع می‌شود.</p>
    ${delegationData.roles.map(role => {
      const d = currentFor(role), enabled = !!d?.enabled;
      return html`<div class="delegation-setting" data-delegation-role="${role}">
        <div class="row" style="align-items:center;justify-content:space-between"><strong>جانشین ${roleLabels[role]}</strong><label class="compose-check"><input type="checkbox" data-delegation-toggle="${role}" ${enabled ? raw('checked') : ''}> فعال‌سازی جانشین</label></div>
        <select class="page-select" data-delegation-select="${role}" ${enabled ? '' : raw('disabled')}>
          <option value="">انتخاب از میان مدیران ساختمان</option>
          ${delegationData.available.map(u => html`<option value="${u.id}" ${d?.delegate_user_id === u.id ? raw('selected') : ''}>${u.name} · ${u.roles.map(r => roleLabels[r] || ROLE_FA[r]).join('، ')}</option>`)}
        </select>
        <button class="page-btn secondary full" type="button" data-delegation-save="${role}">ذخیره جانشین</button>
      </div>`;
    })}
    ${delegationData.available.length ? '' : html`<p class="nika-footnote">در حال حاضر مدیر فعال دیگری برای انتخاب به‌عنوان جانشین وجود ندارد.</p>`}
  </section>` : '';
  const v = route('حساب من', 'تنظیمات و امنیت', '', html`<section class="page-card theme-setting"><div class="theme-setting-copy"><h3>حالت نمایش</h3><p>انتخاب بین نمای شب و روز</p></div><div class="theme-switch-wrap"><span class="theme-current" id="themeCurrent">${currentTheme === 'light' ? 'روز' : 'شب'}</span><button class="theme-switch" type="button" id="themeToggle" role="switch" aria-checked="${currentTheme === 'light'}" aria-label="تغییر بین حالت شب و روز"><span class="theme-switch-sun">${raw(iconMarkup('sun'))}</span><span class="theme-switch-moon">${raw(iconMarkup('moon'))}</span><span class="theme-switch-thumb"></span></button></div></section>
  ${delegationCard}
  <form class="page-card page-form" novalidate><h3>تغییر رمز عبور</h3>${fields([
    { name: 'currentPassword', label: 'رمز فعلی', type: 'password', required: true, dir: 'ltr', autocomplete: 'current-password' },
    { name: 'newPassword', label: 'رمز جدید (حداقل ۸ کاراکتر، نه فقط عدد)', type: 'password', required: true, dir: 'ltr', autocomplete: 'new-password' },
    { name: 'again', label: 'تکرار رمز جدید', type: 'password', required: true, dir: 'ltr', autocomplete: 'new-password' }])}<button class="page-btn full" type="submit">تغییر رمز</button><p class="nika-footnote">پس از تغییر رمز، نشست سایر دستگاه‌ها بسته می‌شود.</p></form>
`);
  const themeToggle = $('#themeToggle', v);
  themeToggle.onclick = () => {
    const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('nika-theme', next); } catch {}
    $('#themeCurrent', v).textContent = next === 'light' ? 'روز' : 'شب';
    themeToggle.setAttribute('aria-checked', String(next === 'light'));
  };
  onSubmit($('form', v), async (d, f) => {
    if (d.newPassword !== d.again) throw new Error('تکرار رمز با رمز جدید یکسان نیست');
    await api('/password', { method: 'POST', body: { currentPassword: d.currentPassword, newPassword: d.newPassword } }); f.reset(); toast('رمز عبور تغییر کرد');
  });
  $$('[data-delegation-toggle]', v).forEach(check => {
    check.onchange = () => {
      const select = $(`[data-delegation-select="${check.dataset.delegationToggle}"]`, v);
      select.disabled = !check.checked;
    };
  });
  $$('[data-delegation-save]', v).forEach(button => button.onclick = async () => {
    const role = button.dataset.delegationSave;
    const enabled = $(`[data-delegation-toggle="${role}"]`, v).checked;
    const delegateId = $(`[data-delegation-select="${role}"]`, v).value;
    if (enabled && !delegateId) { toast('ابتدا جانشین را انتخاب کنید'); return; }
    button.disabled = true;
    try {
      await api(`/delegations/${role}`, { method: 'PUT', body: { enabled, delegateId: enabled ? delegateId : undefined } });
      toast(enabled ? 'جانشین فعال شد' : 'دسترسی جانشین قطع شد');
      open(settingsPage, { replace: true });
    } catch (e) { toast(e.message); }
    finally { button.disabled = false; }
  });
}

// صفحه‌های کاربری: خانه، مقررات، مصوبات، تقویم، تابلو، درخواست‌ها، مالی، پیام‌ها، پروفایل، تنظیمات
import { api } from './api.js?v=2';
import { S, can, canManageCalendarEvents, readableFunds, dashFunds, isManager } from './state.js';
import { html, raw, join, $, $$, fa, toman, fdate, fdt, parseAmount, periodLabel, curPeriod, JM, jOf, jToday, monthStart, monthLen, faN, normDigits,
  FUND_FA, KIND_FA, TX_STATUS, REQ_STATUS, REQ_CATEGORIES, ROLE_FA, baseRoleLabel, userRoleLabels, chip } from './util.js?v=4';
import { toast, openModal, closeModal, ask, promptText, route, open, fields, onSubmit } from './ui.js?v=6';
import { iconMarkup } from './icons.js?v=5';

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
  const managerRole = ['chair','finance','board','executive','caretaker','system_admin'].find(r => u.roles?.includes(r))
    || ['chair','finance','board','executive','caretaker'].find(r => u.delegatedRoles?.includes(r));
  const baseRoleText = S.workspace === 'manager'
    ? (ROLE_FA[managerRole] || u.roles.map(r => ROLE_FA[r]).filter(Boolean).join('، '))
    : (baseRoleLabel(u) || (u.account_type === 'staff' ? 'مدیر / کارکنان' : 'کاربر ساختمان'));
  const delegatedText = (u.delegatedRoles || []).map(r => `جانشین ${ROLE_FA[r]}`).join('، ');
  $('#hdrSub').textContent = [baseRoleText, delegatedText].filter(Boolean).join(' · ');
  $('#hdrAvatar').innerHTML = avatarMarkup(u);
}

function renderExpenseChart(data, donutId, legendId, totalId, balanceId) {
  const total = Number(data?.total || 0), balance = Number(data?.balance || 0), expenses = Array.isArray(data?.expenses) ? data.expenses : [];
  const available = total + balance;
  const donut = $(donutId), legend = $(legendId), totalNode = $(totalId), balanceNode = $(balanceId);
  if (!donut || !legend || !totalNode || !balanceNode) return;
  donut.innerHTML = ''; legend.innerHTML = ''; totalNode.textContent = toman(total); balanceNode.textContent = toman(balance);
  if (available <= 0) {
    legend.innerHTML = '<div class="legend-row"><span class="legend-name">هنوز موجودی یا هزینه‌ای ثبت نشده است</span></div>';
    return;
  }
  let offset = 0;
  expenses.forEach((expense, index) => {
    const amount = Number(expense.total || 0), percent = amount / available * 100, length = CIRC * percent / 100;
    if (length <= 0) return;
    const arc = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    for (const [key,value] of Object.entries({cx:80,cy:80,r:56,fill:'none',stroke:COLORS[index%COLORS.length],'stroke-width':24,'stroke-dasharray':`${Math.max(length-1.5,.5)} ${CIRC}`,'stroke-dashoffset':-offset})) arc.setAttribute(key,value);
    donut.appendChild(arc); offset += length;
  });
  const remainingLength = CIRC * balance / available;
  if (remainingLength > 0) {
    const remainingArc = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    for (const [key,value] of Object.entries({cx:80,cy:80,r:56,fill:'none',stroke:'#33415c','stroke-width':24,'stroke-dasharray':`${Math.max(remainingLength-1.5,.5)} ${CIRC}`,'stroke-dashoffset':-offset})) remainingArc.setAttribute(key,value);
    donut.appendChild(remainingArc);
  }
  legend.innerHTML = join([
    ...expenses.map((expense,index) => {
      const percent = Number(expense.total || 0) / available * 100;
      return html`<div class="legend-row"><span class="legend-dot" style="background:${COLORS[index%COLORS.length]}"></span><span class="legend-name">${expense.category}</span><span class="legend-value">${fa(percent.toFixed(1))}٪ · ${fa(expense.total)} تومان</span></div>`;
    }),
    html`<div class="legend-row"><span class="legend-dot" style="background:#33415c"></span><span class="legend-name">موجودی باقی‌مانده</span><span class="legend-value">${fa((balance / available * 100).toFixed(1))}٪ · ${fa(balance)} تومان</span></div>`
  ]);
}
function renderUnpaidUnitSummary(status) {
  const button = $('#unpaidUnitsButton'), count = $('#unpaidUnitCount');
  const c = status?.charges;
  if (!button || !count) return;
  count.textContent = c ? fa(c.unpaidUnits) : '—';
  button.disabled = !c;
  button.onclick = () => {
    if (!c) return;
    const units = Array.isArray(c.unpaidUnitNumbers) ? c.unpaidUnitNumbers : [];
    const rows = units.length
      ? html`<div class="page-list">${units.map(unit => html`<div class="page-row"><div class="page-row-icon">${raw(iconMarkup('building-2'))}</div><div class="page-row-main"><strong>واحد ${fa(unit)}</strong><small>برای این دوره پرداختی ثبت نشده است</small></div></div>`)}</div>`
      : html`<div class="page-card"><div class="page-empty">برای این دوره واحدی بدون پرداخت ثبت‌نشده وجود ندارد.</div></div>`;
    openModal(`واحدهای بدون پرداخت · ${periodLabel(status.period)}`, html`${rows}<p class="page-kicker">پرداخت‌های ثبت‌شده در انتظار تأیید، در این فهرست نمایش داده نمی‌شوند.</p>`);
  };
}
function renderCharges(d, monthlyStatus) {
  const c = d.charges || {}, isMonthly = d.fund === 'monthly';
  const total = Number(c.total || 0), paid = Number(c.paid || 0);
  const pending = isMonthly ? Number(c.pending || 0) : 0;
  const paidPct = total ? Math.min(100, Math.round(paid / total * 100)) : 0;
  const pendingPct = total ? Math.min(100 - paidPct, Math.round(pending / total * 100)) : 0;
  const unpaidPct = total ? 100 - paidPct - pendingPct : 0;
  const paidLen = CIRC * paidPct / 100, pendingLen = CIRC * pendingPct / 100;
  $('#chargeTotal').textContent = toman(total);
  $('#finTitle').textContent = 'وضعیت مالی' + (dashFunds().length > 1 ? ` · ${d.fund === 'owner' ? 'مالکانه' : 'شارژ'}` : '');
  $('#paidArc').setAttribute('stroke-dasharray', `${paidLen} ${CIRC}`);
  $('#pendingArc').setAttribute('stroke-dasharray', `${pendingLen} ${CIRC}`);
  $('#pendingArc').setAttribute('stroke-dashoffset', String(-paidLen));
  $('#paidPct').textContent = total ? `${fa(paidPct)}٪` : '—';
  $('#pendingPct').textContent = total ? `${fa(pendingPct)}٪` : '—';
  $('#unpaidPct').textContent = total ? `${fa(unpaidPct)}٪` : '—';
  $('#paidDetail').textContent = `${fa(c.paidUnits || 0)} واحد · ${fa(paid)} تومان`;
  $('#pendingDetail').textContent = `${fa(c.pendingUnits || 0)} واحد · ${fa(pending)} تومان`;
  $('#unpaidDetail').textContent = `${fa(c.unpaidUnits || 0)} واحد · ${fa(c.unpaid ?? Math.max(0, total - paid - pending))} تومان`;
  $('#pendingLegend').style.display = isMonthly ? '' : 'none';
  $('#unpaidLabel').textContent = isMonthly ? 'پرداخت ثبت‌نشده' : 'وصول‌نشده';
  $('#finNote').textContent = isMonthly ? 'مبنای محاسبه: مبلغ مصوب شارژ برای ۳۲ واحد' : 'درصدها بر اساس مبلغ شارژ؛ تعداد واحدها جداگانه محاسبه می‌شود';
  renderUnpaidUnitSummary(monthlyStatus);
}
function fillMonths(d) {
  const list = [...new Set(d.periods || [])];
  if (d.period && !list.includes(d.period)) list.unshift(d.period);
  if (!list.length) list.push(curPeriod());
  for (const id of ['#expMonth', '#finMonth']) {
    const s = $(id); s.innerHTML = join(list.map(p => html`<option value="${p}">${d.fund === 'owner' ? fa(p) : periodLabel(p)}</option>`)); s.value = d.period || list[0];
  }
}
export async function loadDashboard(which, period) {
  const requestedPeriod = period || $('#finMonth')?.value || curPeriod();
  const [monthlyStatus, distribution] = await Promise.all([
    api(`/finance/monthly-status?period=${encodeURIComponent(requestedPeriod)}`),
    api('/finance/expense-distribution')
  ]);
  renderCharges({fund:'monthly',charges:monthlyStatus.charges}, monthlyStatus);
  const periods = [...new Set([...(distribution.monthlyPeriods || []),monthlyStatus.period])].filter(Boolean);
  const monthSelect = $('#finMonth');
  if (monthSelect) { monthSelect.innerHTML = join(periods.map(value => html`<option value="${value}">${periodLabel(value)}</option>`)); monthSelect.value = monthlyStatus.period; }
  renderExpenseChart(distribution.monthly,'#expenseDonut','#expenseLegend','#expenseTotal','#monthlyFundBalance');
  renderExpenseChart(distribution.owner,'#ownerExpenseDonut','#ownerExpenseLegend','#ownerExpenseTotal','#ownerFundBalance');
  $('#expTitle').textContent = 'توزیع هزینه‌های صندوق جاری';
  $('#ownerExpTitle').textContent = 'توزیع هزینه‌های صندوق مالکانه';
}
export async function loadLatestNotice() {
  const { notices } = await api('/notices?limit=3'), n = notices[0];
  $('#boardDate').textContent = n ? fdt(n.created_at) : '';
  $('#boardTitle').textContent = n ? n.title : 'اطلاعیه‌ای ثبت نشده است';
  $('#boardText').textContent = n ? n.body.slice(0, 140) : '';
}

let publicMessageTimer = null;
let publicMessageIndex = 0;
const PUBLIC_MESSAGE_INTERVAL = 8000;
let publicMessagePaused = false;
const canDeletePublicMessage = () => S.workspace === 'manager' && !!S.user?.roles?.includes('chair');
const PUBLIC_REACTIONS = [
  { key: 'like', emoji: '👍', label: 'پسندیدم' },
  { key: 'heart', emoji: '❤️', label: 'دوست داشتم' },
  { key: 'support', emoji: '🤝', label: 'حمایت می‌کنم' },
  { key: 'celebrate', emoji: '🎉', label: 'تبریک' }
];
export async function loadPublicMessages() {
  const track = $('#publicMessageTrack'), viewport = $('.public-message-viewport');
  const status = $('#publicMessageStatus'), pauseButton = $('#publicMessagePause');
  if (!track || !status || !viewport) return;
  if (publicMessageTimer) clearInterval(publicMessageTimer);
  publicMessageTimer = null;
  const updatePauseButton = () => {
    if (!pauseButton) return;
    pauseButton.textContent = publicMessagePaused ? 'ادامه پخش' : 'توقف پخش';
    pauseButton.setAttribute('aria-pressed', String(publicMessagePaused));
  };
  if (pauseButton) {
    updatePauseButton();
    pauseButton.onclick = () => {
      publicMessagePaused = !publicMessagePaused;
      updatePauseButton();
    };
  }
  try {
    const { messages = [] } = await api('/public-messages?limit=5');
    if (!messages.length) {
      track.innerHTML = '<div class="public-message-empty">هنوز پیام عمومی ثبت نشده است.</div>';
      track.className = 'public-message-track is-empty';
      status.textContent = 'پیام‌های منتشرشده کاربران';
      return;
    }
    publicMessageIndex = 0;
    track.className = 'public-message-track';
    track.innerHTML = join(messages.map((m, index) => html`<article class="public-message-item" data-gallery-index="${index}">
      <button type="button" class="public-message-open" data-public-message="${m.id}" aria-label="مشاهده پیام ${m.title}">
        <span class="public-message-meta"><span>${m.author_label} · ${m.author_name}</span><span>${fdt(m.created_at)}</span></span>
        <strong>${m.title}</strong><span class="public-message-excerpt">${String(m.body || '').slice(0, 132)}${String(m.body || '').length > 132 ? '…' : ''}</span>
      </button>
      ${canDeletePublicMessage() ? html`<button type="button" class="public-message-delete" data-delete-message="${m.id}" aria-label="حذف پیام">${iconMarkup('trash-2')}</button>` : ''}
    </article>`));
    const paintGallery = (animate = true) => {
      const count = messages.length;
      publicMessageIndex = (publicMessageIndex + count) % count;
      if (!animate) track.classList.add('no-motion');
      track.querySelectorAll('.public-message-item').forEach((item, index) => {
        const delta = (index - publicMessageIndex + count) % count;
        item.classList.toggle('is-active', delta === 0);
        item.classList.toggle('is-previous', count > 1 && delta === count - 1);
        item.classList.toggle('is-next', count > 1 && delta === 1);
        item.classList.toggle('is-hidden', delta > 1 && delta !== count - 1);
        item.setAttribute('aria-hidden', String(delta > 1 && delta !== count - 1));
      });
      if (!animate) requestAnimationFrame(() => track.classList.remove('no-motion'));
    };
    paintGallery(false);
    status.textContent = `${fa(messages.length)} پیام در گالری · جدیدترین پیام در مرکز`;
    track.onclick = event => {
      const remove = event.target.closest('[data-delete-message]');
      if (remove) { deletePublicMessage(remove.dataset.deleteMessage, false); return; }
      const item = event.target.closest('[data-gallery-index]');
      if (!item) return;
      const selectedIndex = Number(item.dataset.galleryIndex);
      if (selectedIndex !== publicMessageIndex) {
        publicMessageIndex = selectedIndex;
        publicMessagePaused = true;
        updatePauseButton();
        paintGallery();
        return;
      }
      const openButton = event.target.closest('[data-public-message]');
      if (openButton) openPublicMessageModal(openButton.dataset.publicMessage);
    };
    const moveGallery = direction => {
      if (messages.length < 2) return;
      publicMessageIndex = (publicMessageIndex + direction + messages.length) % messages.length;
      paintGallery();
    };
    let pointerStartY = null;
    viewport.tabIndex = 0;
    viewport.setAttribute('role', 'group');
    viewport.setAttribute('aria-label', 'گالری عمودی پیام‌های عمومی');
    viewport.onpointerdown = event => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      pointerStartY = event.clientY;
      try { viewport.setPointerCapture(event.pointerId); } catch {}
    };
    viewport.onpointerup = event => {
      if (pointerStartY === null) return;
      const delta = event.clientY - pointerStartY;
      pointerStartY = null;
      if (Math.abs(delta) < 24) return;
      publicMessagePaused = true;
      updatePauseButton();
      moveGallery(delta < 0 ? 1 : -1);
    };
    viewport.onpointercancel = () => { pointerStartY = null; };
    viewport.onwheel = event => {
      if (Math.abs(event.deltaY) < 8) return;
      event.preventDefault();
      publicMessagePaused = true;
      updatePauseButton();
      moveGallery(event.deltaY > 0 ? 1 : -1);
    };
    viewport.onkeydown = event => {
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
      event.preventDefault();
      publicMessagePaused = true;
      updatePauseButton();
      moveGallery(event.key === 'ArrowDown' ? 1 : -1);
    };
    if (messages.length > 1) publicMessageTimer = setInterval(() => {
      if (document.hidden || publicMessagePaused || $('#modalBackdrop')?.classList.contains('open') || !$('#noticeCard')?.getClientRects().length) return;
      moveGallery(1);
    }, PUBLIC_MESSAGE_INTERVAL);
  } catch (error) {
    track.innerHTML = '<div class="public-message-empty">دریافت پیام‌ها در حال حاضر ممکن نیست.</div>';
    track.className = 'public-message-track is-empty';
    status.textContent = 'پیام کاربران';
    console.warn('Nika public messages:', error);
  }
}
async function deletePublicMessage(id, refreshPage = false) {
  if (!canDeletePublicMessage()) return;
  const reason = await promptText('حذف پیام عمومی', 'لطفاً دلیل حذف این پیام را بنویسید (ثبت دلیل الزامی است)');
  if (!reason) return;
  try {
    await api(`/public-messages/${encodeURIComponent(id)}`, { method: 'DELETE', body: { reason } });
    closeModal();
    toast('پیام از تابلو حذف شد و دلیل آن ثبت گردید');
    if (refreshPage) await publicMessagesPage();
    else await loadPublicMessages();
  } catch (error) { toast(error.message); }
}
function renderPublicMessageDiscussion(data) {
  const counts = Object.fromEntries((data.reactions || []).map(x => [x.reaction, Number(x.count || 0)]));
  return html`<article class="public-message-detail">
    <div class="public-message-detail-meta"><span>${data.message.author_label} · ${data.message.author_name}</span><span>${fdt(data.message.created_at)}</span></div>
    ${canDeletePublicMessage() ? html`<button type="button" class="public-message-delete" data-delete-message="${data.message.id}">${iconMarkup('trash-2')} حذف پیام</button>` : ''}
    <h3>${data.message.title}</h3><p class="public-message-fulltext">${data.message.body}</p>
    <div class="public-message-reactions">${PUBLIC_REACTIONS.map(r => html`<button type="button" class="public-reaction ${data.myReaction === r.key ? 'selected' : ''}" data-reaction="${r.key}" aria-pressed="${data.myReaction === r.key}"><span>${r.emoji}</span><small>${r.label}</small><b>${fa(counts[r.key] || 0)}</b></button>`)}</div>
    <div class="page-divider"></div><h4 class="public-comments-title">دیدگاه‌ها · ${fa((data.comments || []).length)}</h4>
    <div class="public-comments-list">${data.comments?.length ? data.comments.map(c => html`<div class="public-comment"><div><strong>${c.author_name}</strong><span>${c.author_label}</span><small>${fdt(c.created_at)}</small></div><p>${c.body}</p></div>`) : html`<div class="page-empty">هنوز دیدگاهی ثبت نشده است.</div>`}</div>
    ${can('messages.use') ? html`<form id="publicMessageCommentForm" class="public-comment-form"><textarea name="body" maxlength="1000" required placeholder="دیدگاه خود را بنویسید…"></textarea><button class="page-btn full" type="submit">ثبت دیدگاه</button></form>` : ''}
  </article>`;
}
export async function openPublicMessageModal(id) {
  let data;
  try { data = await api(`/public-messages/${encodeURIComponent(id)}/discussion`); }
  catch (error) { toast(error.message); return; }
  const modal = openModal('پیام کاربران', renderPublicMessageDiscussion(data));
  const refresh = async () => {
    data = await api(`/public-messages/${encodeURIComponent(id)}/discussion`);
    modal.innerHTML = renderPublicMessageDiscussion(data);
  };
  modal.onclick = async event => {
    const deleteButton = event.target.closest('[data-delete-message]');
    if (deleteButton) { await deletePublicMessage(deleteButton.dataset.deleteMessage, !!document.querySelector('.modal-content .public-messages-page')); return; }
    const button = event.target.closest('[data-reaction]');
    if (!button) return;
    button.disabled = true;
    try {
      await api(`/public-messages/${encodeURIComponent(id)}/reactions`, { method: 'POST', body: { reaction: button.dataset.reaction } });
      await refresh();
    } catch (error) { toast(error.message); }
  };
  modal.onsubmit = async event => {
    if (event.target.id !== 'publicMessageCommentForm') return;
    event.preventDefault();
    const form = event.target, input = form.elements.body, body = input.value.trim();
    if (!body) return;
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      await api(`/public-messages/${encodeURIComponent(id)}/comments`, { method: 'POST', body: { body } });
      await refresh();
      toast('دیدگاه ثبت شد');
    } catch (error) { toast(error.message); button.disabled = false; }
  };
}
export async function publicMessagesPage() {
  const { messages = [] } = await api('/public-messages?limit=500');
  const v = route('خانه', 'پیام کاربران', 'پیام‌های عمومی کاربران ساختمان', html`<div class="page-list public-messages-page">${messages.length ? messages.map(m => html`<article class="page-card public-message-row">
    <button type="button" class="public-message-row-open" data-public-message="${m.id}">
      <div class="public-message-detail-meta"><span>${m.author_label} · ${m.author_name}</span><span>${fdt(m.created_at)}</span></div>
      <h3>${m.title}</h3><p>${String(m.body || '').slice(0, 190)}${String(m.body || '').length > 190 ? '…' : ''}</p>
      <small>${fa(m.comment_count || 0)} دیدگاه · ${fa(m.reaction_count || 0)} واکنش · مشاهده و گفتگو ←</small>
    </button>
    ${canDeletePublicMessage() ? html`<button type="button" class="public-message-delete" data-delete-message="${m.id}">${iconMarkup('trash-2')} حذف پیام</button>` : ''}
  </article>`) : html`<div class="page-card"><div class="page-empty">هنوز پیام عمومی ثبت نشده است.</div></div>`}</div>`);
  v.onclick = event => {
    const remove = event.target.closest('[data-delete-message]');
    if (remove) { deletePublicMessage(remove.dataset.deleteMessage, true); return; }
    const item = event.target.closest('[data-public-message]');
    if (item) openPublicMessageModal(item.dataset.publicMessage);
  };
}
export async function loadWeeklyCalendar() {
  const host = $('#weeklyCalendarDays'), eventsHost = $('#weeklyCalendarEvents'), rangeHost = $('#weeklyRange');
  if (!host || !eventsHost || !rangeHost) return;
  try {
    const today = new Date();
    const weekStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 1) % 7));
    const dates = Array.from({ length: 7 }, (_, i) => {
      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + i);
      const j = jOf(date);
      const key = `${j.y}-${String(j.m).padStart(2, '0')}-${String(j.d).padStart(2, '0')}`;
      return { date, ...j, key };
    });
    const months = [...new Set(dates.map(d => `${d.y}-${String(d.m).padStart(2, '0')}`))];
    const responses = await Promise.all(months.map(month => api(`/events?month=${month}`)));
    const allItems = responses.flatMap(response => Array.isArray(response?.items) ? response.items : []);
    const buildingItems = allItems.filter(event => !String(event.id).startsWith('holiday:'));
    const holidayDates = new Set(allItems.filter(event => event.isOfficialHoliday).map(event => event.event_date));
    const byDate = new Map();
    buildingItems.forEach(event => {
      if (!byDate.has(event.event_date)) byDate.set(event.event_date, []);
      byDate.get(event.event_date).push(event);
    });
    const weekdays = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'];
    const todayKey = dates.find(d => d.date.toDateString() === today.toDateString())?.key;
    const nowTime = `${String(today.getHours()).padStart(2, '0')}:${String(today.getMinutes()).padStart(2, '0')}`;
    const nextWeeklyEvent = buildingItems
      .filter(event => event.event_date >= todayKey && (event.event_date > todayKey || !event.event_time || String(event.event_time) >= nowTime))
      .sort((a, b) => a.event_date.localeCompare(b.event_date) || String(a.event_time || '').localeCompare(String(b.event_time || '')))[0];
    const nextWeeklyEventDate = nextWeeklyEvent?.event_date;
    const dayLabels = dates.map((day, i) => html`<span class="dow">${weekdays[i]}</span>`);
    const dayCells = dates.map((day, i) => {
      const dayEvents = byDate.get(day.key) || [];
      const pulse = day.key === nextWeeklyEventDate;
      const holiday = holidayDates.has(day.key) || i === 6;
      return html`<span class="day-cell ${dayEvents.length ? 'event' : ''} ${holiday ? 'holiday' : ''} ${day.key === todayKey ? 'today' : ''} ${pulse ? 'next-event' : ''}" ${dayEvents.length ? raw(`role="button" tabindex="0" data-weekly-day="${day.key}" aria-label="${weekdays[i]} ${faN(day.d)}، مشاهده رویدادها"`) : ''}><b class="day-number">${faN(day.d)}</b></span>`;
    });
    host.innerHTML = join([...dayLabels, ...dayCells]);
    const first = dates[0], last = dates[6];
    rangeHost.textContent = first.m === last.m
      ? `${faN(first.d)} تا ${faN(last.d)} ${JM[first.m - 1]} ${faN(first.y)}`
      : `${faN(first.d)} ${JM[first.m - 1]} تا ${faN(last.d)} ${JM[last.m - 1]}`;
    eventsHost.innerHTML = '';
    const showDayEvents = key => {
      const dayEvents = byDate.get(key) || [];
      if (!dayEvents.length) return;
      const day = dates.find(d => d.key === key);
      eventsHost.innerHTML = join(dayEvents.map(event => html`<div class="weekly-event"><div><strong>${event.title}</strong><small>${day ? weekdays[dates.indexOf(day)] + ' ' + faN(day.d) + ' ' + JM[day.m - 1] : ''}${event.event_time ? ' · ' + normFa(event.event_time) : ''}</small></div>${event.body ? html`<p>${event.body}</p>` : ''}</div>`));
      host.querySelectorAll('[data-weekly-day]').forEach(cell => cell.classList.toggle('selected', cell.dataset.weeklyDay === key));
    };
    host.onclick = event => {
      const cell = event.target.closest('[data-weekly-day]');
      if (cell) showDayEvents(cell.dataset.weeklyDay);
    };
    host.onkeydown = event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const cell = event.target.closest('[data-weekly-day]');
      if (!cell) return;
      event.preventDefault();
      showDayEvents(cell.dataset.weeklyDay);
    };
  } catch (error) {
    rangeHost.textContent = 'هفته جاری';
    host.innerHTML = '';
    eventsHost.innerHTML = '<div class="weekly-empty">دریافت تقویم در حال حاضر ممکن نیست.</div>';
    console.warn('Nika weekly calendar:', error);
  }
}
export async function loadHome() {
  fillHeader();
  await Promise.allSettled([loadDashboard(), loadLatestNotice(), loadPublicMessages(), loadWeeklyCalendar()]);
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
  const canEdit = canManageCalendarEvents();
  const buildingItems = items.filter(event => !String(event.id).startsWith('holiday:'));
  // رویدادهای ساختمان و تعطیلات جداگانه برای نشانه‌گذاری روزها نگهداری می‌شوند.
  const byDay = {}; buildingItems.forEach(e => (byDay[+e.event_date.slice(8, 10)] ||= []).push(e));
  const holidayDays = new Set(items.filter(event => event.isOfficialHoliday).map(event => +event.event_date.slice(8, 10)));
  const todayKey = `${t.y}-${String(t.m).padStart(2, '0')}-${String(t.d).padStart(2, '0')}`;
  const clock = new Date(), nowTime = `${String(clock.getHours()).padStart(2, '0')}:${String(clock.getMinutes()).padStart(2, '0')}`;
  const nextBuildingEvent = buildingItems
    .filter(e => e.event_date > todayKey || (e.event_date === todayKey && (!e.event_time || String(e.event_time) >= nowTime)))
    .sort((a, b) => a.event_date.localeCompare(b.event_date) || String(a.event_time || '').localeCompare(String(b.event_time || '')))[0];
  const nextEventDate = nextBuildingEvent?.event_date;
  const start = monthStart(y, m), len = Math.round(((m === 12 ? monthStart(y + 1, 1) : monthStart(y, m + 1)) - start) / 864e5), lead = (start.getUTCDay() + 1) % 7;
  const cells = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'].map(d => html`<span class="dow">${d}</span>`);
  for (let i = 0; i < lead; i++) cells.push(html`<span class="blank"></span>`);
  for (let d = 1; d <= len; d++) {
    const dateKey = `${y}-${mm}-${String(d).padStart(2, '0')}`;
    const hasEvent = !!byDay[d], isToday = y === t.y && m === t.m && d === t.d;
    const isHoliday = holidayDays.has(d) || new Date(start.getTime() + (d - 1) * 864e5).getUTCDay() === 5;
    const isNextEvent = dateKey === nextEventDate;
    cells.push(html`<span class="day-cell ${hasEvent ? 'event' : ''} ${isHoliday ? 'holiday' : ''} ${isToday ? 'today' : ''} ${isNextEvent ? 'next-event' : ''}" ${hasEvent ? raw(`data-day="${d}"`) : ''}><b class="day-number">${faN(d)}</b></span>`);
  }
  const prev = m === 1 ? [y - 1, 12] : [y, m - 1], next = m === 12 ? [y + 1, 1] : [y, m + 1];
  const eventFields = [
    { name: 'title', label: 'عنوان رویداد', required: true },
    { name: 'event_date', label: 'تاریخ رویداد', type: 'date', dateSeparator: '-', dir: 'ltr', required: true },
    { name: 'event_time', label: 'ساعت (اختیاری)', dir: 'ltr', placeholder: '18:30' },
    { name: 'body', label: 'توضیحات', type: 'textarea', rows: 2 },
    { name: 'recurrence', label: 'تکرار رویداد', type: 'select', value: 'none', options: [['none','بدون تکرار'],['weekly','هفتگی'],['monthly','ماهانه'],['yearly','سالانه']] },
    { name: 'recurrenceUntil', label: 'پایان تکرار (اختیاری)', type: 'date', dateSeparator: '-', dir: 'ltr', optional: true }
  ];
  const v = route('خانه', 'تقویم ساختمان', 'جلسات، سرویس‌ها و رویدادهای پیش‌رو', html`${canEdit ? html`<div class="page-card"><h3>ثبت رویداد جدید</h3><form id="eventNew" class="page-form" novalidate>${fields(eventFields)}<button class="page-btn full" type="submit">ثبت رویداد</button></form></div>` : ''}
    <div class="page-card"><div class="cal-nav"><button class="page-btn sm secondary" id="calPrev">‹ ماه قبل</button><strong>${JM[m - 1]} ${faN(y)}</strong><button class="page-btn sm secondary" id="calNext">ماه بعد ›</button></div><div class="page-calendar">${cells}</div></div>
    ${html`<div class="page-card"><h3>رویدادهای ساختمان · ${JM[m - 1]}</h3>${buildingItems.length ? html`<div class="page-timeline">${buildingItems.map(e => html`<div class="page-event"><strong>${e.title}</strong><small>${faN(+e.event_date.slice(8, 10))} ${JM[m - 1]}${e.event_time ? ' · ' + normFa(e.event_time) : ''}${e.isHoliday ? ' · ' + (e.isOfficialHoliday ? 'تعطیل رسمی' : 'مناسبت') : ''}</small>${e.body ? html`<p>${e.body}</p>` : ''}${canEdit && !e.isHoliday ? html`<div class="row-actions">${e.recurrence !== 'none' ? html`<button class="page-btn sm secondary" data-event-edit-occ="${e.id}" data-occ-date="${e.recurrence_date}">ویرایش این نوبت</button><button class="page-btn sm danger" data-event-delete-occ="${e.id}" data-occ-date="${e.recurrence_date}">حذف این نوبت</button>` : ''}<button class="page-btn sm secondary" data-event-edit="${e.id}">ویرایش ${e.recurrence !== 'none' ? 'سری' : 'رویداد'}</button><button class="page-btn sm danger" data-event-delete="${e.id}">حذف ${e.recurrence !== 'none' ? 'کل سری' : 'رویداد'}</button></div>` : ''}</div>` )}</div>` : html`<div class="page-empty">رویدادی برای این ماه ثبت نشده است.</div>`}</div>`}`);
  $('#calPrev', v).onclick = () => open(() => calendarPage(...prev), { replace: true });
  $('#calNext', v).onclick = () => open(() => calendarPage(...next), { replace: true });
  const form = $('#eventNew', v);
  if (form) onSubmit(form, async d => {
    const body = { ...d };
    if (!S.user.roles.includes('executive') && !S.user.roles.includes('chair')) { const reason = await promptText('ثبت دلیل انجام خارج از مسئولیت', 'چرا این رویداد را به‌جای مدیر اجرایی ثبت می‌کنید؟', 'ثبت دلیل'); if (!reason) return; body.reason = reason; }
    await api('/events', { method: 'POST', body });
    toast('رویداد ثبت شد');
    // پس از ذخیره، ماهِ تاریخ انتخاب‌شده را باز کن؛ نه لزوماً ماهی که فرم از آن شروع شده بود.
    const [savedYear, savedMonth] = normDigits(body.event_date).replace(/\//g, '-').split('-').map(Number);
    open(() => calendarPage(savedYear, savedMonth), { replace: true });
  });
  $$('[data-event-edit-occ]', v).forEach(b => b.onclick = () => {
    const event=items.find(e=>e.id===b.dataset.eventEditOcc&&e.recurrence_date===b.dataset.occDate);
    const occurrenceFields=eventFields.slice(0,4).map(f=>({...f,value:f.name==='event_date'?event.event_date:(event[f.name]??'')}));
    const modal=openModal('تغییر یک نوبت رویداد',html`<form class="page-form" novalidate>${fields(occurrenceFields)}<button class="page-btn full" type="submit">ذخیره تغییر تاریخ</button></form>`);
    onSubmit($('form',modal),async d=>{
      const body={...d};if(!S.user.roles.includes('executive') && !S.user.roles.includes('chair')){const reason=await promptText('ثبت دلیل انجام خارج از مسئولیت','چرا این نوبت را به‌جای مدیر اجرایی تغییر می‌دهید؟','ثبت دلیل');if(!reason)return;body.reason=reason;}
      await api(`/events/${event.id}/occurrences/${event.recurrence_date}`,{method:'PATCH',body});
      closeModal();toast('تغییر این نوبت ثبت شد');open(()=>calendarPage(y,m),{replace:true});
    });
  });
  $$('[data-event-delete-occ]',v).forEach(b=>b.onclick=async()=>{
    if(!await ask('حذف یک نوبت','فقط این نوبت حذف شود و نوبت‌های بعدی باقی بمانند؟','حذف',true))return;
    const event=items.find(e=>e.id===b.dataset.eventDeleteOcc&&e.recurrence_date===b.dataset.occDate),body={};
    if(!S.user.roles.includes('executive') && !S.user.roles.includes('chair')){const reason=await promptText('ثبت دلیل انجام خارج از مسئولیت','چرا این نوبت را به‌جای مدیر اجرایی حذف می‌کنید؟','ثبت دلیل');if(!reason)return;body.reason=reason;}
    await api(`/events/${event.id}/occurrences/${event.recurrence_date}`,{method:'DELETE',body});
    toast('این نوبت حذف شد');open(()=>calendarPage(y,m),{replace:true});
  });
  $$('[data-event-edit]', v).forEach(b => b.onclick = () => {
    const event = items.find(e => e.id === b.dataset.eventEdit);
    const modal = openModal('ویرایش رویداد', html`<form class="page-form" novalidate>${fields(eventFields.map(f => ({ ...f, value: f.name === 'event_date' ? (event.series_event_date || event.event_date) : f.name === 'event_time' ? (event.series_event_time ?? event.event_time ?? '') : f.name === 'title' ? (event.series_title || event.title) : f.name === 'body' ? (event.series_body ?? event.body ?? '') : f.name === 'recurrenceUntil' ? (event.series_recurrence_until || event.recurrence_until || '') : (event[f.name] ?? '') })))}<button class="page-btn full" type="submit">ذخیره تغییرات</button></form>`);
    onSubmit($('form', modal), async d => {
      const body = { ...d };
      if (!S.user.roles.includes('executive') && !S.user.roles.includes('chair')) { const reason = await promptText('ثبت دلیل انجام خارج از مسئولیت', 'چرا این رویداد را به‌جای مدیر اجرایی ویرایش می‌کنید؟', 'ثبت دلیل'); if (!reason) return; body.reason = reason; }
      await api(`/events/${event.id}`, { method: 'PUT', body });
      closeModal(); toast('رویداد ویرایش شد');
      open(() => calendarPage(y, m), { replace: true });
    });
  });
  $$('[data-event-delete]', v).forEach(b => b.onclick = async () => {
    if (!await ask('حذف رویداد', 'این رویداد از تقویم حذف شود؟', 'حذف', true)) return;
    const body = {};
    if (!S.user.roles.includes('executive') && !S.user.roles.includes('chair')) { const reason = await promptText('ثبت دلیل انجام خارج از مسئولیت', 'چرا این رویداد را به‌جای مدیر اجرایی حذف می‌کنید؟', 'ثبت دلیل'); if (!reason) return; body.reason = reason; }
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
  ])}<button class="page-btn full" type="submit">ارسال</button></form>`);
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

// ====================== پیام‌های خصوصی ======================
const PRIVATE_RECIPIENT_LABELS = { executive: 'مدیر اجرایی', chair: 'رئیس هیأت‌مدیره', board: 'هیأت‌مدیره' };
const privateSenderLabel = m => m.sender_label || (m.sender_unit ? `واحد ${m.sender_unit}` : 'مدیریت ساختمان');
function renderPrivateThread(data) {
  const messages = Array.isArray(data.messages) ? data.messages : [];
  return html`<div class="private-thread">
    <div class="private-thread-list">${messages.map(m => html`<article class="private-thread-message">
      <div class="private-thread-meta"><strong>${m.sender_name || 'کاربر ساختمان'}</strong><span>${privateSenderLabel(m)}</span><small>${fdt(m.created_at)}</small></div>
      <p>${m.body}</p>
    </article>`)}</div>
    <form id="privateMessageReplyForm" class="private-thread-reply"><label>پاسخ شما</label><textarea name="body" maxlength="2000" required placeholder="متن پاسخ را بنویسید…"></textarea><button class="page-btn full" type="submit">ارسال پاسخ</button></form>
  </div>`;
}
async function openPrivateMessageThread(id, markRead = false) {
  try {
    if (markRead) { await api(`/messages/${encodeURIComponent(id)}/read`, { method: 'POST' }).catch(() => {}); refreshSummary(); }
    let data = await api(`/messages/${encodeURIComponent(id)}/thread`);
    const modal = openModal('گفت‌وگوی خصوصی', renderPrivateThread(data));
    modal.onsubmit = async event => {
      if (event.target.id !== 'privateMessageReplyForm') return;
      event.preventDefault();
      const form = event.target, body = form.elements.body.value.trim();
      if (!body) return;
      const button = form.querySelector('button[type="submit"]'); button.disabled = true;
      try {
        await api(`/messages/${encodeURIComponent(id)}/replies`, { method: 'POST', body: { body } });
        data = await api(`/messages/${encodeURIComponent(id)}/thread`);
        modal.innerHTML = renderPrivateThread(data);
        toast('پاسخ ارسال شد');
      } catch (error) { toast(error.message); button.disabled = false; }
    };
  } catch (error) { toast(error.message); }
}
function messageHubButton(icon, title, description, action) {
  return html`<button type="button" class="message-hub-action" data-message-action="${action}">
    <span class="message-hub-icon">${raw(iconMarkup(icon))}</span>
    <strong>${title}</strong><small>${description}</small>
  </button>`;
}
async function openMessageBox(box = 'inbox') {
  try {
    const { messages = [] } = await api(`/messages?box=${box}`);
    const title = box === 'sent' ? 'پیام‌های ارسالی' : 'پیام‌های دریافتی';
    const modal = openModal(title, html`<div class="message-modal-list">
      ${messages.length ? messages.map((m, i) => html`<button type="button" class="message-modal-row ${box === 'inbox' && Number(m.unread_count || 0) > 0 ? 'unread' : ''}" data-message-index="${i}">
        <span class="message-modal-row-main"><strong>${m.title}</strong>
          <small>${box === 'sent' ? (m.sender_id === S.user.id ? 'به: ' + (m.recipient_label || m.recipient_name || 'مدیریت ساختمان') : 'پاسخ به فرستنده گفت‌وگو') : (m.sender_id === S.user.id ? 'پاسخ جدید در گفت‌وگو' : 'از: ' + privateSenderLabel(m) + ' · ' + m.sender_name)}${m.sender_unit && box === 'inbox' && m.sender_id !== S.user.id ? ' · واحد ' + m.sender_unit : ''} · ${fdt(m.created_at)}</small>
        </span>${box === 'inbox' && Number(m.unread_count || 0) > 0 ? html`<i class="message-unread-dot" aria-label="خوانده‌نشده"></i>` : ''}
      </button>`) : html`<div class="page-empty">در این صندوق هنوز پیامی وجود ندارد.</div>`}
    </div>`);
    modal.onclick = event => {
      const row = event.target.closest('[data-message-index]');
      if (!row) return;
      const m = messages[Number(row.dataset.messageIndex)];
      if (m) openPrivateMessageThread(m.id, box === 'inbox' && Number(m.unread_count || 0) > 0);
    };
  } catch (error) { toast(error.message); }
}
function openMessageRecipientPicker() {
  const modal = openModal('ارسال پیام جدید', html`<div class="message-recipient-grid">
    <button type="button" class="message-recipient-action" data-recipient="public"><span>${raw(iconMarkup('megaphone'))}</span><strong>عمومی</strong><small>انتشار در گالری پیام کاربران</small></button>
    <button type="button" class="message-recipient-action" data-recipient="board"><span>${raw(iconMarkup('nika-board'))}</span><strong>هیأت‌مدیره</strong><small>ارسال محرمانه به اعضای هیأت‌مدیره</small></button>
    <button type="button" class="message-recipient-action" data-recipient="executive"><span>${raw(iconMarkup('user-round-check'))}</span><strong>مدیر اجرایی</strong><small>ارسال محرمانه به مدیر اجرایی</small></button>
  </div>`);
  modal.onclick = event => {
    const choice = event.target.closest('[data-recipient]');
    if (choice) openMessageComposer(choice.dataset.recipient);
  };
}
function openMessageComposer(recipient) {
  const isPublic = recipient === 'public';
  const title = isPublic ? 'پیام عمومی جدید' : recipient === 'board' ? 'پیام به هیأت‌مدیره' : 'پیام به مدیر اجرایی';
  const modal = openModal(title, html`<form id="messageCenterComposeForm" class="page-form">
    <label>عنوان پیام</label><input class="page-input" name="title" maxlength="120" required placeholder="موضوع پیام را بنویسید">
    <label>متن پیام</label><textarea class="page-textarea" name="body" maxlength="2000" required placeholder="${isPublic ? 'پیام خود را برای کاربران ساختمان بنویسید…' : 'متن پیام محرمانه را بنویسید…'}"></textarea>
    <p class="page-kicker">${isPublic ? 'این پیام پس از ثبت، بلافاصله در گالری «پیام کاربران» نمایش داده می‌شود.' : 'این پیام به‌صورت محرمانه برای مخاطب انتخاب‌شده ارسال می‌شود.'}</p>
    <button class="page-btn full" type="submit">${isPublic ? 'ثبت و انتشار پیام' : 'ارسال پیام محرمانه'}</button>
  </form>`, { replace: true });
  modal.onsubmit = async event => {
    if (event.target.id !== 'messageCenterComposeForm') return;
    event.preventDefault();
    const form = event.target, subject = form.elements.title.value.trim(), body = form.elements.body.value.trim();
    if (!subject || !body) return;
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      if (isPublic) await api('/public-messages', { method: 'POST', body: { title: subject, body } });
      else await api('/messages', { method: 'POST', body: { recipientRole: recipient, title: subject, body } });
      closeModal();
      toast(isPublic ? 'پیام شما در تابلو منتشر شد' : 'پیام محرمانه ارسال شد');
      if (isPublic) await loadPublicMessages();
      refreshSummary();
    } catch (error) { toast(error.message); button.disabled = false; }
  };
}
export function messagesPage() {
  const v = route('پیام‌ها', 'پیام‌ها', 'دریافت، ارسال و ارتباط با مدیریت ساختمان', html`
    <div class="message-hub-actions">
      ${messageHubButton('inbox', 'پیام‌های دریافتی', 'مشاهده پیام‌های دریافت‌شده', 'inbox')}
      ${messageHubButton('send', 'پیام‌های ارسالی', 'پیگیری پیام‌های ارسال‌شده', 'sent')}
      ${messageHubButton('pencil', 'ارسال پیام جدید', 'انتخاب مخاطب و نوشتن پیام', 'compose')}
    </div>`);
  $$('[data-message-action]', v).forEach(button => button.onclick = () => {
    const action = button.dataset.messageAction;
    if (action === 'inbox' || action === 'sent') openMessageBox(action);
    else openMessageRecipientPicker();
  });
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
    ['نوع حساب', baseRoleLabel(u, false) || (u.account_type === 'staff' ? 'مدیر / کارکنان' : 'کاربر ساختمان')],
    ...(unit ? [['شماره واحد', unit.number]] : [])
  ];
  const v = route('حساب من', 'حساب من', '', html`<section class="profile-panel">
      <div class="profile-cover">${raw(avatarMarkup(u, 'profile-avatar'))}<div><strong>${u.name}</strong><small>${userRoleLabels(u).join(' · ')}</small></div></div>
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

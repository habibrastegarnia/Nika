// عناصر مشترک رابط: اعلان، پنجره، مسیریابی صفحه‌ها، ساخت فرم
import { html, esc, raw, $, $$, normDigits, JM, fa, jToday, monthStart, monthLen } from './util.js';
import { iconMarkup } from './icons.js?v=2';

// ---------- اعلان و پنجره ----------
let toastTimer;
export function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}
export function openModal(title, content) {
  $('#modalTitle').textContent = title;
  $('#modalContent').innerHTML = String(content);
  $('#modalBackdrop').classList.add('open');
  return $('#modalContent');
}
export const closeModal = () => { const backdrop=$('#modalBackdrop'); backdrop.classList.remove('open','jalali-calendar-open'); };
function jalaliParts(value) {
  const s = normDigits(value || '');
  const m = s.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) return { y:+m[1], m:+m[2], d:+m[3] };
  return jToday();
}
function showJalaliPicker(display) {
  const wrap = display.closest('[data-jpicker]') || display.parentElement;
  const hidden = wrap.querySelector('[data-jvalue], [data-jalali-value]');
  if (!hidden) return;
  const separator = display.dataset.jalaliSeparator || wrap.dataset.jalaliSeparator || '-';
  const selected = jalaliParts(hidden.value || display.value);
  let year = selected.y, month = selected.m;
  const weekdays = ['ش','ی','د','س','چ','پ','ج'];
  const modal = openModal('انتخاب تاریخ شمسی', html`<div class="jalali-picker" dir="rtl"></div>`);
  $('#modalBackdrop').classList.add('jalali-calendar-open');
  const render = () => {
    const offset = (monthStart(year, month).getUTCDay() + 1) % 7;
    const count = monthLen(year, month);
    let cells = '';
    for (let i=0;i<offset;i++) cells += '<i></i>';
    for (let day=1;day<=count;day++) {
      const active = year===selected.y && month===selected.m && day===selected.d;
      cells += `<button type="button" data-jcal-day="${day}" class="${active?'selected':''}">${fa(day)}</button>`;
    }
    modal.innerHTML = `<div class="jalali-calendar-head"><button type="button" data-jcal-prev aria-label="ماه قبل">${iconMarkup('chevron-right')}</button><strong>${JM[month-1]} ${fa(year)}</strong><button type="button" data-jcal-next aria-label="ماه بعد">${iconMarkup('chevron-left')}</button></div><div class="jalali-calendar-grid">${weekdays.map(x=>`<span>${x}</span>`).join('')}${cells}</div>`;
  };
  modal.onclick = e => {
    const b=e.target.closest('button');
    if(!b)return;
    if(b.hasAttribute('data-jcal-prev')) { if(--month<1){month=12;year--;} render(); return; }
    if(b.hasAttribute('data-jcal-next')) { if(++month>12){month=1;year++;} render(); return; }
    if(b.hasAttribute('data-jcal-day')) {
      const day=+b.dataset.jcalDay;
      const y=String(year).padStart(4,'0'), m=String(month).padStart(2,'0'), d=String(day).padStart(2,'0');
      hidden.value=[y,m,d].join(separator);
      display.value=fa(year)+'/'+fa(month).padStart(2,'۰')+'/'+fa(day).padStart(2,'۰');
      hidden.dispatchEvent(new Event('change',{bubbles:true}));
      closeModal();
    }
  };
  render();
}
export function initModal() {
  const closeButton = $('#closeModal');
  const backdrop = $('#modalBackdrop');
  if (closeButton) closeButton.onclick = closeModal;
  if (backdrop) backdrop.addEventListener('click', e => { if (e.target.id === 'modalBackdrop') closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
  document.addEventListener('click', e => {
    const display=e.target.closest('[data-jalali-date], [data-jdisplay]');
    if(display) { e.preventDefault(); showJalaliPicker(display); }
  });
}
export function ask(title, message, okLabel = 'تأیید', danger = false) {
  return new Promise(res => {
    const m = openModal(title, html`<p>${message}</p><div class="row-actions"><button class="page-btn sm ${danger ? 'danger' : ''}" data-ok>${okLabel}</button><button class="page-btn sm secondary" data-no>انصراف</button></div>`);
    m.querySelector('[data-ok]').onclick = () => { closeModal(); res(true); };
    m.querySelector('[data-no]').onclick = () => { closeModal(); res(false); };
  });
}
export function promptText(title, label, okLabel = 'ثبت') {
  return new Promise(res => {
    const m = openModal(title, html`<form class="page-form"><label>${label}</label><textarea class="page-textarea" name="t" required></textarea><div class="row-actions"><button class="page-btn sm" type="submit">${okLabel}</button><button class="page-btn sm secondary" type="button" data-no>انصراف</button></div></form>`);
    m.querySelector('form').onsubmit = e => { e.preventDefault(); const v = m.querySelector('textarea').value.trim(); if (v) { closeModal(); res(v); } };
    m.querySelector('[data-no]').onclick = () => { closeModal(); res(null); };
  });
}
export function showSecret(title, note, secret) {
  const m = openModal(title, html`<p>${note}</p><code class="temp-pass">${secret}</code><div class="row-actions"><button class="page-btn sm" data-copy>کپی رمز</button><button class="page-btn sm secondary" data-close>بستن</button></div>`);
  m.querySelector('[data-copy]').onclick = async () => { try { await navigator.clipboard.writeText(secret); toast('کپی شد'); } catch { toast('کپی خودکار ممکن نشد؛ رمز را دستی یادداشت کنید'); } };
  m.querySelector('[data-close]').onclick = closeModal;
}

// ---------- مسیریابی صفحه‌های داخلی ----------
const BACK = raw(iconMarkup('chevron-right'));
let hist = [];
const homeParts = () => $$('.phone > header, .phone > .carousel, .phone > .slide-controls, .phone > .categories, .phone > .notice-head, .phone > .notice');
export function setNav(name) { $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.nav === name)); }
export function showHome() {
  hist = [];
  const view = $('#pageView');
  view.classList.remove('active', 'nika-dashboard-hidden');
  view.innerHTML = '';
  homeParts().forEach(x => { x.style.display = ''; x.classList.remove('nika-dashboard-hidden'); });
  setNav('خانه'); window.scrollTo(0, 0);
}
// نمایش یک صفحه داخلی. content باید خروجی html`` باشد
export function route(nav, title, sub, content) {
  const v = $('#pageView');
  v.innerHTML = String(html`<div class="page-top"><div class="page-heading"><h2>${title}</h2>${sub ? html`<p>${sub}</p>` : ''}</div><button class="page-close" type="button" data-page-close aria-label="بستن پنجره">${raw(iconMarkup('x'))}</button></div>${content}`);
  v.setAttribute('role', 'dialog'); v.setAttribute('aria-modal', 'true'); v.setAttribute('aria-label', title);
  v.classList.add('active'); setNav(nav); window.scrollTo(0, 0);
  v.querySelector('[data-page-close]').onclick = back;
  return v;
}
async function run(fn) {
  try { await fn(); }
  catch (e) { route('', 'خطا', '', html`<div class="page-card"><div class="page-empty">${e.message || 'خطای ناشناخته'}</div></div>`); }
}
// باز کردن یک صفحه (روی پشته‌ی تاریخچه)
export function open(fn, { replace = false, root = false } = {}) {
  if (root) {
    if (hist.length) history.replaceState({ nika: 1 }, '');
    else history.pushState({ nika: 1 }, '');
    hist = [fn];
  } else if (replace && hist.length) {
    hist[hist.length - 1] = fn;
    history.replaceState({ nika: hist.length }, '');
  } else {
    hist.push(fn);
    history.pushState({ nika: hist.length }, '');
  }
  return run(fn);
}
export function back() {
  if (hist.length) history.back();
  else showHome();
}
export function initRouter() {
  window.addEventListener('popstate', () => {
    if (hist.length > 1) { hist.pop(); run(hist[hist.length - 1]); } else showHome();
  });
  document.addEventListener('click', e => {
    const view = $('#pageView');
    if (!view?.classList.contains('active') || view.contains(e.target)) return;
    back();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && $('#pageView')?.classList.contains('active')) back();
  });
}
export const resetRouter = () => { hist = []; };

// ---------- فرم‌ها ----------
// field: {name,label,type,value,required,placeholder,options:[[v,l]],rows,dir,hint}
function formatMoneyInput(input) {
  const before = input.value.slice(0, input.selectionStart ?? input.value.length);
  const digitsBefore = normDigits(before).replace(/\D/g, '').length;
  const digits = normDigits(input.value).replace(/\D/g, '');
  const formatted = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  input.value = formatted;
  let pos = 0, seen = 0;
  while (pos < formatted.length && seen < digitsBefore) { if (/\d/.test(formatted[pos])) seen++; pos++; }
  try { input.setSelectionRange(pos, pos); } catch {}
}
export function fields(list, cls = 'page') {
  const n = cls === 'nika';
  const lab = n ? 'nika-label' : '', inp = n ? 'nika-input' : 'page-input', sel = n ? 'nika-input' : 'page-select', ta = n ? 'nika-input' : 'page-textarea';
  return list.map(f => {
    const req = f.required ? raw(' required') : '', ph = f.placeholder ? raw(` placeholder="${esc(f.placeholder)}"`) : '', dir = f.dir ? raw(` dir="${f.dir}"`) : '';
    let ctl;
    if (f.type === 'date') {
      const s=normDigits(f.value || ''), match=s.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/), p=match?{y:+match[1],m:+match[2],d:+match[3]}:(f.optional&&!String(f.value||'').trim()?null:jToday());
      const sep=f.dateSeparator || '-', y=p?String(p.y).padStart(4,'0'):'', m=p?String(p.m).padStart(2,'0'):'', d=p?String(p.d).padStart(2,'0'):'';
      const display=p?fa(p.y)+'/'+fa(p.m).padStart(2,'۰')+'/'+fa(p.d).padStart(2,'۰'):'';
      ctl=html`<div class="jalali-date-field"><input class="${inp}" type="text" readonly data-jalali-date data-jalali-separator="${sep}" value="${display}" placeholder="انتخاب تاریخ" aria-label="${f.label}" autocomplete="off"><input type="hidden" name="${f.name}" data-jalali-value value="${y?`${y}${sep}${m}${sep}${d}`:''}"${req}></div>`;
    }
    else if (f.type === 'select') ctl = html`<select class="${sel}" name="${f.name}"${req}>${f.options.map(([v, l]) => html`<option value="${v}" ${String(f.value) === String(v) ? raw('selected') : ''}>${l}</option>`)}</select>`;
    else if (f.type === 'textarea') ctl = html`<textarea class="${ta}" name="${f.name}" rows="${f.rows || 4}"${req}${ph}>${f.value ?? ''}</textarea>`;
    else if (f.type === 'checks') ctl = html`<div class="nika-rolelist">${f.options.map(([v, l]) => html`<label class="nika-roleoption"><input type="checkbox" name="${f.name}[]" value="${v}" ${(f.value || []).includes(v) ? raw('checked') : ''}>${l}</label>`)}</div>`;
    else if (f.type === 'checkbox') return html`<label class="compose-check"><input type="checkbox" name="${f.name}" ${f.value ? raw('checked') : ''}> <span>${f.label}</span></label>`;
    else ctl = html`<input class="${inp}" name="${f.name}" type="${f.type || 'text'}" value="${f.value ?? ''}"${req}${ph}${dir} ${f.money ? raw(' data-money="true"') : ''} ${f.inputmode ? raw(`inputmode="${f.inputmode}"`) : ''} ${f.autocomplete ? raw(`autocomplete="${f.autocomplete}"`) : raw('autocomplete="off"')}>`;
    return html`<label class="${lab}">${f.label}</label>${ctl}${f.hint ? html`<div class="nika-footnote" style="margin-top:4px">${f.hint}</div>` : ''}`;
  });
}
export function readForm(form) {
  const o = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === 'checkbox') {
      if (el.name.endsWith('[]')) { const k = el.name.slice(0, -2); (o[k] ||= []); if (el.checked) o[k].push(el.value); }
      else o[el.name] = el.checked;
    } else if (el.type !== 'submit' && el.type !== 'button') o[el.name] = el.value;
  }
  return o;
}
// ثبت فرم با نمایش خطا زیر فرم و جلوگیری از ارسال دوباره
export function onSubmit(form, fn) {
  if (!form) { console.warn('Nika: فرم موردنظر پیدا نشد؛ ثبت رویداد ارسال فرم رد شد.'); return; }
  $$('input[name="amount"], input[data-money="true"]', form).forEach(input => { formatMoneyInput(input); input.addEventListener('input', () => formatMoneyInput(input)); });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    let box = form.querySelector('.form-error');
    if (!box) { box = document.createElement('p'); box.className = 'form-error'; box.setAttribute('role', 'alert'); form.appendChild(box); }
    box.textContent = '';
    const btns = [...form.querySelectorAll('button[type=submit]')]; btns.forEach(b => b.disabled = true);
    try { await fn(readForm(form), form); }
    catch (err) { box.textContent = err.message || 'خطا'; }
    finally { btns.forEach(b => b.disabled = false); }
  });
}
export const num = v => Number(normDigits(v).replace(/[^\d]/g, ''));

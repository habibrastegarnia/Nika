// عناصر مشترک رابط: اعلان، پنجره، مسیریابی صفحه‌ها، ساخت فرم
import { html, esc, raw, $, $$, normDigits } from './util.js';

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
export const closeModal = () => $('#modalBackdrop').classList.remove('open');
export function initModal() {
  $('#closeModal').onclick = closeModal;
  $('#modalBackdrop').addEventListener('click', e => { if (e.target.id === 'modalBackdrop') closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
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
const BACK = html`<svg viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg>`;
let hist = [];
const homeParts = () => $$('.phone > header, .phone > .carousel, .phone > .slide-controls, .phone > .categories, .phone > .notice-head, .phone > .notice');
export function setNav(name) { $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.nav === name)); }
export function showHome() {
  hist = []; $('#pageView').classList.remove('active'); $('#pageView').innerHTML = '';
  homeParts().forEach(x => x.style.display = ''); setNav('خانه'); window.scrollTo(0, 0);
}
// نمایش یک صفحه داخلی. content باید خروجی html`` باشد
export function route(nav, title, sub, content) {
  homeParts().forEach(x => x.style.display = 'none');
  const v = $('#pageView');
  v.innerHTML = String(html`<div class="page-top"><button class="page-back" id="pgBack" aria-label="بازگشت">${BACK}</button><div class="page-heading"><h2>${title}</h2>${sub ? html`<p>${sub}</p>` : ''}</div></div>${content}`);
  v.classList.add('active'); setNav(nav); window.scrollTo(0, 0);
  $('#pgBack').onclick = () => { if (hist.length > 1) history.back(); else showHome(); };
  return v;
}
async function run(fn) {
  try { await fn(); }
  catch (e) { route('', 'خطا', '', html`<div class="page-card"><div class="page-empty">${e.message || 'خطای ناشناخته'}</div></div>`); }
}
// باز کردن یک صفحه (روی پشته‌ی تاریخچه)
export function open(fn, { replace = false, root = false } = {}) {
  if (root) hist = [];
  if (replace && hist.length) { hist[hist.length - 1] = fn; history.replaceState({ nika: hist.length }, ''); }
  else { hist.push(fn); history.pushState({ nika: hist.length }, ''); }
  return run(fn);
}
export function initRouter() {
  window.addEventListener('popstate', () => {
    if (hist.length > 1) { hist.pop(); run(hist[hist.length - 1]); } else showHome();
  });
}
export const resetRouter = () => { hist = []; };

// ---------- فرم‌ها ----------
// field: {name,label,type,value,required,placeholder,options:[[v,l]],rows,dir,hint}
export function fields(list, cls = 'page') {
  const n = cls === 'nika';
  const lab = n ? 'nika-label' : '', inp = n ? 'nika-input' : 'page-input', sel = n ? 'nika-input' : 'page-select', ta = n ? 'nika-input' : 'page-textarea';
  return list.map(f => {
    const req = f.required ? raw(' required') : '', ph = f.placeholder ? raw(` placeholder="${esc(f.placeholder)}"`) : '', dir = f.dir ? raw(` dir="${f.dir}"`) : '';
    let ctl;
    if (f.type === 'select') ctl = html`<select class="${sel}" name="${f.name}"${req}>${f.options.map(([v, l]) => html`<option value="${v}" ${String(f.value) === String(v) ? raw('selected') : ''}>${l}</option>`)}</select>`;
    else if (f.type === 'textarea') ctl = html`<textarea class="${ta}" name="${f.name}" rows="${f.rows || 4}"${req}${ph}>${f.value ?? ''}</textarea>`;
    else if (f.type === 'checks') ctl = html`<div class="nika-rolelist">${f.options.map(([v, l]) => html`<label class="nika-roleoption"><input type="checkbox" name="${f.name}[]" value="${v}" ${(f.value || []).includes(v) ? raw('checked') : ''}>${l}</label>`)}</div>`;
    else if (f.type === 'checkbox') return html`<label class="compose-check"><input type="checkbox" name="${f.name}" ${f.value ? raw('checked') : ''}> <span>${f.label}</span></label>`;
    else ctl = html`<input class="${inp}" name="${f.name}" type="${f.type || 'text'}" value="${f.value ?? ''}"${req}${ph}${dir} ${f.inputmode ? raw(`inputmode="${f.inputmode}"`) : ''} ${f.autocomplete ? raw(`autocomplete="${f.autocomplete}"`) : raw('autocomplete="off"')}>`;
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

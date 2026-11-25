// اطلاعیه‌ها، درخواست‌ها، پیام‌ها و محتوای ساختمان (مقررات، مصوبات، رویدادها، اسناد)
import { R } from './router.js';
import { err, reply, readJson, str, optStr, int, jdate, audit } from './lib.js';
import { can } from './perms.js';
import { OFFICIAL_CALENDAR } from './holidays.js';

// ---------- اطلاعیه‌ها ----------
const NOTICE_KINDS = ['اطلاعیه', 'جلسه', 'عمومی', 'فوری'];
const AUDIENCES = ['all', 'owner', 'resident', 'staff'];

R('GET', '/api/notices', async c => {
  const limit = Math.min(Math.max(Number(c.url.searchParams.get('limit')) || 100, 1), 100), t = c.user.account_type;
  const r = await c.db.prepare(
    `SELECT id,title,body,audience,kind,created_at FROM notices WHERE (?='staff' OR audience IN ('all',?)) ORDER BY created_at DESC,rowid DESC LIMIT ?`).bind(t, t, limit).all();
  return reply({ notices: r.results });
});
R('POST', '/api/notices', { perm: 'notices.manage' }, async c => {
  const x = await readJson(c.request), id = crypto.randomUUID();
  const audience = x.audience ?? 'all', kind = x.kind ?? 'اطلاعیه';
  if (!AUDIENCES.includes(audience) || !NOTICE_KINDS.includes(kind)) throw err(400, 'INVALID_INPUT', 'مخاطب یا نوع اطلاعیه نامعتبر است');
  await c.db.prepare('INSERT INTO notices(id,title,body,audience,kind,created_by) VALUES(?,?,?,?,?,?)')
    .bind(id, str(x.title, { max: 120, field: 'عنوان' }), str(x.body, { max: 2000, multiline: true, field: 'متن' }), audience, kind, c.user.id).run();
  await audit(c.db, c.user.id, 'notice.create', 'notice', id);
  return reply({ ok: true, id }, 201);
});
R('DELETE', '/api/notices/:id', { perm: 'notices.manage' }, async c => {
  const r = await c.db.prepare('DELETE FROM notices WHERE id=?').bind(c.params.id).run();
  if (!r.meta.changes) throw err(404, 'NOT_FOUND', 'اطلاعیه پیدا نشد');
  await audit(c.db, c.user.id, 'notice.delete', 'notice', c.params.id);
  return reply({ ok: true });
});

// ---------- درخواست‌ها ----------
const REQ_KINDS = ['request', 'idea', 'issue'];
const REQ_STATUS = ['new', 'in_progress', 'resolved', 'rejected'];
const REQ_CATEGORIES = ['عمومی', 'تأسیسات و تعمیرات', 'نظافت', 'امنیت', 'مالی', 'سایر'];

R('GET', '/api/requests', async c => {
  const all = c.url.searchParams.get('scope') === 'all';
  if (all && !can(c.user, 'requests.manage')) throw err(403, 'FORBIDDEN', 'دسترسی کافی ندارید');
  const st = c.url.searchParams.get('status');
  const where = [], vals = [];
  if (!all) { where.push('r.user_id=?'); vals.push(c.user.id); }
  if (st) { where.push('r.status=?'); vals.push(st); }
  const r = await c.db.prepare(
    `SELECT r.id,r.title,r.body,r.category,r.kind,r.status,r.response,r.board_requested,r.created_at,r.updated_at,u.name user_name,n.unit_number
     FROM requests r JOIN users u ON u.id=r.user_id LEFT JOIN units n ON n.id=u.unit_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY r.created_at DESC,r.rowid DESC LIMIT 300`).bind(...vals).all();
  return reply({ requests: r.results });
});
R('POST', '/api/requests', { perm: 'requests.create' }, async c => {
  const x = await readJson(c.request), id = crypto.randomUUID();
  const kind = x.kind ?? 'request', category = x.category ?? 'عمومی';
  if (!REQ_KINDS.includes(kind) || !REQ_CATEGORIES.includes(category)) throw err(400, 'INVALID_INPUT', 'نوع یا دسته‌بندی نامعتبر است');
  await c.db.prepare('INSERT INTO requests(id,user_id,title,body,category,kind,board_requested) VALUES(?,?,?,?,?,?,?)')
    .bind(id, c.user.id, str(x.title, { max: 120, field: 'موضوع' }), str(x.body, { max: 2000, multiline: true, field: 'شرح' }), category, kind, x.boardRequested === true ? 1 : 0).run();
  await audit(c.db, c.user.id, 'request.create', 'request', id, { kind, category });
  return reply({ ok: true, id }, 201);
});
R('PATCH', '/api/requests/:id', { perm: 'requests.manage' }, async c => {
  const x = await readJson(c.request);
  const r = await c.db.prepare('SELECT id,user_id,title,status,response FROM requests WHERE id=?').bind(c.params.id).first();
  if (!r) throw err(404, 'NOT_FOUND', 'درخواست پیدا نشد');
  const status = x.status ?? r.status;
  if (!REQ_STATUS.includes(status)) throw err(400, 'INVALID_STATUS', 'وضعیت نامعتبر است');
  const response = 'response' in x ? optStr(x.response, { max: 1000, multiline: true, field: 'پاسخ' }) : r.response;
  const stmts = [c.db.prepare('UPDATE requests SET status=?,response=?,assigned_to=COALESCE(assigned_to,?),updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(status, response, c.user.id, r.id)];
  if (response && response !== r.response) {
    stmts.push(c.db.prepare('INSERT INTO messages(id,sender_id,recipient_id,title,body) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(), c.user.id, r.user_id, `پاسخ به درخواست: ${r.title}`.slice(0, 120), response));
  }
  await c.db.batch(stmts);
  await audit(c.db, c.user.id, 'request.update', 'request', r.id, { status });
  return reply({ ok: true });
});
R('POST', '/api/requests/:id/publish', { perm: 'notices.manage' }, async c => {
  const r = await c.db.prepare('SELECT id,title,body,board_requested FROM requests WHERE id=?').bind(c.params.id).first();
  if (!r) throw err(404, 'NOT_FOUND', 'درخواست پیدا نشد');
  if (r.board_requested !== 1) throw err(409, 'NOT_REQUESTED', 'این مورد برای نمایش در تابلو درخواست نشده یا قبلاً منتشر شده است');
  const nid = crypto.randomUUID();
  await c.db.batch([
    c.db.prepare("INSERT INTO notices(id,title,body,audience,kind,created_by) VALUES(?,?,?,'all','عمومی',?)").bind(nid, r.title, r.body, c.user.id),
    c.db.prepare('UPDATE requests SET board_requested=2 WHERE id=?').bind(r.id)
  ]);
  await audit(c.db, c.user.id, 'request.publish', 'request', r.id, { notice: nid });
  return reply({ ok: true, id: nid }, 201);
});

// ---------- پیام‌ها (بدون گیرنده = پیام به مدیریت) ----------
R('GET', '/api/messages', { perm: 'messages.use' }, async c => {
  const box = c.url.searchParams.get('box') === 'sent' ? 'sent' : 'inbox', mgr = can(c.user, 'messages.manage') ? 1 : 0;
  const cols = 'm.*,su.name sender_name,sn.unit_number sender_unit,ru.name recipient_name';
  const from = 'FROM messages m JOIN users su ON su.id=m.sender_id LEFT JOIN units sn ON sn.id=su.unit_id LEFT JOIN users ru ON ru.id=m.recipient_id';
  const r = box === 'sent'
    ? await c.db.prepare(`SELECT ${cols} ${from} WHERE m.sender_id=? ORDER BY m.created_at DESC,m.rowid DESC LIMIT 200`).bind(c.user.id).all()
    : await c.db.prepare(`SELECT ${cols} ${from} WHERE (m.recipient_id=? OR (m.recipient_id IS NULL AND ?=1)) ORDER BY m.created_at DESC,m.rowid DESC LIMIT 200`).bind(c.user.id, mgr).all();
  return reply({ box, messages: r.results });
});
R('POST', '/api/messages', { perm: 'messages.use' }, async c => {
  const x = await readJson(c.request), id = crypto.randomUUID();
  let recipient = null;
  if (x.recipientId) {
    if (!can(c.user, 'messages.manage')) throw err(403, 'FORBIDDEN', 'فقط مدیریت می‌تواند به کاربر مشخصی پیام بدهد');
    if (!await c.db.prepare('SELECT id FROM users WHERE id=? AND active=1').bind(String(x.recipientId)).first()) throw err(404, 'NOT_FOUND', 'گیرنده پیدا نشد');
    recipient = String(x.recipientId);
  }
  await c.db.prepare('INSERT INTO messages(id,sender_id,recipient_id,title,body) VALUES(?,?,?,?,?)')
    .bind(id, c.user.id, recipient, str(x.title, { max: 120, field: 'عنوان' }), str(x.body, { max: 2000, multiline: true, field: 'متن پیام' })).run();
  return reply({ ok: true, id }, 201);
});
R('POST', '/api/messages/:id/read', { perm: 'messages.use' }, async c => {
  await c.db.prepare('UPDATE messages SET read_at=COALESCE(read_at,CURRENT_TIMESTAMP) WHERE id=? AND (recipient_id=? OR (recipient_id IS NULL AND ?=1))')
    .bind(c.params.id, c.user.id, can(c.user, 'messages.manage') ? 1 : 0).run();
  return reply({ ok: true });
});

// ---------- محتوای ساختمان: CRUD عمومی ----------
const shortTime = v => { const s = String(v ?? '').trim(); if (!s) return null; const t = s.replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)); if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) throw err(400, 'INVALID_TIME', 'ساعت باید به شکل ۱۸:۳۰ باشد'); return t; };
const httpsUrl = v => { const s = String(v ?? '').trim(); try { const u = new URL(s); if (u.protocol !== 'https:' || s.length > 500) throw 0; return u.href; } catch { throw err(400, 'INVALID_URL', 'نشانی باید با https شروع شود'); } };
const jalaliParts = value => { const [y,m,d]=String(value).split('-').map(Number); return {y,m,d}; };
const jalaliToDate = (y,m,d) => {
  const start=Date.UTC(y+621,2,15);
  for(let i=0;i<370;i++){const dt=new Date(start+i*86400000),p=new Intl.DateTimeFormat('en-u-ca-persian',{timeZone:'UTC',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(dt),o=Object.fromEntries(p.map(x=>[x.type,x.value]));if(+o.year===y&&+o.month===m&&+o.day===d)return dt;}
  return null;
};
const dateToJalali = dt => { const p=new Intl.DateTimeFormat('en-u-ca-persian',{timeZone:'UTC',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(dt),o=Object.fromEntries(p.map(x=>[x.type,x.value])); return String(+o.year)+'-'+String(+o.month).padStart(2,'0')+'-'+String(+o.day).padStart(2,'0'); };
const jalaliMonthDay = (y,m,d) => { for(let day=d;day>=1;day--){if(jalaliToDate(y,m,day))return day;} return 28; };
const nextOccurrence = (date, recurrence) => {
  const {y,m,d}=jalaliParts(date);
  if(recurrence==='weekly'){const dt=jalaliToDate(y,m,d);if(!dt)return null;return dateToJalali(new Date(dt.getTime()+7*86400000));}
  if(recurrence==='monthly'){const nm=m===12?1:m+1,ny=m===12?y+1:y,day=jalaliMonthDay(ny,nm,d);return String(ny)+'-'+String(nm).padStart(2,'0')+'-'+String(day).padStart(2,'0');}
  if(recurrence==='yearly'){const ny=y+1,day=jalaliMonthDay(ny,m,d);return String(ny)+'-'+String(m).padStart(2,'0')+'-'+String(day).padStart(2,'0');}
  return null;
};
R('GET','/api/events',async c=>{
  const month=c.url.searchParams.get('month');
  if(!month||!/^1[34]\d{2}-\d{2}$/.test(month)) throw err(400,'INVALID_MONTH','ماه نامعتبر است');
  const [yy,mm]=month.split('-').map(Number),first=month+'-01',next=mm===12?String(yy+1)+'-01':String(yy)+'-'+String(mm+1).padStart(2,'0');
  const end=next+'-01';
  const rows=await c.db.prepare("SELECT * FROM events WHERE event_date<? AND (recurrence='none' OR recurrence_until IS NULL OR recurrence_until>=?) ORDER BY event_date,event_time").bind(end,first).all();
  const out=[];
  for(const e of rows.results){
    let date=e.event_date, guard=0;
    while(date<end && guard++<5000){
      if(date>=first && (!e.recurrence_until || date<=e.recurrence_until)){
        const ov=await c.db.prepare('SELECT * FROM event_occurrences WHERE event_id=? AND occurrence_date=?').bind(e.id,date).first();
        const displayDate=ov?.event_date||date;
        if(!ov?.cancelled && displayDate>=first && displayDate<end) out.push({...e,id:e.id,occurrence_date:date,event_date:displayDate,event_time:ov?.event_time??e.event_time,title:ov?.title||e.title,body:ov?.body??e.body,recurrence_date:date,occurrence_id:ov?.id||null});
      }
      if(e.recurrence==='none')break;
      const nextDate=nextOccurrence(date,e.recurrence);if(!nextDate||nextDate<=date)break;date=nextDate;
    }
  }
  const moved=await c.db.prepare("SELECT e.*,o.occurrence_date,o.event_date occurrence_display_date,o.event_time occurrence_time,o.title occurrence_title,o.body occurrence_body,o.id occurrence_id,o.cancelled FROM event_occurrences o JOIN events e ON e.id=o.event_id WHERE o.event_date>=? AND o.event_date<? AND o.cancelled=0").bind(first,end).all();
  for(const o of moved.results){
    if(out.some(x=>x.id===o.id&&x.recurrence_date===o.occurrence_date))continue;
    out.push({...o,event_date:o.occurrence_display_date,event_time:o.occurrence_time??o.event_time,title:o.occurrence_title||o.title,body:o.occurrence_body??o.body,recurrence_date:o.occurrence_date});
  }
  const holidays=OFFICIAL_CALENDAR.filter(h=>h.date>=first&&h.date<end).map(h=>({id:'holiday:'+h.date,title:h.title,event_date:h.date,event_time:null,body:h.official?'تعطیل رسمی':'مناسبت تقویم رسمی',recurrence:'none',recurrence_date:h.date,isHoliday:true,isOfficialHoliday:h.official}));
  return reply({items:[...out,...holidays].sort((a,b)=>a.event_date.localeCompare(b.event_date)||String(a.event_time||'').localeCompare(String(b.event_time||'')))});
});
R('PATCH','/api/events/:id/occurrences/:date',{perm:'events.manage'},async c=>{
  const e=await c.db.prepare('SELECT id FROM events WHERE id=?').bind(c.params.id).first();if(!e)throw err(404,'NOT_FOUND','رویداد پیدا نشد');
  const original=jdate(c.params.date,'-'),x=await readJson(c.request),actual=jdate(x.event_date,'-');
  const old=await c.db.prepare('SELECT id FROM event_occurrences WHERE event_id=? AND occurrence_date=?').bind(e.id,original).first();
  const id=old?.id||crypto.randomUUID();
  await c.db.prepare('INSERT INTO event_occurrences(id,event_id,occurrence_date,event_date,event_time,title,body,cancelled,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,0,?,CURRENT_TIMESTAMP) ON CONFLICT(event_id,occurrence_date) DO UPDATE SET event_date=excluded.event_date,event_time=excluded.event_time,title=excluded.title,body=excluded.body,cancelled=0,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP')
   .bind(id,e.id,original,actual,x.event_time==null?null:shortTime(x.event_time),x.title==null?null:optStr(x.title,{max:120,field:'عنوان'}),x.body==null?null:optStr(x.body,{max:1000,multiline:true,field:'توضیحات'}),c.user.id).run();
  await audit(c.db,c.user.id,'event.occurrence.update','event',e.id,{occurrence:original,eventDate:actual});return reply({ok:true});
});
R('DELETE','/api/events/:id/occurrences/:date',{perm:'events.manage'},async c=>{
  const e=await c.db.prepare('SELECT id FROM events WHERE id=?').bind(c.params.id).first();if(!e)throw err(404,'NOT_FOUND','رویداد پیدا نشد');
  const date=jdate(c.params.date,'-');
  await c.db.prepare("INSERT INTO event_occurrences(id,event_id,occurrence_date,event_date,cancelled,updated_by,updated_at) VALUES(?,?,?,?,1,?,CURRENT_TIMESTAMP) ON CONFLICT(event_id,occurrence_date) DO UPDATE SET cancelled=1,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP")
   .bind(crypto.randomUUID(),e.id,date,date,c.user.id).run();
  await audit(c.db,c.user.id,'event.occurrence.delete','event',e.id,{occurrence:date});return reply({ok:true});
});
const CONTENT = {
  rules: { perm: 'rules.manage', order: 'sort_order ASC,created_at ASC', parse: x => ({ title: str(x.title, { max: 120, field: 'عنوان' }), body: str(x.body, { max: 2000, multiline: true, field: 'متن' }), sort_order: x.sort_order == null || x.sort_order === '' ? 0 : int(x.sort_order, { min: 0, max: 9999 }) }) },
  resolutions: { perm: 'resolutions.manage', order: 'decided_on DESC,created_at DESC', parse: x => ({ title: str(x.title, { max: 120, field: 'عنوان' }), body: str(x.body, { max: 2000, multiline: true, field: 'متن' }), decided_on: jdate(x.decided_on, '/') }) },
  events: { perm: 'events.manage', order: 'event_date ASC,event_time ASC', parse: x => { const recurrence=x.recurrence??'none'; if(!['none','weekly','monthly','yearly'].includes(recurrence)) throw err(400,'INVALID_RECURRENCE','تکرار رویداد نامعتبر است'); const recurrenceUntil=x.recurrenceUntil?jdate(x.recurrenceUntil,'-'):null; const eventDate=jdate(x.event_date,'-'); if(recurrenceUntil&&recurrenceUntil<eventDate) throw err(400,'INVALID_RECURRENCE_END','پایان تکرار نمی‌تواند قبل از شروع باشد'); return {title:str(x.title,{max:120,field:'عنوان'}),body:optStr(x.body,{max:1000,multiline:true,field:'توضیحات'}),event_date:eventDate,event_time:shortTime(x.event_time),recurrence,recurrence_until:recurrenceUntil}; } },
  documents: { perm: 'documents.manage', order: 'created_at DESC', parse: x => ({ title: str(x.title, { max: 120, field: 'عنوان' }), description: optStr(x.description, { max: 300, field: 'توضیحات' }), url: httpsUrl(x.url) }) }
};
for (const [name, def] of Object.entries(CONTENT)) {
  R('GET', `/api/${name}`, async c => {
    const month = c.url.searchParams.get('month');
    const filter = name === 'events' && month && /^1[34]\d{2}-\d{2}$/.test(month) ? 'WHERE event_date LIKE ?' : '';
    const st = c.db.prepare(`SELECT * FROM ${name} ${filter} ORDER BY ${def.order} LIMIT 500`);
    const r = await (filter ? st.bind(month + '-%') : st).all();
    return reply({ items: r.results });
  });
  R('POST', `/api/${name}`, { perm: def.perm }, async c => {
    const f = def.parse(await readJson(c.request)), id = crypto.randomUUID(), keys = Object.keys(f);
    await c.db.prepare(`INSERT INTO ${name}(id,${keys.join(',')},created_by) VALUES(?,${keys.map(() => '?').join(',')},?)`).bind(id, ...keys.map(k => f[k]), c.user.id).run();
    await audit(c.db, c.user.id, `${name}.create`, name, id);
    return reply({ ok: true, id }, 201);
  });
  R('PUT', `/api/${name}/:id`, { perm: def.perm }, async c => {
    const f = def.parse(await readJson(c.request)), keys = Object.keys(f);
    const previous = name === 'events' ? await c.db.prepare('SELECT event_date,recurrence,recurrence_until FROM events WHERE id=?').bind(c.params.id).first() : null;
    const r = await c.db.prepare(`UPDATE ${name} SET ${keys.map(k => k + '=?').join(',')} WHERE id=?`).bind(...keys.map(k => f[k]), c.params.id).run();
    if (!r.meta.changes) throw err(404, 'NOT_FOUND', 'مورد پیدا نشد');
    if (name === 'events' && previous && (previous.event_date !== f.event_date || previous.recurrence !== f.recurrence || previous.recurrence_until !== f.recurrence_until)) await c.db.prepare('DELETE FROM event_occurrences WHERE event_id=?').bind(c.params.id).run();
    await audit(c.db, c.user.id, `${name}.update`, name, c.params.id);
    return reply({ ok: true });
  });
  R('DELETE', `/api/${name}/:id`, { perm: def.perm }, async c => {
    const r = await c.db.prepare(`DELETE FROM ${name} WHERE id=?`).bind(c.params.id).run();
    if (!r.meta.changes) throw err(404, 'NOT_FOUND', 'مورد پیدا نشد');
    await audit(c.db, c.user.id, `${name}.delete`, name, c.params.id);
    return reply({ ok: true });
  });
}

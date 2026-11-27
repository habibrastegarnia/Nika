import { R } from './router.js';
import { reply, readJson, int, jdate, audit } from './lib.js';
import { jTehran, jalaliToDate, occursOn } from './jcal.js';

const pparts = d => jTehran(d);
export const reminderStageKey = (stage, localDate) => stage === 'lateDaily' || stage === 'late7' ? 'daily:' + localDate : stage;
// تبدیل سریع و کش‌شده (به‌جای اسکن تا ۳۷۰ روز با Intl برای هر تاریخ)
const jalaliDate = (y,m,day) => jalaliToDate(y,m,day);
const diff=(a,b)=>Math.round((Date.parse(keyDate(a)+'T00:00:00Z')-Date.parse(keyDate(b)+'T00:00:00Z'))/86400000);
const fa=v=>String(v).replace(/\d/g,d=>'۰۱۲۳۴۵۶۷۸۹'[+d]);
const amount=v=>fa(Number(v).toLocaleString('en-US'));
const templates={
 before:['یادآوری موعد شارژ ماهیانه','info','به اطلاع می‌رسانیم موعد پرداخت شارژ ماهیانه شما به مبلغ AMOUNT تومان، دو روز دیگر فرا می‌رسد.\n\nپرداخت به‌موقع شارژ، نقش مهمی در تأمین هزینه‌های جاری و استمرار امور خدماتی و رفاهی ساختمان دارد.\n\nاز همراهی و مسئولیت‌پذیری شما در قبال مجموعه نیکا سپاسگزاریم.'],
 due:['امروز موعد پرداخت شارژ ماهیانه است','warning','امروز موعد پرداخت شارژ ماهیانه شما به مبلغ AMOUNT تومان است.\n\nهزینه‌های جاری ساختمان بر اساس مشارکت و پرداخت به‌موقع تمامی واحدها تأمین می‌شود. تأخیر در پرداخت هر واحد می‌تواند برنامه‌ریزی و ارائه خدمات مورد نیاز سایر ساکنان را نیز تحت تأثیر قرار دهد.\n\nخواهشمندیم با پرداخت به‌موقع، در حفظ نظم و رفاه مجموعه سهیم باشید.'],
 lateDaily:['یادآوری بدهی شارژ ماهیانه','amber','با وجود گذشت موعد سررسید، مبلغ AMOUNT تومان از شارژ ماهیانه واحد شما همچنان پرداخت‌نشده است.\n\nخواهشمندیم برای جلوگیری از انباشته‌شدن بدهی و اختلال در تأمین هزینه‌های مشترک ساختمان، در اسرع وقت نسبت به پرداخت آن اقدام فرمایید.'],
 late2:['پرداخت شارژ ماهیانه شما هنوز انجام نشده است','amber','با گذشت دو روز از موعد پرداخت، مبلغ AMOUNT تومان از شارژ ماهیانه واحد شما همچنان پرداخت‌نشده باقی مانده است.\n\nشارژ ساختمان صرفاً یک تعهد فردی نیست؛ بلکه پشتوانه تأمین هزینه‌های مشترک و اداره منظم ساختمان است. تأخیر در پرداخت هر واحد ممکن است موجب اختلال در انجام تعهدات مالی ساختمان و ایجاد مشکل برای سایر ساکنانی شود که سهم خود را به‌موقع پرداخت کرده‌اند.\n\nلطفاً با تسویه بدهی، در انجام مسئولیت مشترک خود نسبت به ساختمان و همسایگان همراهی فرمایید.'],
 late7:['تداوم عدم پرداخت شارژ، بر امور کل ساختمان تأثیر می‌گذارد','danger','با وجود گذشت هفت روز یا بیشتر از تاریخ سررسید، مبلغ AMOUNT تومان از شارژ ماهیانه واحد شما همچنان تسویه نشده است.\n\nاداره ساختمان، تأمین هزینه‌های خدماتی، نگهداری تأسیسات و انجام امور مشترک، به مشارکت مالی منظم تمامی واحدها وابسته است. عدم پرداخت به‌موقع شارژ از سوی حتی یک واحد، می‌تواند تعادل مالی و برنامه‌ریزی مدیریت ساختمان را مختل کند و در نهایت پیامدهایی به دنبال داشته باشد که سایر ساکنان، حتی با وجود انجام به‌موقع تعهدات خود، از آثار آن متأثر شوند.\n\nانتظار می‌رود با درک اهمیت مسئولیت‌پذیری در قبال مجموعه و حقوق سایر همسایگان، در اسرع وقت نسبت به پرداخت بدهی اقدام فرمایید.\n\nحفظ کیفیت زندگی و رفاه در ساختمان، مسئولیتی مشترک است و همکاری تک‌تک واحدها در تحقق آن نقش دارد.']
};
async function send(db,sender,recipient,title,body,tone,key){
 if(!recipient)return;
 await db.prepare("INSERT OR IGNORE INTO messages(id,sender_id,recipient_id,title,body,message_type,tone,text_direction,automatic_key) VALUES(?,?,?,?,?,'automatic',?,'rtl',?)")
 .bind(crypto.randomUUID(),sender,recipient,title,body,tone,key).run();
}
R('GET','/api/finance/reminder-settings',{perm:'finance.settings.read'},async c=>{
 const monthly=await c.db.prepare('SELECT monthly_amount,monthly_due_day,monthly_effective_from FROM finance_settings WHERE monthly_effective_from IS NOT NULL ORDER BY monthly_effective_from DESC,created_at DESC LIMIT 1').first();
 const owner=await c.db.prepare('SELECT owner_amount,owner_due_date,owner_effective_from FROM finance_settings WHERE owner_effective_from IS NOT NULL ORDER BY owner_effective_from DESC,created_at DESC LIMIT 1').first();
 return reply({settings:{...(monthly||{}),...(owner||{})}});
});
R('POST','/api/finance/reminder-settings',{perm:'finance.settings'},async c=>{
 const x=await readJson(c.request);
 const monthlyAmount=int(x.monthlyAmount,{min:0,field:'مبلغ شارژ ماهیانه'});
 const monthlyDueDay=int(x.monthlyDueDay,{min:1,max:31,field:'روز سررسید ماهیانه'});
 const ownerAmount=int(x.ownerAmount,{min:0,field:'مبلغ شارژ مالکانه'});
 const monthlyEffectiveFrom=jdate(x.monthlyEffectiveFrom,'-');
 const ownerEffectiveFrom=jdate(x.ownerEffectiveFrom,'-');
 const ownerDueDate=jdate(x.ownerDueDate,'-');
 const id=crypto.randomUUID();
 await c.db.prepare('INSERT INTO finance_settings(id,monthly_amount,monthly_due_day,owner_amount,owner_due_date,monthly_effective_from,owner_effective_from,effective_from,created_by) VALUES(?,?,?,?,?,?,?,?,?)')
  .bind(id,monthlyAmount,monthlyDueDay,ownerAmount,ownerDueDate,monthlyEffectiveFrom,ownerEffectiveFrom,monthlyEffectiveFrom,c.user.id).run();
 await audit(c.db, c.user.id, 'finance.settings.create', 'finance_settings', id, {monthlyEffectiveFrom,ownerEffectiveFrom,ownerDueDate}, { ...(c.user.activeRole ? { actorRole: c.user.activeRole } : {}) });
 return reply({ok:true,id},201);
});
export async function runReminders(env,now=new Date()){
 const today=pparts(now), period=String(today.y)+'-'+String(today.m).padStart(2,'0'), todayJ=period+'-'+String(today.d).padStart(2,'0');
 const monthlySettings=await env.DB.prepare('SELECT * FROM finance_settings WHERE monthly_effective_from<=? ORDER BY monthly_effective_from DESC,created_at DESC LIMIT 1').bind(todayJ).first();
 const ownerSettings=await env.DB.prepare('SELECT * FROM finance_settings WHERE owner_effective_from<=? ORDER BY owner_effective_from DESC,created_at DESC LIMIT 1').bind(todayJ).first();
 const sender=await env.DB.prepare("SELECT u.id FROM users u JOIN user_roles r ON r.user_id=u.id WHERE r.role='chair' AND u.active=1 LIMIT 1").first()
  || await env.DB.prepare("SELECT id FROM users WHERE account_type='staff' AND active=1 LIMIT 1").first();
 if(!sender)return {sent:0,reason:'sender_missing'};
 let sent=0;
 // شارژ ماهیانه‌ی مصوب به‌صورت خودکار برای دوره جاری ایجاد می‌شود؛ سوابق قبلی دست‌نخورده می‌مانند.
 if(monthlySettings?.monthly_amount>0){
  const units=await env.DB.prepare('SELECT id FROM units').all();
  for(const u of units.results){
   const exists=await env.DB.prepare("SELECT id FROM transactions WHERE unit_id=? AND fund_id='monthly' AND kind='charge' AND period=? AND status='approved' LIMIT 1").bind(u.id,period).first();
   if(!exists)await env.DB.prepare("INSERT INTO transactions(id,unit_id,fund_id,kind,amount,title,period,status,created_by,approved_by,approved_at) VALUES(?,?,'monthly','charge',?,?,?,'approved',?,?,CURRENT_TIMESTAMP)")
    .bind(crypto.randomUUID(),u.id,monthlySettings.monthly_amount,'شارژ ماهیانه '+period,period,sender.id,sender.id).run();
  }
 }
 // یادآوری هر دوره‌ی دارای مانده بررسی می‌شود تا پیام روزانه بعد از هفته اول در ماه‌های بعد هم ادامه یابد.
 const rows=await env.DB.prepare("SELECT t.unit_id,n.unit_number,t.period,SUM(CASE WHEN t.kind='charge' THEN t.amount ELSE 0 END) charged,SUM(CASE WHEN t.kind IN ('payment','adjustment') THEN t.amount ELSE 0 END) paid FROM transactions t JOIN units n ON n.id=t.unit_id WHERE t.fund_id='monthly' AND t.status='approved' AND t.period IS NOT NULL GROUP BY t.unit_id,t.period HAVING charged>paid").all();
 for(const r of rows.results){
  const periodSettings=await env.DB.prepare('SELECT monthly_due_day FROM finance_settings WHERE monthly_effective_from<=? ORDER BY monthly_effective_from DESC,created_at DESC LIMIT 1').bind(String(r.period)+'-01').first();
  if(!periodSettings)continue;
  const parts=String(r.period).split('-').map(Number), maxDay=parts[1]<=6?31:parts[1]<=11?30:29, dueDay=Math.min(periodSettings.monthly_due_day,maxDay);
  const due=jalaliDate(parts[0],parts[1],dueDay), days=due?diff(now,due):null;
  const stage=days===-2?'before':days===0?'due':days>=7?'late7':days>=1?'lateDaily':null;
  if(!stage)continue;
  const balance=r.charged-r.paid;
  const resident=await env.DB.prepare("SELECT u.id,u.name FROM users u JOIN user_roles x ON x.user_id=u.id AND x.role='resident' WHERE u.unit_id=? AND u.active=1 LIMIT 1").bind(r.unit_id).first();
  if(!resident)continue;
  const t=templates[stage],body='ساکن محترم واحد '+r.unit_number+'،\n\n'+t[2].replace('AMOUNT',amount(balance))+'\n\nمدیریت ساختمان نیکا';
  const msgKey='monthly:'+r.unit_id+':'+r.period+':'+reminderStageKey(stage,todayJ);
  await send(env.DB,sender.id,resident.id,t[0],body,t[1],msgKey);sent++;
  if(days>=7){
   const owner=await env.DB.prepare("SELECT u.id FROM users u JOIN user_roles x ON x.user_id=u.id AND x.role='owner' WHERE u.unit_id=? AND u.active=1 LIMIT 1").bind(r.unit_id).first();
   if(owner){
    const ownerBody='مالک محترم واحد '+r.unit_number+'،\n\nبه اطلاع می‌رسانیم شارژ ماهیانه واحد شما به مبلغ '+amount(balance)+' تومان که پرداخت آن بر عهده ساکن واحد است، با گذشت هفت روز از موعد سررسید همچنان تسویه نشده است.\n\nتأمین هزینه‌های جاری و اداره مناسب ساختمان به مشارکت منظم تمامی واحدها وابسته است. استمرار این وضعیت می‌تواند بر انجام امور مشترک و ارائه خدمات به سایر ساکنان نیز تأثیر بگذارد.\n\nخواهشمندیم در صورت امکان، موضوع را با ساکن واحد پیگیری فرمایید و در تقویت فرهنگ مسئولیت‌پذیری و همکاری جمعی ساختمان همراه مدیریت باشید.\n\nتوجه: بدهی یادشده همچنان در حساب ساکن ثبت است و به حساب مالک منتقل نشده است.\n\nمدیریت ساختمان نیکا';
    const ownerWeek=Math.floor((days-7)/7);
    await send(env.DB,sender.id,owner.id,'اطلاع درباره تأخیر در پرداخت شارژ واحد شما',ownerBody,'info','owner-notice:'+r.unit_id+':'+r.period+':week:'+ownerWeek);sent++;
   }
  }
 }
 // شارژ مالکانه سالیانه نیز فقط در حساب مالک ایجاد و پیگیری می‌شود.
 if(ownerSettings?.owner_amount>0 && ownerSettings.owner_due_date){
  const dueParts=String(ownerSettings.owner_due_date).split('-').map(Number);
  const dueYear=dueParts[0], due=jalaliDate(dueParts[0],dueParts[1],dueParts[2]);
  if(due && dueYear===today.y){
   const owners=await env.DB.prepare("SELECT u.id,u.unit_id,n.unit_number FROM users u JOIN user_roles x ON x.user_id=u.id AND x.role='owner' JOIN units n ON n.id=u.unit_id WHERE u.active=1").all();
   for(const o of owners.results){
    const exists=await env.DB.prepare("SELECT id FROM transactions WHERE unit_id=? AND fund_id='owner' AND kind='charge' AND period=? AND status='approved' LIMIT 1").bind(o.unit_id,String(today.y)).first();
    if(!exists)await env.DB.prepare("INSERT INTO transactions(id,unit_id,fund_id,kind,amount,title,period,status,created_by,approved_by,approved_at) VALUES(?,?,'owner','charge',?,?,?,'approved',?,?,CURRENT_TIMESTAMP)")
     .bind(crypto.randomUUID(),o.unit_id,ownerSettings.owner_amount,'شارژ مالکانه سال '+today.y,String(today.y),sender.id,sender.id).run();
   }
   const odays=diff(now,due),ostage=odays===-2?'before':odays===0?'due':odays===2?'late2':odays>=7?'late7':null;
   if(ostage){
    const ownersDue=await env.DB.prepare("SELECT u.id,u.unit_id,n.unit_number,COALESCE((SELECT SUM(amount) FROM transactions WHERE unit_id=u.unit_id AND fund_id='owner' AND kind='charge' AND status='approved' AND period=?),0) charged,COALESCE((SELECT SUM(amount) FROM transactions WHERE unit_id=u.unit_id AND fund_id='owner' AND kind IN ('payment','adjustment') AND status='approved' AND period=?),0) paid FROM users u JOIN user_roles x ON x.user_id=u.id AND x.role='owner' JOIN units n ON n.id=u.unit_id WHERE u.active=1").bind(String(today.y),String(today.y)).all();
    for(const o of ownersDue.results){
     const balance=o.charged-o.paid;if(balance<=0)continue;
     const copy=templates[ostage],title=ostage==='late7'?'تذکر درباره بدهی شارژ مالکانه':copy[0].replace('شارژ ماهیانه','شارژ مالکانه');
     const body='مالک محترم واحد '+o.unit_number+'،\n\n'+(ostage==='late7'?'با وجود گذشت هفت روز یا بیشتر از موعد پرداخت شارژ مالکانه، مبلغ '+amount(balance)+' تومان همچنان تسویه نشده است.\n\nپرداخت به‌موقع شارژ مالکانه بخشی از مسئولیت مشترک در حفظ و نگهداری ساختمان و تأمین منابع مورد نیاز آن است. تأخیر در پرداخت می‌تواند برنامه‌ریزی و اجرای امور مصوب ساختمان را با مشکل روبه‌رو کند.\n\nانتظار می‌رود با احساس مسئولیت نسبت به مجموعه و سایر ساکنان، در اسرع وقت بدهی خود را تسویه فرمایید.':copy[2].replace(/شارژ ماهیانه/g,'شارژ مالکانه').replace('AMOUNT',amount(balance)))+'\n\nمدیریت ساختمان نیکا';
     await send(env.DB,sender.id,o.id,title,body,copy[1],'owner:'+o.unit_id+':'+today.y+':'+reminderStageKey(ostage,todayJ));sent++;
    }
   }
  }
 }
 // یادآوری رویدادهای تقویم: یک روز پیش از هر نوبت برای رئیس و مدیر اجرایی.
 const managers=(await env.DB.prepare("SELECT DISTINCT u.id FROM users u JOIN user_roles r ON r.user_id=u.id WHERE r.role IN ('chair','executive') AND u.active=1").all()).results; // خروجی .all() آبجکت است نه آرایه؛ قبلاً for...of روی آن خطا می‌داد و یادآوری تقویم/قرارداد هرگز ارسال نمی‌شد
 const tomorrowDate=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()+1));
 const tomorrowJ=(()=>{const p=pparts(tomorrowDate);return String(p.y)+'-'+String(p.m).padStart(2,'0')+'-'+String(p.d).padStart(2,'0');})();
 const calendarEvents=await env.DB.prepare("SELECT id,title,event_date,event_time,recurrence,recurrence_until FROM events WHERE event_date<=? AND (recurrence='none' OR recurrence_until IS NULL OR recurrence_until>=?)").bind(tomorrowJ,tomorrowJ).all();
 for(const ev of calendarEvents.results){
  if(!occursOn(ev.event_date,ev.recurrence,ev.recurrence_until,tomorrowJ))continue;
  const occurrence=tomorrowJ;
  const override=await env.DB.prepare('SELECT event_date,cancelled,title,event_time FROM event_occurrences WHERE event_id=? AND occurrence_date=?').bind(ev.id,occurrence).first();
  if(!override?.cancelled && (override?.event_date||occurrence)===tomorrowJ){
   const shown=override?.event_date||occurrence;
   const title=override?.title||ev.title;
   for(const recipient of managers){
    await send(env.DB,sender.id,recipient.id,'یادآوری رویداد فردا: '+title,'رویداد «'+title+'» فردا در تاریخ '+shown+(override?.event_time||ev.event_time?'، ساعت '+(override?.event_time||ev.event_time):'')+' برنامه‌ریزی شده است.','info','calendar:'+ev.id+':'+occurrence+':'+recipient.id);sent++;
   }
  }
 }
 // نوبت‌هایی که از تاریخ اصلی خود به فردا منتقل شده‌اند نیز یادآوری می‌شوند.
 const movedTomorrow=await env.DB.prepare("SELECT e.id,e.title,e.event_time,o.occurrence_date,o.event_time occurrence_time,o.title occurrence_title FROM event_occurrences o JOIN events e ON e.id=o.event_id WHERE o.event_date=? AND o.occurrence_date!=? AND o.cancelled=0").bind(tomorrowJ,tomorrowJ).all();
 for(const ev of movedTomorrow.results)for(const recipient of managers){
  const title=ev.occurrence_title||ev.title;
  await send(env.DB,sender.id,recipient.id,'یادآوری رویداد فردا: '+title,'رویداد «'+title+'» فردا در تاریخ '+tomorrowJ+(ev.occurrence_time||ev.event_time?'، ساعت '+(ev.occurrence_time||ev.event_time):'')+' برنامه‌ریزی شده است.','info','calendar:'+ev.id+':'+ev.occurrence_date+':'+recipient.id);sent++;
 }
 // یادآوری پایان قرارداد، دقیقاً یک ماه پیش از تاریخ پایان؛ کلید شامل تاریخ است تا با اصلاح قرارداد، یادآوری جدید فعال شود.
 const contracts=await env.DB.prepare("SELECT u.id,u.name,u.contract_end_date,n.unit_number FROM users u LEFT JOIN units n ON n.id=u.unit_id WHERE u.active=1 AND u.contract_end_date IS NOT NULL").all();
 const subtractMonth=date=>{
  const [y,m,d]=date.split('-').map(Number);let yy=y,mm=m-1;if(mm===0){mm=12;yy--;}
  for(let day=d;day>=1;day--)if(jalaliDate(yy,mm,day))return String(yy)+'-'+String(mm).padStart(2,'0')+'-'+String(day).padStart(2,'0');return String(yy)+'-'+String(mm).padStart(2,'0')+'-28';
 };
 for(const person of contracts.results){
  if(subtractMonth(person.contract_end_date)!==todayJ)continue;
  for(const recipient of managers){
   const unit=person.unit_number?'واحد '+person.unit_number:'';
   await send(env.DB,sender.id,recipient.id,'یادآوری پایان قرارداد '+unit,'قرارداد '+(person.name||'کاربر')+' '+unit+' در تاریخ '+person.contract_end_date+' به پایان می‌رسد. برای بررسی بدهی و بستانکاری، تسویه‌حساب و برنامه‌ریزی تحویل واحد اقدام کنید.','warning','contract-end:'+person.id+':'+person.contract_end_date+':'+recipient.id);sent++;
  }
 }
 return {sent};
}

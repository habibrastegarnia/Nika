import { R } from './router.js';
import { reply, readJson, int, jdate, audit } from './lib.js';

const pparts = d => {
 const a = new Intl.DateTimeFormat('en-u-ca-persian',{timeZone:'Asia/Tehran',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d);
 const o=Object.fromEntries(a.map(x=>[x.type,x.value]));
 return {y:+o.year,m:+o.month,d:+o.day};
};
const keyDate=d=>new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate())).toISOString().slice(0,10);
function jalaliDate(y,m,day){
 const start=Date.UTC(y+621,2,15);
 for(let i=0;i<370;i++){const d=new Date(start+i*86400000),p=pparts(d);if(p.y===y&&p.m===m&&p.d===day)return d;}
 return null;
}
const diff=(a,b)=>Math.round((Date.parse(keyDate(a)+'T00:00:00Z')-Date.parse(keyDate(b)+'T00:00:00Z'))/86400000);
const fa=v=>String(v).replace(/\d/g,d=>'۰۱۲۳۴۵۶۷۸۹'[+d]);
const amount=v=>fa(Number(v).toLocaleString('en-US'));
const templates={
 before:['یادآوری موعد شارژ ماهیانه','info','به اطلاع می‌رسانیم موعد پرداخت شارژ ماهیانه شما به مبلغ AMOUNT تومان، دو روز دیگر فرا می‌رسد.\n\nپرداخت به‌موقع شارژ، نقش مهمی در تأمین هزینه‌های جاری و استمرار امور خدماتی و رفاهی ساختمان دارد.\n\nاز همراهی و مسئولیت‌پذیری شما در قبال مجموعه نیکا سپاسگزاریم.'],
 due:['امروز موعد پرداخت شارژ ماهیانه است','warning','امروز موعد پرداخت شارژ ماهیانه شما به مبلغ AMOUNT تومان است.\n\nهزینه‌های جاری ساختمان بر اساس مشارکت و پرداخت به‌موقع تمامی واحدها تأمین می‌شود. تأخیر در پرداخت هر واحد می‌تواند برنامه‌ریزی و ارائه خدمات مورد نیاز سایر ساکنان را نیز تحت تأثیر قرار دهد.\n\nخواهشمندیم با پرداخت به‌موقع، در حفظ نظم و رفاه مجموعه سهیم باشید.'],
 late2:['پرداخت شارژ ماهیانه شما هنوز انجام نشده است','amber','با گذشت دو روز از موعد پرداخت، مبلغ AMOUNT تومان از شارژ ماهیانه واحد شما همچنان پرداخت‌نشده باقی مانده است.\n\nشارژ ساختمان صرفاً یک تعهد فردی نیست؛ بلکه پشتوانه تأمین هزینه‌های مشترک و اداره منظم ساختمان است. تأخیر در پرداخت هر واحد ممکن است موجب اختلال در انجام تعهدات مالی ساختمان و ایجاد مشکل برای سایر ساکنانی شود که سهم خود را به‌موقع پرداخت کرده‌اند.\n\nلطفاً با تسویه بدهی، در انجام مسئولیت مشترک خود نسبت به ساختمان و همسایگان همراهی فرمایید.'],
 late7:['تداوم عدم پرداخت شارژ، بر امور کل ساختمان تأثیر می‌گذارد','danger','با وجود گذشت هفت روز یا بیشتر از تاریخ سررسید، مبلغ AMOUNT تومان از شارژ ماهیانه واحد شما همچنان تسویه نشده است.\n\nاداره ساختمان، تأمین هزینه‌های خدماتی، نگهداری تأسیسات و انجام امور مشترک، به مشارکت مالی منظم تمامی واحدها وابسته است. عدم پرداخت به‌موقع شارژ از سوی حتی یک واحد، می‌تواند تعادل مالی و برنامه‌ریزی مدیریت ساختمان را مختل کند و در نهایت پیامدهایی به دنبال داشته باشد که سایر ساکنان، حتی با وجود انجام به‌موقع تعهدات خود، از آثار آن متأثر شوند.\n\nانتظار می‌رود با درک اهمیت مسئولیت‌پذیری در قبال مجموعه و حقوق سایر همسایگان، در اسرع وقت نسبت به پرداخت بدهی اقدام فرمایید.\n\nحفظ کیفیت زندگی و رفاه در ساختمان، مسئولیتی مشترک است و همکاری تک‌تک واحدها در تحقق آن نقش دارد.']
};
async function send(db,sender,recipient,title,body,tone,key){
 if(!recipient)return;
 await db.prepare("INSERT OR IGNORE INTO messages(id,sender_id,recipient_id,title,body,message_type,tone,text_direction,automatic_key) VALUES(?,?,?,?,?,'automatic',?,'rtl',?)")
 .bind(crypto.randomUUID(),sender,recipient,title,body,tone,key).run();
}
R('GET','/api/finance/reminder-settings',{perm:'*'},async c=>{
 const exists=await c.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='finance_settings'").first();
 if(!exists)return reply({settings:null});
 const settings=await c.db.prepare('SELECT monthly_amount,monthly_due_day,owner_amount,owner_due_month,owner_due_day,effective_from,created_at FROM finance_settings ORDER BY effective_from DESC,created_at DESC LIMIT 1').first();
 return reply({settings:settings||null});
});
R('POST','/api/finance/reminder-settings',{perm:'*'},async c=>{
 const x=await readJson(c.request);
 const vals=[int(x.monthlyAmount,{min:0,field:'مبلغ شارژ ماهیانه'}),int(x.monthlyDueDay,{min:1,max:31,field:'روز سررسید ماهیانه'}),int(x.ownerAmount,{min:0,field:'مبلغ شارژ مالکانه'}),int(x.ownerDueMonth,{min:1,max:12,field:'ماه سررسید مالکانه'}),int(x.ownerDueDay,{min:1,max:31,field:'روز سررسید مالکانه'}),jdate(x.effectiveFrom,'-')];
 const id=crypto.randomUUID();
 await c.db.prepare('INSERT INTO finance_settings(id,monthly_amount,monthly_due_day,owner_amount,owner_due_month,owner_due_day,effective_from,created_by) VALUES(?,?,?,?,?,?,?,?)').bind(id,...vals,c.user.id).run();
 await audit(c.db,c.user.id,'finance.settings.create','finance_settings',id,{effectiveFrom:vals[5]});
 return reply({ok:true,id},201);
});
export async function runReminders(env,now=new Date()){
 const today=pparts(now), period=String(today.y)+'-'+String(today.m).padStart(2,'0'), todayJ=period+'-'+String(today.d).padStart(2,'0');
 const settings=await env.DB.prepare('SELECT * FROM finance_settings WHERE effective_from<=? ORDER BY effective_from DESC,created_at DESC LIMIT 1').bind(todayJ).first();
 if(!settings)return {sent:0,reason:'settings_missing'};
 const sender=await env.DB.prepare("SELECT u.id FROM users u JOIN user_roles r ON r.user_id=u.id WHERE r.role='chair' AND u.active=1 LIMIT 1").first()
  || await env.DB.prepare("SELECT id FROM users WHERE account_type='staff' AND active=1 LIMIT 1").first();
 if(!sender)return {sent:0,reason:'sender_missing'};
 let sent=0;
 // شارژ ماهیانه‌ی مصوب به‌صورت خودکار برای دوره جاری ایجاد می‌شود؛ سوابق قبلی دست‌نخورده می‌مانند.
 if(settings.monthly_amount>0){
  const units=await env.DB.prepare('SELECT id FROM units').all();
  for(const u of units.results){
   const exists=await env.DB.prepare("SELECT id FROM transactions WHERE unit_id=? AND fund_id='monthly' AND kind='charge' AND period=? AND status='approved' LIMIT 1").bind(u.id,period).first();
   if(!exists)await env.DB.prepare("INSERT INTO transactions(id,unit_id,fund_id,kind,amount,title,period,status,created_by,approved_by,approved_at) VALUES(?,?,'monthly','charge',?,?,?,'approved',?,?,CURRENT_TIMESTAMP)")
    .bind(crypto.randomUUID(),u.id,settings.monthly_amount,'شارژ ماهیانه '+period,period,sender.id,sender.id).run();
  }
 }
 // یادآوری هر دوره‌ی دارای مانده بررسی می‌شود تا پیام روزانه بعد از هفته اول در ماه‌های بعد هم ادامه یابد.
 const rows=await env.DB.prepare("SELECT t.unit_id,n.unit_number,t.period,SUM(CASE WHEN t.kind='charge' THEN t.amount ELSE 0 END) charged,SUM(CASE WHEN t.kind IN ('payment','adjustment') THEN t.amount ELSE 0 END) paid FROM transactions t JOIN units n ON n.id=t.unit_id WHERE t.fund_id='monthly' AND t.status='approved' AND t.period IS NOT NULL GROUP BY t.unit_id,t.period HAVING charged>paid").all();
 for(const r of rows.results){
  const periodSettings=await env.DB.prepare('SELECT monthly_due_day FROM finance_settings WHERE effective_from<=? ORDER BY effective_from DESC,created_at DESC LIMIT 1').bind(String(r.period)+'-01').first();
  if(!periodSettings)continue;
  const parts=String(r.period).split('-').map(Number), maxDay=parts[1]<=6?31:parts[1]<=11?30:29, dueDay=Math.min(periodSettings.monthly_due_day,maxDay);
  const due=jalaliDate(parts[0],parts[1],dueDay), days=due?diff(now,due):null;
  const stage=days===-2?'before':days===0?'due':days===2?'late2':days>=7?'late7':null;
  if(!stage)continue;
  const balance=r.charged-r.paid;
  const resident=await env.DB.prepare("SELECT u.id,u.name FROM users u JOIN user_roles x ON x.user_id=u.id AND x.role='resident' WHERE u.unit_id=? AND u.active=1 LIMIT 1").bind(r.unit_id).first();
  if(!resident)continue;
  const t=templates[stage],body='ساکن محترم واحد '+r.unit_number+'،\n\n'+t[2].replace('AMOUNT',amount(balance))+'\n\nمدیریت ساختمان نیکا';
  const msgKey='monthly:'+r.unit_id+':'+r.period+':'+(stage==='late7'?'daily:'+keyDate(now):stage);
  await send(env.DB,sender.id,resident.id,t[0],body,t[1],msgKey);sent++;
  if(days>=7){
   const owner=await env.DB.prepare("SELECT u.id FROM users u JOIN user_roles x ON x.user_id=u.id AND x.role='owner' WHERE u.unit_id=? AND u.active=1 LIMIT 1").bind(r.unit_id).first();
   if(owner){
    const ownerBody='مالک محترم واحد '+r.unit_number+'،\n\nبه اطلاع می‌رسانیم شارژ ماهیانه واحد شما به مبلغ '+amount(balance)+' تومان که پرداخت آن بر عهده ساکن واحد است، با گذشت هفت روز از موعد سررسید همچنان تسویه نشده است.\n\nتأمین هزینه‌های جاری و اداره مناسب ساختمان به مشارکت منظم تمامی واحدها وابسته است. استمرار این وضعیت می‌تواند بر انجام امور مشترک و ارائه خدمات به سایر ساکنان نیز تأثیر بگذارد.\n\nخواهشمندیم در صورت امکان، موضوع را با ساکن واحد پیگیری فرمایید و در تقویت فرهنگ مسئولیت‌پذیری و همکاری جمعی ساختمان همراه مدیریت باشید.\n\nتوجه: بدهی یادشده همچنان در حساب ساکن ثبت است و به حساب مالک منتقل نشده است.\n\nمدیریت ساختمان نیکا';
    await send(env.DB,sender.id,owner.id,'اطلاع درباره تأخیر در پرداخت شارژ واحد شما',ownerBody,'info','owner-notice:'+r.unit_id+':'+r.period+':'+keyDate(now));sent++;
   }
  }
 }
 // شارژ مالکانه سالیانه نیز فقط در حساب مالک ایجاد و پیگیری می‌شود.
 if(settings.owner_amount>0){
  const owners=await env.DB.prepare("SELECT u.id,u.unit_id,n.unit_number FROM users u JOIN user_roles x ON x.user_id=u.id AND x.role='owner' JOIN units n ON n.id=u.unit_id WHERE u.active=1").all();
  for(const o of owners.results){
   const exists=await env.DB.prepare("SELECT id FROM transactions WHERE unit_id=? AND fund_id='owner' AND kind='charge' AND period=? AND status='approved' LIMIT 1").bind(o.unit_id,String(today.y)).first();
   if(!exists)await env.DB.prepare("INSERT INTO transactions(id,unit_id,fund_id,kind,amount,title,period,status,created_by,approved_by,approved_at) VALUES(?,?,'owner','charge',?,?,?,'approved',?,?,CURRENT_TIMESTAMP)")
    .bind(crypto.randomUUID(),o.unit_id,settings.owner_amount,'شارژ مالکانه سال '+today.y,String(today.y),sender.id,sender.id).run();
  }
  const odue=jalaliDate(today.y,settings.owner_due_month,Math.min(settings.owner_due_day,settings.owner_due_month<=6?31:settings.owner_due_month<=11?30:29));
  const odays=odue?diff(now,odue):null, ostage=odays===-2?'before':odays===0?'due':odays===2?'late2':odays>=7?'late7':null;
  if(ostage){
   const ownersDue=await env.DB.prepare("SELECT u.id,u.unit_id,n.unit_number,COALESCE((SELECT SUM(amount) FROM transactions WHERE unit_id=u.unit_id AND fund_id='owner' AND kind='charge' AND status='approved' AND period=?),0) charged,COALESCE((SELECT SUM(amount) FROM transactions WHERE unit_id=u.unit_id AND fund_id='owner' AND kind IN ('payment','adjustment') AND status='approved'),0) paid FROM users u JOIN user_roles x ON x.user_id=u.id AND x.role='owner' JOIN units n ON n.id=u.unit_id WHERE u.active=1").bind(String(today.y)).all();
   for(const o of ownersDue.results){
    const balance=o.charged-o.paid;if(balance<=0)continue;
    const copy=templates[ostage];
    const title=ostage==='late7'?'تذکر درباره بدهی شارژ مالکانه':copy[0].replace('شارژ ماهیانه','شارژ مالکانه');
    const body='مالک محترم واحد '+o.unit_number+'،\n\n'+(ostage==='late7'?'با وجود گذشت هفت روز یا بیشتر از موعد پرداخت شارژ مالکانه، مبلغ '+amount(balance)+' تومان همچنان تسویه نشده است.\n\nپرداخت به‌موقع شارژ مالکانه بخشی از مسئولیت مشترک در حفظ و نگهداری ساختمان و تأمین منابع مورد نیاز آن است. تأخیر در پرداخت می‌تواند برنامه‌ریزی و اجرای امور مصوب ساختمان را با مشکل روبه‌رو کند.\n\nانتظار می‌رود با احساس مسئولیت نسبت به مجموعه و سایر ساکنان، در اسرع وقت بدهی خود را تسویه فرمایید.':copy[2].replace('شارژ ماهیانه','شارژ مالکانه').replace('AMOUNT',amount(balance)))+'\n\nمدیریت ساختمان نیکا';
    await send(env.DB,sender.id,o.id,title,body,copy[1],'owner:'+o.unit_id+':'+today.y+':'+(ostage==='late7'?'daily:'+keyDate(now):ostage));sent++;
   }
  }
 }
 return {sent};
}

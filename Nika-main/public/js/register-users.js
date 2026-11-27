const $=id=>document.getElementById(id), faDigits=s=>String(s).replace(/\d/g,d=>'۰۱۲۳۴۵۶۷۸۹'[+d]);
const units=$('unit');
function latinDigits(s){return String(s||'').replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d))}
function validJalaliDate(value){
 const v=latinDigits(value);
 if(!/^\d{4}\/\d{2}\/\d{2}$/.test(v)) return false;
 const [year,month,day]=v.split('/').map(Number);
 if(year<1300||year>1500||month<1||month>12||day<1) return false;
 return day<=(month<=6?31:month<=11?30:30);
}
function latinDigits(s){return String(s||'').replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d))}
$('registration').addEventListener('submit',async e=>{e.preventDefault();const first=$('firstName').value.trim(),last=$('lastName').value.trim(),type=$('userType').value,start=latinDigits($('contractStartDate').value),end=latinDigits($('contractEndDate').value);if(!first||!last){alert('لطفاً نام و نام خانوادگی را وارد کنید.');return}if(start&&!validJalaliDate(start)){alert('تاریخ شروع قرارداد معتبر نیست؛ مثال: ۱۴۰۵/۰۱/۰۱');return}if(end&&!validJalaliDate(end)){alert('تاریخ اتمام قرارداد معتبر نیست؛ مثال: ۱۴۰۵/۰۱/۰۱');return}if(start&&end&&end<start){alert('تاریخ اتمام قرارداد نمی‌تواند پیش از تاریخ شروع باشد.');return}
const payload={unit:units.value,userType:type,firstName:first,lastName:last,fullName:first+' '+last,gender:$('gender').value,phone:latinDigits($('phone').value).replace(/[\s-]/g,''),secondaryPhone:latinDigits($('secondaryPhone').value).replace(/[\s-]/g,''),contractStartDate:start||null,contractEndDate:end||null,website:$('website').value};
if(!payload.unit||!type||!payload.gender||!payload.phone){alert('لطفاً همه موارد ستاره‌دار را تکمیل کنید.');return}
const btn=$('submitBtn');btn.disabled=true;btn.textContent='در حال ثبت…';
try{const r=await fetch('/api/public/user-submissions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});let data={};try{data=await r.json()}catch(_){throw new Error('پاسخ سرور قابل خواندن نبود؛ ثبت اطلاعات تأیید نشد. لطفاً دوباره تلاش کنید.')}if(!r.ok||data.ok!==true)throw new Error(data.message||'ثبت اطلاعات انجام نشد.');const role=type==='owner'?'مالک':'ساکن',honor=$('gender').value==='female'?'خانم':'آقای';$('successGreeting').textContent=role+' محترم واحد '+faDigits(payload.unit)+'، '+honor+' '+first+' '+last;$('formView').style.display='none';$('successView').style.display='block';window.scrollTo({top:0,behavior:'smooth'})}
catch(err){alert(err.message||'ارتباط با سرور برقرار نشد. دوباره تلاش کنید.');btn.disabled=false;btn.textContent='ثبت اطلاعات'}});

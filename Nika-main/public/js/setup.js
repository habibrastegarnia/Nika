(function(){
 'use strict';
 var form=document.getElementById('setup');
 var button=document.getElementById('submit');
 var out=document.getElementById('result');
 if(!form||!button||!out)return;
 form.addEventListener('submit',function(e){
  e.preventDefault();
  var name=form.elements.name.value.trim();
  var phone=form.elements.phone.value.trim();
  var password=form.elements.password.value;
  var key=form.elements.key.value;
  if(!name||!phone||!password||!key){out.textContent='لطفاً هر چهار قسمت را کامل کنید.';return;}
  if(password.length<10){out.textContent='رمز عبور باید حداقل ۱۰ کاراکتر باشد.';return;}
  button.disabled=true;
  out.textContent='در حال ارسال درخواست به سرور...';
  var xhr=new XMLHttpRequest();
  xhr.open('POST','/api/setup',true);
  xhr.setRequestHeader('Content-Type','application/json');
  xhr.setRequestHeader('X-Setup-Key',key);
  xhr.timeout=20000;
  xhr.onload=function(){
   var message=xhr.responseText||'پاسخ خالی از سرور';
   try{
    var data=JSON.parse(xhr.responseText);
    message=data.message||data.error||message;
    if(data.error)message+=' ('+data.error+')';
   }catch(ignore){}
   out.textContent=(xhr.status>=200&&xhr.status<300?'موفقیت: ':'خطای سرور ('+xhr.status+'): ')+message;
   if(xhr.status>=200&&xhr.status<300)form.reset();
   button.disabled=false;
  };
  xhr.onerror=function(){out.textContent='خطای ارتباط با سرور؛ درخواست ارسال نشد یا پاسخ دریافت نشد.';button.disabled=false;};
  xhr.ontimeout=function(){out.textContent='پاسخ سرور بیش از ۲۰ ثانیه طول کشید. وضعیت را بررسی می‌کنیم؛ فعلاً دوباره ارسال نکنید.';button.disabled=false;};
  try{xhr.send(JSON.stringify({name:name,phone:phone,password:password}));}
  catch(err){out.textContent='خطا هنگام ارسال: '+err.message;button.disabled=false;}
 });
})();
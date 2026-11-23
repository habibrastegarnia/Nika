(function(){
 'use strict';
 var form=document.getElementById('setup');
 var button=document.getElementById('submit');
 var out=document.getElementById('result');
 if(!form||!button||!out)return;
 form.addEventListener('submit',function(e){
  e.preventDefault();
  var key=form.elements.key.value;
  if(!key){out.textContent='کلید فعال‌سازی را وارد کنید.';return;}
  button.disabled=true;
  out.textContent='در حال فعال‌سازی سامانه...';
  var xhr=new XMLHttpRequest();
  xhr.open('POST','/api/setup',true);
  xhr.setRequestHeader('Content-Type','application/json');
  xhr.setRequestHeader('X-Setup-Key',key);
  xhr.timeout=20000;
  xhr.onload=function(){
   var data={};try{data=JSON.parse(xhr.responseText||'{}');}catch(ignore){}
   out.textContent=(xhr.status>=200&&xhr.status<300?'موفقیت: ':'خطای سرور ('+xhr.status+'): ')+(data.message||data.error||'پاسخ نامشخص');
   if(xhr.status>=200&&xhr.status<300){form.reset();out.textContent+='\nاکنون به صفحه ورود بروید و با Admin / admin وارد شوید.';}
   button.disabled=false;
  };
  xhr.onerror=function(){out.textContent='خطای ارتباط با سرور.';button.disabled=false;};
  xhr.ontimeout=function(){out.textContent='پاسخ سرور بیش از ۲۰ ثانیه طول کشید؛ وضعیت فعال‌سازی را بررسی کنید و فعلاً دوباره ارسال نکنید.';button.disabled=false;};
  try{xhr.send('{}');}catch(err){out.textContent='خطا هنگام ارسال: '+err.message;button.disabled=false;}
 });
})();
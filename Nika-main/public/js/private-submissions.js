(()=>{
  const $ = id => document.getElementById(id);
  const fa = value => String(value ?? '').replace(/\d/g, digit => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)]);
  const safe = value => value == null || value === '' ? '—' : String(value);

  function cell(row, value) {
    const td = document.createElement('td');
    td.textContent = value;
    row.appendChild(td);
  }

  async function load() {
    try {
      const response = await fetch('/api/private/user-submissions', { cache: 'no-store' });
      if (!response.ok) throw new Error('خطا در دریافت اطلاعات (' + response.status + ')');
      const data = await response.json();

      $('count').textContent = 'تعداد کل ثبت‌نام‌ها: ' + fa(data.total);
      const body = $('rows');
      body.replaceChildren();

      if (!Array.isArray(data.rows) || data.rows.length === 0) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 10;
        td.className = 'empty';
        td.textContent = 'هنوز اطلاعاتی ثبت نشده است.';
        tr.appendChild(td);
        body.appendChild(tr);
      } else {
        data.rows.forEach((item, index) => {
          const tr = document.createElement('tr');
          cell(tr, fa(index + 1));
          cell(tr, fa(item.unit_number));
          cell(tr, item.user_type === 'owner' ? 'مالک' : 'ساکن');
          cell(tr, safe(item.full_name));
          cell(tr, item.gender === 'female' ? 'زن' : 'مرد');
          cell(tr, safe(item.phone));
          cell(tr, safe(item.secondary_phone));
          cell(tr, fa(safe(item.contract_start_date)));
          cell(tr, fa(safe(item.contract_end_date)));
          cell(tr, fa(safe(item.submitted_at)));
          body.appendChild(tr);
        });
      }

      $('status').textContent = 'آخرین دریافت موفق: ' + fa(new Date().toLocaleTimeString('fa-IR'));
      $('status').className = 'status';
    } catch (error) {
      $('status').textContent = 'دریافت اطلاعات ناموفق بود: ' + error.message;
      $('status').className = 'status error';
    }
  }

  load();
  setInterval(load, 15000);
})();

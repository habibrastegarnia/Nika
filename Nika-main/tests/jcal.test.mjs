import test from 'node:test';
import assert from 'node:assert/strict';
import { jParts, jalaliToDate, dateToJalali, monthLength, occursOn, occurrencesBetween, daysBetween } from '../src/jcal.js';

test('jalaliToDate با ICU برای همه‌ی روزهای ۱۳۸۰ تا ۱۴۶۰ رفت‌وبرگشتی سازگار است', () => {
  const DAY = 86400000; let n = 0;
  for (let t = Date.UTC(2001, 0, 1, 12); t < Date.UTC(2081, 0, 1, 12); t += DAY) {
    const g = new Date(t), p = jParts(g), back = jalaliToDate(p.y, p.m, p.d);
    assert.ok(back && back.getTime() === t, `ناسازگار برای ${g.toISOString()}`); n++;
  }
  assert.ok(n > 29000);
});
test('تاریخ نامعتبر null می‌دهد و طول ماه‌ها درست است', () => {
  assert.equal(jalaliToDate(1405, 7, 31), null); assert.equal(jalaliToDate(1405, 13, 1), null); assert.equal(jalaliToDate(1405, 12, 30), null);
  assert.ok(jalaliToDate(1403, 12, 30));
  assert.deepEqual([monthLength(1405, 1), monthLength(1405, 6), monthLength(1405, 7), monthLength(1405, 11), monthLength(1405, 12), monthLength(1403, 12)], [31, 31, 30, 30, 29, 30]);
  assert.equal(dateToJalali(new Date(Date.UTC(2026, 10, 22, 12))), '1405-09-01');
});
test('تکرار ماهانه از روز اصلی محاسبه می‌شود (نه از روز قبلی)', () => {
  const all = occurrencesBetween('1405-01-31', 'monthly', null, '1405-01-01', '1406-01-01');
  assert.deepEqual(all, ['1405-01-31', '1405-02-31', '1405-03-31', '1405-04-31', '1405-05-31', '1405-06-31', '1405-07-30', '1405-08-30', '1405-09-30', '1405-10-30', '1405-11-30', '1405-12-29']);
  assert.equal(occurrencesBetween('1405-01-31', 'monthly', null, '1406-01-01', '1406-02-01')[0], '1406-01-31', 'بعد از اسفند دوباره ۳۱ام');
  assert.ok(occursOn('1405-01-31', 'monthly', null, '1405-12-29') && !occursOn('1405-01-31', 'monthly', null, '1405-12-30'));
});
test('تکرار هفتگی و سالانه و تاریخ پایان', () => {
  const w = occurrencesBetween('1404-01-01', 'weekly', null, '1405-09-01', '1405-10-01');
  assert.deepEqual(w, ['1405-09-06', '1405-09-13', '1405-09-20', '1405-09-27']); // همه جمعه‌اند
  for (const d of w) assert.equal(new Date(jalaliToDate(...d.split('-').map(Number))).getUTCDay(), 5);
  assert.ok(occursOn('1404-01-01', 'weekly', null, '1405-09-06') && !occursOn('1404-01-01', 'weekly', null, '1405-09-07'));
  assert.deepEqual(occurrencesBetween('1404-01-01', 'weekly', '1405-09-14', '1405-09-01', '1405-10-01'), ['1405-09-06', '1405-09-13']);
  assert.deepEqual(occurrencesBetween('1403-12-30', 'yearly', null, '1405-01-01', '1406-01-01'), ['1405-12-29']);
  assert.deepEqual(occurrencesBetween('1405-09-05', 'none', null, '1405-09-01', '1405-10-01'), ['1405-09-05']);
  assert.equal(daysBetween('1405-09-01', '1405-09-08'), 7);
});

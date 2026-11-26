import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('onSubmit مجموعه ورودی‌های مبلغ را با querySelectorAll می‌گیرد', async () => {
  const source = await readFile(new URL('../public/js/ui.js', import.meta.url), 'utf8');
  const start = source.indexOf('export function onSubmit(');
  const end = source.indexOf('\nexport const num', start);
  assert.ok(start >= 0 && end > start, 'تابع onSubmit باید وجود داشته باشد');
  const body = source.slice(start, end);
  assert.match(body, /\$\$\(['"]input\[name="amount"\], input\[data-money="true"\]['"],\s*form\)/);
  assert.doesNotMatch(body, /\$\(['"]input\[name="amount"\], input\[data-money="true"\]['"],\s*form\)\.forEach/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { join } from 'node:path';

const root = new URL('../public/', import.meta.url);

test('تمام فایل‌های پوسته‌ی آفلاین واقعاً در پوشه‌ی public وجود دارند', async () => {
  const source = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
  const match = source.match(/const SHELL = \[(.*?)\];/s);
  assert.ok(match, 'فهرست SHELL باید تعریف شده باشد');
  const paths = [...match[1].matchAll(/'([^']+)'/g)].map(x => x[1]);
  for (const path of paths) {
    const file = path === '/' ? new URL('../public/index.html', import.meta.url) : new URL('../public' + path, import.meta.url);
    await access(file);
  }
});

test('کش آفلاین query version را هنگام بازیابی نادیده می‌گیرد و خطای ذخیره را مدیریت می‌کند', async () => {
  const source = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
  assert.match(source, /caches\.match\(r,\s*\{\s*ignoreSearch:\s*true\s*\}\)/);
  assert.match(source, /caches\.match\('\/',\s*\{\s*ignoreSearch:\s*true\s*\}\)/);
  assert.match(source, /caches\.open\(CACHE\)\.then\(c\s*=>\s*c\.put\(r,\s*copy\)\)\.catch/);
});

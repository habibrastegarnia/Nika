// شبیه‌ساز ساده‌ی D1 روی node:sqlite برای تست محلی (فقط برای توسعه)
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
class Stmt {
  constructor(db, sql) { this.db = db; this.sql = sql; this.args = []; }
  bind(...a) { this.args = a.map(v => { if (v === undefined) throw new Error('undefined bind in: ' + this.sql.slice(0, 80)); return v; }); return this; }
  async first() { return this.db.prepare(this.sql).get(...this.args) ?? null; }
  async all() { return { results: this.db.prepare(this.sql).all(...this.args).map(r => ({ ...r })) }; }
  async run() { const r = this.db.prepare(this.sql).run(...this.args); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; }
}
export function createDB() {
  const raw = new DatabaseSync(':memory:');
  raw.exec('PRAGMA foreign_keys=ON');
  const dir = path.join(here, '..', 'migrations');
  for (const f of readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) raw.exec(readFileSync(path.join(dir, f), 'utf8'));
  return {
    raw,
    prepare: sql => new Stmt(raw, sql),
    async batch(stmts) {
      raw.exec('BEGIN');
      try { const out = []; for (const s of stmts) out.push(await s.run()); raw.exec('COMMIT'); return out; }
      catch (e) { raw.exec('ROLLBACK'); throw e; }
    }
  };
}

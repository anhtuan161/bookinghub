// =============================================================
//  App DB — Postgres nội bộ (docker-core), tách khỏi Supabase của Booking Hub.
//  Chứa: người dùng/phân quyền (app_*), Thomstay Coliving (cl_*).
//  Migration: chạy lần lượt db/app/NNN_*.sql chưa áp dụng (bảng app_migrations).
// =============================================================
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { config } from '../config.js'

// Kiểu DATE trả về chuỗi 'YYYY-MM-DD' (không đổi sang Date → tránh lệch ngày theo múi giờ),
// NUMERIC trả về số. Áp dụng cho mọi pool trong process (cả Supabase — db.ts đã xử lý cả 2 dạng).
pg.types.setTypeParser(1082, (v) => v)
pg.types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)))
// BIGINT (id ezCloud, count) → number (mọi id < 2^53)
pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v)))

export const appDbEnabled = !!config.appDatabaseUrl

let pool: pg.Pool | null = null

export function appPool(): pg.Pool {
  if (!appDbEnabled) throw new Error('APP_DATABASE_URL chưa cấu hình')
  if (!pool) {
    pool = new pg.Pool({ connectionString: config.appDatabaseUrl, max: 8 })
    pool.on('error', (e) => console.error('[app-db] pool error:', e.message))
  }
  return pool
}

export async function q<T = any>(text: string, params?: any[]): Promise<T[]> {
  const r = await appPool().query(text, params)
  return r.rows as T[]
}

export async function q1<T = any>(text: string, params?: any[]): Promise<T | null> {
  const rows = await q<T>(text, params)
  return rows[0] ?? null
}

export async function tx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await appPool().connect()
  try {
    await c.query('begin')
    const out = await fn(c)
    await c.query('commit')
    return out
  } catch (e) {
    await c.query('rollback').catch(() => {})
    throw e
  } finally {
    c.release()
  }
}

export async function migrate(): Promise<string[]> {
  const dir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'db', 'app')
  const files = readdirSync(dir)
    .filter((f) => /^\d+_.+\.sql$/.test(f))
    .sort()
  const c = await appPool().connect()
  const applied: string[] = []
  try {
    // khoá tránh 2 container (api + worker) migrate cùng lúc
    await c.query('select pg_advisory_lock(424242)')
    await c.query('create table if not exists app_migrations (name text primary key, applied_at timestamptz not null default now())')
    const done = new Set((await c.query('select name from app_migrations')).rows.map((r) => r.name))
    for (const f of files) {
      if (done.has(f)) continue
      const sql = readFileSync(join(dir, f), 'utf8')
      await c.query('begin')
      try {
        await c.query(sql)
        await c.query('insert into app_migrations(name) values($1)', [f])
        await c.query('commit')
        applied.push(f)
      } catch (e) {
        await c.query('rollback')
        throw new Error(`migration ${f}: ${(e as Error).message}`)
      }
    }
  } finally {
    await c.query('select pg_advisory_unlock(424242)').catch(() => {})
    c.release()
  }
  return applied
}

export async function audit(userId: number | null, action: string, target?: string, detail?: unknown, ip?: string) {
  try {
    await q('insert into app_audit_log(user_id, action, target, detail, ip) values($1,$2,$3,$4,$5)', [
      userId,
      action,
      target ?? null,
      detail === undefined ? null : JSON.stringify(detail),
      ip ?? null,
    ])
  } catch (e) {
    console.error('[audit]', (e as Error).message)
  }
}

// =============================================================
//  Xác thực bằng phiên cookie (httpOnly) + phân quyền theo menu.
//  - Cookie `bh_sid` chứa token ngẫu nhiên; DB lưu sha256 (app_sessions).
//  - req.user = { id, email, fullName, status, isAdmin, permissions[] }
// =============================================================
import type { NextFunction, Request, Response } from 'express'
import { config } from '../config.js'
import { randomToken, sha256 } from './crypto.js'
import { appDbEnabled, q, q1 } from './db.js'
import { ALL_PERMISSIONS } from './permissions.js'

export const COOKIE = 'bh_sid'

export interface AuthUser {
  id: number
  email: string
  fullName: string
  status: 'pending' | 'active' | 'disabled'
  isAdmin: boolean
  permissions: string[]
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser
      sessionHash?: string
    }
  }
}

export function clientIp(req: Request): string {
  return (req.ip ?? req.socket.remoteAddress ?? '').replace('::ffff:', '')
}

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=')
    if (i < 0) continue
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim())
  }
  return out
}

function setCookie(res: Response, value: string, maxAgeSec: number) {
  const attrs = [`${COOKIE}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSec}`]
  if (config.cookieSecure) attrs.push('Secure')
  res.append('Set-Cookie', attrs.join('; '))
}

export async function createSession(req: Request, res: Response, userId: number) {
  const token = randomToken()
  const days = Math.max(1, config.sessionDays)
  await q(
    `insert into app_sessions(id_hash, user_id, expires_at, ip, user_agent)
     values($1,$2, now() + ($3 || ' days')::interval, $4, $5)`,
    [sha256(token), userId, String(days), clientIp(req), String(req.headers['user-agent'] ?? '').slice(0, 300)],
  )
  await q('update app_users set last_login_at = now() where id = $1', [userId])
  setCookie(res, token, days * 86400)
}

export async function destroySession(req: Request, res: Response) {
  if (req.sessionHash) await q('delete from app_sessions where id_hash = $1', [req.sessionHash])
  setCookie(res, '', 0)
}

export async function loadUserById(id: number): Promise<AuthUser | null> {
  const u = await q1<any>('select id, email, full_name, status, is_admin from app_users where id = $1', [id])
  if (!u) return null
  const perms = u.is_admin
    ? ALL_PERMISSIONS
    : (await q<{ permission: string }>('select permission from app_user_permissions where user_id = $1', [id])).map(
        (r) => r.permission,
      )
  return {
    id: Number(u.id),
    email: u.email,
    fullName: u.full_name,
    status: u.status,
    isAdmin: u.is_admin,
    permissions: u.status === 'active' ? perms.filter((p) => ALL_PERMISSIONS.includes(p)) : [],
  }
}

// Gắn req.user nếu cookie hợp lệ (không chặn). Gia hạn phiên trượt mỗi ngày.
export async function loadUser(req: Request, _res: Response, next: NextFunction) {
  if (!appDbEnabled) return next()
  const token = parseCookies(req.headers.cookie)[COOKIE]
  if (!token) return next()
  try {
    const h = sha256(token)
    const s = await q1<any>('select user_id, last_seen_at from app_sessions where id_hash = $1 and expires_at > now()', [h])
    if (s) {
      const user = await loadUserById(Number(s.user_id))
      if (user && user.status !== 'disabled') {
        req.user = user
        req.sessionHash = h
        if (Date.now() - new Date(s.last_seen_at).getTime() > 3600_000)
          q(
            `update app_sessions set last_seen_at = now(), expires_at = now() + ($2 || ' days')::interval where id_hash = $1`,
            [h, String(Math.max(1, config.sessionDays))],
          ).catch(() => {})
      }
    }
  } catch (e) {
    console.error('[auth] loadUser:', (e as Error).message)
  }
  next()
}

export function requireLogin(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: 'unauthorized', message: 'Vui lòng đăng nhập' })
  if (req.user.status !== 'active')
    return res.status(403).json({ error: 'pending_approval', message: 'Tài khoản đang chờ quản trị duyệt' })
  next()
}

export const hasPerm = (u: AuthUser | undefined, ...perms: string[]) =>
  !!u && u.status === 'active' && (u.isAdmin || perms.some((p) => u.permissions.includes(p)))

// Cho qua nếu có ÍT NHẤT MỘT quyền trong danh sách.
export function requirePerm(...perms: string[]) {
  return (req: Request, res: Response, next: NextFunction) =>
    requireLogin(req, res, () => {
      if (!hasPerm(req.user, ...perms)) return res.status(403).json({ error: 'forbidden', message: 'Bạn không có quyền truy cập mục này', need: perms })
      next()
    })
}

// ---------- Giới hạn số lần thử (đăng nhập/đăng ký) theo IP + khoá ----------
const hits = new Map<string, { n: number; reset: number }>()
export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now()
  const h = hits.get(key)
  if (!h || h.reset < now) {
    hits.set(key, { n: 1, reset: now + windowMs })
    return true
  }
  h.n++
  return h.n <= max
}
setInterval(() => {
  const now = Date.now()
  for (const [k, v] of hits) if (v.reset < now) hits.delete(k)
}, 60_000).unref()

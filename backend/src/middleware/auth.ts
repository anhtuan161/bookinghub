// =============================================================
//  Middleware xác thực — verify JWT do Supabase Auth cấp.
//  Bật bằng AUTH_REQUIRED=true + SUPABASE_JWT_SECRET (Settings → API → JWT Secret).
//  Khi tắt (mặc định): API mở — tiện cho demo/dev.
// =============================================================
import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { config } from '../config.js'

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!config.authRequired) return next() // chưa bật auth → cho qua

  const header = req.headers.authorization ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token) return res.status(401).json({ error: 'unauthorized' })

  if (!config.supabaseJwtSecret) {
    console.error('[auth] AUTH_REQUIRED=true nhưng thiếu SUPABASE_JWT_SECRET')
    return res.status(500).json({ error: 'auth_misconfigured' })
  }

  try {
    const payload = jwt.verify(token, config.supabaseJwtSecret) as any
    ;(req as any).user = { id: payload.sub, email: payload.email, role: payload.role }
    next()
  } catch {
    return res.status(401).json({ error: 'invalid_token' })
  }
}

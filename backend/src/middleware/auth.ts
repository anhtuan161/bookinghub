// =============================================================
//  Middleware xác thực — verify JWT do Supabase Auth cấp.
//  Bật bằng AUTH_REQUIRED=true.
//  Hỗ trợ 2 kiểu khoá ký của Supabase:
//   - ES256/RS256 (JWT Signing Keys mới): verify qua JWKS công khai của project.
//   - HS256 (legacy shared secret): verify bằng SUPABASE_JWT_SECRET.
//  Khi tắt (mặc định): API mở — tiện cho demo/dev.
// =============================================================
import crypto from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { config } from '../config.js'

type Jwk = { kid?: string; [k: string]: unknown }

// Cache JWKS trong bộ nhớ để khỏi gọi mạng mỗi request.
let jwksCache: { url: string; keys: Jwk[]; at: number } | null = null
const JWKS_TTL_MS = 10 * 60 * 1000

async function getJwks(url: string): Promise<Jwk[]> {
  const now = Date.now()
  if (jwksCache && jwksCache.url === url && now - jwksCache.at < JWKS_TTL_MS) return jwksCache.keys
  const res = await fetch(url)
  if (!res.ok) throw new Error(`JWKS fetch ${res.status}`)
  const data = (await res.json()) as { keys?: Jwk[] }
  jwksCache = { url, keys: data.keys ?? [], at: now }
  return jwksCache.keys
}

function decodeSegment(seg: string): any {
  return JSON.parse(Buffer.from(seg, 'base64url').toString('utf8'))
}

// Verify token ký bất đối xứng (ES256/RS256) bằng khoá công khai từ JWKS.
async function verifyAsymmetric(token: string): Promise<any> {
  if (!config.supabaseUrl) throw new Error('thiếu SUPABASE_URL/DATABASE_URL để xác định project')
  const [h, p, s] = token.split('.')
  if (!h || !p || !s) throw new Error('token malformed')
  const header = decodeSegment(h)
  const payload = decodeSegment(p)

  // Pin issuer đúng project (chống token từ project Supabase khác).
  const expectedIss = `${config.supabaseUrl}/auth/v1`
  if (payload.iss !== expectedIss) throw new Error('iss mismatch')

  // Luôn lấy khoá từ URL TIN CẬY (config), không tin iss trong token.
  const keys = await getJwks(`${config.supabaseUrl}/auth/v1/.well-known/jwks.json`)
  const jwk = keys.find((k) => k.kid === header.kid)
  if (!jwk) throw new Error('kid không có trong JWKS')

  const pubKey = crypto.createPublicKey({ key: jwk as any, format: 'jwk' })
  const signingInput = Buffer.from(`${h}.${p}`)
  const sig = Buffer.from(s, 'base64url')

  let ok = false
  if (header.alg === 'ES256') {
    ok = crypto.verify('sha256', signingInput, { key: pubKey, dsaEncoding: 'ieee-p1363' }, sig)
  } else if (header.alg === 'RS256') {
    ok = crypto.verify('RSA-SHA256', signingInput, pubKey, sig)
  } else {
    throw new Error(`alg không hỗ trợ: ${header.alg}`)
  }
  if (!ok) throw new Error('sai chữ ký')

  if (payload.exp && Date.now() / 1000 > payload.exp) throw new Error('token hết hạn')
  return payload
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!config.authRequired) return next() // chưa bật auth → cho qua

  const header = req.headers.authorization ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token) return res.status(401).json({ error: 'unauthorized' })

  const accept = (payload: any) => {
    ;(req as any).user = { id: payload.sub, email: payload.email, role: payload.role }
    next()
  }

  // Xem header để chọn cách verify.
  let alg = ''
  try {
    alg = decodeSegment(token.split('.')[0]).alg
  } catch {
    return res.status(401).json({ error: 'invalid_token' })
  }

  if (alg === 'HS256') {
    if (!config.supabaseJwtSecret) {
      console.error('[auth] token HS256 nhưng thiếu SUPABASE_JWT_SECRET')
      return res.status(500).json({ error: 'auth_misconfigured' })
    }
    try {
      return accept(jwt.verify(token, config.supabaseJwtSecret))
    } catch {
      return res.status(401).json({ error: 'invalid_token' })
    }
  }

  // ES256/RS256 → verify qua JWKS (bất đồng bộ).
  verifyAsymmetric(token)
    .then(accept)
    .catch((e) => {
      console.error('[auth] verify lỗi:', e?.message ?? e)
      res.status(401).json({ error: 'invalid_token' })
    })
}

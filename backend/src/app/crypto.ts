// Mã hoá/giải mã secret lưu trong DB (AES-256-GCM) + băm mật khẩu (scrypt) + token ngẫu nhiên.
import crypto from 'node:crypto'
import { config } from '../config.js'

function key(): Buffer {
  if (!config.appSecretKey) throw new Error('APP_SECRET_KEY chưa cấu hình')
  return crypto.createHash('sha256').update(config.appSecretKey).digest() // 32 byte
}

export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12)
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv)
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()])
  return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), enc.toString('base64url')].join('.')
}

export function decrypt(blob: string): string {
  const [v, iv, tag, enc] = blob.split('.')
  if (v !== 'v1') throw new Error('secret format')
  const d = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'))
  d.setAuthTag(Buffer.from(tag, 'base64url'))
  return Buffer.concat([d.update(Buffer.from(enc, 'base64url')), d.final()]).toString('utf8')
}

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 }

export function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16)
  return new Promise((res, rej) =>
    crypto.scrypt(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p }, (err, dk) =>
      err ? rej(err) : res(`scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64url')}$${dk.toString('base64url')}`),
    ),
  )
}

export function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, N, r, p, salt, hash] = stored.split('$')
  if (alg !== 'scrypt') return Promise.resolve(false)
  const expected = Buffer.from(hash, 'base64url')
  return new Promise((res) =>
    crypto.scrypt(password, Buffer.from(salt, 'base64url'), expected.length, { N: +N, r: +r, p: +p }, (err, dk) =>
      res(!err && dk.length === expected.length && crypto.timingSafeEqual(dk, expected)),
    ),
  )
}

export const randomToken = () => crypto.randomBytes(32).toString('base64url')
export const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex')

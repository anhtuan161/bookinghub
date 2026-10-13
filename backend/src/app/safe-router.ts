// Express 4 không bắt lỗi của handler async → bọc mọi handler để lỗi đi vào error middleware (không sập process).
import { Router, type NextFunction, type Request, type Response } from 'express'

type H = (req: Request, res: Response, next: NextFunction) => unknown

const wrap = (h: unknown) =>
  typeof h === 'function' && (h as H).length < 4
    ? (req: Request, res: Response, next: NextFunction) => {
        try {
          const p = (h as H)(req, res, next) as any
          if (p && typeof p.catch === 'function') p.catch(next)
        } catch (e) {
          next(e)
        }
      }
    : h

export function safeRouter() {
  const r = Router()
  for (const m of ['get', 'post', 'put', 'patch', 'delete', 'use'] as const) {
    const orig = (r as any)[m].bind(r)
    ;(r as any)[m] = (...args: unknown[]) => orig(...args.map((a) => (Array.isArray(a) ? a.map(wrap) : wrap(a))))
  }
  return r
}

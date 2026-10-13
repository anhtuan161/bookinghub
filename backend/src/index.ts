import cors from 'cors'
import express, { type NextFunction, type Request, type Response } from 'express'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import cron from 'node-cron'
import { config } from './config.js'
import * as db from './db.js'
import { hasPerm, loadUser, requireLogin } from './app/auth.js'
import { appDbEnabled, migrate } from './app/db.js'
import { adminRouter, authRouter } from './app/routes.js'
import { colivingRouter } from './coliving/routes.js'
import { requireAuth as requireSupabaseAuth } from './middleware/auth.js'
import { router } from './routes.js'
import { syncTick } from './services/sync.js'

const app = express()
app.disable('x-powered-by')
if (config.trustProxy === 'true') app.set('trust proxy', true)
else if (config.trustProxy && config.trustProxy !== 'false') app.set('trust proxy', config.trustProxy)

// Tên miền public (PUBLIC_URL https) mà đến bằng HTTP → chuyển sang HTTPS. Truy cập nội bộ bằng IP không bị ảnh hưởng.
const publicHost = (() => {
  try {
    return config.publicUrl.startsWith('https://') ? new URL(config.publicUrl).hostname : ''
  } catch {
    return ''
  }
})()
app.use((req, res, next) => {
  if (publicHost && req.hostname === publicHost && !req.secure) return res.redirect(301, `https://${publicHost}${req.originalUrl}`)
  next()
})

// Header bảo mật (web public qua Cloudflare). CSP cho phép Google Fonts (index.html).
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff')
  res.set('X-Frame-Options', 'DENY')
  res.set('Referrer-Policy', 'same-origin')
  res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  res.set(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
      "font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https://cloudflareinsights.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  )
  if (req.secure) res.set('Strict-Transport-Security', 'max-age=15552000')
  next()
})

// Cùng origin (backend phục vụ luôn web) → không cần CORS. Chỉ mở cho origin dev khai báo.
if (config.corsOrigins.length) app.use(cors({ origin: config.corsOrigins, credentials: true }))
else if (!appDbEnabled) app.use(cors()) // chế độ cũ (Vercel + Render, chưa có App DB)

app.use(express.json({ limit: '2mb' }))
app.use('/api', (_req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  res.set('Pragma', 'no-cache')
  res.set('Expires', '0')
  next()
})

app.get('/api/health', (_req, res) =>
  res.json({
    ok: true,
    mode: config.demoMode ? 'demo' : 'live',
    storage: config.usePg ? 'postgres' : 'memory',
    auth: appDbEnabled ? 'app' : config.authRequired ? 'supabase' : 'open',
    provider: config.llmProvider,
    // model thật đang dùng theo provider (gemini | anthropic | openrouter) — để soi cấu hình live
    model:
      config.llmProvider === 'anthropic'
        ? config.llmModel
        : config.llmProvider === 'openrouter'
          ? config.openrouterModel
          : config.geminiModel,
  }),
)

// ---------- Quyền theo menu cho các API Booking Hub (villa) cũ ----------
// Mỗi nhóm route cũ ↔ quyền menu tương ứng (xem src/app/permissions.ts).
const VILLA_READ = ['bookinghub.search', 'bookinghub.villas', 'bookinghub.dashboard', 'bookinghub.requests', 'bookinghub.review', 'bookinghub.sources']
function villaPerms(req: Request): string[] {
  const p = req.path
  if (p.startsWith('/review')) return ['bookinghub.review']
  if (p.startsWith('/bookings')) return ['bookinghub.requests']
  if (p.startsWith('/sheets') || p.startsWith('/sync')) return ['bookinghub.sources']
  if (p.startsWith('/dashboard')) return ['bookinghub.dashboard']
  if (p.startsWith('/data/reload')) return VILLA_READ
  return VILLA_READ // properties, areas, availability, search
}
function villaGuard(req: Request, res: Response, next: NextFunction) {
  requireLogin(req, res, () => {
    const need = villaPerms(req)
    if (!hasPerm(req.user, ...need)) return res.status(403).json({ error: 'forbidden', message: 'Bạn không có quyền truy cập mục này', need })
    next()
  })
}

if (appDbEnabled) {
  app.use('/api', loadUser)
  app.use('/api/auth', authRouter)
  app.use('/api/admin', adminRouter)
  app.use('/api/coliving', colivingRouter)
  app.use('/api', villaGuard, router)
} else {
  // Chế độ cũ: không có App DB → JWT Supabase (AUTH_REQUIRED) hoặc mở.
  app.use('/api', requireSupabaseAuth, router)
}
app.use('/api', (_req, res) => res.status(404).json({ error: 'not_found' }))

// ---------- Web (frontend đã build) ----------
if (config.staticDir && existsSync(join(config.staticDir, 'index.html'))) {
  app.use('/assets', express.static(join(config.staticDir, 'assets'), { maxAge: '365d', immutable: true }))
  app.use(express.static(config.staticDir, { index: false, maxAge: '1h' }))
  app.get('*', (_req, res) => {
    res.set('Cache-Control', 'no-cache')
    res.sendFile(join(config.staticDir, 'index.html'))
  })
}

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[api] lỗi:', err?.message ?? err)
  res.status(500).json({ error: 'server_error', message: err?.message ?? 'Lỗi máy chủ' })
})

async function start() {
  if (appDbEnabled) {
    const applied = await migrate()
    if (applied.length) console.log('[app-db] migration:', applied.join(', '))
  }
  try {
    await db.init() // kết nối Supabase + nạp dữ liệu (nếu có DATABASE_URL)
  } catch (e: any) {
    console.error('[db] Không kết nối được DB:', e?.message ?? e)
    console.error('    → Backend vẫn chạy bằng dữ liệu trong bộ nhớ. Kiểm tra DATABASE_URL / dùng chuỗi pooler nếu cần.')
  }

  app.listen(config.port, () => {
    console.log(`\n  Villa Booking Hub — Backend`)
    console.log(`  ▸ http://localhost:${config.port}/api/health`)
    console.log(`  ▸ Chế độ: ${config.demoMode ? 'DEMO (dữ liệu mẫu)' : 'LIVE (Google Sheet + Claude)'}`)
    console.log(`  ▸ Lưu trữ: ${config.usePg ? 'PostgreSQL (Supabase)' : 'bộ nhớ (in-memory)'}`)
    console.log(`  ▸ Đăng nhập/phân quyền: ${appDbEnabled ? 'App DB (email + duyệt)' : 'tắt (chế độ cũ)'}`)
    if (config.staticDir) console.log(`  ▸ Web: ${config.staticDir}`)
    if (!config.demoMode) {
      const model =
        config.llmProvider === 'anthropic'
          ? config.llmModel
          : config.llmProvider === 'openrouter'
            ? config.openrouterModel
            : config.geminiModel
      console.log(`  ▸ AI bóc tách: ${model} (${config.llmProvider})`)
    }
    console.log('')
  })
}
start().catch((e) => {
  console.error('[start] lỗi khởi động:', e?.message ?? e)
  process.exit(1)
})

if (config.backendSyncEnabled) {
  const everyN = Math.max(1, config.syncIntervalMinutes)
  cron.schedule(`*/${everyN} * * * *`, () => {
    syncTick()
      .then((r) => r.processed > 0 && console.log(`[cron] backend synced ${r.processed} sheet(s)`))
      .catch((e) => console.error('[cron] error:', e))
  })
} else {
  console.log('[cron] Backend Google Sheet sync disabled; use n8n manual/schedule sync.')
}

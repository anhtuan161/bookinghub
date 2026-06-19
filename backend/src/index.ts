import cors from 'cors'
import express from 'express'
import cron from 'node-cron'
import { config } from './config.js'
import * as db from './db.js'
import { requireAuth } from './middleware/auth.js'
import { router } from './routes.js'
import { syncTick } from './services/sync.js'

const app = express()
app.use(cors())
app.use(express.json({ limit: '2mb' }))

app.get('/api/health', (_req, res) =>
  res.json({
    ok: true,
    mode: config.demoMode ? 'demo' : 'live',
    storage: config.usePg ? 'postgres' : 'memory',
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
app.use('/api', requireAuth, router) // /api/health ở trên đã khai báo trước → vẫn công khai

async function start() {
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
start()

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

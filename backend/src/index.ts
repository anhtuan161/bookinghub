import cors from 'cors'
import express from 'express'
import cron from 'node-cron'
import { config } from './config.js'
import { router } from './routes.js'
import { syncTick } from './services/sync.js'

const app = express()
app.use(cors())
app.use(express.json({ limit: '2mb' }))

app.get('/api/health', (_req, res) =>
  res.json({ ok: true, mode: config.demoMode ? 'demo' : 'live', model: config.llmModel }),
)
app.use('/api', router)

app.listen(config.port, () => {
  console.log(`\n  Villa Booking Hub — Backend`)
  console.log(`  ▸ http://localhost:${config.port}/api/health`)
  console.log(`  ▸ Chế độ: ${config.demoMode ? 'DEMO (dữ liệu mẫu)' : 'LIVE (Google Sheet + Claude)'}`)
  if (!config.demoMode) console.log(`  ▸ Model bóc tách: ${config.llmModel}`)
  console.log('')
})

// Cron đồng bộ theo lô (queue-drain). Mỗi N phút xử lý vài sheet cũ nhất.
const everyN = Math.max(1, config.syncIntervalMinutes)
cron.schedule(`*/${everyN} * * * *`, () => {
  syncTick()
    .then((r) => r.processed > 0 && console.log(`[cron] đã đồng bộ ${r.processed} sheet`))
    .catch((e) => console.error('[cron] lỗi:', e))
})

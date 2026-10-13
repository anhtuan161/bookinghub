// =============================================================
//  Worker Thomstay Coliving: đồng bộ ezCloud định kỳ + "Đồng bộ ngay" + Telegram.
//  Chạy: node dist/worker.js (container bookinghub-worker). Heartbeat: /tmp/worker-heartbeat.
// =============================================================
import { writeFileSync } from 'node:fs'
import { config } from './config.js'
import { appDbEnabled, migrate, q, q1 } from './app/db.js'
import { loadSession } from './coliving/ezcloud.js'
import { maybeDailySummary, notifyEvents, sendTelegram, telegramEnabled } from './coliving/notify.js'
import { runSync } from './coliving/sync.js'

const TICK_MS = 20_000
let lastRunAt = 0
let lastAuthAlert = ''

function beat() {
  try {
    writeFileSync('/tmp/worker-heartbeat', String(Date.now()))
  } catch {}
}

async function tick() {
  beat()
  const pending = await q<any>('select id from cl_sync_requests where done_at is null order by id')
  const due = Date.now() - lastRunAt >= config.ezcloudSyncMinutes * 60_000
  if (pending.length || due) {
    const { session } = await loadSession()
    if (!session) {
      if (pending.length) await q('update cl_sync_requests set done_at = now() where id = any($1)', [pending.map((p) => p.id)])
      lastRunAt = Date.now()
    } else {
      if (pending.length) await q('update cl_sync_requests set picked_at = now() where id = any($1)', [pending.map((p) => p.id)])
      lastRunAt = Date.now()
      try {
        const s = await runSync(pending.length ? 'manual' : 'schedule')
        console.log(`[worker] sync ok: ${s.fetched} booking, +${s.inserted} ~${s.updated} -${s.removed}, ${s.events} sự kiện, ${s.chargesFetched} tiền phòng, ${s.apiCalls} call, ${s.ms}ms`)
      } catch (e) {
        const msg = (e as Error).message
        console.error('[worker] sync lỗi:', msg)
        // Báo Telegram 1 lần cho mỗi loại lỗi phiên
        if (/401|phiên|Refresh|kết nối/i.test(msg) && lastAuthAlert !== msg && telegramEnabled()) {
          lastAuthAlert = msg
          await sendTelegram(`⚠️ Thomstay Coliving: đồng bộ ezCloud lỗi — ${msg}. Vào web → Coliving → Kết nối & đồng bộ để dán lại phiên.`).catch(() => {})
        }
      } finally {
        if (pending.length) await q('update cl_sync_requests set done_at = now() where id = any($1)', [pending.map((p) => p.id)])
      }
    }
  }
  try {
    await notifyEvents()
    await maybeDailySummary()
  } catch (e) {
    console.error('[worker] telegram:', (e as Error).message)
  }
  beat()
}

async function main() {
  if (!appDbEnabled) {
    console.error('[worker] APP_DATABASE_URL chưa cấu hình — dừng')
    process.exit(1)
  }
  await migrate()
  // tiếp tục nhịp theo lần chạy gần nhất (khởi động lại không chạy dồn)
  const last = await q1<any>('select started_at from cl_sync_runs order by started_at desc limit 1')
  lastRunAt = last ? Math.min(Date.now(), new Date(last.started_at).getTime()) : 0
  console.log(`[worker] bắt đầu: mỗi ${config.ezcloudSyncMinutes} phút, Telegram ${telegramEnabled() ? 'BẬT' : 'tắt'}`)
  beat()
  for (;;) {
    try {
      await tick()
    } catch (e) {
      console.error('[worker] tick lỗi:', (e as Error).message)
    }
    await new Promise((r) => setTimeout(r, TICK_MS))
  }
}

process.on('SIGTERM', () => process.exit(0))
main()

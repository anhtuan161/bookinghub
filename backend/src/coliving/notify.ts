// Thông báo Telegram (tuỳ chọn): booking mới/huỷ/đổi + tóm tắt buổi sáng.
// Bật bằng TELEGRAM_BOT_TOKEN(_FILE) + TELEGRAM_CHAT_ID(_FILE). Không cấu hình → bỏ qua, không lỗi.
import { config } from '../config.js'
import { q, q1 } from '../app/db.js'
import { overview } from './queries.js'
import { todayLocal } from './sync.js'

export const telegramEnabled = () => !!(config.telegramBotToken && config.telegramChatId)

export async function sendTelegram(text: string) {
  if (!telegramEnabled()) return false
  const res = await fetch(`https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: config.telegramChatId, text: text.slice(0, 4000), disable_web_page_preview: true }),
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) throw new Error(`Telegram HTTP ${res.status}`)
  return true
}

const ICON: Record<string, string> = { new: '🆕', cancelled: '❌', changed: '✏️', removed: '🗑️', restored: '♻️' }

// Gửi các sự kiện chưa báo (chỉ trong 24h gần nhất, tránh dồn tin cũ khi mới bật Telegram).
export async function notifyEvents() {
  if (!telegramEnabled()) return 0
  const rows = await q<any>(
    `select id, kind, summary from cl_booking_events
      where notified_at is null and kind in ('new','cancelled','changed','removed','restored') and at > now() - interval '1 day'
      order by at limit 30`,
  )
  if (!rows.length) return 0
  const text = ['Thomstay Coliving — thay đổi booking (ezCloud)', ...rows.map((r) => `${ICON[r.kind] ?? '•'} ${r.summary}`)].join('\n')
  await sendTelegram(text)
  await q('update cl_booking_events set notified_at = now() where id = any($1)', [rows.map((r) => r.id)])
  return rows.length
}

const fmtMoney = (n: number) => Math.round(n).toLocaleString('vi-VN') + 'đ'

export async function maybeDailySummary() {
  if (!telegramEnabled()) return false
  const today = todayLocal()
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: config.timezone, hour: '2-digit', hour12: false }).format(new Date()))
  if (hour < config.dailySummaryHour) return false
  const sent = await q1<any>("select value from app_settings where key = 'coliving.daily_summary'")
  if (sent?.value?.day === today) return false

  const o = await overview(today)
  const line = (b: any) => `  • ${b.room ?? 'chưa gán'} — ${b.guest ?? ''} (${b.source ?? 'trực tiếp'}) ${b.arrival_date}→${b.departure_date}`
  const parts = [
    `Thomstay Coliving — ${today}`,
    `Công suất đêm nay: ${o.occupiedRooms}/${o.rooms} phòng (${Math.round(o.occupancy * 100)}%)`,
    `Tháng này: ${o.mtd.soldNights} đêm, doanh thu ${fmtMoney(o.mtd.revenue)}, công suất ${Math.round(o.mtd.occupancy * 100)}%`,
    `Khách đến hôm nay (${o.arrivals.length}):`,
    ...o.arrivals.map(line),
    `Khách đi hôm nay (${o.departures.length}):`,
    ...o.departures.map(line),
  ]
  if (o.alerts.length) parts.push('Cảnh báo:', ...o.alerts.map((a) => `  ⚠️ ${a.title}: ${a.items.length}`))
  if (o.sync.stale) parts.push('⚠️ Đồng bộ ezCloud đang trễ — kiểm tra mục Kết nối & đồng bộ')
  await sendTelegram(parts.join('\n'))
  await q(
    `insert into app_settings(key, value) values('coliving.daily_summary', $1)
     on conflict(key) do update set value = excluded.value, updated_at = now()`,
    [JSON.stringify({ day: today, at: new Date().toISOString() })],
  )
  return true
}

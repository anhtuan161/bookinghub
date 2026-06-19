import { Router } from 'express'
import { config } from './config.js'
import * as db from './db.js'
import {
  addBooking,
  addSheet,
  bookings,
  eachDay,
  getDay,
  getMonth,
  parseISO,
  properties,
  reviewQueue,
  setDay,
  sheets,
  startOfToday,
} from './store.js'
import { syncAll, syncOneSheet } from './services/sync.js'

export const router = Router()

const areas = () => Array.from(new Set(properties.map((p) => p.area))).sort()

// ---------- Villa & khu vực ----------
router.get('/properties', (_req, res) => res.json(properties))
router.get('/areas', (_req, res) => res.json(areas()))
router.get('/properties/:id', (req, res) => {
  const p = properties.find((x) => x.id === req.params.id)
  if (!p) return res.status(404).json({ error: 'not_found' })
  res.json(p)
})
router.get('/properties/:id/availability', (req, res) => {
  const year = Number(req.query.year)
  const month = Number(req.query.month) // 0-11
  if (Number.isNaN(year) || Number.isNaN(month)) return res.status(400).json({ error: 'year/month required' })
  res.json(getMonth(req.params.id, year, month))
})

// ---------- Tìm phòng ----------
router.post('/search/availability', (req, res) => {
  const { checkin, checkout, guests = 1, area, maxPrice } = req.body ?? {}
  if (!checkin || !checkout) return res.status(400).json({ error: 'checkin/checkout required' })
  const range = eachDay(checkin, checkout)
  const nights = range.length
  const results: any[] = []
  for (const p of properties) {
    if (guests > p.capacityMax) continue
    if (area && p.area !== area) continue
    let allFree = true
    let hasReview = false
    let total = 0
    for (const iso of range) {
      const day = getDay(p.id, parseISO(iso))
      if (day.status === 'booked' || day.status === 'blocked') allFree = false
      if (day.status === 'unknown') hasReview = true
      total += day.price ?? 0
    }
    if (!allFree) continue
    const avgPrice = nights > 0 ? Math.round(total / nights) : p.basePrice
    if (maxPrice && avgPrice > maxPrice) continue
    results.push({ property: p, avgPrice, nights, hasReview })
  }
  results.sort((a, b) => a.avgPrice - b.avgPrice)
  res.json(results)
})

// ---------- Cần kiểm tra ----------
router.get('/review', (_req, res) => res.json(reviewQueue))
router.post('/review/:id/resolve', (req, res) => {
  const idx = reviewQueue.findIndex((r) => r.id === req.params.id)
  if (idx === -1) return res.status(404).json({ error: 'not_found' })
  const item = reviewQueue[idx]
  const { status, price } = req.body ?? {}
  // ghi vào lịch chính theo quyết định của nhân viên (hoặc theo gợi ý hệ thống)
  setDay(item.propertyId, {
    date: item.date,
    status: status ?? item.suggestedStatus,
    price: price ?? item.suggestedPrice ?? null,
    minNights: 1,
    note: 'Đã duyệt thủ công',
    confidence: 1,
    sourceUpdatedAt: new Date().toISOString(),
  })
  db.resolveReviewRow(item.id)
  reviewQueue.splice(idx, 1)
  res.json({ ok: true })
})

// ---------- Yêu cầu giữ phòng ----------
router.get('/bookings', (req, res) => {
  let list = bookings
  if (req.query.status) list = list.filter((b) => b.status === req.query.status)
  if (req.query.assignee) list = list.filter((b) => b.assignee === req.query.assignee)
  res.json(list)
})
router.post('/bookings', (req, res) => {
  const b = req.body ?? {}
  if (!b.propertyId || !b.customerName || !b.checkin || !b.checkout)
    return res.status(400).json({ error: 'missing fields' })
  const prop = properties.find((p) => p.id === b.propertyId)
  res.json(
    addBooking({
      propertyId: b.propertyId,
      propertyName: prop?.name ?? b.propertyName ?? '',
      customerName: b.customerName,
      customerContact: b.customerContact ?? '',
      channel: b.channel ?? 'other',
      checkin: b.checkin,
      checkout: b.checkout,
      guests: Number(b.guests ?? 1),
      quotedPrice: Number(b.quotedPrice ?? prop?.basePrice ?? 0),
      assignee: b.assignee ?? 'Nhân viên',
      note: b.note ?? '',
    }),
  )
})
router.patch('/bookings/:id', (req, res) => {
  const b = bookings.find((x) => x.id === req.params.id)
  if (!b) return res.status(404).json({ error: 'not_found' })
  if (req.body?.status) {
    b.status = req.body.status
    db.updateBookingStatus(b.id, b.status)
  }
  res.json(b)
})

// ---------- Nguồn dữ liệu (sheets) ----------
router.get('/sheets', (_req, res) => res.json(sheets))
router.post('/sheets', (req, res) => {
  const b = req.body ?? {}
  if (!b.ownerName || !b.url) return res.status(400).json({ error: 'ownerName/url required' })
  res.json(addSheet({ ownerName: b.ownerName, ownerPhone: b.ownerPhone ?? '', url: b.url, commissionRate: Number(b.commissionRate ?? 10), parserType: b.parserType }))
})
router.patch('/sheets/:id', (req, res) => {
  const s = sheets.find((x) => x.id === req.params.id)
  if (!s) return res.status(404).json({ error: 'not_found' })
  if (req.body?.colorMapping) s.colorMapping = req.body.colorMapping
  if (req.body?.parserType) s.parserType = req.body.parserType
  if (req.body?.parserConfig) s.parserConfig = req.body.parserConfig
  if (req.body?.assignee) s.assignee = req.body.assignee
  if (typeof req.body?.active === 'boolean') s.active = req.body.active
  if (req.body?.city) s.city = req.body.city
  db.updateSheetSettings(s)
  res.json(s)
})

// ---------- Đồng bộ ----------
// ---------- Refresh DB cache ----------
router.post('/data/reload', async (_req, res) => {
  try {
    const result = await db.refreshFromDatabase()
    res.json(result)
  } catch (e: any) {
    res.status(500).json({ error: 'db_reload_failed', message: e?.message ?? String(e) })
  }
})

router.post('/sync/now', async (req, res) => {
  if (!config.backendSyncEnabled) {
    return res.status(410).json({
      error: 'backend_sync_disabled',
      message: 'Backend Google Sheet sync is disabled. Use n8n manual sync instead.',
    })
  }
  const sheetId = req.body?.sheetId
  if (sheetId) {
    const s = sheets.find((x) => x.id === sheetId)
    if (!s) return res.status(404).json({ error: 'not_found' })
    await syncOneSheet(s)
    return res.json({ started: true, mode: config.demoMode ? 'demo' : 'live' })
  }
  await syncAll()
  res.json({ started: true, mode: config.demoMode ? 'demo' : 'live' })
})

router.post('/sync/n8n/manual', async (_req, res) => {
  if (!config.n8nManualSyncWebhookUrl) {
    return res.status(400).json({
      error: 'missing_n8n_webhook',
      message: 'Set N8N_MANUAL_SYNC_WEBHOOK_URL on the backend service.',
    })
  }
  try {
    const response = await fetch(config.n8nManualSyncWebhookUrl, { method: 'POST' })
    const text = await response.text()
    if (!response.ok) {
      return res.status(502).json({
        error: 'n8n_webhook_failed',
        status: response.status,
        body: text.slice(0, 1000),
      })
    }
    res.json({ started: true, status: response.status, body: text.slice(0, 1000) })
  } catch (e: any) {
    res.status(502).json({ error: 'n8n_webhook_error', message: e?.message ?? String(e) })
  }
})

// ---------- Tổng quan ----------
router.get('/dashboard/stats', (_req, res) => {
  const today = startOfToday()
  const availableToday = properties.filter((p) => getDay(p.id, today).status === 'available').length
  const pendingBookings = bookings.filter((b) => !['confirmed', 'cancelled', 'lost'].includes(b.status)).length
  const errorSheets = sheets.filter((s) => s.syncStatus !== 'ok').length
  res.json({
    totalProperties: properties.length,
    availableToday,
    pendingBookings,
    reviewCount: reviewQueue.length,
    errorSheets,
  })
})

// Xu hướng nhu cầu theo tháng (số ngày đã đặt / tổng ngày đã sync) — vẽ chart.
router.get('/dashboard/trend', async (_req, res) => {
  try {
    const rows = await db.availabilityTrend()
    res.json(rows)
  } catch (e: any) {
    res.json([])
  }
})

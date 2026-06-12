// =============================================================
//  Điều phối đồng bộ theo mô hình QUEUE-DRAIN (rút dần).
//  Mỗi nhịp chỉ xử lý vài sheet "cũ nhất" → luôn nằm trong giới hạn thời gian.
//  - DEMO_MODE=true : chỉ cập nhật mốc thời gian (không gọi Google/Claude).
//  - DEMO_MODE=false: đọc sheet (kèm màu) → Claude bóc tách → ghi vào store.
// =============================================================
import { config } from '../config.js'
import * as db from '../db.js'
import { addReview, findOrCreateProperty, setDay, sheets } from '../store.js'
import type { Sheet } from '../types.js'
import { extractTab } from './extract.js'
import { readSpreadsheet } from './sheets.js'

let running = false

/** Sync 1 sheet cụ thể (gọi từ nút "Đồng bộ ngay" hoặc từ cron). */
export async function syncOneSheet(sheet: Sheet): Promise<void> {
  if (config.demoMode) {
    sheet.lastSyncedAt = new Date().toISOString()
    if (sheet.syncStatus !== 'error') sheet.syncStatus = 'ok'
    db.touchSheet(sheet)
    return
  }

  try {
    const tabs = await readSpreadsheet(sheet.spreadsheetId)
    const year = new Date().getFullYear()
    let reviewAdded = 0

    for (const tab of tabs) {
      const rows = await extractTab(tab, sheet.colorMapping, year)
      for (const row of rows) {
        if (!row.property_name || !row.date) continue
        // villa do sheet định nghĩa → tìm hoặc tạo mới (1 sheet = 1 chủ nhà)
        const prop = findOrCreateProperty(sheet.id, sheet.ownerName, row.property_name)
        if (row.confidence < config.reviewConfidence || row.status === 'unknown') {
          addReview({
            id: 'r_' + prop.id + '_' + row.date,
            propertyId: prop.id,
            propertyName: prop.name,
            date: row.date,
            rawValue: row.note || '(không rõ)',
            rawColorHex: '#ffffff',
            suggestedStatus: row.status,
            suggestedPrice: row.price,
            confidence: row.confidence,
          })
          reviewAdded++
        } else {
          setDay(prop.id, {
            date: row.date,
            status: row.status,
            price: row.price,
            minNights: row.min_nights || 1,
            note: row.note || '',
            confidence: row.confidence,
            sourceUpdatedAt: new Date().toISOString(),
          })
        }
      }
    }

    sheet.lastSyncedAt = new Date().toISOString()
    sheet.syncStatus = reviewAdded > 0 ? 'needs_check' : 'ok'
    sheet.lastError = undefined
    db.touchSheet(sheet)
  } catch (e: any) {
    sheet.syncStatus = 'error'
    sheet.lastError = e?.message ?? String(e)
    // Mốc thời gian lỗi = bây giờ → cron đếm cooldown từ đây để thử lại, không khoá vĩnh viễn.
    sheet.lastSyncedAt = new Date().toISOString()
    db.touchSheet(sheet)
    console.error(`[sync] lỗi sheet ${sheet.ownerName}:`, sheet.lastError)
  }
}

/** Một nhịp cron: xử lý N sheet "đến hạn nhất". */
export async function syncTick(): Promise<{ processed: number }> {
  if (running) return { processed: 0 }
  running = true
  try {
    const now = Date.now()
    const cooldownMs = config.errorRetryMinutes * 60_000
    const due = [...sheets]
      // Sheet 'error' chỉ tạm nghỉ trong cooldown rồi lại được thử (không loại vĩnh viễn).
      .filter((s) => s.syncStatus !== 'error' || now - new Date(s.lastSyncedAt).getTime() >= cooldownMs)
      .sort((a, b) => new Date(a.lastSyncedAt).getTime() - new Date(b.lastSyncedAt).getTime())
      .slice(0, config.syncBatchSize)
    for (const s of due) await syncOneSheet(s)
    return { processed: due.length }
  } finally {
    running = false
  }
}

/** Sync tất cả (nút "Đồng bộ ngay" toàn cục). */
export async function syncAll(): Promise<{ processed: number }> {
  let n = 0
  // "Đồng bộ ngay" tổng: chạy mọi sheet, kể cả sheet đang 'error' (để người dùng tự gỡ kẹt).
  for (const s of sheets) {
    await syncOneSheet(s)
    n++
  }
  return { processed: n }
}

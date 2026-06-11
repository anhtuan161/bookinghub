// =============================================================
//  Điều phối đồng bộ theo mô hình QUEUE-DRAIN (rút dần).
//  Mỗi nhịp chỉ xử lý vài sheet "cũ nhất" → luôn nằm trong giới hạn thời gian.
//  - DEMO_MODE=true : chỉ cập nhật mốc thời gian (không gọi Google/Claude).
//  - DEMO_MODE=false: đọc sheet (kèm màu) → Claude bóc tách → ghi vào store.
// =============================================================
import { config } from '../config.js'
import * as db from '../db.js'
import { addReview, properties, setDay, sheets } from '../store.js'
import type { Sheet } from '../types.js'
import { extractTab } from './extractor.js'
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
        const prop = properties.find(
          (p) => p.ownerId && row.property_name && p.name.toLowerCase().includes(row.property_name.toLowerCase().slice(0, 6)),
        )
        if (!prop) continue
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
    db.touchSheet(sheet)
    console.error(`[sync] lỗi sheet ${sheet.ownerName}:`, sheet.lastError)
  }
}

/** Một nhịp cron: xử lý N sheet "đến hạn nhất". */
export async function syncTick(): Promise<{ processed: number }> {
  if (running) return { processed: 0 }
  running = true
  try {
    const due = [...sheets]
      .filter((s) => s.syncStatus !== 'error')
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
  for (const s of sheets) {
    if (s.syncStatus === 'error') continue
    await syncOneSheet(s)
    n++
  }
  return { processed: n }
}

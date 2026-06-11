// =============================================================
//  Đọc Google Sheet KÈM MÀU NỀN (bắt buộc cho bài toán này).
//  Dùng spreadsheets.get?includeGridData=true để lấy backgroundColor.
//  Chỉ kích hoạt khi DEMO_MODE=false.
// =============================================================
import { google } from 'googleapis'
import { config } from '../config.js'
import type { RawTab } from '../types.js'

function loadCredentials(): any {
  if (config.googleServiceAccountJson) return JSON.parse(config.googleServiceAccountJson)
  if (config.googleServiceAccountFile) {
    // đọc đồng bộ để đơn giản
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require('node:fs')
    return JSON.parse(fs.readFileSync(config.googleServiceAccountFile, 'utf8'))
  }
  throw new Error('Thiếu GOOGLE_SERVICE_ACCOUNT_JSON hoặc GOOGLE_SERVICE_ACCOUNT_FILE')
}

function rgbToHex(c?: { red?: number; green?: number; blue?: number }): string | null {
  if (!c) return null
  const r = Math.round((c.red ?? 0) * 255)
  const g = Math.round((c.green ?? 0) * 255)
  const b = Math.round((c.blue ?? 0) * 255)
  // ô trắng mặc định → coi như không có màu
  if (r === 255 && g === 255 && b === 255) return null
  return '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')
}

/** Nhận diện tab có phải tháng hiện tại trở đi không (lọc bỏ tháng quá khứ). */
export function isFutureMonthTab(title: string, today = new Date()): boolean {
  const y = today.getFullYear()
  const m = today.getMonth() + 1
  // bắt các mẫu: "Tháng 6", "06.2026", "T6", "6/2026", "Tháng 6.2026"
  const mm = title.match(/(?:tháng|t)\s*(\d{1,2})/i) || title.match(/\b(\d{1,2})[./](\d{4})\b/)
  if (!mm) return true // không chắc → giữ lại, để AI / người duyệt quyết định
  const month = Number(mm[1])
  const yearMatch = title.match(/(\d{4})/)
  const year = yearMatch ? Number(yearMatch[1]) : y
  if (year > y) return true
  if (year < y) return false
  return month >= m
}

/**
 * Đọc 1 spreadsheet → danh sách tab (chỉ tháng hiện tại trở đi), mỗi tab là
 * lưới ô (giá trị + màu nền hex).
 */
export async function readSpreadsheet(spreadsheetId: string): Promise<RawTab[]> {
  const auth = new google.auth.GoogleAuth({
    credentials: loadCredentials(),
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  })
  const sheets = google.sheets({ version: 'v4', auth })

  const meta = await sheets.spreadsheets.get({ spreadsheetId, includeGridData: false })
  const wantedTitles = (meta.data.sheets ?? [])
    .map((s) => s.properties?.title ?? '')
    .filter((t) => t && isFutureMonthTab(t))

  if (wantedTitles.length === 0) return []

  // Lấy grid data chỉ cho các tab cần (kèm màu nền)
  const res = await sheets.spreadsheets.get({
    spreadsheetId,
    ranges: wantedTitles,
    includeGridData: true,
    fields: 'sheets(properties.title,data.rowData.values(formattedValue,effectiveFormat.backgroundColor))',
  })

  const out: RawTab[] = []
  for (const sh of res.data.sheets ?? []) {
    const title = sh.properties?.title ?? ''
    const cells: RawTab['cells'] = []
    const rows = sh.data?.[0]?.rowData ?? []
    rows.forEach((r, ri) => {
      ;(r.values ?? []).forEach((v, ci) => {
        const value = v.formattedValue ?? ''
        const bgHex = rgbToHex(v.effectiveFormat?.backgroundColor as any)
        if (value || bgHex) cells.push({ row: ri, col: ci, value, bgHex })
      })
    })
    out.push({ title, cells })
  }
  return out
}

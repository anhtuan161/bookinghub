// =============================================================
//  Đọc Google Sheet KÈM MÀU NỀN (bắt buộc cho bài toán này).
//  Dùng spreadsheets.get?includeGridData=true để lấy backgroundColor.
//  Chỉ kích hoạt khi DEMO_MODE=false.
// =============================================================
import { readFileSync } from 'node:fs'
import { google } from 'googleapis'
import { config } from '../config.js'
import type { RawTab } from '../types.js'

function loadCredentials(): any {
  if (config.googleServiceAccountJson) return JSON.parse(config.googleServiceAccountJson)
  if (config.googleServiceAccountFile) {
    return JSON.parse(readFileSync(config.googleServiceAccountFile, 'utf8'))
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

export interface SheetInfoRow {
  name: string
  description: string
  address: string
  mapUrl: string
  note: string
}

/** Lấy link Google Maps đầu tiên trong 1 chuỗi (cell "Định vị"). */
function firstMapUrl(s: string): string {
  const m = String(s).match(/https?:\/\/\S*(?:maps\.app\.goo\.gl|google\.[^/]*\/maps|goo\.gl\/maps)\S*/i)
  return m ? m[0] : ''
}

/**
 * Đọc tab "Thông tin" (nếu có) → thông tin từng căn. PARSE THUẦN (không gọi AI):
 * dựa vào hàng tiêu đề có các cột Tên / Thông tin / Địa chỉ / Định vị / Lưu ý.
 * Sheet không có tab thông tin → trả [].
 */
export async function readSheetInfo(spreadsheetId: string): Promise<SheetInfoRow[]> {
  const auth = new google.auth.GoogleAuth({
    credentials: loadCredentials(),
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  })
  const api = google.sheets({ version: 'v4', auth })

  const meta = await api.spreadsheets.get({ spreadsheetId, includeGridData: false })
  const infoTitle = (meta.data.sheets ?? [])
    .map((s) => s.properties?.title ?? '')
    .find((t) => /th[ôo]ng tin/i.test(t))
  if (!infoTitle) return []

  const res = await api.spreadsheets.values.get({ spreadsheetId, range: `${infoTitle}!A1:Z200` })
  const rows = res.data.values ?? []

  // Tìm cột theo tiêu đề (có thể lặp lại nhiều khối: biệt thự, penthouse…).
  let col: { name: number; desc: number; addr: number; map: number; note: number } | null = null
  const norm = (s: any) => String(s ?? '').toLowerCase().trim()
  const out: SheetInfoRow[] = []

  for (const r of rows) {
    const cells = r.map(norm)
    const isHeader = cells.some((c) => c.startsWith('tên')) && cells.some((c) => c.includes('định vị') || c.includes('địa chỉ'))
    if (isHeader) {
      const find = (kw: string[]) => cells.findIndex((c) => kw.some((k) => c.includes(k)))
      col = {
        name: find(['tên']),
        desc: find(['thông tin']),
        addr: find(['địa chỉ']),
        map: find(['định vị']),
        note: find(['lưu ý', 'lưu y']),
      }
      continue
    }
    if (!col || col.name < 0) continue
    const name = String(r[col.name] ?? '').trim()
    if (!name) continue
    out.push({
      name,
      description: col.desc >= 0 ? String(r[col.desc] ?? '').trim() : '',
      address: col.addr >= 0 ? String(r[col.addr] ?? '').trim() : '',
      mapUrl: col.map >= 0 ? firstMapUrl(r[col.map] ?? '') : '',
      note: col.note >= 0 ? String(r[col.note] ?? '').trim() : '',
    })
  }
  return out
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

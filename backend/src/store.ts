// =============================================================
//  KHO DỮ LIỆU TRUNG TÂM (in-memory)
//  - Là "nguồn sự thật" mà các route đọc/ghi.
//  - Ở DEMO_MODE: được seed sẵn dữ liệu mẫu để chạy ngay.
//  - Khi nối thật: Sync Service ghi dữ liệu đã bóc tách vào đây.
//  - Lên production: thay file này bằng adapter PostgreSQL (xem db/schema.sql),
//    giữ nguyên chữ ký các hàm bên dưới — route không phải đổi.
// =============================================================
import * as db from './db.js'
import type {
  AvailabilityDay,
  BookingRequest,
  Property,
  ReviewItem,
  Sheet,
  Status,
} from './types.js'

// ---------- tiện ích ----------
function hash(str: string): number {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}
function fmtISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function parseISO(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
function isWeekend(d: Date): boolean {
  const w = d.getDay()
  return w === 5 || w === 6
}
function isoMinsAgo(m: number): string {
  return new Date(Date.now() - m * 60000).toISOString()
}
export function startOfToday(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

// ---------- dữ liệu ----------
export const properties: Property[] = [
  { id: 'soulmate', name: 'Soulmate - Hoàng Hoa Thám', ownerId: 'mebap', ownerName: 'Mẹ Bắp Homestay', area: 'Đà Lạt - P.10', address: 'Hoàng Hoa Thám, P.10, Đà Lạt', bedrooms: 2, capacityStandard: 6, capacityMax: 8, amenities: ['BBQ', 'Bếp đầy đủ', 'Máy lạnh'], rules: ['Nhận thú cưng'], images: [], basePrice: 1_300_000, extraFeeNote: 'Phụ thu 100k/người/đêm', lastSyncedAt: isoMinsAgo(12), sourceSheetUrl: 'https://docs.google.com/spreadsheets/d/mebap' },
  { id: 'hamy', name: 'Hà My House - Phù Đổng', ownerId: 'mebap', ownerName: 'Mẹ Bắp Homestay', area: 'Đà Lạt - P.8', address: 'Phù Đổng Thiên Vương, P.8, Đà Lạt', bedrooms: 3, capacityStandard: 8, capacityMax: 10, amenities: ['BBQ', 'Bếp đầy đủ'], rules: ['Không loa kéo'], images: [], basePrice: 1_700_000, extraFeeNote: 'Phụ thu 100k/người/đêm', lastSyncedAt: isoMinsAgo(12), sourceSheetUrl: 'https://docs.google.com/spreadsheets/d/mebap' },
  { id: 'baobao', name: 'Baobao House', ownerId: 'hoangcuong', ownerName: 'Hoàng Cường', area: 'Đà Lạt - P.7', address: '24C hẻm 68 Dankia, P.7, Đà Lạt', bedrooms: 4, capacityStandard: 8, capacityMax: 10, amenities: ['Sân nướng BBQ', 'View thung lũng'], rules: ['Nhận thú cưng', 'Không loa kéo'], images: [], basePrice: 2_500_000, extraFeeNote: 'Phụ thu 150k/người/đêm', lastSyncedAt: isoMinsAgo(45), sourceSheetUrl: 'https://docs.google.com/spreadsheets/d/hoangcuong' },
  { id: 'andy', name: "Andy's House", ownerId: 'hoangcuong', ownerName: 'Hoàng Cường', area: 'Đà Lạt - P.9', address: '94 Lữ Gia, P.9, Đà Lạt', bedrooms: 7, capacityStandard: 14, capacityMax: 16, amenities: ['Bida', 'Karaoke', 'BBQ'], rules: [], images: [], basePrice: 4_500_000, extraFeeNote: 'Phụ thu 150k/người/đêm', lastSyncedAt: isoMinsAgo(45), sourceSheetUrl: 'https://docs.google.com/spreadsheets/d/andy' },
  { id: 'luca', name: 'Luca Villa', ownerId: 'peace', ownerName: 'The Peace Seeker', area: 'Đà Lạt - P.9', address: 'Nguyễn Đình Chiểu, P.9, Đà Lạt', bedrooms: 5, capacityStandard: 12, capacityMax: 14, amenities: ['Lò sưởi', 'View thung lũng'], rules: ['Không nhận thú cưng', 'Không loa kéo'], images: [], basePrice: 6_000_000, extraFeeNote: 'Trên 12 khách phụ thu 300k/khách/ngày', lastSyncedAt: isoMinsAgo(160), sourceSheetUrl: 'https://docs.google.com/spreadsheets/d/peace' },
  { id: 'pinus', name: 'Pinus Villa', ownerId: 'peace', ownerName: 'The Peace Seeker', area: 'Đà Lạt - P.10', address: 'Phạm Hồng Thái, P.10, Đà Lạt', bedrooms: 5, capacityStandard: 14, capacityMax: 16, amenities: ['Lò sưởi', 'Khu BBQ'], rules: ['Không loa kéo'], images: [], basePrice: 7_000_000, extraFeeNote: 'Cọc tài sản 2tr khi nhận phòng', lastSyncedAt: isoMinsAgo(160), sourceSheetUrl: 'https://docs.google.com/spreadsheets/d/peace' },
  { id: 'chillbox', name: 'Chill Box', ownerId: 'peace', ownerName: 'The Peace Seeker', area: 'Đà Lạt - P.10', address: 'Hoàng Hoa Thám, P.10, Đà Lạt', bedrooms: 2, capacityStandard: 6, capacityMax: 6, amenities: ['Chảo đốt lửa', 'View rừng thông'], rules: ['Không loa kéo'], images: [], basePrice: 2_000_000, extraFeeNote: 'Cọc tài sản 500k khi nhận phòng', lastSyncedAt: isoMinsAgo(160), sourceSheetUrl: 'https://docs.google.com/spreadsheets/d/peace' },
]

export const sheets: Sheet[] = [
  { id: 's1', ownerName: 'Mẹ Bắp Homestay', ownerPhone: '097 373 8204', url: 'https://docs.google.com/spreadsheets/d/10YNQ_jCFkKkYIBWHmhijVH0u4CDnK2v612OxG5v9A0g', spreadsheetId: '10YNQ_jCFkKkYIBWHmhijVH0u4CDnK2v612OxG5v9A0g', propertyCount: 2, syncStatus: 'ok', lastSyncedAt: isoMinsAgo(12), assignee: 'Lan', commissionRate: 10, colorMapping: { '#ff0000': 'booked', '#00ff00': 'available' } },
  { id: 's2', ownerName: 'Hoàng Cường', ownerPhone: '098 444 1368', url: 'https://docs.google.com/spreadsheets/d/1Qr_vo3uGiMYk5v0aeqWM6w817O7aKXEIDLsVtX_DijA', spreadsheetId: '1Qr_vo3uGiMYk5v0aeqWM6w817O7aKXEIDLsVtX_DijA', propertyCount: 3, syncStatus: 'ok', lastSyncedAt: isoMinsAgo(45), assignee: 'Phúc', commissionRate: 10, colorMapping: { '#ff0000': 'booked' } },
  { id: 's3', ownerName: 'The Peace Seeker', ownerPhone: '0784 975 279', url: 'https://docs.google.com/spreadsheets/d/11b0OMDpolFDEKBB4141oEgNJQhuq0FMKhRecNiK4BXw', spreadsheetId: '11b0OMDpolFDEKBB4141oEgNJQhuq0FMKhRecNiK4BXw', propertyCount: 3, syncStatus: 'needs_check', lastSyncedAt: isoMinsAgo(160), assignee: 'Lan', commissionRate: 10, colorMapping: { '#00ff00': 'available' }, lastError: 'Tab "Tháng 7" đổi cấu trúc — cần gán lại nghĩa màu' },
]

// ---------- lịch (sinh ổn định) ----------
function statusForDay(propertyId: string, date: Date): Status {
  const r = hash(propertyId + fmtISO(date)) % 100
  const bookedTo = isWeekend(date) ? 38 : 18
  if (r < bookedTo) return 'booked'
  if (r < bookedTo + 7) return 'blocked'
  if (r < bookedTo + 12) return 'unknown'
  return 'available'
}
function priceForDay(p: Property, date: Date): number {
  if (isWeekend(date)) return Math.round((p.basePrice * 1.25) / 50000) * 50000
  return p.basePrice
}
/** Lịch ghi đè bởi sync thật: key = `${propertyId}|${date}` */
export const overrides = new Map<string, AvailabilityDay>()

export function getDay(propertyId: string, date: Date): AvailabilityDay {
  const iso = fmtISO(date)
  const key = `${propertyId}|${iso}`
  if (overrides.has(key)) return overrides.get(key)!
  const p = properties.find((x) => x.id === propertyId)!
  const status = statusForDay(propertyId, date)
  return {
    date: iso,
    status,
    price: priceForDay(p, date),
    minNights: isWeekend(date) ? 2 : 1,
    note: status === 'blocked' ? 'Đang giữ chỗ' : '',
    confidence: status === 'unknown' ? 0.55 : 0.97,
    sourceUpdatedAt: p.lastSyncedAt,
  }
}

export function setDay(propertyId: string, day: AvailabilityDay, persist = true) {
  overrides.set(`${propertyId}|${day.date}`, day)
  if (persist) db.upsertAvailability(propertyId, day)
}

/** Thêm 1 mục Cần kiểm tra (push + ghi DB). */
export function addReview(item: ReviewItem) {
  reviewQueue.push(item)
  db.insertReview(item)
}

function slug(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
}

/**
 * LIVE sync: tìm villa theo (chủ nhà + tên), KHÔNG có thì TẠO MỚI từ sheet.
 * Đây là cách đúng cho dữ liệu thật — villa do sheet định nghĩa, không phải seed.
 */
export function findOrCreateProperty(ownerId: string, ownerName: string, name: string): Property {
  const norm = name.toLowerCase().trim()
  const existing = properties.find(
    (p) => (p.ownerId === ownerId || p.ownerName === ownerName) && p.name.toLowerCase().trim() === norm,
  )
  if (existing) return existing

  const id = ownerId + '_' + slug(name)
  const byId = properties.find((p) => p.id === id)
  if (byId) return byId

  const p: Property = {
    id,
    name,
    ownerId,
    ownerName,
    area: '',
    address: '',
    bedrooms: 0,
    capacityStandard: 0,
    capacityMax: 0,
    amenities: [],
    rules: [],
    images: [],
    basePrice: 0,
    extraFeeNote: '',
    lastSyncedAt: new Date().toISOString(),
    sourceSheetUrl: '',
  }
  properties.push(p)
  db.insertProperty(p)
  return p
}

export function getMonth(propertyId: string, year: number, month: number): AvailabilityDay[] {
  const days = new Date(year, month + 1, 0).getDate()
  const out: AvailabilityDay[] = []
  for (let d = 1; d <= days; d++) out.push(getDay(propertyId, new Date(year, month, d)))
  return out
}

export function eachDay(checkin: string, checkout: string): string[] {
  const out: string[] = []
  let cur = parseISO(checkin)
  const end = parseISO(checkout)
  while (cur < end) {
    out.push(fmtISO(cur))
    cur = new Date(cur.getTime() + 86400000)
  }
  return out
}
export { fmtISO, parseISO }

// ---------- hàng đợi Cần kiểm tra ----------
export const reviewQueue: ReviewItem[] = [
  { id: 'r1', propertyId: 'soulmate', propertyName: 'Soulmate - Hoàng Hoa Thám', date: fmtISO(new Date(startOfToday().getTime() + 9 * 86400000)), rawValue: 'Khoa', rawColorHex: '#fde2e2', suggestedStatus: 'booked', suggestedPrice: null, confidence: 0.62 },
  { id: 'r2', propertyId: 'luca', propertyName: 'Luca Villa', date: fmtISO(new Date(startOfToday().getTime() + 14 * 86400000)), rawValue: '7tr/7tr5', rawColorHex: '#ffffff', suggestedStatus: 'available', suggestedPrice: 7_000_000, confidence: 0.58 },
  { id: 'r3', propertyId: 'andy', propertyName: "Andy's House", date: fmtISO(new Date(startOfToday().getTime() + 5 * 86400000)), rawValue: 'Tạm giữ - P.Lê', rawColorHex: '#fff3cd', suggestedStatus: 'blocked', suggestedPrice: null, confidence: 0.66 },
  { id: 'r4', propertyId: 'pinus', propertyName: 'Pinus Villa', date: fmtISO(new Date(startOfToday().getTime() + 20 * 86400000)), rawValue: 'MB', rawColorHex: '#e2e3e5', suggestedStatus: 'unknown', suggestedPrice: null, confidence: 0.4 },
]

// ---------- yêu cầu giữ phòng ----------
export const bookings: BookingRequest[] = [
  { id: 'b1', propertyId: 'soulmate', propertyName: 'Soulmate - Hoàng Hoa Thám', customerName: 'Chị Hương', customerContact: 'FB: Huong Nguyen', channel: 'facebook', checkin: fmtISO(new Date(startOfToday().getTime() + 10 * 86400000)), checkout: fmtISO(new Date(startOfToday().getTime() + 12 * 86400000)), guests: 6, quotedPrice: 1_300_000, status: 'new', assignee: 'Lan', note: 'Khách hỏi có nhận thú cưng không', createdAt: isoMinsAgo(30) },
  { id: 'b2', propertyId: 'luca', propertyName: 'Luca Villa', customerName: 'Anh Tuấn', customerContact: 'Zalo: 0901xxxxxx', channel: 'zalo', checkin: fmtISO(new Date(startOfToday().getTime() + 15 * 86400000)), checkout: fmtISO(new Date(startOfToday().getTime() + 17 * 86400000)), guests: 12, quotedPrice: 6_500_000, status: 'consulting', assignee: 'Lan', note: 'Nhóm công ty 12 người', createdAt: isoMinsAgo(120) },
  { id: 'b3', propertyId: 'andy', propertyName: "Andy's House", customerName: 'Chị Mai', customerContact: 'IG: mai.tran', channel: 'instagram', checkin: fmtISO(new Date(startOfToday().getTime() + 6 * 86400000)), checkout: fmtISO(new Date(startOfToday().getTime() + 8 * 86400000)), guests: 14, quotedPrice: 4_800_000, status: 'waiting_owner', assignee: 'Phúc', note: 'Đang chờ chủ nhà xác nhận lịch', createdAt: isoMinsAgo(200) },
  { id: 'b4', propertyId: 'baobao', propertyName: 'Baobao House', customerName: 'Anh Nam', customerContact: 'Website', channel: 'website', checkin: fmtISO(new Date(startOfToday().getTime() + 21 * 86400000)), checkout: fmtISO(new Date(startOfToday().getTime() + 23 * 86400000)), guests: 8, quotedPrice: 2_700_000, status: 'waiting_deposit', assignee: 'Phúc', note: 'Đã chốt căn, chờ chuyển cọc', createdAt: isoMinsAgo(300) },
]

let bookingSeq = bookings.length

export function addBooking(payload: Omit<BookingRequest, 'id' | 'status' | 'createdAt'>): BookingRequest {
  const b: BookingRequest = { ...payload, id: 'b' + ++bookingSeq + '_' + hash(payload.customerName + payload.checkin), status: 'new', createdAt: new Date().toISOString() }
  bookings.unshift(b)
  db.insertBooking(b)
  return b
}

let sheetSeq = sheets.length
export function addSheet(payload: { ownerName: string; ownerPhone: string; url: string; commissionRate: number }): Sheet {
  const idMatch = payload.url.match(/\/d\/([a-zA-Z0-9_-]+)/)
  const s: Sheet = { id: 's' + ++sheetSeq, ownerName: payload.ownerName, ownerPhone: payload.ownerPhone, url: payload.url, spreadsheetId: idMatch?.[1] ?? '', propertyCount: 0, syncStatus: 'needs_check', lastSyncedAt: new Date().toISOString(), assignee: '—', commissionRate: payload.commissionRate, colorMapping: {} }
  sheets.push(s)
  db.insertSheet(s)
  return s
}

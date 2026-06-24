// =============================================================
//  LỚP TRUY CẬP DỮ LIỆU (hiện dùng MOCK DATA)
//  Khi nối thật: chỉ thay phần thân các hàm dưới đây bằng lời gọi
//  Supabase / REST backend (xem docs/docs-backend.md). FE không đổi.
// =============================================================
import type {
  AvailabilityDay,
  BookingRequest,
  BookingStatus,
  Property,
  ReviewItem,
  SearchParams,
  SearchResult,
  Sheet,
  Status,
} from './types'
import {
  addDays,
  eachDay,
  fmtISO,
  hash,
  isWeekend,
  parseISO,
  startOfToday,
} from './utils'
import { getAccessToken } from './auth'

function delay<T>(value: T, ms = 250): Promise<T> {
  return new Promise((res) => setTimeout(() => res(value), ms))
}

function isoMinsAgo(mins: number): string {
  return new Date(Date.now() - mins * 60000).toISOString()
}

// =============================================================
//  NỐI BACKEND THẬT
//  - Đặt VITE_API_URL (vd http://localhost:8787/api) → gọi backend.
//  - Không đặt → dùng MOCK bên dưới (vẫn chạy được standalone).
// =============================================================
const API_URL: string | undefined = import.meta.env.VITE_API_URL

async function http<T>(path: string, opts?: RequestInit): Promise<T> {
  const token = await getAccessToken()
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(opts?.headers as any) }
  if (token) headers.Authorization = `Bearer ${token}`
  const method = (opts?.method ?? 'GET').toUpperCase()
  let url = `${API_URL}${path}`
  if (method === 'GET') {
    const sep = url.includes('?') ? '&' : '?'
    url = `${url}${sep}_ts=${Date.now()}`
  }
  const res = await fetch(url, { ...opts, headers, cache: 'no-store' })
  if (res.status === 401) throw new Error('Phiên đăng nhập hết hạn — vui lòng đăng nhập lại')
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`)
  return res.json() as Promise<T>
}

let lastReviewCount = 0 // cập nhật mỗi lần getReviewQueue chạy (để badge sidebar có số)

// ---------------- Dữ liệu villa mẫu ----------------
export const PROPERTIES: Property[] = [
  {
    id: 'soulmate',
    name: 'Soulmate - Hoàng Hoa Thám',
    ownerId: 'mebap',
    ownerName: 'Mẹ Bắp Homestay',
    area: 'Đà Lạt - P.10',
    address: 'Hoàng Hoa Thám, P.10, Đà Lạt',
    bedrooms: 2,
    capacityStandard: 6,
    capacityMax: 8,
    amenities: ['BBQ', 'Bếp đầy đủ', 'Máy lạnh', 'Lò sưởi'],
    rules: ['Nhận thú cưng'],
    images: [],
    basePrice: 1_300_000,
    extraFeeNote: 'Phụ thu 100k/người/đêm khi quá 6 khách',
    lastSyncedAt: isoMinsAgo(12),
    sourceSheetUrl: 'https://docs.google.com/spreadsheets/d/mebap',
  },
  {
    id: 'hamy',
    name: 'Hà My House - Phù Đổng',
    ownerId: 'mebap',
    ownerName: 'Mẹ Bắp Homestay',
    area: 'Đà Lạt - P.8',
    address: 'Phù Đổng Thiên Vương, P.8, Đà Lạt',
    bedrooms: 3,
    capacityStandard: 8,
    capacityMax: 10,
    amenities: ['BBQ', 'Bếp đầy đủ', 'Máy giặt'],
    rules: ['Không loa kéo'],
    images: [],
    basePrice: 1_700_000,
    extraFeeNote: 'Phụ thu 100k/người/đêm',
    lastSyncedAt: isoMinsAgo(12),
    sourceSheetUrl: 'https://docs.google.com/spreadsheets/d/mebap',
  },
  {
    id: 'baobao',
    name: 'Baobao House',
    ownerId: 'hoangcuong',
    ownerName: 'Hoàng Cường',
    area: 'Đà Lạt - P.7',
    address: '24C hẻm 68 Dankia, P.7, Đà Lạt',
    bedrooms: 4,
    capacityStandard: 8,
    capacityMax: 10,
    amenities: ['Sân nướng BBQ', 'View thung lũng', 'Bãi đậu xe'],
    rules: ['Nhận thú cưng', 'Không loa kéo'],
    images: [],
    basePrice: 2_500_000,
    extraFeeNote: 'Phụ thu 150k/người/đêm',
    lastSyncedAt: isoMinsAgo(45),
    sourceSheetUrl: 'https://docs.google.com/spreadsheets/d/hoangcuong',
  },
  {
    id: 'adela',
    name: 'Adela Villa',
    ownerId: 'hoangcuong',
    ownerName: 'Hoàng Cường',
    area: 'Đà Lạt - P.9',
    address: '77 Hùng Vương, P.9, Đà Lạt',
    bedrooms: 14,
    capacityStandard: 28,
    capacityMax: 32,
    amenities: ['5 căn hộ', 'Máy giặt sấy', 'BBQ', 'Bãi đậu xe lớn'],
    rules: [],
    images: [],
    basePrice: 9_000_000,
    extraFeeNote: 'Đặt cọc tài sản 2tr khi nhận phòng',
    lastSyncedAt: isoMinsAgo(45),
    sourceSheetUrl: 'https://docs.google.com/spreadsheets/d/adela',
  },
  {
    id: 'andy',
    name: "Andy's House",
    ownerId: 'hoangcuong',
    ownerName: 'Hoàng Cường',
    area: 'Đà Lạt - P.9',
    address: '94 Lữ Gia, P.9, Đà Lạt',
    bedrooms: 7,
    capacityStandard: 14,
    capacityMax: 16,
    amenities: ['Bida', 'Karaoke', 'BBQ', 'View đẹp'],
    rules: [],
    images: [],
    basePrice: 4_500_000,
    extraFeeNote: 'Phụ thu 150k/người/đêm',
    lastSyncedAt: isoMinsAgo(45),
    sourceSheetUrl: 'https://docs.google.com/spreadsheets/d/andy',
  },
  {
    id: 'luca',
    name: 'Luca Villa',
    ownerId: 'peace',
    ownerName: 'The Peace Seeker',
    area: 'Đà Lạt - P.9',
    address: 'Nguyễn Đình Chiểu, P.9, Đà Lạt',
    bedrooms: 5,
    capacityStandard: 12,
    capacityMax: 14,
    amenities: ['Lò sưởi', 'Chảo đốt lửa', 'Bãi đậu xe', 'View thung lũng'],
    rules: ['Không nhận thú cưng', 'Không loa kéo'],
    images: [],
    basePrice: 6_000_000,
    extraFeeNote: 'Trên 12 khách phụ thu 300k/khách/ngày. Cọc tài sản 1tr.',
    lastSyncedAt: isoMinsAgo(160),
    sourceSheetUrl: 'https://docs.google.com/spreadsheets/d/peace',
  },
  {
    id: 'pinus',
    name: 'Pinus Villa',
    ownerId: 'peace',
    ownerName: 'The Peace Seeker',
    area: 'Đà Lạt - P.10',
    address: 'Phạm Hồng Thái, P.10, Đà Lạt',
    bedrooms: 5,
    capacityStandard: 14,
    capacityMax: 16,
    amenities: ['Lò sưởi', 'Khu BBQ', 'Xích đu', 'Giếng trời'],
    rules: ['Không loa kéo'],
    images: [],
    basePrice: 7_000_000,
    extraFeeNote: 'Cọc tài sản 2tr khi nhận phòng',
    lastSyncedAt: isoMinsAgo(160),
    sourceSheetUrl: 'https://docs.google.com/spreadsheets/d/peace',
  },
  {
    id: 'chillbox',
    name: 'Chill Box',
    ownerId: 'peace',
    ownerName: 'The Peace Seeker',
    area: 'Đà Lạt - P.10',
    address: 'Hoàng Hoa Thám, P.10, Đà Lạt',
    bedrooms: 2,
    capacityStandard: 6,
    capacityMax: 6,
    amenities: ['Chảo đốt lửa', 'View rừng thông', '2 view'],
    rules: ['Không loa kéo'],
    images: [],
    basePrice: 2_000_000,
    extraFeeNote: 'Cọc tài sản 500k khi nhận phòng',
    lastSyncedAt: isoMinsAgo(160),
    sourceSheetUrl: 'https://docs.google.com/spreadsheets/d/peace',
  },
]

// ---------------- Sinh trạng thái + giá theo ngày (ổn định) ----------------
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

export function buildDay(p: Property, date: Date): AvailabilityDay {
  const status = statusForDay(p.id, date)
  return {
    date: fmtISO(date),
    status,
    price: priceForDay(p, date),
    minNights: isWeekend(date) ? 2 : 1,
    note: status === 'blocked' ? 'Đang giữ chỗ' : '',
    confidence: status === 'unknown' ? 0.55 : 0.97,
    sourceUpdatedAt: p.lastSyncedAt,
  }
}

// ---------------- API ----------------
export async function getProperties(): Promise<Property[]> {
  if (API_URL) return http('/properties')
  return delay(PROPERTIES)
}

export async function getProperty(id: string): Promise<Property | undefined> {
  if (API_URL) return http(`/properties/${id}`)
  return delay(PROPERTIES.find((p) => p.id === id))
}

export async function getAreas(): Promise<string[]> {
  if (API_URL) return http('/areas')
  return delay(Array.from(new Set(PROPERTIES.map((p) => p.area))).sort())
}

export async function getAvailability(propertyId: string, year: number, month: number): Promise<AvailabilityDay[]> {
  if (API_URL) return http(`/properties/${propertyId}/availability?year=${year}&month=${month}`)
  const p = PROPERTIES.find((x) => x.id === propertyId)
  if (!p) return delay([])
  const days = new Date(year, month + 1, 0).getDate()
  const out: AvailabilityDay[] = []
  for (let d = 1; d <= days; d++) out.push(buildDay(p, new Date(year, month, d)))
  return delay(out)
}

export async function searchAvailability(params: SearchParams): Promise<SearchResult[]> {
  if (API_URL) return http('/search/availability', { method: 'POST', body: JSON.stringify(params) })
  const range = eachDay(params.checkin, params.checkout)
  const nights = range.length
  const results: SearchResult[] = []
  for (const p of PROPERTIES) {
    if (params.guests > p.capacityMax) continue
    if (params.area && p.area !== params.area) continue

    let allFree = true
    let hasReview = false
    let total = 0
    for (const iso of range) {
      const day = buildDay(p, parseISO(iso))
      if (day.status === 'booked' || day.status === 'blocked') allFree = false
      if (day.status === 'unknown') hasReview = true
      total += day.price ?? 0
    }
    if (!allFree) continue
    const avgPrice = nights > 0 ? Math.round(total / nights) : p.basePrice
    if (params.maxPrice && avgPrice > params.maxPrice) continue
    results.push({ property: p, avgPrice, nights, hasReview })
  }
  results.sort((a, b) => a.avgPrice - b.avgPrice)
  return delay(results)
}

// ---------------- Cần kiểm tra ----------------
let REVIEW_QUEUE: ReviewItem[] = [
  {
    id: 'r1',
    propertyId: 'soulmate',
    propertyName: 'Soulmate - Hoàng Hoa Thám',
    date: fmtISO(addDays(startOfToday(), 9)),
    rawValue: 'Khoa',
    rawColorHex: '#fde2e2',
    suggestedStatus: 'booked',
    suggestedPrice: null,
    confidence: 0.62,
  },
  {
    id: 'r2',
    propertyId: 'luca',
    propertyName: 'Luca Villa',
    date: fmtISO(addDays(startOfToday(), 14)),
    rawValue: '7tr/7tr5',
    rawColorHex: '#ffffff',
    suggestedStatus: 'available',
    suggestedPrice: 7_000_000,
    confidence: 0.58,
  },
  {
    id: 'r3',
    propertyId: 'andy',
    propertyName: "Andy's House",
    date: fmtISO(addDays(startOfToday(), 5)),
    rawValue: 'Tạm giữ - P.Lê',
    rawColorHex: '#fff3cd',
    suggestedStatus: 'blocked',
    suggestedPrice: null,
    confidence: 0.66,
  },
  {
    id: 'r4',
    propertyId: 'pinus',
    propertyName: 'Pinus Villa',
    date: fmtISO(addDays(startOfToday(), 20)),
    rawValue: 'MB',
    rawColorHex: '#e2e3e5',
    suggestedStatus: 'unknown',
    suggestedPrice: null,
    confidence: 0.4,
  },
  {
    id: 'r5',
    propertyId: 'baobao',
    propertyName: 'Baobao House',
    date: fmtISO(addDays(startOfToday(), 3)),
    rawValue: 'Cọc 50%',
    rawColorHex: '#fde2e2',
    suggestedStatus: 'booked',
    suggestedPrice: null,
    confidence: 0.7,
  },
]

export async function getReviewQueue(): Promise<ReviewItem[]> {
  if (API_URL) {
    const list = await http<ReviewItem[]>('/review')
    lastReviewCount = list.length
    return list
  }
  lastReviewCount = REVIEW_QUEUE.length
  return delay([...REVIEW_QUEUE])
}

export async function resolveReview(id: string, body?: { status?: Status; price?: number | null }): Promise<void> {
  if (API_URL) {
    await http(`/review/${id}/resolve`, { method: 'POST', body: JSON.stringify(body ?? {}) })
    if (lastReviewCount > 0) lastReviewCount--
    return
  }
  REVIEW_QUEUE = REVIEW_QUEUE.filter((r) => r.id !== id)
  lastReviewCount = REVIEW_QUEUE.length
  return delay(undefined)
}

export function reviewCount(): number {
  if (API_URL) return lastReviewCount
  return REVIEW_QUEUE.length
}

// ---------------- Yêu cầu giữ phòng ----------------
let BOOKINGS: BookingRequest[] = [
  {
    id: 'b1',
    propertyId: 'soulmate',
    propertyName: 'Soulmate - Hoàng Hoa Thám',
    customerName: 'Chị Hương',
    customerContact: 'FB: Huong Nguyen',
    channel: 'facebook',
    checkin: fmtISO(addDays(startOfToday(), 10)),
    checkout: fmtISO(addDays(startOfToday(), 12)),
    guests: 6,
    quotedPrice: 1_300_000,
    status: 'new',
    assignee: 'Lan',
    note: 'Khách hỏi có nhận thú cưng không',
    createdAt: isoMinsAgo(30),
  },
  {
    id: 'b2',
    propertyId: 'luca',
    propertyName: 'Luca Villa',
    customerName: 'Anh Tuấn',
    customerContact: 'Zalo: 0901xxxxxx',
    channel: 'zalo',
    checkin: fmtISO(addDays(startOfToday(), 15)),
    checkout: fmtISO(addDays(startOfToday(), 17)),
    guests: 12,
    quotedPrice: 6_500_000,
    status: 'consulting',
    assignee: 'Lan',
    note: 'Nhóm công ty 12 người',
    createdAt: isoMinsAgo(120),
  },
  {
    id: 'b3',
    propertyId: 'andy',
    propertyName: "Andy's House",
    customerName: 'Chị Mai',
    customerContact: 'IG: mai.tran',
    channel: 'instagram',
    checkin: fmtISO(addDays(startOfToday(), 6)),
    checkout: fmtISO(addDays(startOfToday(), 8)),
    guests: 14,
    quotedPrice: 4_800_000,
    status: 'waiting_owner',
    assignee: 'Phúc',
    note: 'Đang chờ chủ nhà xác nhận lịch',
    createdAt: isoMinsAgo(200),
  },
  {
    id: 'b4',
    propertyId: 'baobao',
    propertyName: 'Baobao House',
    customerName: 'Anh Nam',
    customerContact: 'Website',
    channel: 'website',
    checkin: fmtISO(addDays(startOfToday(), 21)),
    checkout: fmtISO(addDays(startOfToday(), 23)),
    guests: 8,
    quotedPrice: 2_700_000,
    status: 'waiting_deposit',
    assignee: 'Phúc',
    note: 'Đã chốt căn, chờ chuyển cọc',
    createdAt: isoMinsAgo(300),
  },
  {
    id: 'b5',
    propertyId: 'pinus',
    propertyName: 'Pinus Villa',
    customerName: 'Chị Thảo',
    customerContact: 'FB: Thao Le',
    channel: 'facebook',
    checkin: fmtISO(addDays(startOfToday(), 25)),
    checkout: fmtISO(addDays(startOfToday(), 27)),
    guests: 14,
    quotedPrice: 7_500_000,
    status: 'deposit_received',
    assignee: 'Lan',
    note: 'Đã cọc 3tr',
    createdAt: isoMinsAgo(480),
  },
  {
    id: 'b6',
    propertyId: 'hamy',
    propertyName: 'Hà My House - Phù Đổng',
    customerName: 'Anh Dũng',
    customerContact: 'Zalo: 0987xxxxxx',
    channel: 'zalo',
    checkin: fmtISO(addDays(startOfToday(), 4)),
    checkout: fmtISO(addDays(startOfToday(), 6)),
    guests: 8,
    quotedPrice: 1_700_000,
    status: 'confirmed',
    assignee: 'Phúc',
    note: 'Đã xác nhận, đã thanh toán đủ',
    createdAt: isoMinsAgo(600),
  },
]

export async function getBookingRequests(): Promise<BookingRequest[]> {
  if (API_URL) return http('/bookings')
  return delay([...BOOKINGS])
}

export async function createBookingRequest(
  payload: Omit<BookingRequest, 'id' | 'status' | 'createdAt'>,
): Promise<BookingRequest> {
  if (API_URL) return http('/bookings', { method: 'POST', body: JSON.stringify(payload) })
  const b: BookingRequest = {
    ...payload,
    id: 'b' + (BOOKINGS.length + 1) + '_' + hash(payload.customerName + payload.checkin),
    status: 'new',
    createdAt: new Date().toISOString(),
  }
  BOOKINGS = [b, ...BOOKINGS]
  return delay(b)
}

export async function updateBookingStatus(id: string, status: BookingStatus): Promise<void> {
  if (API_URL) {
    await http(`/bookings/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) })
    return
  }
  BOOKINGS = BOOKINGS.map((b) => (b.id === id ? { ...b, status } : b))
  return delay(undefined)
}

// ---------------- Nguồn dữ liệu (sheets) ----------------
let SHEETS: Sheet[] = [
  {
    id: 's1',
    ownerName: 'Mẹ Bắp Homestay',
    ownerPhone: '097 373 8204',
    url: 'https://docs.google.com/spreadsheets/d/mebap',
    parserType: 'column_villas_month_tabs',
    propertyCount: 2,
    syncStatus: 'ok',
    lastSyncedAt: isoMinsAgo(12),
    assignee: 'Lan',
    commissionRate: 10,
  },
  {
    id: 's2',
    ownerName: 'Hoàng Cường',
    ownerPhone: '098 444 1368',
    url: 'https://docs.google.com/spreadsheets/d/hoangcuong',
    parserType: 'weekday_day_columns_month_tabs',
    propertyCount: 3,
    syncStatus: 'ok',
    lastSyncedAt: isoMinsAgo(45),
    assignee: 'Phúc',
    commissionRate: 10,
  },
  {
    id: 's3',
    ownerName: 'The Peace Seeker',
    ownerPhone: '0784 975 279',
    url: 'https://docs.google.com/spreadsheets/d/peace',
    parserType: 'column_villas_month_tabs',
    propertyCount: 3,
    syncStatus: 'needs_check',
    lastSyncedAt: isoMinsAgo(160),
    assignee: 'Lan',
    commissionRate: 10,
    lastError: 'Tab "Tháng 7" đổi cấu trúc — cần gán lại nghĩa màu',
  },
  {
    id: 's4',
    ownerName: 'Villa Làng Cổ',
    ownerPhone: '090 123 4567',
    url: 'https://docs.google.com/spreadsheets/d/langco',
    parserType: 'needs_manual_mapping',
    propertyCount: 4,
    syncStatus: 'error',
    lastSyncedAt: isoMinsAgo(320),
    assignee: 'Phúc',
    commissionRate: 12,
    lastError: 'Không truy cập được sheet — chủ nhà có thể đã đổi quyền chia sẻ',
  },
]

export async function getSheets(): Promise<Sheet[]> {
  if (API_URL) return http('/sheets')
  return delay([...SHEETS])
}

export async function addOwnerSheet(payload: {
  ownerName: string
  ownerPhone: string
  url: string
  commissionRate: number
  parserType?: string
}): Promise<Sheet> {
  if (API_URL) return http('/sheets', { method: 'POST', body: JSON.stringify(payload) })
  const s: Sheet = {
    id: 's' + (SHEETS.length + 1),
    ownerName: payload.ownerName,
    ownerPhone: payload.ownerPhone,
    url: payload.url,
    propertyCount: 0,
    syncStatus: 'needs_check',
    lastSyncedAt: new Date().toISOString(),
    assignee: '—',
    commissionRate: payload.commissionRate,
  }
  SHEETS = [...SHEETS, s]
  return delay(s)
}

export async function updateOwnerSheet(id: string, payload: Partial<Sheet>): Promise<Sheet> {
  if (API_URL) return http(`/sheets/${id}`, { method: 'PATCH', body: JSON.stringify(payload) })
  let updated = SHEETS.find((s) => s.id === id)
  SHEETS = SHEETS.map((s) => {
    if (s.id !== id) return s
    updated = { ...s, ...payload }
    return updated
  })
  return delay(updated as Sheet)
}

export async function syncNow(target?: { sheetId?: string; propertyId?: string }): Promise<{ started: boolean }> {
  if (API_URL) return http('/sync/now', { method: 'POST', body: JSON.stringify(target ?? {}) })
  if (target?.sheetId) {
    SHEETS = SHEETS.map((s) =>
      s.id === target.sheetId ? { ...s, lastSyncedAt: new Date().toISOString(), syncStatus: 'ok', lastError: undefined } : s,
    )
  } else if (!target?.propertyId) {
    SHEETS = SHEETS.map((s) =>
      s.syncStatus === 'error' ? s : { ...s, lastSyncedAt: new Date().toISOString(), syncStatus: 'ok' },
    )
  }
  return delay({ started: true }, 600)
}

export async function triggerN8nManualSync(): Promise<{ started: boolean }> {
  if (API_URL) return http('/sync/n8n/manual', { method: 'POST' })
  return delay({ started: true }, 600)
}

// Xu hướng nhu cầu theo tháng (số ngày đã đặt / tổng) — cho chart Tổng quan.
export async function refreshDataFromDb(): Promise<{ refreshed: boolean }> {
  if (API_URL) return http('/data/reload', { method: 'POST' })
  return delay({ refreshed: true }, 200)
}

export async function getTrend(): Promise<import('./types').TrendPoint[]> {
  if (API_URL) return http('/dashboard/trend')
  // mock: vài tháng tới
  const today = startOfToday()
  return delay(
    Array.from({ length: 6 }, (_, i) => {
      const d = new Date(today.getFullYear(), today.getMonth() + i, 1)
      const total = 30
      const booked = Math.round(total * (0.4 + 0.08 * Math.sin(i)))
      return { month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, booked, total }
    }),
  )
}

// ---------------- Dashboard ----------------
export async function getDashboardStats() {
  if (API_URL) return http('/dashboard/stats')
  const today = startOfToday()
  const availableToday = PROPERTIES.filter((p) => buildDay(p, today).status === 'available').length
  const pendingBookings = BOOKINGS.filter(
    (b) => !['confirmed', 'cancelled', 'lost'].includes(b.status),
  ).length
  const errorSheets = SHEETS.filter((s) => s.syncStatus === 'error' || s.syncStatus === 'needs_check').length
  return delay({
    totalProperties: PROPERTIES.length,
    availableToday,
    pendingBookings,
    reviewCount: REVIEW_QUEUE.length,
    errorSheets,
  })
}

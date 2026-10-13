// API Thomstay Coliving (dữ liệu ezCloud đã đồng bộ về server).
import { api } from './http'

export interface ClBooking {
  id: number
  number: number | null
  code: string | null
  status: string | null
  arrival_date: string
  departure_date: string
  dep_eff: string
  nights: number | null
  room_id: number | null
  room: string | null
  room_type: string | null
  source: string | null
  ota_ref: string | null
  price: number | null
  room_total: number | null
  guest: string | null
  adults: number | null
  children: number | null
  rate_plan: string | null
  created_at: string | null
  created_by: string | null
  phone?: string | null
  email?: string | null
  country?: string | null
  market?: string | null
  cancelled_at?: string | null
  cancel_reason?: string | null
  note?: string | null
}

export interface Alert {
  level: 'danger' | 'warning' | 'info'
  code: string
  title: string
  hint: string
  items: any[]
}

export interface EzStatus {
  connected: boolean
  userName?: string
  hotelId?: string
  hotelName?: string
  issuedAt?: string
  expiresAt?: string
  lastRefreshAt?: string
  lastRefreshError?: string
  lastError?: string | null
  lastErrorAt?: string | null
  connectedAt?: string
  connectedBy?: string
}

export interface SyncRun {
  id: number
  trigger: string
  started_at: string
  finished_at: string | null
  ok: boolean | null
  stats: any
  error: string | null
}

export interface SyncState {
  ezcloud: EzStatus
  lastRun: SyncRun | null
  lastOkAt: string | null
  stale: boolean
  pendingRequests: number
  intervalMinutes: number
}

export interface ClEvent {
  id: number
  at: string
  kind: string
  summary: string
  changes: any
  booking_id: number
}

export interface Overview {
  day: string
  rooms: number
  occupiedRooms: number
  unassignedTonight: number
  occupancy: number
  inHouse: ClBooking[]
  arrivals: ClBooking[]
  departures: ClBooking[]
  arrivalsTomorrow: ClBooking[]
  forecast: { day: string; occupied: number; unassigned: number; arrivals: number; revenue: number; occupancy: number }[]
  mtd: { from: string; to: string; soldNights: number; availableNights: number; occupancy: number; revenue: number; adr: number; revpar: number }
  alerts: Alert[]
  events: ClEvent[]
  sync: SyncState
  ezKpi: any
}

export interface RevenueMonth {
  month: string
  soldNights: number
  availableNights: number
  occupancy: number
  revenue: number
  adr: number
  revpar: number
  bySegment: Record<string, number>
  bySource: Record<string, number>
}

export interface Revenue {
  year: number
  rooms: number
  monthly: RevenueMonth[]
  total: { nights: number; revenue: number; available: number; occupancy: number; adr: number; revpar: number }
  bySource: { key: string; nights: number; revenue: number }[]
  bySegment: { key: string; nights: number; revenue: number }[]
  byRoom: { key: string; nights: number; revenue: number }[]
  missingPrice: ClBooking[]
  chargesNotSynced: number
}

export const getStatus = () => api<SyncState>('/coliving/status')
export const getOverview = (date?: string) => api<Overview>(`/coliving/overview${date ? `?date=${date}` : ''}`)
export const getCalendar = (from: string, days: number) =>
  api<{ from: string; days: number; rooms: any[]; bookings: ClBooking[]; nights: { id: number; night: string; amount: number }[] }>(
    `/coliving/calendar?from=${from}&days=${days}`,
  )
export const getBookings = (params: Record<string, string>) =>
  api<ClBooking[]>(`/coliving/bookings?${new URLSearchParams(params).toString()}`)
export const getBooking = (id: number) =>
  api<ClBooking & { nightsDetail: { night: string; amount: number }[]; events: ClEvent[]; [k: string]: any }>(`/coliving/bookings/${id}`)
export const getEvents = (limit = 100) => api<ClEvent[]>(`/coliving/events?limit=${limit}`)
export const getRevenue = (year: number) => api<Revenue>(`/coliving/revenue?year=${year}`)
export const getRevenueDaily = (month: string) =>
  api<{ month: string; rooms: number; days: { day: string; sold: number; revenue: number; arrivals: number; departures: number; occupancy: number }[] }>(
    `/coliving/revenue/daily?month=${month}`,
  )
export const getSyncRuns = () => api<SyncRun[]>('/coliving/sync-runs')
export const requestSync = () => api<{ queued: boolean; message: string }>('/coliving/sync', { method: 'POST', json: {} })
export const connectEzcloud = (session: string) => api<{ ok: boolean; status: EzStatus }>('/coliving/connect', { method: 'POST', json: { session } })
export const disconnectEzcloud = () => api('/coliving/connect', { method: 'DELETE' })

// Trang chi tiết booking trên ezCloud (cần đăng nhập ezCloud trên trình duyệt đang dùng)
export const EZCLOUD_URL = 'https://pms.ezcloudhotel.com'
export const ezUrl = (reservationRoomId: number) => `${EZCLOUD_URL}/#/reservation/${reservationRoomId}`

// ---------- hiển thị ----------
export const money = (n: number | null | undefined) => (n ? Math.round(n).toLocaleString('vi-VN') + 'đ' : '0đ')
export const shortMoney = (n: number | null | undefined) => {
  const v = n ?? 0
  if (Math.abs(v) >= 1e9) return (v / 1e9).toFixed(2).replace(/\.?0+$/, '') + ' tỷ'
  if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(1).replace(/\.0$/, '') + 'tr'
  if (Math.abs(v) >= 1e3) return Math.round(v / 1e3) + 'k'
  return String(Math.round(v))
}
export const pct = (x: number) => `${Math.round((x || 0) * 100)}%`
export const dmy = (iso?: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—')
export const dm = (iso?: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '—')
export const dateTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '—'

export function localToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date())
}
export function addDaysIso(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export const STATUS: Record<string, { label: string; cls: string; bar: string }> = {
  BOOKED: { label: 'Đã đặt', cls: 'bg-sky-50 text-sky-700 ring-sky-200', bar: 'bg-sky-500' },
  CHECKIN: { label: 'Đang ở', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200', bar: 'bg-emerald-500' },
  CHECKOUT: { label: 'Đã trả', cls: 'bg-slate-100 text-slate-600 ring-slate-200', bar: 'bg-slate-400' },
  CANCELLED: { label: 'Đã huỷ', cls: 'bg-rose-50 text-rose-700 ring-rose-200', bar: 'bg-rose-400' },
  NOSHOW: { label: 'No-show', cls: 'bg-amber-50 text-amber-700 ring-amber-200', bar: 'bg-amber-400' },
}

export const SEGMENT: Record<string, string> = { short: 'Ngắn ngày (< 7 đêm)', mid: 'Trung hạn (7–27 đêm)', long: 'Dài hạn (≥ 28 đêm)' }

export const EVENT_META: Record<string, { label: string; cls: string; icon: string }> = {
  new: { label: 'Mới', cls: 'bg-emerald-50 text-emerald-700', icon: '🆕' },
  cancelled: { label: 'Huỷ', cls: 'bg-rose-50 text-rose-700', icon: '❌' },
  changed: { label: 'Đổi', cls: 'bg-sky-50 text-sky-700', icon: '✏️' },
  status: { label: 'Trạng thái', cls: 'bg-slate-100 text-slate-600', icon: '🔁' },
  removed: { label: 'Bị xoá', cls: 'bg-amber-50 text-amber-700', icon: '🗑️' },
  restored: { label: 'Khôi phục', cls: 'bg-violet-50 text-violet-700', icon: '♻️' },
}

export function toCsv(rows: Record<string, any>[], cols: { key: string; label: string }[]): string {
  const esc = (v: any) => {
    const s = v === null || v === undefined ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return '﻿' + [cols.map((c) => esc(c.label)).join(','), ...rows.map((r) => cols.map((c) => esc(r[c.key])).join(','))].join('\n')
}

export function download(filename: string, content: string, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

import type { Status } from './types'

// ---------- Ngày tháng ----------
export function startOfToday(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

export function fmtISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function parseISO(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function fmtVN(s: string): string {
  const d = parseISO(s)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

export function isWeekend(d: Date): boolean {
  const w = d.getDay()
  return w === 5 || w === 6 // Thứ 6, Thứ 7
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

export function nightsBetween(checkin: string, checkout: string): number {
  const a = parseISO(checkin).getTime()
  const b = parseISO(checkout).getTime()
  return Math.max(0, Math.round((b - a) / 86400000))
}

export function eachDay(checkin: string, checkout: string): string[] {
  const out: string[] = []
  let cur = parseISO(checkin)
  const end = parseISO(checkout)
  while (cur < end) {
    out.push(fmtISO(cur))
    cur = addDays(cur, 1)
  }
  return out
}

// Lưới lịch theo tháng (Thứ 2 đầu tuần). month: 0-11
export function monthMatrix(year: number, month: number): (Date | null)[] {
  const first = new Date(year, month, 1)
  const startWeekday = (first.getDay() + 6) % 7 // Mon=0
  const days = new Date(year, month + 1, 0).getDate()
  const cells: (Date | null)[] = []
  for (let i = 0; i < startWeekday; i++) cells.push(null)
  for (let d = 1; d <= days; d++) cells.push(new Date(year, month, d))
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

export const WEEKDAYS_VN = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']

// ---------- Tiền ----------
export function fmtVND(n: number | null): string {
  if (n == null) return '—'
  return n.toLocaleString('vi-VN') + ' đ'
}

export function shortPrice(n: number | null): string {
  if (n == null) return '—'
  const tr = n / 1_000_000
  const s = Number.isInteger(tr) ? String(tr) : tr.toFixed(1).replace('.0', '')
  return s + 'tr'
}

// ---------- Hash để sinh mock ổn định ----------
export function hash(str: string): number {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function gradientFor(seed: string): React.CSSProperties {
  const h1 = hash(seed) % 360
  const h2 = (h1 + 40) % 360
  return {
    background: `linear-gradient(135deg, hsl(${h1} 65% 55%), hsl(${h2} 65% 42%))`,
  }
}

export function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
}

// ---------- Nhãn & màu trạng thái ----------
export const STATUS_META: Record<
  Status,
  { label: string; badge: string; dot: string; cell: string }
> = {
  available: {
    label: 'Còn trống',
    badge: 'bg-green-100 text-green-800',
    dot: 'bg-green-500',
    cell: 'bg-green-50 border-green-200 text-green-900',
  },
  booked: {
    label: 'Đã đặt',
    badge: 'bg-red-100 text-red-800',
    dot: 'bg-red-500',
    cell: 'bg-red-50 border-red-200 text-red-900',
  },
  blocked: {
    label: 'Đang giữ',
    badge: 'bg-amber-100 text-amber-800',
    dot: 'bg-amber-500',
    cell: 'bg-amber-50 border-amber-200 text-amber-900',
  },
  unknown: {
    label: 'Cần kiểm tra',
    badge: 'bg-gray-100 text-gray-700',
    dot: 'bg-gray-400',
    cell: 'bg-gray-50 border-amber-300 text-gray-700',
  },
}

export const BOOKING_STATUS_META: Record<string, { label: string; color: string }> = {
  new: { label: 'Mới', color: 'bg-slate-100 text-slate-700' },
  consulting: { label: 'Đang tư vấn', color: 'bg-blue-100 text-blue-700' },
  waiting_customer: { label: 'Chờ khách', color: 'bg-indigo-100 text-indigo-700' },
  waiting_owner: { label: 'Chờ chủ nhà', color: 'bg-violet-100 text-violet-700' },
  waiting_deposit: { label: 'Chờ cọc', color: 'bg-amber-100 text-amber-700' },
  deposit_received: { label: 'Đã cọc', color: 'bg-teal-100 text-teal-700' },
  confirmed: { label: 'Đã xác nhận', color: 'bg-green-100 text-green-700' },
  cancelled: { label: 'Hủy', color: 'bg-rose-100 text-rose-700' },
  lost: { label: 'Mất khách', color: 'bg-gray-200 text-gray-600' },
}

export function minsAgo(iso: string): number {
  return Math.round((Date.now() - new Date(iso).getTime()) / 60000)
}

export function freshness(iso: string): { dot: string; label: string; stale: boolean } {
  const m = minsAgo(iso)
  if (m < 30) return { dot: 'bg-green-500', label: `Cập nhật ${m} phút trước`, stale: false }
  if (m < 120) return { dot: 'bg-amber-500', label: `Cập nhật ${m} phút trước`, stale: false }
  const h = Math.round(m / 60)
  return { dot: 'bg-red-500', label: `Cập nhật ${h} giờ trước — nên đồng bộ lại`, stale: true }
}

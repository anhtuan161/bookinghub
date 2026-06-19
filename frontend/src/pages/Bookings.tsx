import { useEffect, useState } from 'react'
import { getBookingRequests, updateBookingStatus } from '../lib/api'
import { onDbRefresh } from '../lib/refresh'
import { showToast } from '../lib/toast'
import type { BookingRequest, BookingStatus } from '../lib/types'
import { BOOKING_STATUS_META, fmtVN, shortPrice } from '../lib/utils'

const COLUMNS: BookingStatus[] = [
  'new',
  'consulting',
  'waiting_customer',
  'waiting_owner',
  'waiting_deposit',
  'deposit_received',
  'confirmed',
]

const ALL_STATUSES: BookingStatus[] = [...COLUMNS, 'cancelled', 'lost']

export default function Bookings() {
  const [items, setItems] = useState<BookingRequest[]>([])

  function load() {
    getBookingRequests().then(setItems)
  }
  useEffect(() => {
    load()
    return onDbRefresh(load)
  }, [])

  async function change(id: string, status: BookingStatus) {
    await updateBookingStatus(id, status)
    showToast('Đã cập nhật trạng thái')
    load()
  }

  return (
    <div>
      <h1 className="mb-1 text-2xl font-extrabold tracking-tight text-slate-800">Yêu cầu giữ phòng</h1>
      <p className="mb-4 text-sm text-slate-500">Kéo theo quy trình: Mới → Tư vấn → Chờ chủ nhà → Chờ cọc → Đã cọc → Đã xác nhận.</p>

      <div className="flex gap-3 overflow-x-auto pb-4">
        {COLUMNS.map((col) => {
          const cards = items.filter((i) => i.status === col)
          return (
            <div key={col} className="flex w-72 shrink-0 flex-col rounded-xl bg-slate-100 p-2">
              <div className="mb-2 flex items-center justify-between px-2 py-1">
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${BOOKING_STATUS_META[col].color}`}>
                  {BOOKING_STATUS_META[col].label}
                </span>
                <span className="text-xs text-slate-400">{cards.length}</span>
              </div>
              <div className="space-y-2">
                {cards.map((b) => (
                  <div key={b.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-card">
                    <div className="font-semibold leading-tight">{b.customerName}</div>
                    <div className="text-xs text-slate-500">{b.propertyName}</div>
                    <div className="mt-1 text-xs text-slate-600">
                      {fmtVN(b.checkin)} → {fmtVN(b.checkout)} • {b.guests} khách
                    </div>
                    <div className="mt-1 text-sm font-semibold text-brand-700">{shortPrice(b.quotedPrice)}/đêm</div>
                    <div className="mt-1 flex items-center justify-between text-xs text-slate-400">
                      <span>{channelLabel(b.channel)}</span>
                      <span>NV: {b.assignee}</span>
                    </div>
                    {b.note && <div className="mt-1 rounded bg-slate-50 px-2 py-1 text-xs text-slate-500">{b.note}</div>}
                    <select
                      value={b.status}
                      onChange={(e) => change(b.id, e.target.value as BookingStatus)}
                      className="mt-2 w-full rounded border bg-white px-2 py-1 text-xs"
                    >
                      {ALL_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          Chuyển: {BOOKING_STATUS_META[s].label}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
                {cards.length === 0 && <div className="px-2 py-4 text-center text-xs text-slate-300">— trống —</div>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function channelLabel(c: string): string {
  return { facebook: 'Facebook', instagram: 'Instagram', zalo: 'Zalo', website: 'Website', other: 'Khác' }[c] ?? c
}

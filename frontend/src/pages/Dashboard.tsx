import { useEffect, useState } from 'react'
import { getDashboardStats, getTrend } from '../lib/api'
import { onDbRefresh } from '../lib/refresh'
import type { TrendPoint } from '../lib/types'

interface Stats {
  totalProperties: number
  availableToday: number
  pendingBookings: number
  reviewCount: number
  errorSheets: number
}

export default function Dashboard() {
  const [s, setS] = useState<Stats | null>(null)
  const [trend, setTrend] = useState<TrendPoint[] | null>(null)

  function load() {
    getDashboardStats().then(setS)
    getTrend().then(setTrend).catch(() => setTrend([]))
  }

  useEffect(() => {
    load()
    return onDbRefresh(load)
  }, [])

  if (!s) return <div className="text-slate-400">Đang tải…</div>

  const cards = [
    { label: 'Tổng số villa', value: s.totalProperties, icon: '🏡', cls: 'text-slate-800' },
    { label: 'Còn trống hôm nay', value: s.availableToday, icon: '✅', cls: 'text-green-600' },
    { label: 'Yêu cầu đang chờ', value: s.pendingBookings, icon: '📋', cls: 'text-blue-600' },
    { label: 'Mục cần kiểm tra', value: s.reviewCount, icon: '⚠️', cls: 'text-amber-600' },
    { label: 'Sheet lỗi/cần xem', value: s.errorSheets, icon: '🛑', cls: 'text-red-600' },
  ]

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-4 text-2xl font-extrabold tracking-tight text-slate-800">Tổng quan</h1>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        {cards.map((c) => (
          <div key={c.label} className="card p-5 transition hover:shadow-pop">
            <div className="text-2xl">{c.icon}</div>
            <div className={`mt-2 text-3xl font-bold ${c.cls}`}>{c.value}</div>
            <div className="mt-1 text-sm text-slate-500">{c.label}</div>
          </div>
        ))}
      </div>

      <TrendChart data={trend} />
    </div>
  )
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split('-')
  return `T${Number(m)}/${y.slice(2)}`
}

function TrendChart({ data }: { data: TrendPoint[] | null }) {
  if (!data) return <div className="card mt-6 p-5 text-sm text-slate-400">Đang tải biểu đồ…</div>
  if (data.length === 0)
    return (
      <div className="card mt-6 p-5 text-sm text-slate-500">
        Chưa có dữ liệu xu hướng. Bấm <b>Đồng bộ ngay</b> để nạp lịch từ Google Sheet, biểu đồ sẽ hiện theo số ngày đã đặt.
      </div>
    )

  const peak = Math.max(...data.map((d) => (d.total ? d.booked / d.total : 0)), 0.0001)
  const avgOcc = Math.round((data.reduce((a, d) => a + (d.total ? d.booked / d.total : 0), 0) / data.length) * 100)

  return (
    <div className="card mt-6 p-5">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-800">Xu hướng nhu cầu khách ở Đà Lạt</h2>
        <span className="text-sm text-slate-400">Tỷ lệ lấp đầy TB: <b className="text-slate-700">{avgOcc}%</b></span>
      </div>
      <p className="mb-4 text-xs text-slate-400">
        Theo số ngày đã đặt / tổng số ngày trong lịch (tính trên tất cả villa). Cột càng cao = càng đông khách.
      </p>

      <div className="flex items-end gap-2 sm:gap-3" style={{ height: 180 }}>
        {data.map((d) => {
          const occ = d.total ? d.booked / d.total : 0
          const pct = Math.round(occ * 100)
          const h = Math.max(4, Math.round((occ / peak) * 150))
          // màu nóng dần theo tỷ lệ lấp đầy
          const color = occ >= 0.7 ? 'bg-red-500' : occ >= 0.45 ? 'bg-amber-500' : 'bg-brand-500'
          return (
            <div key={d.month} className="flex flex-1 flex-col items-center justify-end gap-1">
              <div className="text-xs font-semibold text-slate-600">{pct}%</div>
              <div
                className={`w-full max-w-[44px] rounded-t-md ${color} transition-all`}
                style={{ height: h }}
                title={`${monthLabel(d.month)}: ${d.booked}/${d.total} ngày đã đặt (${pct}%)`}
              />
              <div className="mt-1 text-xs text-slate-500">{monthLabel(d.month)}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

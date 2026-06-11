import { useEffect, useState } from 'react'
import { getDashboardStats } from '../lib/api'

interface Stats {
  totalProperties: number
  availableToday: number
  pendingBookings: number
  reviewCount: number
  errorSheets: number
}

export default function Dashboard() {
  const [s, setS] = useState<Stats | null>(null)
  useEffect(() => {
    getDashboardStats().then(setS)
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

      <div className="card mt-6 p-5 text-sm text-slate-500">
        Đây là bản demo chạy trên <b>dữ liệu mẫu</b>. Khi nối Google Sheet + backend thật, các con số này sẽ tự cập nhật theo
        mỗi lần đồng bộ.
      </div>
    </div>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { getAvailability, getBookingRequests, getProperties, getReviewQueue } from '../lib/api'
import { CITIES, cityFor, sheetKeyFor, sheetNameFor } from '../lib/catalog'
import { onDbRefresh } from '../lib/refresh'
import type { BookingRequest, Property, ReviewItem, TrendPoint } from '../lib/types'
import { fmtISO, startOfToday } from '../lib/utils'

interface Stats {
  totalProperties: number
  availableToday: number
  pendingBookings: number
  reviewCount: number
  sheetCount: number
}

export default function Dashboard() {
  const [properties, setProperties] = useState<Property[] | null>(null)
  const [bookings, setBookings] = useState<BookingRequest[]>([])
  const [reviews, setReviews] = useState<ReviewItem[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [trend, setTrend] = useState<TrendPoint[] | null>(null)
  const [city, setCity] = useState('Đà Lạt')
  const [sheetKey, setSheetKey] = useState('all')

  function load() {
    Promise.all([getProperties(), getBookingRequests(), getReviewQueue()]).then(([p, b, r]) => {
      setProperties(p)
      setBookings(b)
      setReviews(r)
    })
  }

  useEffect(() => {
    load()
    return onDbRefresh(load)
  }, [])

  const cityCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const c of CITIES) counts.set(c, 0)
    for (const p of properties ?? []) counts.set(cityFor(p), (counts.get(cityFor(p)) ?? 0) + 1)
    return counts
  }, [properties])

  const cityProperties = useMemo(
    () => (properties ?? []).filter((p) => cityFor(p) === city),
    [properties, city],
  )

  const sheetGroups = useMemo(() => {
    const groups = new Map<string, { key: string; name: string; url: string; count: number }>()
    for (const p of cityProperties) {
      const key = sheetKeyFor(p)
      const current = groups.get(key) ?? { key, name: sheetNameFor(p), url: p.sourceSheetUrl, count: 0 }
      current.count += 1
      groups.set(key, current)
    }
    return Array.from(groups.values()).sort((a, b) => a.name.localeCompare(b.name, 'vi'))
  }, [cityProperties])

  useEffect(() => {
    setSheetKey('all')
  }, [city])

  const selectedProperties = useMemo(() => {
    if (sheetKey === 'all') return cityProperties
    return cityProperties.filter((p) => sheetKeyFor(p) === sheetKey)
  }, [cityProperties, sheetKey])

  useEffect(() => {
    let cancelled = false
    async function compute() {
      if (!properties) return
      setStats(null)
      setTrend(null)
      const selectedIds = new Set(selectedProperties.map((p) => p.id))
      const today = startOfToday()
      const todayIso = fmtISO(today)
      const monthRows = await Promise.all(
        selectedProperties.map((p) => getAvailability(p.id, today.getFullYear(), today.getMonth()).catch(() => [])),
      )
      const availableToday = monthRows.filter((rows) => rows.find((d) => d.date === todayIso)?.status === 'available').length
      const pendingBookings = bookings.filter(
        (b) => selectedIds.has(b.propertyId) && !['confirmed', 'cancelled', 'lost'].includes(b.status),
      ).length
      const reviewCount = reviews.filter((r) => selectedIds.has(r.propertyId)).length

      const trendRows: TrendPoint[] = []
      for (let i = 0; i < 6; i++) {
        const d = new Date(today.getFullYear(), today.getMonth() + i, 1)
        const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        const rowsByProperty = i === 0
          ? monthRows
          : await Promise.all(selectedProperties.map((p) => getAvailability(p.id, d.getFullYear(), d.getMonth()).catch(() => [])))
        const flat = rowsByProperty.flat()
        trendRows.push({
          month: ym,
          booked: flat.filter((x) => x.status === 'booked' || x.status === 'blocked').length,
          total: flat.length,
        })
      }

      if (cancelled) return
      setStats({
        totalProperties: selectedProperties.length,
        availableToday,
        pendingBookings,
        reviewCount,
        sheetCount: sheetKey === 'all' ? sheetGroups.length : selectedProperties.length > 0 ? 1 : 0,
      })
      setTrend(trendRows)
    }
    compute()
    return () => {
      cancelled = true
    }
  }, [properties, selectedProperties, bookings, reviews, sheetKey, sheetGroups.length])

  if (!properties) return <div className="text-slate-400">Đang tải...</div>

  const cards = [
    { label: 'Tổng số villa', value: stats?.totalProperties ?? '...', icon: '🏡', cls: 'text-slate-800' },
    { label: 'Còn trống hôm nay', value: stats?.availableToday ?? '...', icon: '✅', cls: 'text-green-600' },
    { label: 'Yêu cầu đang chờ', value: stats?.pendingBookings ?? '...', icon: '📋', cls: 'text-blue-600' },
    { label: 'Mục cần kiểm tra', value: stats?.reviewCount ?? '...', icon: '⚠️', cls: 'text-amber-600' },
    { label: 'Nhóm sheet', value: stats?.sheetCount ?? '...', icon: '🗂️', cls: 'text-slate-700' },
  ]

  const selectedGroup = sheetGroups.find((g) => g.key === sheetKey)

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-800">Tổng quan</h1>
          <p className="text-sm text-slate-500">Lọc theo khu vực và từng Google Sheet để kiểm tra dữ liệu chủ nhà.</p>
        </div>
        {selectedGroup?.url && (
          <a href={selectedGroup.url} target="_blank" rel="noreferrer" className="btn-ghost">
            Mở Google Sheet
          </a>
        )}
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {CITIES.map((c) => (
          <button
            key={c}
            onClick={() => setCity(c)}
            className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
              city === c
                ? 'border-brand-200 bg-brand-50 text-brand-700'
                : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
            }`}
          >
            {c} <span className="ml-1 text-xs opacity-70">({cityCounts.get(c) ?? 0})</span>
          </button>
        ))}
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        <button
          onClick={() => setSheetKey('all')}
          className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
            sheetKey === 'all'
              ? 'border-slate-300 bg-slate-800 text-white'
              : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
          }`}
        >
          Tất cả sheet ({cityProperties.length})
        </button>
        {sheetGroups.map((g) => (
          <button
            key={g.key}
            onClick={() => setSheetKey(g.key)}
            className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
              sheetKey === g.key
                ? 'border-slate-300 bg-slate-800 text-white'
                : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
            }`}
          >
            {g.name} <span className="ml-1 text-xs opacity-70">({g.count})</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        {cards.map((c) => (
          <div key={c.label} className="card p-5 transition hover:shadow-pop">
            <div className="text-2xl">{c.icon}</div>
            <div className={`mt-2 text-3xl font-bold ${c.cls}`}>{c.value}</div>
            <div className="mt-1 text-sm text-slate-500">{c.label}</div>
          </div>
        ))}
      </div>

      <TrendChart data={trend} city={city} sheetName={selectedGroup?.name} />
    </div>
  )
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split('-')
  return `T${Number(m)}/${y.slice(2)}`
}

function TrendChart({ data, city, sheetName }: { data: TrendPoint[] | null; city: string; sheetName?: string }) {
  if (!data) return <div className="card mt-6 p-5 text-sm text-slate-400">Đang tải biểu đồ...</div>
  if (data.length === 0 || data.every((d) => d.total === 0)) {
    return <div className="card mt-6 p-5 text-sm text-slate-500">Chưa có dữ liệu lịch cho nhóm đang chọn.</div>
  }

  const peak = Math.max(...data.map((d) => (d.total ? d.booked / d.total : 0)), 0.0001)
  const avgOcc = Math.round((data.reduce((a, d) => a + (d.total ? d.booked / d.total : 0), 0) / data.length) * 100)

  return (
    <div className="card mt-6 p-5">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-slate-800">
          Xu hướng lấp đầy {sheetName ? `${city} > ${sheetName}` : city}
        </h2>
        <span className="text-sm text-slate-400">
          TB: <b className="text-slate-700">{avgOcc}%</b>
        </span>
      </div>
      <p className="mb-4 text-xs text-slate-400">
        Theo số ngày đã đặt hoặc bị khóa trên tổng số ngày đã sync của nhóm đang chọn.
      </p>

      <div className="flex items-end gap-2 sm:gap-3" style={{ height: 180 }}>
        {data.map((d) => {
          const occ = d.total ? d.booked / d.total : 0
          const pct = Math.round(occ * 100)
          const h = Math.max(4, Math.round((occ / peak) * 150))
          const color = occ >= 0.7 ? 'bg-red-500' : occ >= 0.45 ? 'bg-amber-500' : 'bg-brand-500'
          return (
            <div key={d.month} className="flex flex-1 flex-col items-center justify-end gap-1">
              <div className="text-xs font-semibold text-slate-600">{pct}%</div>
              <div
                className={`w-full max-w-[44px] rounded-t-md ${color} transition-all`}
                style={{ height: h }}
                title={`${monthLabel(d.month)}: ${d.booked}/${d.total} ngày đã đặt/khóa (${pct}%)`}
              />
              <div className="mt-1 text-xs text-slate-500">{monthLabel(d.month)}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

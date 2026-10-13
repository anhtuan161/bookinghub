import { useEffect, useMemo, useState } from 'react'
import { BookingModal, ErrorBox, PageHeader, SyncBar } from '../../components/coliving/ui'
import { STATUS, addDaysIso, getCalendar, localToday, money, type ClBooking } from '../../lib/coliving'

const WD = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']

interface Seg {
  b: ClBooking
  start: number
  span: number
  conflict: boolean
}

export default function Calendar() {
  const [from, setFrom] = useState(addDaysIso(localToday(), -3))
  const [days, setDays] = useState(31)
  const [data, setData] = useState<Awaited<ReturnType<typeof getCalendar>> | null>(null)
  const [err, setErr] = useState('')
  const [open, setOpen] = useState<number | null>(null)

  useEffect(() => {
    setErr('')
    getCalendar(from, days).then(setData).catch((e) => setErr(e.message))
  }, [from, days])

  const dates = useMemo(() => Array.from({ length: days }, (_, i) => addDaysIso(from, i)), [from, days])
  const today = localToday()

  const rows = useMemo(() => {
    if (!data) return []
    const idx = (iso: string) => Math.round((Date.parse(iso) - Date.parse(from)) / 86400000)
    const build = (list: ClBooking[]) => {
      // xếp lane: booking chồng nhau trong cùng phòng → lane riêng + đánh dấu xung đột
      const lanes: Seg[][] = []
      for (const b of [...list].sort((a, c) => a.arrival_date.localeCompare(c.arrival_date))) {
        const s = Math.max(0, idx(b.arrival_date))
        const e = Math.min(days, idx(b.dep_eff))
        if (e <= s) continue
        let placed = false
        for (const lane of lanes) {
          if (lane.every((x) => x.start + x.span <= s || e <= x.start)) {
            lane.push({ b, start: s, span: e - s, conflict: false })
            placed = true
            break
          }
        }
        if (!placed) lanes.push([{ b, start: s, span: e - s, conflict: lanes.length > 0 }])
      }
      if (lanes.length > 1) lanes.slice(1).forEach((l) => l.forEach((x) => (x.conflict = true)))
      return lanes.length ? lanes : [[]]
    }
    const out: { key: string; name: string; sub?: string; lanes: Seg[][]; occupiedNights: number }[] = []
    for (const r of data.rooms) {
      const list = data.bookings.filter((b) => String(b.room_id) === String(r.id))
      const lanes = build(list)
      out.push({ key: String(r.id), name: r.name, sub: r.room_type, lanes, occupiedNights: lanes[0].reduce((a, s) => a + s.span, 0) })
    }
    const unassigned = data.bookings.filter((b) => !b.room_id || !data.rooms.some((r) => String(r.id) === String(b.room_id)))
    if (unassigned.length) {
      const lanes: Seg[][] = []
      for (const b of unassigned) {
        const s = Math.max(0, idx(b.arrival_date))
        const e = Math.min(days, idx(b.dep_eff))
        if (e > s) lanes.push([{ b, start: s, span: e - s, conflict: false }])
      }
      out.push({ key: 'unassigned', name: 'Chưa gán', sub: 'phòng', lanes, occupiedNights: 0 })
    }
    return out
  }, [data, from, days])

  const nightAmount = useMemo(() => {
    const m = new Map<string, number>()
    for (const n of data?.nights ?? []) m.set(`${n.id}|${n.night}`, n.amount)
    return m
  }, [data])

  const occByDay = useMemo(
    () =>
      dates.map((d, i) => rows.filter((r) => r.key !== 'unassigned' && r.lanes[0].some((s) => s.start <= i && i < s.start + s.span)).length),
    [rows, dates],
  )
  const roomTotal = data?.rooms.length ?? 0

  return (
    <div className="mx-auto max-w-[1600px]">
      <PageHeader title="Lịch phòng" subtitle="Mỗi thanh là 1 booking — bấm để xem chi tiết. Thanh đỏ = trùng phòng.">
        <button className="btn-ghost btn-sm" onClick={() => setFrom(addDaysIso(from, -7))}>
          ‹ 7 ngày
        </button>
        <input type="date" className="input w-auto py-1.5" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} />
        <button className="btn-ghost btn-sm" onClick={() => setFrom(addDaysIso(from, 7))}>
          7 ngày ›
        </button>
        <button className="btn-ghost btn-sm" onClick={() => setFrom(addDaysIso(localToday(), -3))}>
          Hôm nay
        </button>
        <select className="input w-auto py-1.5" value={days} onChange={(e) => setDays(Number(e.target.value))}>
          <option value={14}>14 ngày</option>
          <option value={31}>31 ngày</option>
          <option value={62}>62 ngày</option>
          <option value={92}>92 ngày</option>
        </select>
      </PageHeader>
      <SyncBar />
      {err && <ErrorBox msg={err} />}
      {!data && !err && <div className="text-sm text-slate-400">Đang tải…</div>}

      {data && (
        <>
          <div className="mb-3 flex flex-wrap gap-3 text-xs text-slate-500">
            {['BOOKED', 'CHECKIN', 'CHECKOUT'].map((s) => (
              <span key={s} className="flex items-center gap-1.5">
                <span className={`h-3 w-5 rounded ${STATUS[s].bar}`} /> {STATUS[s].label}
              </span>
            ))}
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-5 rounded bg-rose-500" /> Trùng phòng
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-5 rounded border-2 border-dashed border-amber-500" /> Chưa có giá
            </span>
          </div>
          <div className="card overflow-x-auto">
            <table className="border-separate border-spacing-0 text-xs">
              <thead>
                <tr>
                  <th className="sticky left-0 z-20 min-w-[110px] border-b border-r border-slate-200 bg-white px-3 py-2 text-left text-slate-500">Phòng</th>
                  {dates.map((d) => {
                    const wd = new Date(d + 'T00:00:00Z').getUTCDay()
                    return (
                      <th
                        key={d}
                        className={`min-w-[38px] border-b border-slate-200 px-0.5 py-1 text-center font-medium ${
                          d === today ? 'bg-brand-50 text-brand-700' : wd === 0 || wd === 6 ? 'bg-slate-50 text-slate-500' : 'text-slate-400'
                        }`}
                      >
                        <div>{WD[wd]}</div>
                        <div className="text-[13px] font-semibold text-slate-700">{d.slice(8, 10)}</div>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) =>
                  r.lanes.map((lane, li) => {
                    const cells: JSX.Element[] = []
                    let i = 0
                    const sorted = [...lane].sort((a, b) => a.start - b.start)
                    for (const seg of sorted) {
                      for (; i < seg.start; i++) cells.push(<td key={`e${i}`} className={`h-9 border-b border-slate-100 ${dates[i] === today ? 'bg-brand-50/50' : ''}`} />)
                      const b = seg.b
                      const noPrice = !b.room_total && !b.price
                      const color = seg.conflict ? 'bg-rose-500' : STATUS[b.status ?? '']?.bar ?? 'bg-slate-400'
                      const firstNight = dates[seg.start]
                      const amt = nightAmount.get(`${b.id}|${firstNight}`)
                      cells.push(
                        <td key={`b${b.id}`} colSpan={seg.span} className="h-9 border-b border-slate-100 px-0.5 py-1">
                          <button
                            onClick={() => setOpen(b.id)}
                            title={`#${b.number} ${b.guest ?? ''}\n${b.arrival_date} → ${b.departure_date} (${b.nights} đêm)\n${b.source ?? 'Trực tiếp'} · ${STATUS[b.status ?? '']?.label ?? b.status}\nTổng tiền phòng: ${money(b.room_total)}`}
                            className={`flex h-7 w-full items-center gap-1 overflow-hidden rounded-md px-1.5 text-left text-[11px] font-medium text-white shadow-sm hover:brightness-110 ${color} ${
                              noPrice ? 'outline outline-2 outline-dashed outline-amber-400' : ''
                            }`}
                          >
                            <span className="truncate">{b.guest ?? `#${b.number}`}</span>
                            {seg.span >= 3 && amt ? <span className="ml-auto shrink-0 opacity-80">{Math.round(amt / 1000)}k</span> : null}
                          </button>
                        </td>,
                      )
                      i = seg.start + seg.span
                    }
                    for (; i < days; i++) cells.push(<td key={`e${i}`} className={`h-9 border-b border-slate-100 ${dates[i] === today ? 'bg-brand-50/50' : ''}`} />)
                    return (
                      <tr key={`${r.key}-${li}`}>
                        <td className="sticky left-0 z-10 border-b border-r border-slate-200 bg-white px-3 py-1">
                          {li === 0 ? (
                            <>
                              <div className={`font-semibold ${r.key === 'unassigned' ? 'text-amber-600' : 'text-slate-800'}`}>{r.name}</div>
                              {r.sub && <div className="truncate text-[10px] text-slate-400">{r.sub}</div>}
                            </>
                          ) : (
                            <div className="text-[10px] text-rose-500">↳ chồng</div>
                          )}
                        </td>
                        {cells}
                      </tr>
                    )
                  }),
                )}
                <tr>
                  <td className="sticky left-0 z-10 border-r border-slate-200 bg-slate-50 px-3 py-2 font-semibold text-slate-600">Công suất</td>
                  {occByDay.map((n, i) => (
                    <td key={i} className="bg-slate-50 py-2 text-center text-[11px] font-semibold tabular-nums text-slate-600">
                      {roomTotal ? Math.round((n / roomTotal) * 100) : 0}%
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
      <BookingModal id={open} onClose={() => setOpen(null)} />
    </div>
  )
}

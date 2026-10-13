import { useEffect, useMemo, useState } from 'react'
import { Bar, BookingModal, ErrorBox, PageHeader, Stat, SyncBar } from '../../components/coliving/ui'
import {
  SEGMENT,
  dm,
  dmy,
  download,
  getRevenue,
  getRevenueDaily,
  localToday,
  money,
  pct,
  shortMoney,
  toCsv,
  type Revenue as R,
} from '../../lib/coliving'

const SEG_COLOR: Record<string, string> = { short: 'bg-sky-500', mid: 'bg-violet-500', long: 'bg-emerald-500' }

export default function Revenue() {
  const thisYear = Number(localToday().slice(0, 4))
  const [year, setYear] = useState(thisYear)
  const [data, setData] = useState<R | null>(null)
  const [month, setMonth] = useState(localToday().slice(0, 7))
  const [daily, setDaily] = useState<Awaited<ReturnType<typeof getRevenueDaily>> | null>(null)
  const [err, setErr] = useState('')
  const [open, setOpen] = useState<number | null>(null)

  useEffect(() => {
    setErr('')
    setData(null)
    getRevenue(year).then(setData).catch((e) => setErr(e.message))
  }, [year])
  useEffect(() => {
    setDaily(null)
    getRevenueDaily(month).then(setDaily).catch(() => {})
  }, [month])

  const maxRev = useMemo(() => Math.max(1, ...(data?.monthly.map((m) => m.revenue) ?? [1])), [data])
  const maxDay = useMemo(() => Math.max(1, ...(daily?.days.map((d) => d.revenue) ?? [1])), [daily])

  function exportCsv() {
    if (!data) return
    const rows = data.monthly.map((m) => ({
      month: m.month,
      sold: m.soldNights,
      available: m.availableNights,
      occ: Math.round(m.occupancy * 1000) / 10,
      revenue: Math.round(m.revenue),
      adr: Math.round(m.adr),
      revpar: Math.round(m.revpar),
      short: Math.round(m.bySegment.short ?? 0),
      mid: Math.round(m.bySegment.mid ?? 0),
      long: Math.round(m.bySegment.long ?? 0),
    }))
    download(
      `coliving-doanh-thu-${year}.csv`,
      toCsv(rows, [
        { key: 'month', label: 'Tháng' }, { key: 'sold', label: 'Đêm bán' }, { key: 'available', label: 'Đêm có thể bán' },
        { key: 'occ', label: 'Công suất %' }, { key: 'revenue', label: 'Doanh thu phòng' }, { key: 'adr', label: 'ADR' },
        { key: 'revpar', label: 'RevPAR' }, { key: 'short', label: 'Ngắn ngày' }, { key: 'mid', label: 'Trung hạn' }, { key: 'long', label: 'Dài hạn' },
      ]),
    )
  }

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Báo cáo doanh thu" subtitle="Doanh thu tiền phòng theo đêm lưu trú (lấy từ giá từng đêm trên ezCloud)">
        <button className="btn-ghost btn-sm" onClick={() => setYear(year - 1)}>
          ‹ {year - 1}
        </button>
        <span className="px-2 text-lg font-bold text-slate-800">{year}</span>
        <button className="btn-ghost btn-sm" onClick={() => setYear(year + 1)} disabled={year >= thisYear + 1}>
          {year + 1} ›
        </button>
        <button className="btn-ghost btn-sm" onClick={exportCsv} disabled={!data}>
          ⬇ CSV
        </button>
      </PageHeader>
      <SyncBar />
      {err && <ErrorBox msg={err} />}
      {!data && !err && <div className="text-sm text-slate-400">Đang tải…</div>}

      {data && (
        <div className="space-y-6">
          {(data.missingPrice.length > 0 || data.chargesNotSynced > 0) && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {data.missingPrice.length > 0 && (
                <div>
                  ⚠️ <b>{data.missingPrice.length} booking</b> trong năm chưa có giá phòng trên ezCloud → doanh thu đang thiếu. Sửa giá trên ezCloud, hệ thống tự cập nhật.
                </div>
              )}
              {data.chargesNotSynced > 0 && <div>⏳ {data.chargesNotSynced} booking chưa lấy xong tiền phòng theo đêm (đang đồng bộ dần).</div>}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Stat label={`Doanh thu phòng ${year}`} value={shortMoney(data.total.revenue)} sub={money(data.total.revenue)} />
            <Stat label="Đêm phòng bán" value={data.total.nights.toLocaleString('vi-VN')} sub={`/${data.total.available.toLocaleString('vi-VN')} có thể bán`} />
            <Stat label="Công suất" value={pct(data.total.occupancy)} sub={`${data.rooms} phòng`} />
            <Stat label="ADR (giá TB/đêm)" value={shortMoney(data.total.adr)} />
            <Stat label="RevPAR" value={shortMoney(data.total.revpar)} sub="doanh thu / đêm phòng có thể bán" />
          </div>

          <section className="card p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold text-slate-800">Doanh thu theo tháng</h2>
              <div className="flex gap-3 text-xs text-slate-500">
                {Object.entries(SEGMENT).map(([k, v]) => (
                  <span key={k} className="flex items-center gap-1.5">
                    <span className={`h-2.5 w-2.5 rounded-sm ${SEG_COLOR[k]}`} />
                    {v}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex h-56 items-end gap-2">
              {data.monthly.map((m) => (
                <button
                  key={m.month}
                  onClick={() => setMonth(m.month)}
                  className={`group flex flex-1 flex-col items-center gap-1 rounded-lg pb-1 ${month === m.month ? 'bg-brand-50' : 'hover:bg-slate-50'}`}
                  title={`${m.month}: ${money(m.revenue)} · ${m.soldNights} đêm · ${pct(m.occupancy)}`}
                >
                  <span className="text-[10px] font-semibold tabular-nums text-slate-500">{m.revenue ? shortMoney(m.revenue) : ''}</span>
                  <div className="flex w-full max-w-[44px] flex-1 flex-col-reverse overflow-hidden rounded-md bg-slate-100">
                    {(['short', 'mid', 'long'] as const).map((s) => (
                      <div key={s} className={SEG_COLOR[s]} style={{ height: `${((m.bySegment[s] ?? 0) / maxRev) * 100}%` }} />
                    ))}
                  </div>
                  <span className="text-[11px] text-slate-500">T{Number(m.month.slice(5))}</span>
                  <span className="text-[10px] tabular-nums text-slate-400">{pct(m.occupancy)}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Tháng</th>
                  <th className="px-3 py-2 text-right">Đêm bán</th>
                  <th className="px-3 py-2 text-right">Công suất</th>
                  <th className="px-3 py-2 text-right">Doanh thu</th>
                  <th className="px-3 py-2 text-right">ADR</th>
                  <th className="px-3 py-2 text-right">RevPAR</th>
                  <th className="px-3 py-2 text-right">Ngắn ngày</th>
                  <th className="px-3 py-2 text-right">Trung hạn</th>
                  <th className="px-3 py-2 text-right">Dài hạn</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 tabular-nums">
                {data.monthly.map((m) => (
                  <tr key={m.month} onClick={() => setMonth(m.month)} className={`cursor-pointer ${month === m.month ? 'bg-brand-50/60' : 'hover:bg-slate-50'}`}>
                    <td className="px-3 py-2 font-medium">{m.month.slice(5)}/{m.month.slice(0, 4)}</td>
                    <td className="px-3 py-2 text-right">{m.soldNights}</td>
                    <td className="px-3 py-2 text-right">{pct(m.occupancy)}</td>
                    <td className="px-3 py-2 text-right font-semibold">{money(m.revenue)}</td>
                    <td className="px-3 py-2 text-right">{money(m.adr)}</td>
                    <td className="px-3 py-2 text-right">{money(m.revpar)}</td>
                    <td className="px-3 py-2 text-right text-slate-500">{shortMoney(m.bySegment.short)}</td>
                    <td className="px-3 py-2 text-right text-slate-500">{shortMoney(m.bySegment.mid)}</td>
                    <td className="px-3 py-2 text-right text-slate-500">{shortMoney(m.bySegment.long)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="card p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold text-slate-800">Theo ngày — tháng {month.slice(5)}/{month.slice(0, 4)}</h2>
              <input type="month" className="input w-auto py-1.5" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
            </div>
            {!daily ? (
              <div className="text-sm text-slate-400">Đang tải…</div>
            ) : (
              <div className="flex h-40 items-end gap-[3px]">
                {daily.days.map((d) => (
                  <div key={d.day} className="flex flex-1 flex-col items-center gap-1" title={`${dmy(d.day)}: ${money(d.revenue)} · ${d.sold} phòng (${pct(d.occupancy)}) · đến ${d.arrivals} / đi ${d.departures}`}>
                    <div className="flex w-full flex-1 items-end rounded-sm bg-slate-100">
                      <div className={`w-full rounded-sm ${d.revenue ? 'bg-brand-500' : 'bg-amber-300'}`} style={{ height: `${Math.max(d.sold ? 4 : 0, (d.revenue / maxDay) * 100)}%` }} />
                    </div>
                    <span className="text-[9px] text-slate-400">{d.day.slice(8)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <div className="grid gap-4 lg:grid-cols-3">
            <Breakdown title="Theo nguồn" rows={data.bySource.map((r) => ({ ...r, label: r.key === 'ONLINE' ? 'OTA (ONLINE)' : r.key }))} />
            <Breakdown title="Theo thời gian ở" rows={data.bySegment.map((r) => ({ ...r, label: SEGMENT[r.key] ?? r.key }))} />
            <Breakdown title="Theo phòng" rows={data.byRoom.map((r) => ({ ...r, label: r.key }))} />
          </div>

          {data.missingPrice.length > 0 && (
            <section className="card overflow-hidden">
              <h2 className="border-b border-slate-100 px-4 py-3 font-semibold text-slate-800">Booking chưa có giá ({data.missingPrice.length})</h2>
              <ul className="divide-y divide-slate-100 text-sm">
                {data.missingPrice.map((b) => (
                  <li key={b.id}>
                    <button onClick={() => setOpen(b.id)} className="flex w-full gap-3 px-4 py-2 text-left hover:bg-slate-50">
                      <span className="w-16 font-semibold">{b.room ?? 'Chưa gán'}</span>
                      <span className="flex-1">{b.guest ?? '—'}</span>
                      <span className="text-slate-500">
                        {dm(b.arrival_date)} → {dm(b.departure_date)} ({b.nights} đêm)
                      </span>
                      <span className="text-xs text-slate-400">#{b.number} · {b.rate_plan}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
      <BookingModal id={open} onClose={() => setOpen(null)} />
    </div>
  )
}

function Breakdown({ title, rows }: { title: string; rows: { label: string; nights: number; revenue: number }[] }) {
  const total = rows.reduce((a, r) => a + r.revenue, 0)
  const max = Math.max(1, ...rows.map((r) => r.revenue))
  return (
    <section className="card p-4">
      <h2 className="mb-3 font-semibold text-slate-800">{title}</h2>
      {rows.length === 0 ? (
        <div className="text-sm text-slate-400">Chưa có dữ liệu</div>
      ) : (
        <ul className="space-y-2.5">
          {rows.map((r) => (
            <li key={r.label}>
              <div className="mb-1 flex justify-between gap-2 text-sm">
                <span className="truncate text-slate-700">{r.label}</span>
                <span className="shrink-0 tabular-nums text-slate-500">
                  {shortMoney(r.revenue)} · {r.nights} đêm · {total ? Math.round((r.revenue / total) * 100) : 0}%
                </span>
              </div>
              <Bar value={r.revenue} max={max} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

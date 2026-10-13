import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BookingList, BookingModal, ErrorBox, PageHeader, Stat, SyncBar } from '../../components/coliving/ui'
import { can } from '../../lib/auth'
import { EVENT_META, addDaysIso, dateTime, dm, getOverview, localToday, money, pct, shortMoney, type Overview as O } from '../../lib/coliving'
import { useSession } from '../../lib/session'

const LEVEL = {
  danger: 'border-rose-200 bg-rose-50 text-rose-800',
  warning: 'border-amber-200 bg-amber-50 text-amber-800',
  info: 'border-slate-200 bg-slate-50 text-slate-700',
}

export default function Overview() {
  const { user } = useSession()
  const [day, setDay] = useState(localToday())
  const [data, setData] = useState<O | null>(null)
  const [err, setErr] = useState('')
  const [open, setOpen] = useState<number | null>(null)
  const [alertOpen, setAlertOpen] = useState<string | null>(null)

  function load(d = day) {
    setErr('')
    getOverview(d).then(setData).catch((e) => setErr(e.message))
  }
  useEffect(() => {
    load(day)
    const t = setInterval(() => load(day), 5 * 60_000)
    return () => clearInterval(t)
  }, [day])

  const isToday = day === localToday()
  const maxF = Math.max(1, data?.rooms ?? 1)

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title={isToday ? 'Tổng quan hôm nay' : `Tổng quan ngày ${dm(day)}`} subtitle="Công suất, khách đến/đi và các việc cần xử lý">
        <button className="btn-ghost btn-sm" onClick={() => setDay(addDaysIso(day, -1))}>
          ‹ Hôm trước
        </button>
        <input type="date" className="input w-auto py-1.5" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} />
        <button className="btn-ghost btn-sm" onClick={() => setDay(addDaysIso(day, 1))}>
          Hôm sau ›
        </button>
        {!isToday && (
          <button className="btn-ghost btn-sm" onClick={() => setDay(localToday())}>
            Hôm nay
          </button>
        )}
      </PageHeader>
      <SyncBar state={data?.sync} />
      {err && <ErrorBox msg={err} />}
      {!data && !err && <div className="text-sm text-slate-400">Đang tải…</div>}

      {data && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Stat
              label="Công suất đêm nay"
              value={pct(data.occupancy)}
              sub={
                <>
                  {data.occupiedRooms}/{data.rooms} phòng{data.unassignedTonight ? ` · ${data.unassignedTonight} chưa gán` : ''}
                  {isToday && data.ezKpi?.todayStats_roomOccupied != null && data.ezKpi.todayStats_roomOccupied !== data.occupiedRooms && (
                    <span className="block text-amber-600" title="ezCloud tính cả phòng có booking đã qua ngày đi nhưng chưa check-in/check-out (xem cảnh báo bên dưới)">
                      ezCloud ghi {data.ezKpi.todayStats_roomOccupied} phòng — do booking chưa xử lý
                    </span>
                  )}
                </>
              }
              tone={data.occupancy >= 0.8 ? 'good' : 'default'}
            />
            <Stat label="Khách đến" value={data.arrivals.length} sub={`Ngày mai: ${data.arrivalsTomorrow.length}`} />
            <Stat label="Khách đi" value={data.departures.length} />
            <Stat label="Đang lưu trú" value={data.inHouse.length} sub="booking (gồm chưa check-in)" />
            {can(user, 'coliving.revenue') ? (
              <>
                <Stat label={`Doanh thu tháng ${data.day.slice(5, 7)} (tới ${dm(data.day)})`} value={shortMoney(data.mtd.revenue)} sub={`ADR ${shortMoney(data.mtd.adr)} · RevPAR ${shortMoney(data.mtd.revpar)}`} />
                <Stat label="Công suất tháng" value={pct(data.mtd.occupancy)} sub={`${data.mtd.soldNights}/${data.mtd.availableNights} đêm phòng`} />
              </>
            ) : (
              <Stat label="Cảnh báo" value={data.alerts.reduce((a, x) => a + x.items.length, 0)} tone="warn" />
            )}
          </div>

          {data.alerts.length > 0 && (
            <div className="space-y-2">
              {data.alerts.map((a) => (
                <div key={a.code} className={`rounded-xl border ${LEVEL[a.level]}`}>
                  <button className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left" onClick={() => setAlertOpen(alertOpen === a.code ? null : a.code)}>
                    <span>
                      <span className="font-semibold">
                        {a.level === 'danger' ? '⛔' : a.level === 'warning' ? '⚠️' : 'ℹ️'} {a.title}: {a.items.length}
                      </span>
                      <span className="ml-2 text-xs opacity-80">{a.hint}</span>
                    </span>
                    <span className="text-xs">{alertOpen === a.code ? 'Thu gọn' : 'Xem'}</span>
                  </button>
                  {alertOpen === a.code && (
                    <div className="border-t border-current/10 bg-white/60 text-slate-700">
                      {a.code === 'overlap' ? (
                        <ul className="divide-y divide-slate-100 text-sm">
                          {a.items.map((o: any, i: number) => (
                            <li key={i} className="px-4 py-2">
                              <b>{o.room}</b>: #{o.number_a} {o.guest_a} ({dm(o.from_a)}→{dm(o.to_a)}) chồng #{o.number_b} {o.guest_b} ({dm(o.from_b)}→{dm(o.to_b)})
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <BookingList rows={a.items} onOpen={setOpen} empty="" />
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="card overflow-hidden">
              <h2 className="border-b border-slate-100 px-4 py-3 font-semibold text-slate-800">🛬 Khách đến ({data.arrivals.length})</h2>
              <BookingList rows={data.arrivals} onOpen={setOpen} empty="Không có khách đến" />
            </section>
            <section className="card overflow-hidden">
              <h2 className="border-b border-slate-100 px-4 py-3 font-semibold text-slate-800">🛫 Khách đi ({data.departures.length})</h2>
              <BookingList rows={data.departures} onOpen={setOpen} empty="Không có khách đi" />
            </section>
          </div>

          <section className="card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold text-slate-800">Dự báo công suất 14 ngày</h2>
              {can(user, 'coliving.calendar') && (
                <Link to="/coliving/calendar" className="text-sm font-medium text-brand-600 hover:underline">
                  Mở lịch phòng →
                </Link>
              )}
            </div>
            <div className="flex h-40 items-end gap-1.5">
              {data.forecast.map((f) => (
                <div key={f.day} className="group flex flex-1 flex-col items-center gap-1" title={`${dm(f.day)}: ${f.occupied}/${data.rooms} phòng, ${f.arrivals} khách đến${can(user, 'coliving.revenue') ? `, ${money(f.revenue)}` : ''}`}>
                  <span className="text-[10px] font-semibold tabular-nums text-slate-500">{pct(f.occupancy)}</span>
                  <div className="flex w-full flex-1 items-end rounded-md bg-slate-100">
                    <div className={`w-full rounded-md ${f.occupancy >= 0.8 ? 'bg-emerald-500' : f.occupancy >= 0.5 ? 'bg-brand-500' : 'bg-amber-400'}`} style={{ height: `${(f.occupied / maxF) * 100}%` }} />
                  </div>
                  <span className={`text-[10px] ${f.day === data.day ? 'font-bold text-slate-800' : 'text-slate-400'}`}>{dm(f.day)}</span>
                </div>
              ))}
            </div>
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="card overflow-hidden">
              <h2 className="border-b border-slate-100 px-4 py-3 font-semibold text-slate-800">🏠 Đang lưu trú ({data.inHouse.length})</h2>
              <BookingList rows={data.inHouse} onOpen={setOpen} empty="Không có khách" />
            </section>
            <section className="card overflow-hidden">
              <h2 className="border-b border-slate-100 px-4 py-3 font-semibold text-slate-800">Thay đổi gần đây (ezCloud)</h2>
              {data.events.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-slate-400">Chưa có thay đổi nào kể từ lần đồng bộ đầu</div>
              ) : (
                <ul className="divide-y divide-slate-100 text-sm">
                  {data.events.map((e) => (
                    <li key={e.id}>
                      <button onClick={() => setOpen(e.booking_id)} className="flex w-full gap-3 px-4 py-2 text-left hover:bg-slate-50">
                        <span className={`badge shrink-0 ${EVENT_META[e.kind]?.cls ?? ''}`}>{EVENT_META[e.kind]?.label ?? e.kind}</span>
                        <span className="min-w-0 flex-1 text-slate-700">{e.summary}</span>
                        <span className="shrink-0 text-xs text-slate-400">{dateTime(e.at)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}
      <BookingModal id={open} onClose={() => setOpen(null)} />
    </div>
  )
}

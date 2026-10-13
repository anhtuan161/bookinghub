import { useEffect, useMemo, useState } from 'react'
import { BookingModal, Empty, ErrorBox, PageHeader, SourcePill, StatusPill, SyncBar } from '../../components/coliving/ui'
import { STATUS, addDaysIso, dateTime, dmy, download, getBookings, getEvents, localToday, money, toCsv, EVENT_META, type ClBooking, type ClEvent } from '../../lib/coliving'

export default function Bookings() {
  const today = localToday()
  const [tab, setTab] = useState<'list' | 'events'>('list')
  const [field, setField] = useState('stay')
  const [from, setFrom] = useState(addDaysIso(today, -30))
  const [to, setTo] = useState(addDaysIso(today, 60))
  const [status, setStatus] = useState<string[]>([])
  const [source, setSource] = useState('')
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<ClBooking[] | null>(null)
  const [events, setEvents] = useState<ClEvent[] | null>(null)
  const [err, setErr] = useState('')
  const [open, setOpen] = useState<number | null>(null)

  function load() {
    setErr('')
    setRows(null)
    getBookings({ field, from, to, status: status.join(','), source, q, limit: '2000' })
      .then(setRows)
      .catch((e) => setErr(e.message))
  }
  useEffect(load, [field, from, to, status, source])
  useEffect(() => {
    if (tab === 'events' && !events) getEvents(300).then(setEvents).catch((e) => setErr(e.message))
  }, [tab])

  const totals = useMemo(() => {
    const active = (rows ?? []).filter((r) => r.status !== 'CANCELLED')
    return {
      count: rows?.length ?? 0,
      active: active.length,
      nights: active.reduce((a, r) => a + (r.nights ?? 0), 0),
      money: active.reduce((a, r) => a + (r.room_total ?? 0), 0),
    }
  }, [rows])

  function exportCsv() {
    if (!rows) return
    const cols = [
      { key: 'number', label: 'Số' }, { key: 'code', label: 'Mã' }, { key: 'status', label: 'Trạng thái' },
      { key: 'room', label: 'Phòng' }, { key: 'guest', label: 'Khách' }, { key: 'phone', label: 'Điện thoại' },
      { key: 'email', label: 'Email' }, { key: 'arrival_date', label: 'Đến' }, { key: 'departure_date', label: 'Đi' },
      { key: 'nights', label: 'Đêm' }, { key: 'source', label: 'Nguồn' }, { key: 'ota_ref', label: 'Mã OTA' },
      { key: 'rate_plan', label: 'Loại giá' }, { key: 'price', label: 'Giá/đêm' }, { key: 'room_total', label: 'Tổng tiền phòng' },
      { key: 'created_by', label: 'Tạo bởi' }, { key: 'created_at', label: 'Tạo lúc' },
    ]
    download(`coliving-booking-${from}_${to}.csv`, toCsv(rows, cols))
  }

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Booking" subtitle="Tất cả booking từ ezCloud — OTA lẫn tạo tay">
        <div className="flex rounded-lg bg-slate-100 p-1 text-sm">
          {(['list', 'events'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`rounded-md px-3 py-1.5 font-medium ${tab === t ? 'bg-white shadow-sm' : 'text-slate-500'}`}>
              {t === 'list' ? 'Danh sách' : 'Nhật ký thay đổi'}
            </button>
          ))}
        </div>
      </PageHeader>
      <SyncBar />
      {err && <ErrorBox msg={err} />}

      {tab === 'list' && (
        <>
          <form
            className="card mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6"
            onSubmit={(e) => {
              e.preventDefault()
              load()
            }}
          >
            <div>
              <label className="label">Lọc theo</label>
              <select className="input" value={field} onChange={(e) => setField(e.target.value)}>
                <option value="stay">Thời gian lưu trú</option>
                <option value="arrival">Ngày đến</option>
                <option value="created">Ngày tạo</option>
              </select>
            </div>
            <div>
              <label className="label">Từ</label>
              <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <label className="label">Đến</label>
              <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div>
              <label className="label">Nguồn</label>
              <select className="input" value={source} onChange={(e) => setSource(e.target.value)}>
                <option value="">Tất cả</option>
                <option value="ota">OTA</option>
                <option value="direct">Trực tiếp / tạo tay</option>
              </select>
            </div>
            <div className="lg:col-span-2">
              <label className="label">Tìm (tên, SĐT, mã, mã OTA, phòng)</label>
              <div className="flex gap-2">
                <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nhập rồi Enter" />
                <button className="btn-primary">Tìm</button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-6">
              <span className="label mb-0">Trạng thái:</span>
              {Object.entries(STATUS).map(([k, v]) => (
                <label key={k} className={`badge cursor-pointer ring-1 ${status.includes(k) ? v.cls : 'bg-white text-slate-500 ring-slate-200'}`}>
                  <input
                    type="checkbox"
                    className="hidden"
                    checked={status.includes(k)}
                    onChange={() => setStatus(status.includes(k) ? status.filter((s) => s !== k) : [...status, k])}
                  />
                  {v.label}
                </label>
              ))}
              <span className="ml-auto text-xs text-slate-500">
                {totals.count} booking · {totals.active} hiệu lực · {totals.nights} đêm · {money(totals.money)}
              </span>
              <button type="button" className="btn-ghost btn-sm" onClick={exportCsv} disabled={!rows?.length}>
                ⬇ Xuất CSV
              </button>
            </div>
          </form>

          <div className="card overflow-x-auto">
            {!rows ? (
              <Empty>Đang tải…</Empty>
            ) : rows.length === 0 ? (
              <Empty>Không có booking phù hợp</Empty>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">#</th>
                    <th className="px-3 py-2">Phòng</th>
                    <th className="px-3 py-2">Khách</th>
                    <th className="px-3 py-2">Đến → Đi</th>
                    <th className="px-3 py-2 text-right">Đêm</th>
                    <th className="px-3 py-2">Nguồn</th>
                    <th className="px-3 py-2">Trạng thái</th>
                    <th className="px-3 py-2 text-right">Tiền phòng</th>
                    <th className="px-3 py-2">Tạo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((b) => (
                    <tr key={b.id} onClick={() => setOpen(b.id)} className="cursor-pointer hover:bg-slate-50">
                      <td className="px-3 py-2 tabular-nums text-slate-500">{b.number}</td>
                      <td className="px-3 py-2 font-medium text-slate-800">{b.room ?? <span className="text-amber-600">Chưa gán</span>}</td>
                      <td className="px-3 py-2">
                        <div className="text-slate-800">{b.guest ?? '—'}</div>
                        {b.phone && <div className="text-xs text-slate-400">{b.phone}</div>}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-slate-600">
                        {dmy(b.arrival_date)} → {dmy(b.departure_date)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{b.nights}</td>
                      <td className="px-3 py-2">
                        <SourcePill source={b.source} />
                      </td>
                      <td className="px-3 py-2">
                        <StatusPill status={b.status} />
                      </td>
                      <td className={`px-3 py-2 text-right tabular-nums ${!b.room_total && b.status !== 'CANCELLED' ? 'text-amber-600' : ''}`}>
                        {b.room_total === null ? <span className="text-slate-400">…</span> : money(b.room_total)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-400">
                        {b.created_by}
                        <div>{dateTime(b.created_at)}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {tab === 'events' && (
        <div className="card overflow-hidden">
          {!events ? (
            <Empty>Đang tải…</Empty>
          ) : events.length === 0 ? (
            <Empty>Chưa ghi nhận thay đổi nào (lần đồng bộ đầu tiên chỉ lấy hiện trạng)</Empty>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {events.map((e) => (
                <li key={e.id}>
                  <button onClick={() => setOpen(e.booking_id)} className="flex w-full gap-3 px-4 py-2.5 text-left hover:bg-slate-50">
                    <span className="w-28 shrink-0 text-xs text-slate-400">{dateTime(e.at)}</span>
                    <span className={`badge shrink-0 ${EVENT_META[e.kind]?.cls ?? ''}`}>{EVENT_META[e.kind]?.label ?? e.kind}</span>
                    <span className="min-w-0 flex-1 text-slate-700">{e.summary}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <BookingModal id={open} onClose={() => setOpen(null)} />
    </div>
  )
}

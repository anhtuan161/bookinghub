import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { can } from '../../lib/auth'
import {
  EVENT_META,
  STATUS,
  dateTime,
  dmy,
  getBooking,
  getStatus,
  money,
  type ClBooking,
  type SyncState,
} from '../../lib/coliving'
import { useSession } from '../../lib/session'
import Modal from '../Modal'

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-brand-600">Thomstay Coliving</div>
        <h1 className="text-2xl font-bold text-slate-800">{title}</h1>
        {subtitle && <div className="mt-1 text-sm text-slate-500">{subtitle}</div>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  )
}

export function Stat({ label, value, sub, tone = 'default' }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'default' | 'good' | 'warn' }) {
  const ring = tone === 'good' ? 'ring-emerald-100' : tone === 'warn' ? 'ring-amber-100' : 'ring-transparent'
  return (
    <div className={`card p-4 ring-1 ${ring}`}>
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums text-slate-800">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-400">{sub}</div>}
    </div>
  )
}

export function StatusPill({ status }: { status: string | null }) {
  const m = STATUS[status ?? ''] ?? { label: status ?? '—', cls: 'bg-slate-100 text-slate-600 ring-slate-200' }
  return <span className={`badge ring-1 ${m.cls}`}>{m.label}</span>
}

export function SourcePill({ source }: { source: string | null }) {
  return source ? (
    <span className="badge bg-violet-50 text-violet-700">{source === 'ONLINE' ? 'OTA' : source}</span>
  ) : (
    <span className="badge bg-slate-100 text-slate-600">Trực tiếp</span>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="px-4 py-8 text-center text-sm text-slate-400">{children}</div>
}

export function ErrorBox({ msg }: { msg: string }) {
  return <div className="card border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{msg}</div>
}

// Thanh trạng thái đồng bộ ở đầu các trang Coliving
export function SyncBar({ state: given }: { state?: SyncState | null }) {
  const { user } = useSession()
  const [state, setState] = useState<SyncState | null>(given ?? null)
  useEffect(() => {
    if (given !== undefined) return setState(given)
    getStatus().then(setState).catch(() => {})
  }, [given])
  if (!state) return null
  const manage = can(user, 'coliving.manage')
  if (!state.ezcloud.connected)
    return (
      <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        Chưa kết nối ezCloud — chưa có dữ liệu.{' '}
        {manage ? (
          <Link to="/coliving/sync" className="font-semibold underline">
            Kết nối ngay
          </Link>
        ) : (
          'Nhờ quản lý kết nối.'
        )}
      </div>
    )
  return (
    <div className={`mb-5 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl px-4 py-2 text-xs ${state.stale || state.ezcloud.lastError ? 'bg-amber-50 text-amber-800' : 'bg-white text-slate-500 ring-1 ring-slate-200'}`}>
      <span>
        <span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${state.stale ? 'bg-amber-500' : 'bg-emerald-500'}`} />
        Đồng bộ ezCloud lần cuối: <b>{dateTime(state.lastOkAt)}</b> (mỗi {state.intervalMinutes} phút)
      </span>
      {state.ezcloud.lastError && <span>Lỗi gần nhất: {state.ezcloud.lastError}</span>}
      {manage && (state.stale || state.ezcloud.lastError) && (
        <Link to="/coliving/sync" className="font-semibold underline">
          Kiểm tra kết nối
        </Link>
      )}
    </div>
  )
}

// Bảng booking gọn (dùng ở Tổng quan)
export function BookingList({ rows, onOpen, empty, showDates = true }: { rows: ClBooking[]; onOpen: (id: number) => void; empty: string; showDates?: boolean }) {
  if (!rows.length) return <Empty>{empty}</Empty>
  return (
    <ul className="divide-y divide-slate-100">
      {rows.map((b) => (
        <li key={b.id}>
          <button onClick={() => onOpen(b.id)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50">
            <span className="w-16 shrink-0 font-semibold text-slate-800">{b.room ?? <span className="text-amber-600">Chưa gán</span>}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-slate-700">{b.guest ?? '—'}</span>
              {showDates && (
                <span className="block text-xs text-slate-400">
                  {dmy(b.arrival_date)} → {dmy(b.departure_date)} · {b.nights ?? '?'} đêm
                </span>
              )}
            </span>
            <SourcePill source={b.source} />
            <StatusPill status={b.status} />
          </button>
        </li>
      ))}
    </ul>
  )
}

// Chi tiết 1 booking (modal)
export function BookingModal({ id, onClose }: { id: number | null; onClose: () => void }) {
  const [b, setB] = useState<any>(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    setB(null)
    setErr('')
    if (id) getBooking(id).then(setB).catch((e) => setErr(e.message))
  }, [id])
  return (
    <Modal open={!!id} title={b ? `Booking #${b.number ?? ''} ${b.code ? `· ${b.code}` : ''}` : 'Booking'} onClose={onClose} width="max-w-2xl">
      {err && <ErrorBox msg={err} />}
      {!b && !err && <div className="text-sm text-slate-400">Đang tải…</div>}
      {b && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={b.status} />
            <SourcePill source={b.source} />
            {b.ota_ref && <span className="badge bg-slate-100 text-slate-600">Mã OTA: {b.ota_ref}</span>}
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
            <Field k="Khách" v={b.guest} />
            {'phone' in b && <Field k="Điện thoại" v={b.phone} />}
            {'email' in b && <Field k="Email" v={b.email} />}
            <Field k="Phòng" v={b.room ?? 'Chưa gán'} />
            <Field k="Loại phòng" v={b.room_type} />
            <Field k="Số khách" v={`${b.adults ?? 0} NL${b.children ? ` + ${b.children} TE` : ''}`} />
            <Field k="Đến" v={dateTime(b.arrival_at)} />
            <Field k="Đi" v={dateTime(b.departure_at)} />
            <Field k="Số đêm" v={b.nights} />
            <Field k="Loại giá" v={b.rate_plan} />
            <Field k="Giá/đêm (ezCloud)" v={money(b.price)} />
            <Field k="Tổng tiền phòng" v={b.room_total === null ? 'chưa lấy' : money(b.room_total)} />
            <Field k="Tạo bởi" v={`${b.created_by ?? '—'} · ${dateTime(b.created_at)}`} />
            {b.country && <Field k="Quốc gia" v={b.country} />}
            {b.cancelled_at && <Field k="Huỷ lúc" v={`${dateTime(b.cancelled_at)} ${b.cancel_reason ?? ''}`} />}
          </dl>
          {(b.note || b.reservation_note) && (
            <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
              {b.note && <div>Ghi chú phòng: {b.note}</div>}
              {b.reservation_note && <div>Ghi chú đặt phòng: {b.reservation_note}</div>}
            </div>
          )}
          {b.nightsDetail?.length > 0 && (
            <div>
              <div className="label">Tiền phòng theo đêm</div>
              <div className="flex flex-wrap gap-1.5">
                {b.nightsDetail.map((n: any) => (
                  <span key={n.night} className={`rounded-md px-2 py-1 text-xs ${n.amount ? 'bg-slate-100 text-slate-700' : 'bg-amber-50 text-amber-700'}`}>
                    {n.night.slice(8, 10)}/{n.night.slice(5, 7)}: {n.amount ? money(n.amount) : '0'}
                  </span>
                ))}
              </div>
            </div>
          )}
          {b.events?.length > 0 && (
            <div>
              <div className="label">Lịch sử thay đổi (từ khi đồng bộ)</div>
              <ul className="space-y-1 text-xs text-slate-600">
                {b.events.map((e: any) => (
                  <li key={e.id}>
                    <span className="text-slate-400">{dateTime(e.at)}</span> {EVENT_META[e.kind]?.icon} {e.summary}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-xs text-slate-400">Dữ liệu chỉ đọc từ ezCloud. Sửa booking trên ezCloud, hệ thống tự cập nhật sau lượt đồng bộ kế tiếp.</p>
        </div>
      )}
    </Modal>
  )
}

function Field({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-slate-400">{k}</dt>
      <dd className="font-medium text-slate-800">{v ?? '—'}</dd>
    </div>
  )
}

// Thanh % đơn giản
export function Bar({ value, max, className = 'bg-brand-500' }: { value: number; max: number; className?: string }) {
  const w = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
      <div className={`h-full rounded-full ${className}`} style={{ width: `${w}%` }} />
    </div>
  )
}

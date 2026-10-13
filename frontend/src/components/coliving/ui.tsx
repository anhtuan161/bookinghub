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
  ezUrl,
  doCheckin,
  getCheckinPreview,
  setPrice,
  type CheckinPreview,
  type PricePreview,
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
      {state.windowDays ? <span>Phạm vi: booking có ngày đi trong {state.windowDays} ngày qua trở đi (cũ hơn giữ bản đã lưu, không cập nhật)</span> : null}
      {state.ezcloud.lastError && <span>Lỗi gần nhất: {state.ezcloud.lastError}</span>}
      {manage && (state.stale || state.ezcloud.lastError) && (
        <Link to="/coliving/sync" className="font-semibold underline">
          Kiểm tra kết nối
        </Link>
      )}
    </div>
  )
}

// Nút mở booking trên ezCloud (tab mới). Sửa trên ezCloud → đồng bộ lại sau ≤ 15 phút hoặc "Đồng bộ ngay".
export function EzLink({ id, label = false, className = '' }: { id: number; label?: boolean; className?: string }) {
  return (
    <a
      href={ezUrl(id)}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      title="Mở booking này trên ezCloud"
      className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-brand-600 hover:bg-brand-50 ${className}`}
    >
      {label ? 'Mở trên ezCloud' : 'ezCloud'} ↗
    </a>
  )
}

// Bảng booking gọn (dùng ở Tổng quan)
export function BookingList({ rows, onOpen, empty, showDates = true }: { rows: ClBooking[]; onOpen: (id: number) => void; empty: string; showDates?: boolean }) {
  if (!rows.length) return <Empty>{empty}</Empty>
  return (
    <ul className="divide-y divide-slate-100">
      {rows.map((b) => (
        <li key={b.id} className="flex items-center hover:bg-slate-50">
          <button onClick={() => onOpen(b.id)} className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-4 pr-2 text-left">
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
          <EzLink id={b.id} className="mr-2" />
        </li>
      ))}
    </ul>
  )
}

// Chi tiết 1 booking (modal)
export function BookingModal({ id, onClose, onChanged }: { id: number | null; onClose: () => void; onChanged?: () => void }) {
  const { user } = useSession()
  const [b, setB] = useState<any>(null)
  const [err, setErr] = useState('')
  const [writable, setWritable] = useState(false)
  const reload = () => {
    if (id) getBooking(id).then(setB).catch((e) => setErr(e.message))
  }
  useEffect(() => {
    setB(null)
    setErr('')
    reload()
  }, [id])
  useEffect(() => {
    if (id && can(user, 'coliving.write')) getStatus().then((s) => setWritable(!!s.writesEnabled)).catch(() => {})
  }, [id, user])
  return (
    <Modal open={!!id} title={b ? `Booking #${b.number ?? ''} ${b.code ? `· ${b.code}` : ''}` : 'Booking'} onClose={onClose} width="max-w-2xl">
      {err && <ErrorBox msg={err} />}
      {!b && !err && <div className="text-sm text-slate-400">Đang tải…</div>}
      {b && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <a href={ezUrl(b.id)} target="_blank" rel="noreferrer" className="btn-primary btn-sm order-last ml-auto">
              Mở trên ezCloud ↗
            </a>
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
            <Field k="Đến" v={b.pms_arrival_date && b.pms_arrival_date !== b.arrival_date ? `${dmy(b.arrival_date)} (ezCloud ghi ${dateTime(b.arrival_at)} do check-in muộn)` : dateTime(b.arrival_at)} />
            <Field k="Đi" v={dateTime(b.departure_at)} />
            <Field k="Số đêm" v={b.nights} />
            <Field k="Loại giá" v={b.rate_plan} />
            <Field k="Giá/đêm (ezCloud)" v={money(b.price)} />
            <Field k="Tổng tiền phòng" v={b.room_total === null ? 'chưa lấy' : money(b.room_total)} />
            {b.services_total ? <Field k="Dịch vụ" v={money(b.services_total)} /> : null}
            <Field k="Đã thu" v={b.paid_total === null || b.paid_total === undefined ? '—' : money(b.paid_total)} />
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
          {can(user, 'coliving.write') && writable && (
            <WritePanel
              b={b}
              onDone={() => {
                reload()
                onChanged?.()
              }}
            />
          )}
          {(b.services?.length > 0 || b.payments?.length > 0) && (
            <div className="grid gap-4 sm:grid-cols-2">
              {b.services?.length > 0 && (
                <div>
                  <div className="label">Dịch vụ</div>
                  <ul className="space-y-1 text-xs">
                    {b.services.map((x: any) => (
                      <li key={x.id} className={`flex justify-between gap-2 ${x.deleted ? 'text-slate-300 line-through' : 'text-slate-600'}`}>
                        <span>
                          {x.item_name || x.name}
                          {x.is_room && <span className="ml-1 text-amber-600">(tiền phòng)</span>}
                        </span>
                        <span className="tabular-nums">{money(x.total)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {b.payments?.length > 0 && (
                <div>
                  <div className="label">Đã thu</div>
                  <ul className="space-y-1 text-xs">
                    {b.payments.map((p: any) => (
                      <li key={p.id} className={`flex justify-between gap-2 ${p.deleted ? 'text-slate-300 line-through' : 'text-slate-600'}`}>
                        <span>
                          {dateTime(p.paid_at)} · {p.type_name === 'REFUND' ? 'Hoàn' : 'Thu'}
                          {p.created_by ? ` · ${p.created_by}` : ''}
                        </span>
                        <span className="tabular-nums">{money(p.amount)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
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
          <p className="text-xs text-slate-400">Dữ liệu chỉ đọc từ ezCloud. Bấm “Mở trên ezCloud” để sửa (cần đang đăng nhập ezCloud trên trình duyệt này); hệ thống tự cập nhật sau ≤ 15 phút, hoặc bấm “Đồng bộ ngay” ở trang Kết nối ezCloud.</p>
        </div>
      )}
    </Modal>
  )
}

// Thao tác GHI lên ezCloud (quyền coliving.write). Luôn xem trước → xác nhận → server đọc lại để kiểm tra.
function WritePanel({ b, onDone }: { b: any; onDone: () => void }) {
  const [tab, setTab] = useState<'price' | 'checkin' | null>(null)
  const [mode, setMode] = useState<'total' | 'month' | 'night'>((b.nights ?? 0) >= 7 ? 'total' : 'night')
  const [amount, setAmount] = useState('')
  const [fromNight, setFromNight] = useState('')
  const [preview, setPreview] = useState<PricePreview | null>(null)
  const [ci, setCi] = useState<CheckinPreview | null>(null)
  const [agree, setAgree] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const canPrice = ['BOOKED', 'CHECKIN'].includes(b.status)
  const canCheckin = b.status === 'BOOKED'
  if (!canPrice && !canCheckin) return null
  const num = Number(amount.replace(/[^0-9]/g, '') || 0)
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date())

  async function previewPrice() {
    setBusy(true)
    setMsg(null)
    try {
      const r = await setPrice(b.id, { mode, amount: num, fromNight: fromNight || undefined, dryRun: true })
      setPreview(r.preview)
    } catch (e: any) {
      setMsg({ ok: false, text: e.message })
    } finally {
      setBusy(false)
    }
  }

  async function sendPrice() {
    if (!preview) return
    if (!confirm(`Cập nhật giá ${preview.changed} đêm lên ezCloud? Tổng tiền phòng ${money(preview.oldTotal)} → ${money(preview.newTotal)}`)) return
    setBusy(true)
    setMsg(null)
    try {
      const r = await setPrice(b.id, { mode, amount: num, fromNight: fromNight || undefined })
      setMsg({ ok: true, text: `Đã cập nhật giá ${r.preview.changed} đêm trên ezCloud (đã đọc lại kiểm tra). Tổng tiền phòng: ${money(r.preview.newTotal)}` })
      setPreview(null)
      onDone()
    } catch (e: any) {
      setMsg({ ok: false, text: e.message })
    } finally {
      setBusy(false)
    }
  }

  async function openCheckin() {
    setTab('checkin')
    setMsg(null)
    setAgree(false)
    setCi(null)
    try {
      setCi(await getCheckinPreview(b.id))
    } catch (e: any) {
      setMsg({ ok: false, text: e.message })
    }
  }

  async function sendCheckin() {
    setBusy(true)
    setMsg(null)
    try {
      const r = await doCheckin(b.id)
      setMsg({ ok: true, text: `Đã check-in trên ezCloud${r.extra ? ` — ${r.extra.RoomExtraServiceDescription}: ${money(r.extra.Amount)}` : ''}` })
      setCi(null)
      onDone()
    } catch (e: any) {
      setMsg({ ok: false, text: e.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl border border-brand-200 bg-brand-50/40 p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-brand-800">Cập nhật lên ezCloud</span>
        {canPrice && (
          <button
            className={tab === 'price' ? 'btn-primary btn-sm' : 'btn-ghost btn-sm'}
            onClick={() => {
              setTab('price')
              setMsg(null)
            }}
          >
            💰 Nhập giá
          </button>
        )}
        {canCheckin && (
          <button className={tab === 'checkin' ? 'btn-primary btn-sm' : 'btn-ghost btn-sm'} onClick={openCheckin}>
            🛎️ Check-in
          </button>
        )}
      </div>

      {tab === 'price' && (
        <div className="space-y-3 text-sm">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="label">Kiểu giá</label>
              <select
                className="input"
                value={mode}
                onChange={(e) => {
                  setMode(e.target.value as 'total' | 'month' | 'night')
                  setPreview(null)
                }}
              >
                <option value="total">Tổng tiền cả booking (chia đều các đêm)</option>
                <option value="month">Giá tháng (chia theo số ngày của tháng)</option>
                <option value="night">Giá 1 đêm</option>
              </select>
            </div>
            <div>
              <label className="label">{mode === 'total' ? (fromNight ? 'Tổng tiền các đêm từ ngày chọn' : 'Tổng tiền cả booking') : mode === 'month' ? 'Tiền thuê / tháng' : 'Giá / đêm'} (đ)</label>
              <input
                className="input"
                inputMode="numeric"
                value={num ? num.toLocaleString('vi-VN') : ''}
                onChange={(e) => {
                  setAmount(e.target.value)
                  setPreview(null)
                }}
                placeholder={mode === 'night' ? 'vd 450.000' : 'vd 6.000.000'}
              />
            </div>
            <div>
              <label className="label">Chỉ đổi từ đêm (tuỳ chọn)</label>
              <input
                type="date"
                className="input"
                value={fromNight}
                onChange={(e) => {
                  setFromNight(e.target.value)
                  setPreview(null)
                }}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-ghost btn-sm" disabled={busy || !num} onClick={previewPrice}>
              Xem trước
            </button>
            {preview && (
              <button className="btn-primary btn-sm" disabled={busy || !preview.changed} onClick={sendPrice}>
                {busy ? 'Đang gửi…' : 'Gửi lên ezCloud'}
              </button>
            )}
          </div>
          {preview && (
            <div className="rounded-lg bg-white p-3 text-xs text-slate-600 ring-1 ring-slate-200">
              Sẽ đổi <b>{preview.changed}/{preview.nights}</b> đêm ({dmy(preview.from)} → {dmy(preview.to)}), giá/đêm{' '}
              <b>{preview.perNight.map((v) => money(v)).join(' / ') || '—'}</b>. Tổng tiền phòng: {money(preview.oldTotal)} →{' '}
              <b>{money(preview.newTotal)}</b>.
              {b.status === 'BOOKED' && b.arrival_date < today && (
                <div className="mt-1 text-amber-700">Booking đã qua ngày đến: nhập giá TRƯỚC khi check-in để các đêm đã qua được tính đúng tiền.</div>
              )}
            </div>
          )}
        </div>
      )}

      {tab === 'checkin' && (
        <div className="space-y-3 text-sm">
          {!ci ? (
            <div className="text-xs text-slate-400">{msg ? '' : 'Đang kiểm tra trên ezCloud…'}</div>
          ) : (
            <>
              <ul className="list-disc space-y-1 pl-5 text-xs text-slate-600">
                {!ci.roomAssigned && <li className="text-rose-600">Chưa gán phòng: gán phòng trên ezCloud trước.</li>}
                {ci.pastNights > 0 ? (
                  <li className="text-amber-700">
                    Đã qua ngày đến: ezCloud sẽ <b>dời ngày đến sang lúc check-in</b>. {ci.pastNights} đêm đã qua ({dmy(ci.pastFrom)} → {dmy(ci.pastTo)}, tổng{' '}
                    <b>{money(ci.pastAmount)}</b>){' '}
                    {ci.noshowOff
                      ? 'sẽ không còn được tính.'
                      : 'được chuyển thành dịch vụ “Phòng cả ngày …” (giống web ezCloud). Hệ thống vẫn tính các đêm này là có khách.'}
                  </li>
                ) : (
                  <li>Check-in đúng ngày, không có đêm nào bị dời.</li>
                )}
                {ci.allZero && <li className="text-rose-600">Booking đang có giá 0đ: nên “Nhập giá” trước rồi mới check-in.</li>}
                <li>Nếu phòng đang bị booking cũ chiếm (chưa check-out), ezCloud sẽ từ chối và hệ thống chỉ ra booking đó.</li>
              </ul>
              <label className="flex items-center gap-2 text-xs text-slate-700">
                <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> Tôi đã kiểm tra, check-in booking này trên ezCloud
              </label>
              <button className="btn-primary btn-sm" disabled={busy || !agree || !ci.roomAssigned} onClick={sendCheckin}>
                {busy ? 'Đang check-in…' : 'Check-in trên ezCloud'}
              </button>
            </>
          )}
        </div>
      )}

      {msg && msg.text && (
        <div className={`mt-3 rounded-lg px-3 py-2 text-xs ${msg.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}>{msg.text}</div>
      )}
    </div>
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

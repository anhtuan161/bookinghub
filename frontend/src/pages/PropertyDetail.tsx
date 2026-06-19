import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import Modal from '../components/Modal'
import { createBookingRequest, getAvailability, getProperty } from '../lib/api'
import { getUser } from '../lib/auth'
import { showToast } from '../lib/toast'
import type { AvailabilityDay, Channel, Property } from '../lib/types'
import {
  STATUS_META,
  WEEKDAYS_VN,
  fmtISO,
  fmtVND,
  freshness,
  gradientFor,
  initials,
  monthMatrix,
  shortPrice,
  startOfToday,
} from '../lib/utils'

export default function PropertyDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [sp] = useSearchParams()
  const [property, setProperty] = useState<Property>()
  const today = startOfToday()
  const [cursor, setCursor] = useState({ y: today.getFullYear(), m: today.getMonth() })
  const [days, setDays] = useState<AvailabilityDay[]>([])
  const [bookOpen, setBookOpen] = useState(sp.get('book') === '1')

  useEffect(() => {
    if (id) getProperty(id).then(setProperty)
  }, [id])

  useEffect(() => {
    if (id) getAvailability(id, cursor.y, cursor.m).then(setDays)
  }, [id, cursor])

  const dayMap = useMemo(() => {
    const m: Record<string, AvailabilityDay> = {}
    days.forEach((d) => (m[d.date] = d))
    return m
  }, [days])

  if (!property) return <div className="text-slate-400">Đang tải…</div>

  const fr = freshness(property.lastSyncedAt)
  const cells = monthMatrix(cursor.y, cursor.m)
  const canGoPrev = cursor.y > today.getFullYear() || cursor.m > today.getMonth()

  function shiftMonth(delta: number) {
    setCursor((c) => {
      const d = new Date(c.y, c.m + delta, 1)
      return { y: d.getFullYear(), m: d.getMonth() }
    })
  }

  return (
    <div className="mx-auto max-w-5xl">
      <button onClick={() => navigate(-1)} className="mb-4 text-sm font-medium text-slate-500 hover:text-slate-800">
        ← Quay lại
      </button>

      <div className="card overflow-hidden">
        <div className="flex h-36 items-center justify-center text-4xl font-extrabold text-white" style={gradientFor(property.id)}>
          {initials(property.name)}
        </div>
        <div className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              {property.sourceSheetUrl ? (
                <a
                  href={property.sourceSheetUrl}
                  target="_blank"
                  rel="noreferrer"
                  title="Mở Google Sheet gốc"
                  className="text-2xl font-extrabold tracking-tight text-slate-800 hover:text-brand-700 hover:underline"
                >
                  {property.name} <span className="align-middle text-base text-slate-400">↗</span>
                </a>
              ) : (
                <h1 className="text-2xl font-extrabold tracking-tight text-slate-800">{property.name}</h1>
              )}
              <div className="mt-1 flex flex-wrap items-center gap-2 text-slate-500">
                <span>{property.address}</span>
                {property.mapUrl && (
                  <a href={property.mapUrl} target="_blank" rel="noreferrer" className="text-sm font-medium text-brand-600 hover:underline">
                    🗺️ Xem bản đồ
                  </a>
                )}
              </div>
            </div>
            <button onClick={() => setBookOpen(true)} className="btn-primary">
              Tạo yêu cầu giữ phòng
            </button>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
            <Info label="Sức chứa" value={`${property.capacityStandard}–${property.capacityMax} khách`} />
            <Info label="Phòng ngủ" value={`${property.bedrooms} PN`} />
            <Info label="Giá cơ bản" value={fmtVND(property.basePrice)} />
            <Info label="Chủ nhà" value={property.ownerName} />
          </div>

          <div className="mt-4 flex flex-wrap gap-1.5">
            {property.amenities.map((a) => (
              <span key={a} className="badge bg-brand-50 text-brand-700">{a}</span>
            ))}
            {property.rules.map((r) => (
              <span key={r} className="badge bg-amber-50 text-amber-700">{r}</span>
            ))}
          </div>

          {property.description && (
            <div className="mt-4 whitespace-pre-line rounded-lg bg-slate-50 px-3 py-2.5 text-sm text-slate-600">
              {property.description}
            </div>
          )}

          {property.extraFeeNote && (
            <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-700">💡 {property.extraFeeNote}</div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className={`h-2 w-2 rounded-full ${fr.dot}`} />
            {fr.label}
            <span className="text-slate-300">•</span>
            <a href={property.sourceSheetUrl} target="_blank" className="font-medium text-brand-600 hover:underline">
              Mở sheet gốc
            </a>
          </div>
          {fr.stale && (
            <div className="mt-3 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700">
              Dữ liệu hơi cũ — nên bấm “Đồng bộ căn này” và xác nhận lại với chủ nhà trước khi chốt.
            </div>
          )}
        </div>
      </div>

      {/* Lịch */}
      <div className="card mt-6 p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800">
            Lịch tháng {cursor.m + 1}/{cursor.y}
          </h2>
          <div className="flex gap-2">
            <button onClick={() => shiftMonth(-1)} disabled={!canGoPrev} className="btn-ghost btn-sm disabled:opacity-40">
              ← Tháng trước
            </button>
            <button onClick={() => shiftMonth(1)} className="btn-ghost btn-sm">
              Tháng sau →
            </button>
          </div>
        </div>

        <div className="mb-3 flex flex-wrap gap-4 text-xs">
          {(['available', 'booked', 'blocked', 'unknown'] as const).map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5">
              <span className={`h-3 w-3 rounded ${STATUS_META[s].dot}`} />
              {STATUS_META[s].label}
            </span>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1.5">
          {WEEKDAYS_VN.map((w) => (
            <div key={w} className="py-1 text-center text-xs font-semibold text-slate-400">{w}</div>
          ))}
          {cells.map((d, i) => {
            if (!d) return <div key={i} />
            const iso = fmtISO(d)
            const past = d < today
            const day = dayMap[iso]
            const meta = day ? STATUS_META[day.status] : null
            return (
              <div
                key={i}
                title={day ? `${meta?.label} • ${fmtVND(day.price)}${day.note ? ' • ' + day.note : ''}` : ''}
                className={`min-h-[60px] rounded-lg border p-1.5 text-xs transition ${
                  past ? 'border-slate-100 bg-slate-50 text-slate-300' : `${meta?.cell ?? ''} hover:ring-2 hover:ring-brand-200`
                }`}
              >
                <div className="font-bold">{d.getDate()}</div>
                {!past && day && <div className="mt-0.5 font-medium">{shortPrice(day.price)}</div>}
              </div>
            )
          })}
        </div>
      </div>

      <BookModal
        open={bookOpen}
        property={property}
        defaults={{
          checkin: sp.get('checkin') || '',
          checkout: sp.get('checkout') || '',
          guests: Number(sp.get('guests') || property.capacityStandard),
        }}
        onClose={() => setBookOpen(false)}
      />
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2.5">
      <div className="text-xs text-slate-400">{label}</div>
      <div className="font-semibold text-slate-700">{value}</div>
    </div>
  )
}

function BookModal({
  open,
  property,
  defaults,
  onClose,
}: {
  open: boolean
  property: Property
  defaults: { checkin: string; checkout: string; guests: number }
  onClose: () => void
}) {
  const [form, setForm] = useState({
    customerName: '',
    customerContact: '',
    channel: 'facebook' as Channel,
    checkin: defaults.checkin,
    checkout: defaults.checkout,
    guests: defaults.guests,
    quotedPrice: property.basePrice,
    note: '',
  })

  useEffect(() => {
    setForm((f) => ({ ...f, checkin: defaults.checkin, checkout: defaults.checkout, guests: defaults.guests }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaults.checkin, defaults.checkout, defaults.guests])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.customerName || !form.checkin || !form.checkout) {
      alert('Nhập tên khách và ngày nhận/trả phòng')
      return
    }
    await createBookingRequest({
      propertyId: property.id,
      propertyName: property.name,
      assignee: getUser() || 'Nhân viên',
      ...form,
    })
    showToast('Đã tạo yêu cầu giữ phòng')
    onClose()
  }

  return (
    <Modal open={open} title="Tạo yêu cầu giữ phòng" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div className="text-sm text-slate-500">Villa: <b className="text-slate-800">{property.name}</b></div>
        <Row label="Tên khách">
          <input className="input" value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} />
        </Row>
        <Row label="Liên hệ (nick/SĐT)">
          <input className="input" value={form.customerContact} onChange={(e) => setForm({ ...form, customerContact: e.target.value })} />
        </Row>
        <Row label="Kênh">
          <select className="input" value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value as Channel })}>
            <option value="facebook">Facebook</option>
            <option value="instagram">Instagram</option>
            <option value="zalo">Zalo</option>
            <option value="website">Website</option>
            <option value="other">Khác</option>
          </select>
        </Row>
        <div className="grid grid-cols-2 gap-3">
          <Row label="Ngày nhận">
            <input type="date" className="input" value={form.checkin} onChange={(e) => setForm({ ...form, checkin: e.target.value })} />
          </Row>
          <Row label="Ngày trả">
            <input type="date" className="input" value={form.checkout} onChange={(e) => setForm({ ...form, checkout: e.target.value })} />
          </Row>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Row label="Số khách">
            <input type="number" className="input" value={form.guests} onChange={(e) => setForm({ ...form, guests: Number(e.target.value) })} />
          </Row>
          <Row label="Giá báo khách/đêm">
            <input type="number" className="input" value={form.quotedPrice} onChange={(e) => setForm({ ...form, quotedPrice: Number(e.target.value) })} />
          </Row>
        </div>
        <Row label="Ghi chú">
          <textarea className="input" rows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </Row>
        <div className="rounded-lg bg-amber-50 px-3 py-2.5 text-xs text-amber-700">
          Lưu ý: hệ thống chỉ giữ chỗ tạm. Nhớ xác nhận lại với chủ nhà trước khi thu cọc.
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-ghost">Hủy</button>
          <button className="btn-primary">Lưu yêu cầu</button>
        </div>
      </form>
    </Modal>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
    </label>
  )
}

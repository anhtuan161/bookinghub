// =============================================================
//  Đồng bộ ezCloud → App DB (chỉ đọc ezCloud).
//  Mỗi lượt:
//   1. Lấy TOÀN BỘ booking (GetFrontOfficeBooking, ~600 dòng, 1-2 request) → upsert cl_bookings,
//      so sánh hash → ghi cl_booking_events (mới / đổi / huỷ / bị xoá).
//   2. Lấy tiền phòng theo đêm (GetRoomChargesList) cho booking mới/đổi + booking đang/sắp ở (1 lần/ngày).
//   3. Sơ đồ phòng hôm nay (room-view) → cl_rooms; số liệu Dashboard ezCloud → cl_daily_kpi.
//  Lượt đầu tiên (DB trống) = baseline: không sinh sự kiện "mới".
// =============================================================
import crypto from 'node:crypto'
import { config } from '../config.js'
import { appPool, q, q1, tx } from '../app/db.js'
import { EzAuthError, EzClient, patchStatus } from './ezcloud.js'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const dateFmt = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: config.timezone, year: 'numeric', month: '2-digit', day: '2-digit' })
export const localDate = (d: Date | string) => dateFmt().format(typeof d === 'string' ? new Date(d) : d)
export const todayLocal = () => localDate(new Date())

const str = (v: any) => (v === null || v === undefined || v === '' ? null : String(v))
const num = (v: any) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v))
const ts = (v: any) => (v ? new Date(v).toISOString() : null)

interface Mapped {
  reservation_room_id: number
  reservation_id: number | null
  reservation_number: number | null
  reservation_code: string | null
  status: string | null
  arrival_at: string | null
  departure_at: string | null
  arrival_date: string | null
  departure_date: string | null
  nights: number | null
  room_id: number | null
  room_name: string | null
  room_type: string | null
  room_price_name: string | null
  source_name: string | null
  market_name: string | null
  company_name: string | null
  ota_ref: string | null
  cm_booking_id: string | null
  price: number | null
  adults: number | null
  children: number | null
  guest_name: string | null
  guest_phone: string | null
  guest_email: string | null
  guest_country: string | null
  booking_note: string | null
  reservation_note: string | null
  created_by: string | null
  created_at_pms: string | null
  cancelled_at: string | null
  cancel_reason: string | null
  raw: any
  hash: string
}

// Các trường dùng để phát hiện thay đổi + hiển thị trong thông báo.
const WATCH: (keyof Mapped)[] = [
  'status', 'arrival_date', 'departure_date', 'room_id', 'room_name', 'price', 'nights', 'guest_name',
  'source_name', 'ota_ref', 'room_price_name', 'adults', 'children', 'cancelled_at',
]

// Không lưu giấy tờ tuỳ thân / ngày sinh / địa chỉ khách (không cần cho báo cáo).
const DROP = ['IdentityNumber', 'PassportNumber', 'Birthday', 'Address', 'Ward', 'District', 'Province']
const slim = (r: any) => Object.fromEntries(Object.entries(r).filter(([k]) => !DROP.includes(k)))

function mapRow(r: any): Mapped {
  const m: any = {
    reservation_room_id: Number(r.ReservationRoomId),
    reservation_id: num(r.ReservationId),
    reservation_number: num(r.ReservationNumber),
    reservation_code: str(r.ReservationCode),
    status: str(r.BookingStatus),
    arrival_at: ts(r.ArrivalDate),
    departure_at: ts(r.DepartureDate),
    arrival_date: r.ArrivalDate ? localDate(r.ArrivalDate) : null,
    departure_date: r.DepartureDate ? localDate(r.DepartureDate) : null,
    nights: num(r.Nights),
    room_id: num(r.RoomId),
    room_name: str(r.RoomName),
    room_type: str(r.RoomTypeName),
    room_price_name: str(r.RoomPriceName),
    source_name: str(r.SourceName),
    market_name: str(r.MarketName),
    company_name: str(r.CompanyName),
    ota_ref: str(r.CMChannelRef),
    cm_booking_id: str(r.CMBookingId),
    price: num(r.Price),
    adults: num(r.Adults),
    children: num(r.Child),
    guest_name: str(r.Fullname),
    guest_phone: str(r.Mobile),
    guest_email: str(r.Email),
    guest_country: str(r.CountryName),
    booking_note: str(r.BookingNote),
    reservation_note: str(r.ReservationNote),
    created_by: str(r.CreatedUserName),
    created_at_pms: ts(r.CreatedDate),
    cancelled_at: ts(r.CancelDate),
    cancel_reason: str(r.CancelReason),
    raw: slim(r),
  }
  // hash trên toàn bộ dòng gốc → mọi thay đổi đều được cập nhật; sự kiện chỉ sinh từ các trường WATCH.
  m.hash = crypto.createHash('sha1').update(JSON.stringify(r)).digest('hex')
  return m as Mapped
}

const LABEL: Record<string, string> = {
  status: 'Trạng thái', arrival_date: 'Ngày đến', departure_date: 'Ngày đi', room_name: 'Phòng', price: 'Giá/đêm',
  nights: 'Số đêm', guest_name: 'Khách', source_name: 'Nguồn', ota_ref: 'Mã OTA', room_price_name: 'Loại giá',
  adults: 'Người lớn', children: 'Trẻ em',
}

function describe(b: Partial<Mapped>) {
  return `#${b.reservation_number ?? '?'} ${b.room_name ?? 'chưa gán phòng'} ${b.arrival_date ?? ''}→${b.departure_date ?? ''} ${b.guest_name ?? ''} (${b.source_name ?? 'trực tiếp'})`.trim()
}

export interface SyncStats {
  fetched: number
  inserted: number
  updated: number
  unchanged: number
  removed: number
  events: number
  chargesFetched: number
  chargesFailed: number
  rooms: number
  apiCalls: number
  baseline: boolean
  ms: number
}

const COLS: (keyof Mapped)[] = [
  'reservation_room_id', 'reservation_id', 'reservation_number', 'reservation_code', 'status', 'arrival_at', 'departure_at',
  'arrival_date', 'departure_date', 'nights', 'room_id', 'room_name', 'room_type', 'room_price_name', 'source_name',
  'market_name', 'company_name', 'ota_ref', 'cm_booking_id', 'price', 'adults', 'children', 'guest_name', 'guest_phone',
  'guest_email', 'guest_country', 'booking_note', 'reservation_note', 'created_by', 'created_at_pms', 'cancelled_at',
  'cancel_reason', 'raw', 'hash',
]

export async function runSync(trigger: string): Promise<SyncStats> {
  // Khoá phiên (advisory) phải giữ trên CÙNG một kết nối → dùng client riêng.
  const lockConn = await appPool().connect()
  const got = (await lockConn.query('select pg_try_advisory_lock(777001) as ok')).rows[0]?.ok
  if (!got) {
    lockConn.release()
    throw new Error('Đang có lượt đồng bộ khác chạy')
  }
  try {
    return await runSyncLocked(trigger)
  } finally {
    await lockConn.query('select pg_advisory_unlock(777001)').catch(() => {})
    lockConn.release()
  }
}

async function runSyncLocked(trigger: string): Promise<SyncStats> {
  const run = await q1<any>('insert into cl_sync_runs(trigger) values($1) returning id', [trigger])
  const t0 = Date.now()
  const stats: SyncStats = {
    fetched: 0, inserted: 0, updated: 0, unchanged: 0, removed: 0, events: 0,
    chargesFetched: 0, chargesFailed: 0, rooms: 0, apiCalls: 0, baseline: false, ms: 0,
  }
  let client: EzClient | null = null
  try {
    client = await EzClient.fromStore()

    // ---------- 1. Booking ----------
    // Phạm vi: ngày đi >= hôm nay - EZCLOUD_WINDOW_DAYS. Booking cũ hơn giữ nguyên trong DB, không cập nhật.
    const windowStart = addDay(todayLocal(), -Math.max(1, config.ezcloudWindowDays))
    const rows = (await client.bookingsDepartingFrom(windowStart)).map(mapRow).filter((m) => m.reservation_room_id)
    stats.fetched = rows.length
    if (rows.length === 0) throw new Error('ezCloud trả 0 booking — dừng để tránh đánh dấu xoá nhầm')

    const existing = new Map<number, any>()
    for (const r of await q<any>(`select ${WATCH.join(',')}, reservation_room_id, reservation_number, hash, missing_since from cl_bookings`))
      existing.set(Number(r.reservation_room_id), r)
    stats.baseline = existing.size === 0
    // chỉ xét "bị xoá" với booking nằm trong phạm vi đồng bộ
    const inWindow = (r: any) => !r.departure_date || String(r.departure_date) >= windowStart

    await tx(async (c) => {
      for (const m of rows) {
        const old = existing.get(m.reservation_room_id)
        const values = COLS.map((k) => (k === 'raw' ? JSON.stringify(m.raw) : (m as any)[k]))
        if (!old) {
          await c.query(
            `insert into cl_bookings(${COLS.join(',')}) values(${COLS.map((_, i) => `$${i + 1}`).join(',')})`,
            values,
          )
          stats.inserted++
          if (!stats.baseline && m.status !== 'CANCELLED') {
            await c.query('insert into cl_booking_events(reservation_room_id, kind, summary) values($1,$2,$3)', [
              m.reservation_room_id, 'new', `Booking mới: ${describe(m)}`,
            ])
            stats.events++
          }
          continue
        }
        if (old.hash === m.hash && !old.missing_since) {
          stats.unchanged++
          continue
        }
        await c.query(
          `update cl_bookings set ${COLS.slice(1).map((k, i) => `${k} = $${i + 2}`).join(', ')},
             updated_at = now(), last_seen_at = now(), missing_since = null
           where reservation_room_id = $1`,
          values,
        )
        stats.updated++
        // so sánh trường → sự kiện
        const changes: Record<string, { from: any; to: any }> = {}
        for (const k of WATCH) {
          const a = old[k] instanceof Date ? localDate(old[k]) : old[k]
          const b = (m as any)[k]
          const na = a === null || a === undefined ? null : String(a)
          const nb = b === null || b === undefined ? null : String(b)
          const same = k === 'price' ? Number(a ?? 0) === Number(b ?? 0) : na === nb
          if (!same && k !== 'cancelled_at') changes[k] = { from: a ?? null, to: b ?? null }
        }
        let kind = 'changed'
        if (changes.status && m.status === 'CANCELLED') kind = 'cancelled'
        else if (old.missing_since) kind = 'restored'
        else if (Object.keys(changes).length === 1 && changes.status) kind = 'status'
        if (Object.keys(changes).length === 0 && !old.missing_since) continue
        const detail = Object.entries(changes)
          .map(([k, v]) => `${LABEL[k] ?? k}: ${v.from ?? '—'} → ${v.to ?? '—'}`)
          .join('; ')
        const prefix = kind === 'cancelled' ? 'Huỷ' : kind === 'status' ? 'Đổi trạng thái' : kind === 'restored' ? 'Xuất hiện lại' : 'Thay đổi'
        await c.query('insert into cl_booking_events(reservation_room_id, kind, summary, changes) values($1,$2,$3,$4)', [
          m.reservation_room_id, kind, `${prefix}: ${describe(m)}${detail ? ' — ' + detail : ''}`, JSON.stringify(changes),
        ])
        stats.events++
      }

      // Booking không còn trên ezCloud (bị xoá) → đánh dấu, không xoá dữ liệu.
      const seen = new Set(rows.map((r) => r.reservation_room_id))
      for (const [id, old] of existing) {
        if (seen.has(id) || old.missing_since || !inWindow(old)) continue
        await c.query('update cl_bookings set missing_since = now() where reservation_room_id = $1', [id])
        await c.query('insert into cl_booking_events(reservation_room_id, kind, summary) values($1,$2,$3)', [
          id, 'removed', `Không còn trên ezCloud (bị xoá?): ${describe(old)}`,
        ])
        stats.removed++
        stats.events++
      }
    })

    // ---------- 2. Tiền phòng theo đêm + dịch vụ + khoản thu ----------
    const today = todayLocal()
    const need = await q<any>(
      `select reservation_room_id, hash from cl_bookings
        where missing_since is null
          and departure_date >= $3::date
          and (charges_hash is distinct from hash
               or details_synced_at is null
               or (coalesce(status,'') not in ('CANCELLED','NOSHOW') and departure_date >= $1::date - 7
                   and (charges_synced_at is null or charges_synced_at < now() - interval '20 hours')))
        order by departure_date desc nulls last limit $2`,
      [today, config.ezcloudChargesPerRun, windowStart],
    )
    for (const b of need) {
      try {
        await refreshBookingDetails(client, Number(b.reservation_room_id), b.hash)
        stats.chargesFetched++
      } catch (e) {
        if (e instanceof EzAuthError) throw e
        stats.chargesFailed++
        console.error('[sync] details', b.reservation_room_id, (e as Error).message)
      }
      await sleep(config.ezcloudRequestGapMs)
    }

    // ---------- 3. Sơ đồ phòng + KPI hôm nay ----------
    try {
      const rv = await client.roomView(today)
      const rooms: any[] = rv?.Data?.rooms ?? []
      if (rooms.length) {
        await tx(async (c) => {
          for (const r of rooms)
            await c.query(
              `insert into cl_rooms(room_id, name, room_type, room_type_id, floor, sort_order, house_status, room_status, reservation_type, active, updated_at)
               values($1,$2,$3,$4,$5,$6,$7,$8,$9,true,now())
               on conflict(room_id) do update set name=excluded.name, room_type=excluded.room_type, room_type_id=excluded.room_type_id,
                 floor=excluded.floor, sort_order=excluded.sort_order, house_status=excluded.house_status, room_status=excluded.room_status,
                 reservation_type=excluded.reservation_type, active=true, updated_at=now()`,
              [r.RoomId, r.RoomName, r.RoomTypeName, r.RoomTypeId, r.FloorName, r.OrderNumber ?? r.Priority ?? null, r.HouseStatus, r.RoomStatus, r.ReservationType],
            )
          await c.query('update cl_rooms set active = false where not (room_id = any($1::bigint[]))', [rooms.map((r) => r.RoomId)])
        })
        stats.rooms = rooms.length
      }
    } catch (e) {
      if (e instanceof EzAuthError) throw e
      console.error('[sync] room-view:', (e as Error).message)
    }
    try {
      const k = await client.dashboard(new Date())
      if (k)
        await q(
          `insert into cl_daily_kpi(day, data, updated_at) values($1,$2,now())
           on conflict(day) do update set data = excluded.data, updated_at = now()`,
          [today, JSON.stringify(k)],
        )
    } catch (e) {
      if (e instanceof EzAuthError) throw e
      console.error('[sync] dashboard:', (e as Error).message)
    }

    stats.apiCalls = client.calls
    stats.ms = Date.now() - t0
    await q('update cl_sync_runs set finished_at = now(), ok = true, stats = $2 where id = $1', [run.id, JSON.stringify(stats)])
    await patchStatus({ lastError: null as any, lastErrorAt: null as any })
    return stats
  } catch (e) {
    const msg = (e as Error).message
    stats.apiCalls = client?.calls ?? 0
    stats.ms = Date.now() - t0
    await q('update cl_sync_runs set finished_at = now(), ok = false, stats = $2, error = $3 where id = $1', [
      run.id, JSON.stringify(stats), msg,
    ])
    await patchStatus({ lastError: msg, lastErrorAt: new Date().toISOString() }).catch(() => {})
    throw e
  }
}

// =============================================================
//  Chi tiết 1 booking: tiền phòng từng đêm (GetRoomChargesList) + dịch vụ & khoản thu
//  (GetReservationRoomV3 → nếu có thì ProcessReservation để lấy mô tả/ngày).
//  Dịch vụ "Phòng cả ngày dd/mm/yyyy - dd/mm/yyyy" (check-in muộn / no-show) được chia đều vào các đêm đó
//  và kéo stay_from về ngày bắt đầu ở thật. Dùng chung cho đồng bộ định kỳ và sau khi GHI từ webapp.
// =============================================================
const ROOM_SVC_RE = /(\d{2})\/(\d{2})\/(\d{4})(?:\s*-\s*(\d{2})\/(\d{2})\/(\d{4}))?/
const ymd = (d: string, m: string, y: string) => `${y}-${m}-${d}`
const addDay = (iso: string, n: number) => {
  const x = new Date(iso + 'T00:00:00Z')
  x.setUTCDate(x.getUTCDate() + n)
  return x.toISOString().slice(0, 10)
}

export async function refreshBookingDetails(client: EzClient, rrId: number, hash: string | null) {
  const gap = () => sleep(config.ezcloudRequestGapMs)
  const r = await client.roomCharges(rrId)
  const list: any[] = Array.isArray(r) ? r : r?.roomCharges ?? []
  const nights = new Map<string, number>()
  for (const ch of list) {
    if (ch?.Status === false) continue
    // Giá tuần/tháng (bật trong cấu hình loại giá ezCloud): 1 khoản cho cả kỳ → chia đều các đêm StartDate..EndDate
    if ((ch?.Type === 'WEEK_PRICE' || ch?.Type === 'MONTH_PRICE') && ch?.StartDate && ch?.EndDate) {
      const from = localDate(ch.StartDate)
      const to = localDate(ch.EndDate)
      const days: string[] = []
      for (let d = from; d < to && days.length < 62; d = addDay(d, 1)) days.push(d)
      if (!days.length) days.push(from)
      const per = Math.round((Number(ch?.Value ?? 0) / days.length) * 100) / 100
      for (const d of days) nights.set(d, (nights.get(d) ?? 0) + per)
      continue
    }
    const m = /^DAY(\d{4})(\d{2})(\d{2})$/.exec(String(ch?.PriceKey ?? ''))
    const night = m ? `${m[1]}-${m[2]}-${m[3]}` : ch?.StartDate ? localDate(ch.StartDate) : null
    if (!night) continue
    nights.set(night, (nights.get(night) ?? 0) + Number(ch?.Value ?? 0))
  }

  await gap()
  const v3 = await client.reservationRoomV3(rrId)
  const hasExtra =
    (v3?.RoomExtraServicesList ?? []).some((x: any) => !x?.IsDeleted) || (v3?.PaymentsList ?? []).length > 0
  let services: any[] = []
  let payments: any[] = []
  if (hasExtra) {
    await gap()
    const pr = await client.processReservation(rrId, todayLocal())
    services = (pr?.BookingServiceList ?? []).flatMap((g: any) => g?.LstRoomExtraServiceModels ?? [])
    payments = pr?.PaymentList ?? []
  }

  const svcRows = services.map((x: any) => {
    const total = Number(x?.TotalAmount ?? Number(x?.Amount ?? 0) * Number(x?.Quantity ?? 1))
    const item = String(x?.RoomExtraServiceItemName ?? '')
    const m = ROOM_SVC_RE.exec(item)
    const isRoom = !!m && String(x?.RoomExtraServiceName ?? '') === 'EXTRA_SERVICES' && /phòng|room/i.test(item)
    const from = m ? ymd(m[1], m[2], m[3]) : null
    const to = m ? (m[4] ? ymd(m[4], m[5], m[6]) : from) : null
    return {
      id: Number(x?.RoomExtraServiceId), name: x?.RoomExtraServiceName ?? null, item, amount: Number(x?.Amount ?? 0),
      quantity: Number(x?.Quantity ?? 1), total, isRoom, from: isRoom ? from : null, to: isRoom ? to : null,
      created: x?.CreatedDate ?? null, deleted: !!x?.IsDeleted,
    }
  }).filter((x) => x.id)

  // chia tiền dịch vụ "Phòng cả ngày ..." vào từng đêm
  let stayFrom: string | null = null
  for (const sv of svcRows) {
    if (!sv.isRoom || sv.deleted || !sv.from || !sv.to || sv.to < sv.from) continue
    const days: string[] = []
    for (let d = sv.from; d <= sv.to && days.length < 400; d = addDay(d, 1)) days.push(d)
    const per = days.length ? Math.round((sv.total / days.length) * 100) / 100 : 0
    for (const d of days) nights.set(d, (nights.get(d) ?? 0) + per)
    if (!stayFrom || sv.from < stayFrom) stayFrom = sv.from
  }

  const payRows = payments.map((p: any) => ({
    id: Number(p?.PaymentId), amount: Number(p?.Amount ?? 0), paidAt: p?.CreatedDate ?? null, type: p?.PaymentTypeName ?? null,
    method: p?.PaymentMethodId ?? null, desc: p?.PaymentDescription ?? null, by: p?.UserCreated ?? null, deleted: !!p?.IsDeleted,
  })).filter((p) => p.id)

  const roomTotal = [...nights.values()].reduce((a, v) => a + v, 0)
  const servicesTotal = svcRows.filter((x) => !x.deleted).reduce((a, x) => a + x.total, 0)
  const paidTotal = payRows.filter((p) => !p.deleted).reduce((a, p) => a + p.amount, 0)

  await tx(async (c) => {
    await c.query('delete from cl_booking_nights where reservation_room_id = $1', [rrId])
    for (const [night, amount] of nights)
      await c.query('insert into cl_booking_nights(reservation_room_id, night, amount) values($1,$2,$3)', [rrId, night, amount])
    await c.query('delete from cl_booking_services where reservation_room_id = $1', [rrId])
    for (const x of svcRows)
      await c.query(
        `insert into cl_booking_services(id, reservation_room_id, name, item_name, amount, quantity, total, is_room, period_from, period_to, created_at_pms, deleted)
         values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) on conflict(id) do nothing`,
        [x.id, rrId, x.name, x.item, x.amount, x.quantity, x.total, x.isRoom, x.from, x.to, x.created, x.deleted],
      )
    await c.query('delete from cl_booking_payments where reservation_room_id = $1', [rrId])
    for (const p of payRows)
      await c.query(
        `insert into cl_booking_payments(id, reservation_room_id, amount, paid_at, type_name, method_id, description, created_by, deleted)
         values($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict(id) do nothing`,
        [p.id, rrId, p.amount, p.paidAt, p.type, p.method, p.desc, p.by, p.deleted],
      )
    await c.query(
      `update cl_bookings set charges_hash = coalesce($2, charges_hash), charges_synced_at = now(), details_synced_at = now(),
              room_total = $3, services_total = $4, paid_total = $5,
              stay_from = case when $6::date is not null and $6::date < arrival_date then $6::date else null end
        where reservation_room_id = $1`,
      [rrId, hash, roomTotal, servicesTotal, paidTotal, stayFrom],
    )
  })
  return { nights: nights.size, roomTotal, servicesTotal, paidTotal, stayFrom, v3 }
}

// =============================================================
//  Truy vấn báo cáo Thomstay Coliving (đọc từ App DB, KHÔNG gọi ezCloud).
//  Quy ước:
//   - Booking "hiệu lực" = chưa huỷ/no-show và còn trên ezCloud.
//   - Đêm ở: từ arrival_date đến trước departure_date (day-use = 1 đêm).
//   - BOOKED đã qua ngày đến vẫn tính là đang ở (lễ tân hay quên check-in) + có cảnh báo.
//   - Doanh thu = tổng tiền phòng theo đêm lấy từ ezCloud (cl_booking_nights).
// =============================================================
import { config } from '../config.js'
import { q, q1 } from '../app/db.js'
import { loadSession } from './ezcloud.js'
import { todayLocal } from './sync.js'

export const ACTIVE = `b.missing_since is null and coalesce(b.status,'') not in ('CANCELLED','NOSHOW')`
const DEP = `greatest(b.departure_date, b.arrival_date + 1)`
// Dưới mức này/đêm coi là chưa nhập giá hoặc nhập sai (vd 0đ, 1đ)
const MIN_NIGHT = 50000

const BOOKING_COLS = `b.reservation_room_id as id, b.reservation_number as number, b.reservation_code as code, b.status,
  b.arrival_date, b.departure_date, ${DEP} as dep_eff, b.nights, b.room_id,
  coalesce(r.name, b.room_name) as room, b.room_type, b.source_name as source, b.ota_ref, b.price, b.room_total,
  b.guest_name as guest, b.adults, b.children, b.room_price_name as rate_plan, b.created_at_pms as created_at, b.created_by`

const isoDate = (s: unknown, fallback: string) => (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : fallback)

export async function roomCount(): Promise<number> {
  const r = await q1<any>('select count(*)::int n from cl_rooms where active')
  if (r?.n) return r.n
  const b = await q1<any>('select count(distinct room_id)::int n from cl_bookings where room_id is not null')
  return b?.n ?? 0
}

export async function lastSync() {
  return q1<any>(
    `select id, trigger, started_at, finished_at, ok, stats, error from cl_sync_runs order by started_at desc limit 1`,
  )
}

export async function lastOkSync() {
  return q1<any>(`select finished_at from cl_sync_runs where ok order by started_at desc limit 1`)
}

// ---------------- Tổng quan 1 ngày ----------------
export async function overview(dayIn?: string) {
  const D = isoDate(dayIn, todayLocal())
  const rooms = await roomCount()

  const inHouse = await q<any>(
    `select ${BOOKING_COLS} from cl_bookings b left join cl_rooms r on r.room_id = b.room_id
      where ${ACTIVE} and b.arrival_date <= $1::date and ${DEP} > $1::date order by room nulls last`,
    [D],
  )
  const arrivals = await q<any>(
    `select ${BOOKING_COLS} from cl_bookings b left join cl_rooms r on r.room_id = b.room_id
      where ${ACTIVE} and b.arrival_date = $1::date order by b.arrival_at`,
    [D],
  )
  const departures = await q<any>(
    `select ${BOOKING_COLS} from cl_bookings b left join cl_rooms r on r.room_id = b.room_id
      where ${ACTIVE} and b.departure_date = $1::date and b.arrival_date < $1::date order by b.departure_at`,
    [D],
  )
  const arrivalsTomorrow = await q<any>(
    `select ${BOOKING_COLS} from cl_bookings b left join cl_rooms r on r.room_id = b.room_id
      where ${ACTIVE} and b.arrival_date = $1::date + 1 order by b.arrival_at`,
    [D],
  )

  const occupiedRooms = new Set(inHouse.filter((b) => b.room_id).map((b) => String(b.room_id))).size
  const unassignedTonight = inHouse.filter((b) => !b.room_id).length

  // Dự báo 14 ngày tới (số phòng có khách mỗi đêm)
  const forecast = await q<any>(
    `select d::date::text as day,
            count(distinct b.room_id) filter (where b.room_id is not null)::int as occupied,
            count(*) filter (where b.room_id is null)::int as unassigned,
            count(*) filter (where b.arrival_date = d::date)::int as arrivals,
            coalesce(sum(n.amount),0)::float as revenue
       from generate_series($1::date, $1::date + 13, interval '1 day') d
       left join cl_bookings b on ${ACTIVE} and b.arrival_date <= d::date and ${DEP} > d::date
       left join cl_booking_nights n on n.reservation_room_id = b.reservation_room_id and n.night = d::date
      group by d order by d`,
    [D],
  )

  // Tháng hiện tại tới ngày D
  const monthStart = D.slice(0, 8) + '01'
  const mtd = await q1<any>(
    `with nights as (
       select b.reservation_room_id, d::date night
         from cl_bookings b, generate_series(b.arrival_date, ${DEP} - 1, interval '1 day') d
        where ${ACTIVE} and b.arrival_date <= $2::date and ${DEP} > $1::date)
     select (select count(*) from nights where night between $1::date and $2::date)::int as sold,
            (select coalesce(sum(n.amount),0) from cl_booking_nights n join cl_bookings b on b.reservation_room_id = n.reservation_room_id
              where ${ACTIVE} and n.night between $1::date and $2::date)::float as revenue`,
    [monthStart, D],
  )
  const daysElapsed = Number(D.slice(8, 10))
  const mtdAvail = rooms * daysElapsed

  const alerts = await buildAlerts(D)
  const events = await recentEvents(15)
  const sync = await syncState()
  const kpi = await q1<any>('select data, updated_at from cl_daily_kpi where day = $1', [D])

  return {
    day: D,
    rooms,
    occupiedRooms,
    unassignedTonight,
    occupancy: rooms ? occupiedRooms / rooms : 0,
    inHouse,
    arrivals,
    departures,
    arrivalsTomorrow,
    forecast: forecast.map((f) => ({ ...f, occupancy: rooms ? f.occupied / rooms : 0 })),
    mtd: {
      from: monthStart,
      to: D,
      soldNights: mtd?.sold ?? 0,
      availableNights: mtdAvail,
      occupancy: mtdAvail ? (mtd?.sold ?? 0) / mtdAvail : 0,
      revenue: mtd?.revenue ?? 0,
      adr: mtd?.sold ? (mtd.revenue ?? 0) / mtd.sold : 0,
      revpar: mtdAvail ? (mtd?.revenue ?? 0) / mtdAvail : 0,
    },
    alerts,
    events,
    sync,
    ezKpi: kpi?.data?.Dashboard ?? null,
  }
}

export interface Alert {
  level: 'danger' | 'warning' | 'info'
  code: string
  title: string
  hint: string
  items: any[]
}

export async function buildAlerts(D: string): Promise<Alert[]> {
  const alerts: Alert[] = []
  const add = (level: Alert['level'], code: string, title: string, hint: string, items: any[]) => {
    if (items.length) alerts.push({ level, code, title, hint, items })
  }
  const base = `select ${BOOKING_COLS} from cl_bookings b left join cl_rooms r on r.room_id = b.room_id where ${ACTIVE}`

  // Trùng phòng (2 booking cùng phòng chồng ngày) — nguy cơ overbooking
  const overlaps = await q<any>(
    `with x as (select b.reservation_room_id id, b.reservation_number number, b.room_id, coalesce(r.name,b.room_name) room,
                       b.arrival_date, ${DEP} dep, b.guest_name guest, b.source_name source
                  from cl_bookings b left join cl_rooms r on r.room_id = b.room_id
                 where ${ACTIVE} and b.room_id is not null and ${DEP} > $1::date)
     select a.room, a.number as number_a, a.guest as guest_a, a.arrival_date as from_a, a.dep as to_a,
            c.number as number_b, c.guest as guest_b, c.arrival_date as from_b, c.dep as to_b
       from x a join x c on a.room_id = c.room_id and a.id < c.id and a.arrival_date < c.dep and c.arrival_date < a.dep
      order by a.room, a.arrival_date`,
    [D],
  )
  add('danger', 'overlap', 'Trùng phòng (2 booking chồng ngày)', 'Kiểm tra lại trên ezCloud, đổi phòng hoặc huỷ 1 booking', overlaps)

  add('warning', 'unassigned', 'Booking chưa gán phòng', 'Gán phòng trên ezCloud để tránh overbooking',
    await q(`${base} and b.room_id is null and ${DEP} > $1::date order by b.arrival_date`, [D]))

  add('warning', 'overdue_checkin', 'Đã qua ngày đến nhưng chưa check-in', 'Khách đang ở? Bấm check-in trên ezCloud cho đúng trạng thái',
    await q(`${base} and b.status = 'BOOKED' and b.arrival_date < $1::date and ${DEP} > $1::date order by b.arrival_date`, [D]))

  add('warning', 'overdue_checkout', 'Quá ngày đi chưa check-out', 'Check-out hoặc gia hạn trên ezCloud',
    await q(`${base} and b.status = 'CHECKIN' and b.departure_date < $1::date order by b.departure_date`, [D]))

  add('info', 'stale_booked', 'Booking đã qua ngày đi vẫn BOOKED (60 ngày gần đây)', 'Có thể là no-show chưa xử lý hoặc quên check-in/out',
    await q(`${base} and b.status = 'BOOKED' and ${DEP} <= $1::date and b.departure_date >= $1::date - 60 order by b.departure_date desc`, [D]))

  add('warning', 'missing_price', 'Booking chưa có giá / giá bất thường (< 50.000đ/đêm)', 'Sửa giá phòng trên ezCloud để báo cáo doanh thu đúng',
    await q(
      `${base} and ${DEP} > $1::date - 31 and b.arrival_date <= $1::date + 60
         and coalesce(b.room_total, b.price * greatest(b.nights, 1), 0) < ${MIN_NIGHT} * greatest(b.nights, 1)
       order by b.arrival_date`,
      [D],
    ))

  return alerts
}

export async function recentEvents(limit = 50, kinds?: string[]) {
  return q<any>(
    `select e.id, e.at, e.kind, e.summary, e.changes, e.reservation_room_id as booking_id
       from cl_booking_events e ${kinds?.length ? 'where e.kind = any($2)' : ''}
      order by e.at desc limit $1`,
    kinds?.length ? [limit, kinds] : [limit],
  )
}

export async function syncState() {
  const { status } = await loadSession()
  const last = await lastSync()
  const ok = await lastOkSync()
  const pending = await q1<any>('select count(*)::int n from cl_sync_requests where done_at is null')
  const minutesSinceOk = ok?.finished_at ? (Date.now() - new Date(ok.finished_at).getTime()) / 60000 : null
  return {
    ezcloud: status,
    lastRun: last,
    lastOkAt: ok?.finished_at ?? null,
    stale: minutesSinceOk === null || minutesSinceOk > config.ezcloudSyncMinutes * 3,
    pendingRequests: pending?.n ?? 0,
    intervalMinutes: config.ezcloudSyncMinutes,
  }
}

// ---------------- Lịch phòng ----------------
export async function calendar(fromIn?: string, daysIn?: number) {
  const from = isoDate(fromIn, todayLocal())
  const days = Math.min(92, Math.max(7, Number(daysIn ?? 31)))
  const rooms = await q<any>(
    `select room_id as id, name, room_type, floor, house_status, room_status from cl_rooms where active order by sort_order nulls last, name`,
  )
  const bookings = await q<any>(
    `select ${BOOKING_COLS} from cl_bookings b left join cl_rooms r on r.room_id = b.room_id
      where ${ACTIVE} and b.arrival_date < $1::date + $2::int and ${DEP} > $1::date order by b.arrival_date`,
    [from, days],
  )
  const nights = await q<any>(
    `select n.reservation_room_id as id, n.night::text as night, n.amount::float as amount
       from cl_booking_nights n join cl_bookings b on b.reservation_room_id = n.reservation_room_id
      where ${ACTIVE} and n.night >= $1::date and n.night < $1::date + $2::int`,
    [from, days],
  )
  return { from, days, rooms, bookings, nights }
}

// ---------------- Danh sách booking ----------------
export async function listBookings(f: Record<string, any>) {
  const where: string[] = ['b.missing_since is null']
  const params: any[] = []
  const p = (v: any) => {
    params.push(v)
    return `$${params.length}`
  }
  const from = isoDate(f.from, '')
  const to = isoDate(f.to, '')
  const field = f.field === 'arrival' ? 'arrival' : f.field === 'created' ? 'created' : 'stay'
  if (from && to) {
    if (field === 'arrival') where.push(`b.arrival_date between ${p(from)}::date and ${p(to)}::date`)
    else if (field === 'created')
      where.push(`(b.created_at_pms at time zone '${config.timezone}')::date between ${p(from)}::date and ${p(to)}::date`)
    else where.push(`b.arrival_date <= ${p(to)}::date and ${DEP} > ${p(from)}::date`)
  }
  const statuses = String(f.status ?? '')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
  if (statuses.length) where.push(`b.status = any(${p(statuses)})`)
  if (f.source === 'ota') where.push('b.source_name is not null')
  else if (f.source === 'direct') where.push('b.source_name is null')
  if (f.room) where.push(`b.room_id = ${p(Number(f.room))}`)
  const term = String(f.q ?? '').trim()
  if (term) {
    const t = p(`%${term}%`)
    where.push(
      `(b.guest_name ilike ${t} or b.guest_phone ilike ${t} or b.guest_email ilike ${t} or b.reservation_code ilike ${t}
        or b.ota_ref ilike ${t} or b.reservation_number::text = ${p(term)} or b.room_name ilike ${t})`,
    )
  }
  const limit = Math.min(2000, Number(f.limit ?? 500))
  const rows = await q<any>(
    `select ${BOOKING_COLS}, b.guest_phone as phone, b.guest_email as email, b.guest_country as country,
            b.market_name as market, b.cancelled_at, b.cancel_reason, b.booking_note as note
       from cl_bookings b left join cl_rooms r on r.room_id = b.room_id
      where ${where.join(' and ')}
      order by b.arrival_date desc, b.reservation_number desc limit ${limit}`,
    params,
  )
  return rows
}

export async function bookingDetail(id: number) {
  const b = await q1<any>(
    `select ${BOOKING_COLS}, b.guest_phone as phone, b.guest_email as email, b.guest_country as country,
            b.market_name as market, b.company_name as company, b.cm_booking_id, b.cancelled_at, b.cancel_reason,
            b.booking_note as note, b.reservation_note, b.arrival_at, b.departure_at, b.charges_synced_at,
            b.first_seen_at, b.updated_at
       from cl_bookings b left join cl_rooms r on r.room_id = b.room_id where b.reservation_room_id = $1`,
    [id],
  )
  if (!b) return null
  const nights = await q<any>(
    'select night::text as night, amount::float as amount from cl_booking_nights where reservation_room_id = $1 order by night',
    [id],
  )
  const events = await q<any>(
    'select id, at, kind, summary, changes from cl_booking_events where reservation_room_id = $1 order by at desc',
    [id],
  )
  return { ...b, nightsDetail: nights, events }
}

// ---------------- Doanh thu ----------------
export async function revenueYear(yearIn?: number) {
  const year = Number.isInteger(Number(yearIn)) && Number(yearIn) > 2000 ? Number(yearIn) : Number(todayLocal().slice(0, 4))
  const start = `${year}-01-01`
  const end = `${year + 1}-01-01`
  const rooms = await roomCount()

  const segment = `case when b.nights >= 28 then 'long' when b.nights >= 7 then 'mid' else 'short' end`
  const source = `coalesce(b.source_name, 'Trực tiếp')`

  // Đêm bán (theo lịch ở) và doanh thu (theo tiền phòng từng đêm)
  const sold = await q<any>(
    `select to_char(d, 'YYYY-MM') as month, ${source} as source, ${segment} as segment, coalesce(r.name, b.room_name, 'Chưa gán') as room,
            count(*)::int as nights
       from cl_bookings b left join cl_rooms r on r.room_id = b.room_id,
            generate_series(b.arrival_date, ${DEP} - 1, interval '1 day') d
      where ${ACTIVE} and d >= $1::date and d < $2::date
      group by 1,2,3,4`,
    [start, end],
  )
  const rev = await q<any>(
    `select to_char(n.night, 'YYYY-MM') as month, ${source} as source, ${segment} as segment, coalesce(r.name, b.room_name, 'Chưa gán') as room,
            sum(n.amount)::float as revenue
       from cl_booking_nights n join cl_bookings b on b.reservation_room_id = n.reservation_room_id
       left join cl_rooms r on r.room_id = b.room_id
      where ${ACTIVE} and n.night >= $1::date and n.night < $2::date
      group by 1,2,3,4`,
    [start, end],
  )

  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`)
  const daysIn = (m: string) => new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0).getDate()
  const agg = (key: 'source' | 'segment' | 'room') => {
    const map = new Map<string, { key: string; nights: number; revenue: number }>()
    for (const r of sold) {
      const k = r[key]
      const e = map.get(k) ?? { key: k, nights: 0, revenue: 0 }
      e.nights += r.nights
      map.set(k, e)
    }
    for (const r of rev) {
      const k = r[key]
      const e = map.get(k) ?? { key: k, nights: 0, revenue: 0 }
      e.revenue += r.revenue
      map.set(k, e)
    }
    return [...map.values()].sort((a, b) => b.revenue - a.revenue || b.nights - a.nights)
  }

  const monthly = months.map((m) => {
    const nights = sold.filter((r) => r.month === m).reduce((a, r) => a + r.nights, 0)
    const revenue = rev.filter((r) => r.month === m).reduce((a, r) => a + r.revenue, 0)
    const available = rooms * daysIn(m)
    const bySegment: Record<string, number> = {}
    for (const r of rev.filter((x) => x.month === m)) bySegment[r.segment] = (bySegment[r.segment] ?? 0) + r.revenue
    const bySource: Record<string, number> = {}
    for (const r of rev.filter((x) => x.month === m)) bySource[r.source] = (bySource[r.source] ?? 0) + r.revenue
    return {
      month: m,
      soldNights: nights,
      availableNights: available,
      occupancy: available ? nights / available : 0,
      revenue,
      adr: nights ? revenue / nights : 0,
      revpar: available ? revenue / available : 0,
      bySegment,
      bySource,
    }
  })

  const missingPrice = await q<any>(
    `select ${BOOKING_COLS} from cl_bookings b left join cl_rooms r on r.room_id = b.room_id
      where ${ACTIVE} and b.arrival_date < $2::date and ${DEP} > $1::date
        and coalesce(b.room_total, b.price * greatest(b.nights, 1), 0) < ${MIN_NIGHT} * greatest(b.nights, 1)
      order by b.arrival_date`,
    [start, end],
  )
  const notSynced = await q1<any>(
    `select count(*)::int n from cl_bookings b where ${ACTIVE} and b.charges_synced_at is null
       and b.arrival_date < $2::date and ${DEP} > $1::date`,
    [start, end],
  )
  const total = monthly.reduce(
    (a, m) => ({ nights: a.nights + m.soldNights, revenue: a.revenue + m.revenue, available: a.available + m.availableNights }),
    { nights: 0, revenue: 0, available: 0 },
  )
  return {
    year,
    rooms,
    monthly,
    total: {
      ...total,
      occupancy: total.available ? total.nights / total.available : 0,
      adr: total.nights ? total.revenue / total.nights : 0,
      revpar: total.available ? total.revenue / total.available : 0,
    },
    bySource: agg('source'),
    bySegment: agg('segment'),
    byRoom: agg('room'),
    missingPrice,
    chargesNotSynced: notSynced?.n ?? 0,
  }
}

export async function revenueDaily(monthIn?: string) {
  const month = typeof monthIn === 'string' && /^\d{4}-\d{2}$/.test(monthIn) ? monthIn : todayLocal().slice(0, 7)
  const start = `${month}-01`
  const rooms = await roomCount()
  const rows = await q<any>(
    `with days as (select d::date as dd from generate_series($1::date, ($1::date + interval '1 month' - interval '1 day'), interval '1 day') d)
     select days.dd::text as day,
            (select count(*) from cl_bookings b where ${ACTIVE} and b.arrival_date <= days.dd and ${DEP} > days.dd)::int as sold,
            (select coalesce(sum(n.amount),0) from cl_booking_nights n join cl_bookings b on b.reservation_room_id = n.reservation_room_id
              where ${ACTIVE} and n.night = days.dd)::float as revenue,
            (select count(*) from cl_bookings b where ${ACTIVE} and b.arrival_date = days.dd)::int as arrivals,
            (select count(*) from cl_bookings b where ${ACTIVE} and b.departure_date = days.dd and b.arrival_date < days.dd)::int as departures
       from days order by days.dd`,
    [start],
  )
  return { month, rooms, days: rows.map((r) => ({ ...r, occupancy: rooms ? r.sold / rooms : 0 })) }
}

// =============================================================
//  GHI lên ezCloud từ webapp — chỉ 2 thao tác đã kiểm chứng (2026-10-13, booking #493):
//   1. Nhập giá từng đêm (api/Booking/UpdatePriceAdjustment) — theo đêm hoặc quy từ giá tháng.
//   2. Check-in (api/Booking/Checkin) + xử lý đêm đã qua như web ezCloud (AddExtraService "Phòng cả ngày ...").
//  Quy tắc: bật bằng EZCLOUD_WRITE_ENABLED=true, quyền 'coliving.write', luôn đọc lại từ ezCloud để kiểm tra,
//  ghi cl_write_log + app_audit_log, sau đó làm mới chi tiết booking trong DB + xếp lượt đồng bộ đầy đủ.
//  KHÔNG thêm thao tác ghi khác khi chưa đo request thật trên web ezCloud (xem docs/EZCLOUD-API.md).
// =============================================================
import { q } from '../app/db.js'
import { EzClient } from './ezcloud.js'
import { localDate, refreshBookingDetails, todayLocal } from './sync.js'

export const writesEnabled = () => (process.env.EZCLOUD_WRITE_ENABLED ?? 'false').toLowerCase() === 'true'

// Chuỗi web ezCloud gửi kèm để ghi nhật ký thay đổi giá bên ezCloud (giữ nguyên như web).
const PRICE_LANGUAGE_KEYS = {
  NOTIFICATION_DISCOUNT_ROOM_PRICE: '[USER] giảm giá cho phòng [ROOM_RESNO] [ROOM] : [DISCOUNT_PERCENTAGE] [DISCOUNT_FLAT]',
  NOTIFICATION_FREE_OF_CHARGE: '[USER] miễn phí tiền phòng [ROOM_RESNO] [ROOM]',
  NOTIFICATION_WHEN_CHANGE_NEW_PRICE: '[USER] thay đổi giá phòng [ROOM]: [TITLE] từ [OLD_PRICE] -> [NEW_PRICE]',
  NOTIFICATION_WHEN_CHANGE_NEW_TYPE_PRICE: '[USER] thay đổi loại giá phòng [ROOM]: [OLD_PRICE_NAME] -> [NEW_PRICE_NAME]',
  NOTIFICATION_WHEN_CHANGE_PRICE: '[USER] thay đổi giá phòng [ROOM_RESNO] [ROOM] : [OLD_PRICE] -> [NEW_PRICE]',
  NOTIFICATION_WHEN_CHANGE_PRICE_FULLDAY: '[USER] thay đổi giá phòng [ROOM_RESNO] [ROOM] ngày [DATE]: [OLD_PRICE] -> [NEW_PRICE]',
  RES_NO: 'Mã đặt phòng',
  ROOM: 'Phòng',
}

const DAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const daysInMonth = (iso: string) => new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)), 0)).getUTCDate()
const dmyStr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`

export class WriteError extends Error {
  constructor(message: string, public code = 'write_failed', public data?: any) {
    super(message)
  }
}

interface Actor {
  id: number
  email: string
}

async function logWrite(actor: Actor, action: string, rrId: number, params: any, request: any, response: any, ok: boolean, verify: any, error?: string) {
  await q(
    `insert into cl_write_log(user_id, user_email, action, reservation_room_id, params, request, response, ok, verify, error)
     values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [actor.id, actor.email, action, rrId, JSON.stringify(params ?? null), JSON.stringify(request ?? null), JSON.stringify(response ?? null), ok, JSON.stringify(verify ?? null), error ?? null],
  ).catch((e) => console.error('[write-log]', e.message))
}

async function afterWrite(client: EzClient, rrId: number, actor: Actor, summary: string) {
  // cập nhật trạng thái/ngày TRƯỚC (stay_from so với arrival_date mới), rồi làm mới tiền phòng/dịch vụ/khoản thu
  const v3 = await client.reservationRoomV3(rrId).catch(() => null)
  if (v3?.BookingStatus) {
    await q(
      `update cl_bookings set status = $2, arrival_at = $3, departure_at = $4, arrival_date = $5, departure_date = $6, updated_at = now()
        where reservation_room_id = $1`,
      [rrId, v3.BookingStatus, v3.ArrivalDate, v3.DepartureDate, localDate(v3.ArrivalDate), localDate(v3.DepartureDate)],
    ).catch(() => {})
  }
  await refreshBookingDetails(client, rrId, null).catch((e) => console.error('[write] refresh', e.message))
  await q('insert into cl_booking_events(reservation_room_id, kind, summary) values($1,$2,$3)', [rrId, 'write', `${summary} (bởi ${actor.email} từ webapp)`])
  await q('insert into cl_sync_requests(requested_by) values($1)', [actor.id])
}

function nightOf(ch: any): string | null {
  const m = /^DAY(\d{4})(\d{2})(\d{2})$/.exec(String(ch?.PriceKey ?? ''))
  return m ? `${m[1]}-${m[2]}-${m[3]}` : ch?.StartDate ? localDate(ch.StartDate) : null
}

// ---------------- 1. Nhập giá ----------------
export interface PriceInput {
  mode: 'night' | 'month' | 'total'
  amount: number // giá 1 đêm (night) | tiền thuê 1 tháng (month) | tổng tiền các đêm được đổi (total, chia đều, lẻ dồn đêm cuối)
  fromNight?: string // chỉ đổi các đêm >= ngày này (mặc định: tất cả)
  dryRun?: boolean
}

export async function setPrice(rrId: number, input: PriceInput, actor: Actor) {
  if (!writesEnabled()) throw new WriteError('Chức năng ghi lên ezCloud đang tắt (EZCLOUD_WRITE_ENABLED)', 'disabled')
  const amount = Math.round(Number(input.amount))
  if (!Number.isFinite(amount) || amount < 0 || amount > 500_000_000) throw new WriteError('Số tiền không hợp lệ', 'invalid')
  if (!['night', 'month', 'total'].includes(input.mode)) throw new WriteError('Kiểu giá không hợp lệ', 'invalid')

  const client = await EzClient.fromStore()
  const v3 = await client.reservationRoomV3(rrId)
  if (!v3?.ReservationRoomId) throw new WriteError('Không tìm thấy booking trên ezCloud', 'not_found')
  if (!['BOOKED', 'CHECKIN'].includes(v3.BookingStatus))
    throw new WriteError(`Chỉ sửa giá booking Đã đặt/Đang ở (hiện: ${v3.BookingStatus})`, 'bad_status')

  const chRes = await client.roomCharges(rrId)
  const charges: any[] = (chRes?.roomCharges ?? []).filter((c: any) => c?.Status !== false && c?.Type === 'DAY_PRICE')
  if (!charges.length) throw new WriteError('Booking không có đêm tính giá (DAY_PRICE) để sửa', 'no_nights')
  const types = new Set((chRes?.roomCharges ?? []).map((c: any) => c?.Type))
  if ([...types].some((t) => t !== 'DAY_PRICE'))
    throw new WriteError(`Booking có kiểu giá ${[...types].join(', ')} — chưa hỗ trợ, sửa trực tiếp trên ezCloud`, 'unsupported')

  const targets = charges.filter((c) => !input.fromNight || nightOf(c)! >= input.fromNight)
  const base = targets.length ? Math.floor(amount / targets.length) : 0
  const lastKey = targets.length ? targets[targets.length - 1].PriceKey : null
  const models = charges.map((c) => {
    const night = nightOf(c)!
    const change = !input.fromNight || night >= input.fromNight
    const perNight =
      input.mode === 'night'
        ? amount
        : input.mode === 'month'
          ? Math.round(amount / daysInMonth(night))
          : c.PriceKey === lastKey
            ? amount - base * (targets.length - 1)
            : base
    const value = change ? perNight : Number(c.Value ?? 0)
    const d = new Date(night + 'T00:00:00Z')
    return {
      DayName: DAY_NAMES[d.getUTCDay()], Day: `${night.slice(8, 10)}/${night.slice(5, 7)}`, SubDay: '', Title: `${night.slice(8, 10)}/${night.slice(5, 7)}`,
      Value: value, Amount: value, RoomChargeId: 0, StartDate: c.StartDate, EndDate: c.EndDate, Type: 'DAY_PRICE',
      ReservationRoomId: rrId, RoomPriceId: c.RoomPriceId ?? v3.RoomPriceId, PriceKey: c.PriceKey, OldValue: Number(c.Value ?? 0),
      _night: night, _changed: change && value !== Number(c.Value ?? 0),
    }
  })
  const preview = {
    nights: models.length,
    changed: models.filter((m) => m._changed).length,
    from: models[0]._night,
    to: models[models.length - 1]._night,
    oldTotal: models.reduce((a, m) => a + m.OldValue, 0),
    newTotal: models.reduce((a, m) => a + m.Value, 0),
    perNight: [...new Set(models.filter((m) => m._changed).map((m) => m.Value))],
  }
  if (input.dryRun) return { dryRun: true, preview }
  if (!preview.changed) return { ok: true, preview, message: 'Không có đêm nào cần đổi' }

  const body = {
    LstPriceAdjustmentModels: models.map(({ _night, _changed, ...m }) => m),
    DiscountFlat: Number(v3.DiscountFlat ?? 0),
    DiscountPercentage: Number(v3.DiscountPercentage ?? 0),
    FOC: !!v3.Foc,
    ReservationRoomId: rrId,
    RoomPriceId: v3.RoomPriceId,
    languageKeys: PRICE_LANGUAGE_KEYS,
  }
  let resp: any
  try {
    resp = await client.updatePriceAdjustment(body)
  } catch (e) {
    await logWrite(actor, 'set_price', rrId, input, { nights: preview.nights }, null, false, null, (e as Error).message)
    throw new WriteError(`ezCloud lỗi: ${(e as Error).message}`)
  }
  if (resp?.success === false) {
    await logWrite(actor, 'set_price', rrId, input, { nights: preview.nights }, resp, false, null, resp?.message)
    throw new WriteError(`ezCloud từ chối: ${resp?.message ?? 'không rõ'}`, 'rejected', resp?.data)
  }

  // đọc lại để kiểm tra
  const after = (await client.roomCharges(rrId))?.roomCharges ?? []
  const want = new Map(models.map((m) => [m._night, m.Value]))
  const mismatch = after
    .filter((c: any) => c?.Type === 'DAY_PRICE' && c?.Status !== false)
    .filter((c: any) => want.has(nightOf(c)!) && Number(c.Value) !== want.get(nightOf(c)!))
    .map((c: any) => ({ night: nightOf(c), got: c.Value, want: want.get(nightOf(c)!) }))
  const ok = mismatch.length === 0
  await logWrite(actor, 'set_price', rrId, input, { nights: preview.nights, changed: preview.changed, perNight: preview.perNight }, resp, ok, { mismatch })
  await afterWrite(client, rrId, actor, `Nhập giá ${input.mode === 'month' ? 'tháng' : input.mode === 'total' ? 'tổng' : 'đêm'} ${amount.toLocaleString('vi-VN')}đ: ${preview.changed} đêm, tổng ${preview.oldTotal.toLocaleString('vi-VN')} → ${preview.newTotal.toLocaleString('vi-VN')}đ`)
  if (!ok) throw new WriteError(`ezCloud đã nhận lệnh nhưng ${mismatch.length} đêm chưa đúng giá — kiểm tra trên ezCloud`, 'verify_failed', mismatch)
  return { ok: true, preview }
}

// ---------------- 2. Check-in ----------------
export async function checkinPreview(rrId: number) {
  const client = await EzClient.fromStore()
  const v3 = await client.reservationRoomV3(rrId)
  if (!v3?.ReservationRoomId) throw new WriteError('Không tìm thấy booking trên ezCloud', 'not_found')
  const charges: any[] = ((await client.roomCharges(rrId))?.roomCharges ?? []).filter((c: any) => c?.Status !== false)
  const today = todayLocal()
  const past = charges.filter((c) => (c.StartDate ? localDate(c.StartDate) : today) < today)
  const settings = await client.hotelSettings().catch(() => null)
  const noshowOff = !!(settings?.IsOffNoshow ?? settings?.data?.IsOffNoshow)
  return {
    status: v3.BookingStatus as string,
    roomAssigned: !!v3.RoomId,
    arrival: v3.ArrivalDate,
    pastNights: past.length,
    pastAmount: past.reduce((a, c) => a + Number(c.Value ?? 0), 0),
    pastFrom: past.length ? localDate(past[0].StartDate) : null,
    pastTo: past.length ? localDate(past[past.length - 1].StartDate) : null,
    noshowOff,
    allZero: charges.every((c) => !Number(c.Value)),
    _past: past,
    _client: client,
  }
}

export async function checkin(rrId: number, actor: Actor) {
  if (!writesEnabled()) throw new WriteError('Chức năng ghi lên ezCloud đang tắt (EZCLOUD_WRITE_ENABLED)', 'disabled')
  const pre = await checkinPreview(rrId)
  const client = pre._client
  if (pre.status !== 'BOOKED') throw new WriteError(`Chỉ check-in booking Đã đặt (hiện: ${pre.status})`, 'bad_status')
  if (!pre.roomAssigned) throw new WriteError('Booking chưa gán phòng — gán phòng trên ezCloud trước', 'no_room')

  let resp: any
  try {
    resp = await client.checkin(rrId)
  } catch (e) {
    await logWrite(actor, 'checkin', rrId, null, null, null, false, null, (e as Error).message)
    throw new WriteError(`ezCloud lỗi: ${(e as Error).message}`)
  }
  if (resp?.success === false) {
    const c = resp?.data
    const conflict = c?.ReservationRoomId
      ? { id: c.ReservationRoomId, status: c.BookingStatus, room: c.Rooms?.RoomName, from: c.ArrivalDate, to: c.DepartureDate }
      : null
    await logWrite(actor, 'checkin', rrId, null, null, { success: false, message: resp?.message, conflict }, false, null, resp?.message)
    throw new WriteError(
      conflict
        ? `ezCloud: ${resp?.message ?? 'Xung đột'} — phòng ${conflict.room ?? ''} đang bị booking khác chiếm (${conflict.status}, ${localDate(conflict.from)} → ${localDate(conflict.to)}). Check-out/xử lý booking đó trước.`
        : `ezCloud từ chối: ${resp?.message ?? 'không rõ'}`,
      conflict ? 'conflict' : 'rejected',
      conflict,
    )
  }

  // Như web ezCloud: hotel bật tính no-show + có đêm đã qua → thêm dịch vụ "Phòng cả ngày dd/mm/yyyy - dd/mm/yyyy"
  let extra: any = null
  if (!pre.noshowOff && pre.pastNights > 0 && pre.pastFrom && pre.pastTo) {
    const range = pre.pastFrom === pre.pastTo ? dmyStr(pre.pastFrom) : `${dmyStr(pre.pastFrom)} - ${dmyStr(pre.pastTo)}`
    const item = { ReservationRoomId: rrId, RoomExtraServiceName: 'EXTRA_SERVICES', RoomExtraServiceDescription: `Phòng cả ngày ${range}`, Amount: pre.pastAmount, Quantity: 1 }
    try {
      extra = { item, resp: await client.addExtraService([item]) }
    } catch (e) {
      extra = { item, error: (e as Error).message }
    }
  }

  const v3 = await client.reservationRoomV3(rrId)
  const ok = v3?.BookingStatus === 'CHECKIN'
  await logWrite(actor, 'checkin', rrId, null, null, { success: true, extra }, ok, { status: v3?.BookingStatus, arrival: v3?.ArrivalDate })
  await afterWrite(client, rrId, actor, `Check-in${extra ? ` (gom ${pre.pastNights} đêm đã qua = ${pre.pastAmount.toLocaleString('vi-VN')}đ vào dịch vụ)` : ''}`)
  if (!ok) throw new WriteError(`Đã gửi check-in nhưng ezCloud vẫn báo ${v3?.BookingStatus}`, 'verify_failed')
  if (extra?.error) throw new WriteError(`Đã check-in, nhưng thêm dịch vụ đêm đã qua lỗi: ${extra.error} — thêm tay trên ezCloud`, 'partial')
  return { ok: true, status: v3.BookingStatus, arrival: v3.ArrivalDate, extra: extra?.item ?? null }
}

export async function recentWrites(limit = 50) {
  return q<any>(
    `select w.id, w.at, w.user_email, w.action, w.reservation_room_id, w.params, w.ok, w.error, b.reservation_number as number
       from cl_write_log w left join cl_bookings b on b.reservation_room_id = w.reservation_room_id
      order by w.at desc limit $1`,
    [limit],
  )
}


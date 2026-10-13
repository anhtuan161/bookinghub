// =============================================================
//  Client API nội bộ ezCloud PMS (https://pms.ezcloudhotel.com/api/...).
//  ezCloud KHÔNG có API công khai; các endpoint dưới đây đo từ web app (2026-10-13),
//  xem docs/EZCLOUD-API.md. CHỈ GỌI ENDPOINT ĐỌC — tuyệt đối không gọi Save/Cancel/Checkin...
//
//  Phiên: token bearer sống 60 ngày + refresh_token (POST api/Account/Refresh).
//  Phiên lưu mã hoá trong app_settings('ezcloud.session'); worker tự refresh mỗi ~20 giờ.
// =============================================================
import { config } from '../config.js'
import { decrypt, encrypt } from '../app/crypto.js'
import { q, q1 } from '../app/db.js'

export interface EzSession {
  access_token: string
  refresh_token?: string
  token_type?: string
  userName?: string
  Email?: string
  HotelId?: number | string
  UserId?: string
  '.issued'?: string
  '.expires'?: string
  [k: string]: unknown
}

export interface EzStatus {
  connected: boolean
  userName?: string
  hotelId?: string
  hotelName?: string
  issuedAt?: string
  expiresAt?: string
  lastRefreshAt?: string
  lastRefreshError?: string
  lastError?: string
  lastErrorAt?: string
  connectedAt?: string
  connectedBy?: string
}

const KEY = 'ezcloud.session'

export class EzAuthError extends Error {}

export async function loadSession(): Promise<{ session: EzSession | null; status: EzStatus }> {
  const row = await q1<any>('select value, secret_enc from app_settings where key = $1', [KEY])
  if (!row?.secret_enc) return { session: null, status: { connected: false, ...(row?.value ?? {}) } }
  try {
    return { session: JSON.parse(decrypt(row.secret_enc)), status: { connected: true, ...(row.value ?? {}) } }
  } catch (e) {
    return { session: null, status: { connected: false, lastError: 'Không giải mã được phiên (APP_SECRET_KEY đổi?)' } }
  }
}

async function saveSession(session: EzSession, statusPatch: Partial<EzStatus>) {
  const { status } = await loadSession().catch(() => ({ status: {} as EzStatus }))
  const value: EzStatus = {
    ...status,
    ...statusPatch,
    connected: true,
    userName: session.userName ?? status.userName,
    hotelId: String(session.HotelId ?? status.hotelId ?? ''),
    issuedAt: session['.issued'] ? new Date(session['.issued']).toISOString() : status.issuedAt,
    expiresAt: session['.expires'] ? new Date(session['.expires']).toISOString() : status.expiresAt,
  }
  await q(
    `insert into app_settings(key, value, secret_enc, updated_at) values($1,$2,$3,now())
     on conflict(key) do update set value = excluded.value, secret_enc = excluded.secret_enc, updated_at = now()`,
    [KEY, JSON.stringify(value), encrypt(JSON.stringify(session))],
  )
}

export async function patchStatus(patch: Partial<EzStatus>) {
  await q(
    `insert into app_settings(key, value) values($1,$2)
     on conflict(key) do update set value = coalesce(app_settings.value,'{}'::jsonb) || $2::jsonb, updated_at = now()`,
    [KEY, JSON.stringify(patch)],
  )
}

export async function disconnect() {
  await q('delete from app_settings where key = $1', [KEY])
}

// Chấp nhận: JSON của localStorage 'ngStorage-session' / 'ezIdData' (có access_token), hoặc chuỗi bọc thêm dấu nháy.
export function parsePastedSession(input: string): EzSession {
  let text = input.trim()
  if (/^['"]/.test(text) && /['"]$/.test(text)) {
    try {
      const unq = JSON.parse(text)
      if (typeof unq === 'string') text = unq
    } catch {
      text = text.slice(1, -1)
    }
  }
  let obj: any
  try {
    obj = JSON.parse(text)
  } catch {
    throw new Error('Không đọc được JSON. Hãy dán nguyên giá trị ngStorage-session.')
  }
  if (obj?.session?.access_token) obj = obj.session
  if (!obj?.access_token) throw new Error('JSON không có access_token')
  return obj as EzSession
}

// ---------- HTTP ----------
async function rawCall(session: EzSession, path: string, init?: { method?: string; body?: unknown }) {
  const res = await fetch(`${config.ezcloudBaseUrl}/${path.replace(/^\/+/, '')}`, {
    method: init?.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
      Language: 'en',
      Accept: 'application/json',
    },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(60_000),
  })
  return res
}

export async function refreshSession(session: EzSession, reason: string): Promise<EzSession> {
  if (!session.refresh_token) throw new EzAuthError('Phiên không có refresh_token')
  const res = await rawCall(session, 'api/Account/Refresh', { method: 'POST', body: { refresh_token: session.refresh_token } })
  const text = await res.text()
  if (!res.ok) {
    await patchStatus({ lastRefreshError: `HTTP ${res.status} (${reason})`, lastErrorAt: new Date().toISOString() })
    throw new EzAuthError(`Refresh thất bại HTTP ${res.status}`)
  }
  let data: any
  try {
    data = JSON.parse(text)
  } catch {
    throw new EzAuthError('Refresh trả về không phải JSON')
  }
  const fresh = data?.access_token ? data : data?.data?.access_token ? data.data : null
  if (!fresh) throw new EzAuthError('Refresh không trả access_token')
  const merged: EzSession = { ...session, ...fresh }
  // Lưu NGAY trước khi dùng: nếu refresh_token xoay vòng, token cũ có thể đã hết hiệu lực.
  await saveSession(merged, { lastRefreshAt: new Date().toISOString(), lastRefreshError: undefined })
  return merged
}

// Client dùng trong 1 lượt đồng bộ: tự refresh khi cần và khi gặp 401 (1 lần).
export class EzClient {
  private session: EzSession
  private refreshed = false
  calls = 0
  constructor(session: EzSession) {
    this.session = session
  }

  static async fromStore(): Promise<EzClient> {
    const { session } = await loadSession()
    if (!session) throw new EzAuthError('Chưa kết nối ezCloud')
    const c = new EzClient(session)
    await c.maybeRefresh()
    return c
  }

  // Web ezCloud refresh khi token đã cấp > ~1 ngày; làm tương tự (20 giờ).
  async maybeRefresh() {
    const issued = this.session['.issued'] ? new Date(this.session['.issued']).getTime() : 0
    if (issued && Date.now() - issued < 20 * 3600_000) return
    try {
      this.session = await refreshSession(this.session, 'định kỳ')
      this.refreshed = true
    } catch (e) {
      // access_token còn hạn (60 ngày) thì vẫn chạy tiếp, chỉ ghi cảnh báo.
      const exp = this.session['.expires'] ? new Date(this.session['.expires']).getTime() : 0
      if (exp && exp < Date.now()) throw e
      console.error('[ezcloud] refresh định kỳ lỗi, dùng token cũ:', (e as Error).message)
    }
  }

  async call<T = any>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
    this.calls++
    let res = await rawCall(this.session, path, init)
    if (res.status === 401 && !this.refreshed) {
      this.session = await refreshSession(this.session, '401')
      this.refreshed = true
      res = await rawCall(this.session, path, init)
    }
    if (res.status === 401) throw new EzAuthError('ezCloud trả 401 — phiên hết hạn, cần kết nối lại')
    const text = await res.text()
    if (!res.ok) throw new Error(`ezCloud ${path} HTTP ${res.status}: ${text.slice(0, 200)}`)
    try {
      return JSON.parse(text) as T
    } catch {
      throw new Error(`ezCloud ${path}: phản hồi không phải JSON`)
    }
  }

  // ----- Endpoint đọc -----
  currentUser() {
    return this.call<any>('api/Account/GetCurrentUser')
  }
  currentHotel() {
    return this.call<any>('api/Hotel/GetCurrentHotel')
  }

  async allBookings(pageSize = 500): Promise<any[]> {
    const out: any[] = []
    for (let page = 1; page <= 50; page++) {
      const body = {
        ReportTemplateDefaultId: 1,
        GuestName: '', Phone: '', Email: '', IdentityNumber: '', PassportNumber: '', Address: '',
        ReservationNumber: '', OtaNumber: '', RoomName: '', Adults: '', Children: '', CountryId: null,
        SourceIds: [], CompanyIds: [], MarketIds: [], BookingStatus: [], CommissionType: [],
        BirthDayFrom: null, BirthDayTo: null, OccupiedNightFrom: null, OccupiedNightTo: null,
        ArrivalDateFrom: '2015-01-01T00:00:00', ArrivalDateTo: `${new Date().getFullYear() + 3}-12-31T23:59:00`,
        DepartureDateFrom: null, DepartureDateTo: null, CreatedUser: [], CreatedDateFrom: null, CreatedDateTo: null,
        CancelUser: [], CancelDateFrom: null, CancelDateTo: null,
        pageSize, OrderBy: 'ArrivalDate', Ascending: 1, AscendingGroup: -1,
        take: pageSize, skip: (page - 1) * pageSize, page,
      }
      const r = await this.call<any>('api/Booking/GetFrontOfficeBooking', { method: 'POST', body })
      if (r?.success === false) throw new Error(`GetFrontOfficeBooking: ${r?.message ?? r?.errorKey ?? 'lỗi'}`)
      const rows: any[] = r?.data?.ReservationRooms ?? []
      const total = Number(r?.data?.TotalRecords ?? rows.length)
      out.push(...rows)
      if (rows.length < pageSize || out.length >= total) break
    }
    return out
  }

  roomCharges(reservationRoomId: number) {
    return this.call<any>(`api/Reservation/GetRoomChargesList?reservationRoomId=${reservationRoomId}`)
  }

  roomView(isoDate: string) {
    return this.call<any>(`api/room-view/get-all-resource?date=${isoDate}`)
  }

  dashboard(d: Date) {
    // ezCloud web gửi dạng "Tuesday October 13, 2026"
    const s = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: config.timezone }).replace(',', '')
    return this.call<any>(`api/Room/DashboardForApp?from=${encodeURIComponent(s)}`)
  }
}

// Kiểm tra phiên dán vào rồi lưu.
export async function connectWithPasted(input: string, by: string): Promise<EzStatus> {
  const session = parsePastedSession(input)
  const client = new EzClient(session)
  const me = await client.currentUser().catch((e) => {
    throw new Error(`Phiên không dùng được: ${(e as Error).message}`)
  })
  const hotel = await client.currentHotel().catch(() => null)
  await saveSession(session, {
    connectedAt: new Date().toISOString(),
    connectedBy: by,
    hotelName: hotel?.HotelName ?? hotel?.data?.HotelName ?? undefined,
    userName: session.userName ?? me?.Email ?? me?.UserName ?? undefined,
    lastError: undefined,
    lastRefreshError: undefined,
  })
  return (await loadSession()).status
}

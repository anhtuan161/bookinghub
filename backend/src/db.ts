// =============================================================
//  Adapter PostgreSQL (Supabase).
//  - Khi có DATABASE_URL: tạo bảng (nếu chưa), seed dữ liệu ban đầu,
//    nạp vào bộ nhớ (hydrate), và GHI-XUYÊN-SUỐT mọi thay đổi xuống DB.
//  - Routes vẫn đọc từ bộ nhớ (đồng bộ, nhanh) → không phải đổi.
//  - Mọi lệnh ghi best-effort: nếu DB lỗi vẫn không làm sập API.
// =============================================================
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { config } from './config.js'
import {
  bookings,
  overrides,
  properties,
  reviewQueue,
  sheets,
} from './store.js'
import type { AvailabilityDay, BookingRequest, Property, ReviewItem, Sheet } from './types.js'

export const dbEnabled = config.usePg

let pool: pg.Pool | null = null
function getPool(): pg.Pool {
  if (!pool)
    pool = new pg.Pool({
      connectionString: config.databaseUrl,
      ssl: { rejectUnauthorized: false }, // Supabase yêu cầu SSL
      max: 5,
    })
  return pool
}

export async function query(text: string, params?: any[]) {
  return getPool().query(text, params)
}

const J = (v: unknown) => JSON.stringify(v ?? null)
const log = (...a: any[]) => console.error('[db]', ...a)

// ---------- tạo bảng ----------
async function ensureSchema() {
  const __dirname = dirname(fileURLToPath(import.meta.url))
  const sql = readFileSync(join(__dirname, '..', 'db', 'schema.sql'), 'utf8')
  await getPool().query(sql)
}

// ---------- seed dữ liệu ban đầu (nếu DB trống) ----------
async function seedIfEmpty() {
  // Luôn đảm bảo cấu hình SHEET thật tồn tại (dùng cho cả LIVE lẫn DEMO).
  const sc = await query('select count(*)::int as n from sheets')
  if (sc.rows[0].n === 0) {
    log('Chưa có sheet → seed cấu hình sheet…')
    for (const s of sheets)
      await query(
        `insert into sheets(id,url,spreadsheet_id,title,color_mapping,sync_status,last_synced_at,assignee)
         values($1,$2,$3,$4,$5,$6,now(),$7) on conflict(id) do nothing`,
        [s.id, s.url, s.spreadsheetId, s.ownerName, J(s.colorMapping), s.syncStatus, s.assignee],
      )
  }

  // LIVE: KHÔNG seed villa/booking/review demo — dữ liệu thật do sync tạo từ sheet.
  if (!config.demoMode) return

  const { rows } = await query('select count(*)::int as n from properties')
  if (rows[0].n > 0) return
  log('DB trống → seed dữ liệu mẫu (DEMO)…')

  // owners (suy ra từ properties)
  const owners = new Map<string, string>()
  properties.forEach((p) => owners.set(p.ownerId, p.ownerName))
  for (const [id, name] of owners)
    await query('insert into owners(id,name) values($1,$2) on conflict(id) do nothing', [id, name])

  for (const p of properties)
    await query(
      `insert into properties(id,owner_id,name,area,address,bedrooms,capacity_standard,capacity_max,amenities,rules,images,base_price,extra_fee_note,last_synced_at)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,now()) on conflict(id) do nothing`,
      [p.id, p.ownerId, p.name, p.area, p.address, p.bedrooms, p.capacityStandard, p.capacityMax, J(p.amenities), J(p.rules), J(p.images), p.basePrice, p.extraFeeNote],
    )

  for (const b of bookings)
    await query(
      `insert into booking_requests(id,property_id,customer_name,customer_contact,channel,checkin,checkout,guests,quoted_price,status,assignee,note,created_at)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now()) on conflict(id) do nothing`,
      [b.id, b.propertyId, b.customerName, b.customerContact, b.channel, b.checkin, b.checkout, b.guests, b.quotedPrice, b.status, b.assignee, b.note],
    )

  for (const r of reviewQueue)
    await query(
      `insert into review_queue(id,property_id,date,raw_value,raw_color_hex,suggested_status,suggested_price,confidence)
       values($1,$2,$3,$4,$5,$6,$7,$8) on conflict(id) do nothing`,
      [r.id, r.propertyId, r.date, r.rawValue, r.rawColorHex, r.suggestedStatus, r.suggestedPrice, r.confidence],
    )
}

// ---------- nạp DB → bộ nhớ ----------
async function hydrate() {
  // owners (map id → name) để dựng ownerName cho properties
  const ow = await query('select id, name from owners')
  const ownerName = new Map<string, string>(ow.rows.map((r: any) => [r.id, r.name]))

  // properties (nguồn sự thật ở LIVE — thay cho seed demo trong bộ nhớ)
  const pr = await query('select * from properties order by name')
  if (pr.rows.length || !config.demoMode) {
    properties.length = 0
    for (const row of pr.rows)
      properties.push({
        id: row.id, name: row.name, ownerId: row.owner_id, ownerName: ownerName.get(row.owner_id) ?? '',
        area: row.area ?? '', address: row.address ?? '', bedrooms: row.bedrooms ?? 0,
        capacityStandard: row.capacity_standard ?? 0, capacityMax: row.capacity_max ?? 0,
        amenities: row.amenities ?? [], rules: row.rules ?? [], images: row.images ?? [],
        basePrice: Number(row.base_price ?? 0), extraFeeNote: row.extra_fee_note ?? '',
        lastSyncedAt: (row.last_synced_at ?? new Date()).toISOString(), sourceSheetUrl: '',
      })
  }

  // sheets
  const s = await query('select * from sheets order by id')
  if (s.rows.length) {
    sheets.length = 0
    for (const row of s.rows)
      sheets.push({
        id: row.id, ownerName: row.title ?? '', ownerPhone: '', url: row.url, spreadsheetId: row.spreadsheet_id,
        propertyCount: 0, syncStatus: row.sync_status, lastSyncedAt: (row.last_synced_at ?? new Date()).toISOString(),
        assignee: row.assignee ?? '—', commissionRate: Number(row.commission_rate ?? 10),
        colorMapping: row.color_mapping ?? {}, lastError: row.last_error ?? undefined,
      } as Sheet)
  }

  // bookings
  const b = await query('select * from booking_requests order by created_at desc')
  if (b.rows.length || !config.demoMode) {
    bookings.length = 0
    for (const row of b.rows)
      bookings.push({
        id: row.id, propertyId: row.property_id, propertyName: properties.find((p) => p.id === row.property_id)?.name ?? '',
        customerName: row.customer_name, customerContact: row.customer_contact, channel: row.channel,
        checkin: row.checkin instanceof Date ? row.checkin.toISOString().slice(0, 10) : row.checkin,
        checkout: row.checkout instanceof Date ? row.checkout.toISOString().slice(0, 10) : row.checkout,
        guests: row.guests, quotedPrice: Number(row.quoted_price), status: row.status, assignee: row.assignee,
        note: row.note ?? '', createdAt: (row.created_at ?? new Date()).toISOString(),
      } as BookingRequest)
  }

  // review queue (chưa xử lý)
  const r = await query('select * from review_queue where resolved = false')
  reviewQueue.length = 0
  for (const row of r.rows)
    reviewQueue.push({
      id: row.id, propertyId: row.property_id, propertyName: properties.find((p) => p.id === row.property_id)?.name ?? '',
      date: row.date instanceof Date ? row.date.toISOString().slice(0, 10) : row.date,
      rawValue: row.raw_value ?? '', rawColorHex: row.raw_color_hex ?? '#ffffff',
      suggestedStatus: row.suggested_status, suggestedPrice: row.suggested_price != null ? Number(row.suggested_price) : null,
      confidence: Number(row.confidence ?? 0),
    } as ReviewItem)

  // availability (ghi đè bởi sync thật)
  const a = await query('select * from availability_calendar')
  for (const row of a.rows) {
    const date = row.date instanceof Date ? row.date.toISOString().slice(0, 10) : row.date
    overrides.set(`${row.property_id}|${date}`, {
      date, status: row.status, price: row.price != null ? Number(row.price) : null,
      minNights: row.min_nights ?? 1, note: row.note ?? '', confidence: Number(row.confidence ?? 1),
      sourceUpdatedAt: (row.source_updated_at ?? row.synced_at ?? new Date()).toISOString(),
    })
  }
}

export async function init() {
  if (!dbEnabled) return
  await ensureSchema()
  await seedIfEmpty()
  await hydrate()
  console.log('[db] Đã kết nối Supabase Postgres + nạp dữ liệu.')
}

// ---------- ghi-xuyên-suốt (gọi từ store/routes) ----------
export function upsertAvailability(propertyId: string, d: AvailabilityDay) {
  if (!dbEnabled) return
  query(
    `insert into availability_calendar(property_id,date,status,price,min_nights,note,confidence,source_updated_at,synced_at)
     values($1,$2,$3,$4,$5,$6,$7,$8,now())
     on conflict(property_id,date) do update set status=$3,price=$4,min_nights=$5,note=$6,confidence=$7,source_updated_at=$8,synced_at=now()`,
    [propertyId, d.date, d.status, d.price, d.minNights, d.note, d.confidence, d.sourceUpdatedAt],
  ).catch((e) => log('upsertAvailability', e.message))
}

export function insertBooking(b: BookingRequest) {
  if (!dbEnabled) return
  query(
    `insert into booking_requests(id,property_id,customer_name,customer_contact,channel,checkin,checkout,guests,quoted_price,status,assignee,note,created_at)
     values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now())`,
    [b.id, b.propertyId, b.customerName, b.customerContact, b.channel, b.checkin, b.checkout, b.guests, b.quotedPrice, b.status, b.assignee, b.note],
  ).catch((e) => log('insertBooking', e.message))
}

export function updateBookingStatus(id: string, status: string) {
  if (!dbEnabled) return
  query('update booking_requests set status=$2, updated_at=now() where id=$1', [id, status]).catch((e) => log('updateBookingStatus', e.message))
}

export function insertSheet(s: Sheet) {
  if (!dbEnabled) return
  query(
    `insert into sheets(id,url,spreadsheet_id,title,color_mapping,sync_status,last_synced_at,assignee)
     values($1,$2,$3,$4,$5,$6,now(),$7)`,
    [s.id, s.url, s.spreadsheetId, s.ownerName, J(s.colorMapping), s.syncStatus, s.assignee],
  ).catch((e) => log('insertSheet', e.message))
}

export function touchSheet(s: Sheet) {
  if (!dbEnabled) return
  query('update sheets set sync_status=$2, last_synced_at=now(), last_error=$3 where id=$1', [s.id, s.syncStatus, s.lastError ?? null]).catch((e) => log('touchSheet', e.message))
}

// Trả về Promise để caller AWAIT được — bảo đảm property đã ghi DB xong
// trước khi ghi availability/review (tránh vi phạm khóa ngoại property_id).
export async function insertProperty(p: Property) {
  if (!dbEnabled) return
  try {
    // đảm bảo có owner trước (FK), rồi insert property
    await query('insert into owners(id,name) values($1,$2) on conflict(id) do nothing', [p.ownerId, p.ownerName])
    await query(
      `insert into properties(id,owner_id,name,area,address,bedrooms,capacity_standard,capacity_max,amenities,rules,images,base_price,extra_fee_note,last_synced_at)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,now()) on conflict(id) do nothing`,
      [p.id, p.ownerId, p.name, p.area, p.address, p.bedrooms, p.capacityStandard, p.capacityMax, J(p.amenities), J(p.rules), J(p.images), p.basePrice, p.extraFeeNote],
    )
  } catch (e: any) {
    log('insertProperty', e.message)
  }
}

export function insertReview(r: ReviewItem) {
  if (!dbEnabled) return
  query(
    `insert into review_queue(id,property_id,date,raw_value,raw_color_hex,suggested_status,suggested_price,confidence)
     values($1,$2,$3,$4,$5,$6,$7,$8) on conflict(id) do nothing`,
    [r.id, r.propertyId, r.date, r.rawValue, r.rawColorHex, r.suggestedStatus, r.suggestedPrice, r.confidence],
  ).catch((e) => log('insertReview', e.message))
}

export function resolveReviewRow(id: string) {
  if (!dbEnabled) return
  query('update review_queue set resolved=true where id=$1', [id]).catch((e) => log('resolveReviewRow', e.message))
}

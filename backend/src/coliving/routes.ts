// /api/coliving/* — Thomstay Coliving (dữ liệu ezCloud đã đồng bộ về App DB).
import { safeRouter } from '../app/safe-router.js'
import { clientIp, hasPerm, requirePerm } from '../app/auth.js'
import { audit, q, q1 } from '../app/db.js'
import { connectWithPasted, disconnect } from './ezcloud.js'
import {
  bookingDetail,
  calendar,
  listBookings,
  overview,
  recentEvents,
  revenueDaily,
  revenueYear,
  syncState,
} from './queries.js'

export const colivingRouter = safeRouter()

const ANY = ['coliving.overview', 'coliving.calendar', 'coliving.bookings', 'coliving.revenue', 'coliving.manage']
const wrap = (fn: (req: any, res: any) => Promise<any>) => (req: any, res: any) =>
  fn(req, res).catch((e: Error) => {
    console.error('[coliving]', req.path, e.message)
    res.status(500).json({ error: 'server_error', message: e.message })
  })

colivingRouter.get('/status', requirePerm(...ANY), wrap(async (_req, res) => res.json(await syncState())))

colivingRouter.get('/overview', requirePerm('coliving.overview'), wrap(async (req, res) => res.json(await overview(req.query.date))))

colivingRouter.get('/calendar', requirePerm('coliving.calendar'), wrap(async (req, res) =>
  res.json(await calendar(req.query.from, Number(req.query.days ?? 31))),
))

colivingRouter.get('/bookings', requirePerm('coliving.bookings'), wrap(async (req, res) => res.json(await listBookings(req.query))))

colivingRouter.get('/bookings/:id', requirePerm('coliving.bookings', 'coliving.calendar', 'coliving.overview'), wrap(async (req, res) => {
  const b = await bookingDetail(Number(req.params.id))
  if (!b) return res.status(404).json({ error: 'not_found' })
  // Người không có quyền "Danh sách booking" không xem SĐT/email
  if (!hasPerm(req.user, 'coliving.bookings')) {
    delete b.phone
    delete b.email
  }
  res.json(b)
}))

colivingRouter.get('/events', requirePerm('coliving.bookings', 'coliving.overview'), wrap(async (req, res) => {
  const kinds = String(req.query.kinds ?? '').split(',').filter(Boolean)
  res.json(await recentEvents(Math.min(500, Number(req.query.limit ?? 100)), kinds))
}))

colivingRouter.get('/revenue', requirePerm('coliving.revenue'), wrap(async (req, res) => res.json(await revenueYear(Number(req.query.year)))))
colivingRouter.get('/revenue/daily', requirePerm('coliving.revenue'), wrap(async (req, res) => res.json(await revenueDaily(req.query.month))))

// ----- Quản lý kết nối / đồng bộ -----
colivingRouter.get('/sync-runs', requirePerm('coliving.manage'), wrap(async (req, res) =>
  res.json(
    await q(
      `select id, trigger, started_at, finished_at, ok, stats, error from cl_sync_runs order by started_at desc limit $1`,
      [Math.min(200, Number(req.query.limit ?? 30))],
    ),
  ),
))

colivingRouter.post('/sync', requirePerm('coliving.manage'), wrap(async (req, res) => {
  const pending = await q1<any>('select id from cl_sync_requests where done_at is null limit 1')
  if (!pending) await q('insert into cl_sync_requests(requested_by) values($1)', [req.user.id])
  await audit(req.user.id, 'coliving_sync_request', null, null, clientIp(req))
  res.json({ queued: true, message: 'Đã yêu cầu đồng bộ, worker sẽ chạy trong ~20 giây' })
}))

colivingRouter.post('/connect', requirePerm('coliving.manage'), wrap(async (req, res) => {
  const text = String(req.body?.session ?? '')
  if (text.length < 20) return res.status(400).json({ error: 'empty', message: 'Dán giá trị phiên ezCloud vào ô' })
  try {
    const status = await connectWithPasted(text, req.user.email)
    await audit(req.user.id, 'ezcloud_connect', status.userName ?? null, { hotelId: status.hotelId }, clientIp(req))
    await q('insert into cl_sync_requests(requested_by) values($1)', [req.user.id])
    res.json({ ok: true, status })
  } catch (e) {
    res.status(400).json({ error: 'connect_failed', message: (e as Error).message })
  }
}))

colivingRouter.delete('/connect', requirePerm('coliving.manage'), wrap(async (req, res) => {
  await disconnect()
  await audit(req.user.id, 'ezcloud_disconnect', null, null, clientIp(req))
  res.json({ ok: true })
}))

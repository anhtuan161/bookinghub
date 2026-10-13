// =============================================================
//  /api/auth/*  : đăng ký bằng email, đăng nhập, đổi/đặt lại mật khẩu, thông tin phiên.
//  /api/admin/* : duyệt người dùng, cấp quyền menu, tạo link đặt lại mật khẩu, nhật ký.
//  Chưa có SMTP: đăng ký → trạng thái "chờ duyệt"; admin duyệt + cấp quyền trên web.
// =============================================================
import { safeRouter } from './safe-router.js'
import { config } from '../config.js'
import {
  clientIp,
  createSession,
  destroySession,
  loadUserById,
  rateLimit,
  requireLogin,
  requirePerm,
} from './auth.js'
import { hashPassword, randomToken, sha256, verifyPassword } from './crypto.js'
import { audit, q, q1, tx } from './db.js'
import { ALL_PERMISSIONS, MENUS, PRESETS, isKnownPermission } from './permissions.js'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const normEmail = (e: unknown) => String(e ?? '').trim().toLowerCase()
const pwError = (p: string) =>
  p.length < 8 ? 'Mật khẩu tối thiểu 8 ký tự' : p.length > 200 ? 'Mật khẩu quá dài' : null

function publicUser(u: any) {
  return u && { id: u.id, email: u.email, fullName: u.fullName, status: u.status, isAdmin: u.isAdmin, permissions: u.permissions }
}

// ======================= /api/auth =======================
export const authRouter = safeRouter()

authRouter.get('/me', (req, res) => {
  res.json({ user: publicUser(req.user) ?? null })
})

authRouter.get('/catalog', requireLogin, (_req, res) => res.json({ menus: MENUS, presets: PRESETS }))

authRouter.post('/register', async (req, res) => {
  const ip = clientIp(req)
  if (!rateLimit(`reg:${ip}`, 10, 3600_000)) return res.status(429).json({ error: 'too_many', message: 'Thử lại sau' })
  const email = normEmail(req.body?.email)
  const password = String(req.body?.password ?? '')
  const fullName = String(req.body?.fullName ?? '').trim().slice(0, 120)
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'invalid_email', message: 'Email không hợp lệ' })
  if (!fullName) return res.status(400).json({ error: 'invalid_name', message: 'Nhập họ tên' })
  const pe = pwError(password)
  if (pe) return res.status(400).json({ error: 'weak_password', message: pe })

  const exists = await q1('select 1 from app_users where email = $1', [email])
  if (exists) return res.status(409).json({ error: 'email_taken', message: 'Email đã được đăng ký' })

  const hash = await hashPassword(password)
  const user = await tx(async (c) => {
    // Bootstrap: chưa có admin nào + email nằm trong BOOTSTRAP_ADMIN_EMAILS → admin luôn.
    await c.query('lock table app_users in share row exclusive mode')
    const hasAdmin = (await c.query('select 1 from app_users where is_admin limit 1')).rowCount! > 0
    const bootstrap = !hasAdmin && config.bootstrapAdminEmails.includes(email)
    const r = await c.query(
      `insert into app_users(email, full_name, password_hash, status, is_admin, approved_at)
       values($1,$2,$3,$4,$5, case when $5 then now() end) returning id, status, is_admin`,
      [email, fullName, hash, bootstrap ? 'active' : 'pending', bootstrap],
    )
    return r.rows[0]
  })
  await audit(Number(user.id), user.is_admin ? 'register_bootstrap_admin' : 'register', email, null, ip)
  await createSession(req, res, Number(user.id))
  res.json({ user: publicUser(await loadUserById(Number(user.id))) })
})

authRouter.post('/login', async (req, res) => {
  const ip = clientIp(req)
  const email = normEmail(req.body?.email)
  const password = String(req.body?.password ?? '')
  if (!rateLimit(`login:${ip}`, 30, 900_000) || !rateLimit(`login:${email}`, 10, 900_000))
    return res.status(429).json({ error: 'too_many', message: 'Sai quá nhiều lần, thử lại sau 15 phút' })
  const u = await q1<any>('select id, password_hash, status from app_users where email = $1', [email])
  // luôn chạy scrypt để không lộ "email có tồn tại không" qua thời gian phản hồi
  const ok = await verifyPassword(password, u?.password_hash ?? 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAA')
  if (!u || !ok) {
    await audit(u ? Number(u.id) : null, 'login_failed', email, null, ip)
    return res.status(401).json({ error: 'invalid_credentials', message: 'Sai email hoặc mật khẩu' })
  }
  if (u.status === 'disabled') return res.status(403).json({ error: 'disabled', message: 'Tài khoản đã bị khoá' })
  await createSession(req, res, Number(u.id))
  await audit(Number(u.id), 'login', email, null, ip)
  res.json({ user: publicUser(await loadUserById(Number(u.id))) })
})

authRouter.post('/logout', async (req, res) => {
  await destroySession(req, res)
  res.json({ ok: true })
})

authRouter.post('/change-password', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'unauthorized' })
  const cur = String(req.body?.currentPassword ?? '')
  const next = String(req.body?.newPassword ?? '')
  const pe = pwError(next)
  if (pe) return res.status(400).json({ error: 'weak_password', message: pe })
  const u = await q1<any>('select password_hash from app_users where id = $1', [req.user.id])
  if (!u || !(await verifyPassword(cur, u.password_hash)))
    return res.status(400).json({ error: 'wrong_password', message: 'Mật khẩu hiện tại không đúng' })
  await q('update app_users set password_hash = $2 where id = $1', [req.user.id, await hashPassword(next)])
  // đăng xuất các thiết bị khác
  await q('delete from app_sessions where user_id = $1 and id_hash <> $2', [req.user.id, req.sessionHash ?? ''])
  await audit(req.user.id, 'change_password', req.user.email, null, clientIp(req))
  res.json({ ok: true })
})

authRouter.post('/reset-password', async (req, res) => {
  const ip = clientIp(req)
  if (!rateLimit(`reset:${ip}`, 20, 3600_000)) return res.status(429).json({ error: 'too_many' })
  const token = String(req.body?.token ?? '')
  const next = String(req.body?.newPassword ?? '')
  const pe = pwError(next)
  if (pe) return res.status(400).json({ error: 'weak_password', message: pe })
  const r = await q1<any>(
    'select user_id from app_password_resets where token_hash = $1 and used_at is null and expires_at > now()',
    [sha256(token)],
  )
  if (!r) return res.status(400).json({ error: 'invalid_token', message: 'Link đặt lại đã hết hạn hoặc đã dùng' })
  await tx(async (c) => {
    await c.query('update app_password_resets set used_at = now() where token_hash = $1', [sha256(token)])
    await c.query('update app_users set password_hash = $2 where id = $1', [r.user_id, await hashPassword(next)])
    await c.query('delete from app_sessions where user_id = $1', [r.user_id])
  })
  await audit(Number(r.user_id), 'reset_password', null, null, ip)
  res.json({ ok: true })
})

// ======================= /api/admin =======================
export const adminRouter = safeRouter()
adminRouter.use(requirePerm('admin.users'))

adminRouter.get('/users', async (_req, res) => {
  const rows = await q<any>(
    `select u.id, u.email, u.full_name, u.status, u.is_admin, u.note, u.created_at, u.approved_at, u.last_login_at,
            coalesce(array_agg(p.permission order by p.permission) filter (where p.permission is not null), '{}') as permissions
       from app_users u left join app_user_permissions p on p.user_id = u.id
      group by u.id order by (u.status = 'pending') desc, u.created_at desc`,
  )
  res.json(
    rows.map((u) => ({
      id: Number(u.id),
      email: u.email,
      fullName: u.full_name,
      status: u.status,
      isAdmin: u.is_admin,
      note: u.note,
      createdAt: u.created_at,
      approvedAt: u.approved_at,
      lastLoginAt: u.last_login_at,
      permissions: u.permissions,
    })),
  )
})

adminRouter.patch('/users/:id', async (req, res) => {
  const me = req.user!
  const id = Number(req.params.id)
  const target = await q1<any>('select id, email, status, is_admin from app_users where id = $1', [id])
  if (!target) return res.status(404).json({ error: 'not_found' })
  const b = req.body ?? {}

  // Chỉ admin mới đổi cờ admin / cấp quyền admin.users / sửa tài khoản admin khác.
  const touchesAdmin = typeof b.isAdmin === 'boolean' || (Array.isArray(b.permissions) && b.permissions.includes('admin.users'))
  if ((touchesAdmin || target.is_admin) && !me.isAdmin)
    return res.status(403).json({ error: 'forbidden', message: 'Chỉ admin được thay đổi quyền quản trị' })

  // Không để hệ thống mất admin cuối cùng.
  const demote = (b.isAdmin === false && target.is_admin) || (target.is_admin && b.status && b.status !== 'active')
  if (demote) {
    const n = await q1<any>("select count(*)::int n from app_users where is_admin and status = 'active'")
    if ((n?.n ?? 0) <= 1) return res.status(400).json({ error: 'last_admin', message: 'Phải còn ít nhất 1 admin đang hoạt động' })
  }
  if (b.status && !['pending', 'active', 'disabled'].includes(b.status)) return res.status(400).json({ error: 'invalid_status' })
  if (Array.isArray(b.permissions) && b.permissions.some((p: string) => !isKnownPermission(p)))
    return res.status(400).json({ error: 'unknown_permission' })

  await tx(async (c) => {
    if (b.status)
      await c.query(
        `update app_users set status = $2,
           approved_at = case when $2 = 'active' and approved_at is null then now() else approved_at end,
           approved_by = case when $2 = 'active' and approved_by is null then $3 else approved_by end
         where id = $1`,
        [id, b.status, me.id],
      )
    if (typeof b.isAdmin === 'boolean') await c.query('update app_users set is_admin = $2 where id = $1', [id, b.isAdmin])
    if (typeof b.fullName === 'string') await c.query('update app_users set full_name = $2 where id = $1', [id, b.fullName.trim().slice(0, 120)])
    if (typeof b.note === 'string') await c.query('update app_users set note = $2 where id = $1', [id, b.note.slice(0, 500)])
    if (Array.isArray(b.permissions)) {
      await c.query('delete from app_user_permissions where user_id = $1', [id])
      for (const p of new Set<string>(b.permissions))
        await c.query('insert into app_user_permissions(user_id, permission, granted_by) values($1,$2,$3)', [id, p, me.id])
    }
    if (b.status === 'disabled') await c.query('delete from app_sessions where user_id = $1', [id])
  })
  await audit(me.id, 'update_user', target.email, b, clientIp(req))
  res.json({ ok: true, user: publicUser(await loadUserById(id)) })
})

adminRouter.post('/users/:id/reset-link', async (req, res) => {
  const id = Number(req.params.id)
  const target = await q1<any>('select email, is_admin from app_users where id = $1', [id])
  if (!target) return res.status(404).json({ error: 'not_found' })
  if (target.is_admin && !req.user!.isAdmin) return res.status(403).json({ error: 'forbidden' })
  const token = randomToken()
  await q(
    `insert into app_password_resets(token_hash, user_id, expires_at, created_by) values($1,$2, now() + interval '24 hours', $3)`,
    [sha256(token), id, req.user!.id],
  )
  await audit(req.user!.id, 'create_reset_link', target.email, null, clientIp(req))
  const base = config.publicUrl || `${req.protocol}://${req.get('host')}`
  res.json({ url: `${base}/reset-password?token=${token}`, expiresInHours: 24 })
})

adminRouter.post('/users/:id/logout-all', async (req, res) => {
  const id = Number(req.params.id)
  await q('delete from app_sessions where user_id = $1', [id])
  await audit(req.user!.id, 'logout_all', String(id), null, clientIp(req))
  res.json({ ok: true })
})

adminRouter.get('/audit', async (req, res) => {
  const limit = Math.min(500, Number(req.query.limit ?? 100))
  const rows = await q<any>(
    `select a.id, a.at, a.action, a.target, a.detail, a.ip, u.email as user_email
       from app_audit_log a left join app_users u on u.id = a.user_id order by a.at desc limit $1`,
    [limit],
  )
  res.json(rows)
})

export { ALL_PERMISSIONS }

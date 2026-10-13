// CLI quản trị (chạy trong container): node dist/cli.js <lệnh>
//   users                      liệt kê người dùng
//   make-admin <email>         kích hoạt + cấp admin cho email ĐÃ ĐĂNG KÝ trên web
//   disable <email>            khoá tài khoản + đăng xuất mọi thiết bị
//   reset-link <email>         tạo link đặt lại mật khẩu 24h (in ra màn hình)
//   migrate                    chạy migration App DB
// Không có lệnh nhập mật khẩu: người dùng tự đăng ký/đặt mật khẩu trên web.
import { config } from './config.js'
import { randomToken, sha256 } from './app/crypto.js'
import { appPool, audit, migrate, q, q1 } from './app/db.js'

async function main() {
  const [cmd, arg] = process.argv.slice(2)
  await migrate()
  const email = (arg ?? '').trim().toLowerCase()
  switch (cmd) {
    case 'migrate':
      console.log('ok')
      break
    case 'users': {
      const rows = await q<any>(
        `select u.id, u.email, u.full_name, u.status, u.is_admin, u.last_login_at,
                (select count(*) from app_user_permissions p where p.user_id = u.id)::int perms
           from app_users u order by u.id`,
      )
      console.table(rows)
      break
    }
    case 'make-admin': {
      const u = await q1<any>('select id from app_users where email = $1', [email])
      if (!u) throw new Error(`Chưa có tài khoản ${email} — đăng ký trên web trước`)
      await q("update app_users set is_admin = true, status = 'active', approved_at = coalesce(approved_at, now()) where id = $1", [u.id])
      await audit(null, 'cli_make_admin', email)
      console.log(`${email} -> admin, active`)
      break
    }
    case 'disable': {
      const u = await q1<any>("update app_users set status = 'disabled' where email = $1 returning id", [email])
      if (!u) throw new Error('không thấy user')
      await q('delete from app_sessions where user_id = $1', [u.id])
      await audit(null, 'cli_disable', email)
      console.log(`${email} -> disabled`)
      break
    }
    case 'reset-link': {
      const u = await q1<any>('select id from app_users where email = $1', [email])
      if (!u) throw new Error('không thấy user')
      const token = randomToken()
      await q(`insert into app_password_resets(token_hash, user_id, expires_at) values($1,$2, now() + interval '24 hours')`, [sha256(token), u.id])
      await audit(null, 'cli_reset_link', email)
      console.log(`${config.publicUrl || 'http://<host>'}/reset-password?token=${token}`)
      break
    }
    default:
      console.log('Lệnh: users | make-admin <email> | disable <email> | reset-link <email> | migrate')
  }
  await appPool().end()
}

main().catch((e) => {
  console.error('LỖI:', e.message)
  process.exit(1)
})

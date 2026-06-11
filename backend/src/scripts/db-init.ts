// Tạo bảng + seed dữ liệu ban đầu vào Supabase, rồi thoát.
//   npm run db:init
import { config } from '../config.js'
import * as db from '../db.js'

const run = async () => {
  if (!config.usePg) {
    console.error('Chưa đặt DATABASE_URL trong .env — không có gì để khởi tạo.')
    process.exit(1)
  }
  console.log('Đang kết nối Supabase và tạo bảng…')
  await db.init()
  const c = await db.query('select count(*)::int as n from properties')
  console.log(`Xong. Số villa trong DB: ${c.rows[0].n}`)
  process.exit(0)
}
run().catch((e) => {
  console.error('Lỗi:', e?.message ?? e)
  process.exit(1)
})

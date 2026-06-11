// Hỗ trợ 2 chế độ:
//  - authEnabled (có Supabase): đăng nhập email/mật khẩu thật, token gắn vào API.
//  - không: đăng nhập demo bằng tên (localStorage), API mở.
import { authEnabled, supabase } from './supabase'

const KEY = 'vbh_user'

export { authEnabled }

export function getUser(): string | null {
  return localStorage.getItem(KEY)
}

// Đăng nhập demo (tên) — dùng khi chưa cấu hình Supabase.
export function login(name: string) {
  localStorage.setItem(KEY, name || 'Nhân viên')
}

// Đăng nhập thật qua Supabase. Trả về lỗi (chuỗi) nếu thất bại, null nếu ok.
export async function signIn(email: string, password: string): Promise<string | null> {
  if (!supabase) return 'Chưa cấu hình Supabase Auth'
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return error.message
  localStorage.setItem(KEY, email)
  return null
}

export async function logout() {
  localStorage.removeItem(KEY) // xóa ngay để UI thoát liền
  if (supabase) await supabase.auth.signOut()
}

// Lấy access token để gắn header Authorization (null nếu không có).
export async function getAccessToken(): Promise<string | null> {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

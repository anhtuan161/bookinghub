// Đăng nhập bằng email + mật khẩu (backend App DB, cookie phiên httpOnly).
// Không có VITE_API_URL → chế độ demo: đăng nhập bằng tên, có mọi quyền (dữ liệu mẫu).
import { API_URL, api } from './http'

export interface User {
  id: number
  email: string
  fullName: string
  status: 'pending' | 'active' | 'disabled'
  isAdmin: boolean
  permissions: string[]
}

export const demoMode = !API_URL
const DEMO_KEY = 'vbh_user'

export const ALL_DEMO_PERMS = [
  'bookinghub.search', 'bookinghub.villas', 'bookinghub.review', 'bookinghub.requests', 'bookinghub.sources',
  'bookinghub.dashboard', 'admin.users',
]

function demoUser(): User | null {
  const name = localStorage.getItem(DEMO_KEY)
  return name
    ? { id: 0, email: 'demo@local', fullName: name, status: 'active', isAdmin: false, permissions: ALL_DEMO_PERMS.filter((p) => p !== 'admin.users') }
    : null
}

export async function fetchMe(): Promise<User | null> {
  if (demoMode) return demoUser()
  const r = await api<{ user: User | null }>('/auth/me', { silent401: true })
  return r.user
}

export async function login(email: string, password: string): Promise<User> {
  if (demoMode) {
    localStorage.setItem(DEMO_KEY, email || 'Nhân viên')
    return demoUser()!
  }
  const r = await api<{ user: User }>('/auth/login', { method: 'POST', json: { email, password }, silent401: true })
  return r.user
}

export async function register(fullName: string, email: string, password: string): Promise<User> {
  const r = await api<{ user: User }>('/auth/register', { method: 'POST', json: { fullName, email, password } })
  return r.user
}

export async function logout() {
  localStorage.removeItem(DEMO_KEY)
  if (!demoMode) await api('/auth/logout', { method: 'POST', silent401: true }).catch(() => {})
}

export async function changePassword(currentPassword: string, newPassword: string) {
  await api('/auth/change-password', { method: 'POST', json: { currentPassword, newPassword } })
}

export async function resetPassword(token: string, newPassword: string) {
  await api('/auth/reset-password', { method: 'POST', json: { token, newPassword } })
}

export const can = (u: User | null | undefined, ...perms: string[]) =>
  !!u && u.status === 'active' && (u.isAdmin || perms.some((p) => u.permissions.includes(p)))

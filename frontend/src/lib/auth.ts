const KEY = 'vbh_user'

export function getUser(): string | null {
  return localStorage.getItem(KEY)
}

export function login(name: string) {
  localStorage.setItem(KEY, name || 'Nhân viên')
}

export function logout() {
  localStorage.removeItem(KEY)
}

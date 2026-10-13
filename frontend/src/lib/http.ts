// Gọi API cùng origin bằng cookie phiên (httpOnly). VITE_API_URL trống = chế độ demo (mock, không backend).
export const API_URL: string | undefined = import.meta.env.VITE_API_URL || undefined

export class ApiError extends Error {
  status: number
  code?: string
  constructor(status: number, message: string, code?: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

// Phiên hết hạn → AuthProvider đăng ký hàm này để đưa về trang đăng nhập.
let onUnauthorized: (() => void) | null = null
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn
}

export async function api<T>(path: string, opts?: RequestInit & { json?: unknown; silent401?: boolean }): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json', ...(opts?.headers as any) }
  let body = opts?.body
  if (opts?.json !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(opts.json)
  } else if (typeof body === 'string' && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }
  const method = (opts?.method ?? 'GET').toUpperCase()
  let url = `${API_URL ?? '/api'}${path}`
  if (method === 'GET') url += `${url.includes('?') ? '&' : '?'}_ts=${Date.now()}`
  const res = await fetch(url, { ...opts, method, headers, body, credentials: 'include', cache: 'no-store' })
  const text = await res.text()
  let data: any = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }
  if (!res.ok) {
    if (res.status === 401 && !opts?.silent401) onUnauthorized?.()
    const msg = (data && (data.message || data.error)) || `Lỗi ${res.status}`
    throw new ApiError(res.status, msg, data?.error)
  }
  return data as T
}

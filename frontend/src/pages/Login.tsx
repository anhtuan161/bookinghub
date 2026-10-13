import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import AuthShell, { FormError } from '../components/AuthShell'
import { demoMode, login } from '../lib/auth'
import { homePath } from '../lib/nav'
import { useSession } from '../lib/session'

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation() as { state?: { from?: string } }
  const { user, setUser } = useSession()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  if (user) return <Navigate to={user.status === 'active' ? location.state?.from || homePath(user) : '/pending'} replace />

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr('')
    setLoading(true)
    try {
      const u = await login(email.trim(), password)
      setUser(u)
      navigate(u.status === 'active' ? location.state?.from || homePath(u) : '/pending', { replace: true })
    } catch (e: any) {
      setErr(e.message || 'Đăng nhập thất bại')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell title="Thomstay Hub" subtitle="Booking Hub · Thomstay Coliving">
      <form onSubmit={submit} className="card p-7">
        <div className="mb-4">
          <label className="label">{demoMode ? 'Tên nhân viên (demo)' : 'Email'}</label>
          <input
            autoFocus
            type={demoMode ? 'text' : 'email'}
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={demoMode ? 'Ví dụ: Lan' : 'ban@congty.com'}
            className="input"
            required
          />
        </div>
        <div className="mb-2">
          <label className="label">Mật khẩu</label>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="input"
            required={!demoMode}
          />
        </div>
        <FormError msg={err} />
        <button disabled={loading} className="btn-primary mt-5 w-full py-3 text-base">
          {loading ? 'Đang đăng nhập…' : 'Đăng nhập'}
        </button>
        {!demoMode && (
          <div className="mt-4 space-y-1 text-center text-sm text-slate-500">
            <p>
              Chưa có tài khoản?{' '}
              <Link to="/register" className="font-semibold text-brand-600 hover:underline">
                Đăng ký bằng email
              </Link>
            </p>
            <p className="text-xs text-slate-400">Quên mật khẩu? Liên hệ quản trị để nhận link đặt lại.</p>
          </div>
        )}
      </form>
    </AuthShell>
  )
}

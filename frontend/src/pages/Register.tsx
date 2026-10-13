import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import AuthShell, { FormError } from '../components/AuthShell'
import { demoMode, register } from '../lib/auth'
import { homePath } from '../lib/nav'
import { useSession } from '../lib/session'

export default function Register() {
  const navigate = useNavigate()
  const { user, setUser } = useSession()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  if (demoMode) return <Navigate to="/login" replace />
  if (user) return <Navigate to={user.status === 'active' ? homePath(user) : '/pending'} replace />

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr('')
    if (password !== confirm) return setErr('Mật khẩu nhập lại không khớp')
    if (password.length < 8) return setErr('Mật khẩu tối thiểu 8 ký tự')
    setLoading(true)
    try {
      const u = await register(fullName.trim(), email.trim(), password)
      setUser(u)
      navigate(u.status === 'active' ? homePath(u) : '/pending', { replace: true })
    } catch (e: any) {
      setErr(e.message || 'Đăng ký thất bại')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell title="Đăng ký tài khoản" subtitle="Quản trị sẽ duyệt và cấp quyền menu cho bạn">
      <form onSubmit={submit} className="card space-y-4 p-7">
        <div>
          <label className="label">Họ tên</label>
          <input autoFocus value={fullName} onChange={(e) => setFullName(e.target.value)} className="input" placeholder="Nguyễn Văn A" required />
        </div>
        <div>
          <label className="label">Email</label>
          <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className="input" placeholder="ban@congty.com" required />
        </div>
        <div>
          <label className="label">Mật khẩu (≥ 8 ký tự)</label>
          <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="input" required />
        </div>
        <div>
          <label className="label">Nhập lại mật khẩu</label>
          <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="input" required />
        </div>
        <FormError msg={err} />
        <button disabled={loading} className="btn-primary w-full py-3 text-base">
          {loading ? 'Đang gửi…' : 'Đăng ký'}
        </button>
        <p className="text-center text-sm text-slate-500">
          Đã có tài khoản?{' '}
          <Link to="/login" className="font-semibold text-brand-600 hover:underline">
            Đăng nhập
          </Link>
        </p>
      </form>
    </AuthShell>
  )
}

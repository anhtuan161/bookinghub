import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import AuthShell, { FormError } from '../components/AuthShell'
import { resetPassword } from '../lib/auth'

export default function ResetPassword() {
  const [sp] = useSearchParams()
  const token = sp.get('token') ?? ''
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [err, setErr] = useState('')
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr('')
    if (password !== confirm) return setErr('Mật khẩu nhập lại không khớp')
    setLoading(true)
    try {
      await resetPassword(token, password)
      setDone(true)
    } catch (e: any) {
      setErr(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell title="Đặt lại mật khẩu">
      <div className="card p-7">
        {done ? (
          <div className="space-y-4 text-center">
            <p className="text-sm text-slate-600">Đã đặt mật khẩu mới. Các thiết bị khác đã bị đăng xuất.</p>
            <Link to="/login" className="btn-primary w-full">
              Đăng nhập
            </Link>
          </div>
        ) : !token ? (
          <p className="text-sm text-slate-600">Link không hợp lệ. Nhờ quản trị tạo link mới.</p>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="label">Mật khẩu mới (≥ 8 ký tự)</label>
              <input autoFocus type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="input" required />
            </div>
            <div>
              <label className="label">Nhập lại</label>
              <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="input" required />
            </div>
            <FormError msg={err} />
            <button disabled={loading} className="btn-primary w-full py-3">
              {loading ? 'Đang lưu…' : 'Lưu mật khẩu'}
            </button>
          </form>
        )}
      </div>
    </AuthShell>
  )
}

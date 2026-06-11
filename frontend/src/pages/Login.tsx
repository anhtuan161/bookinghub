import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { login } from '../lib/auth'

export default function Login() {
  const navigate = useNavigate()
  const [name, setName] = useState('')

  function submit(e: React.FormEvent) {
    e.preventDefault()
    login(name.trim() || 'Nhân viên')
    navigate('/search')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-100 via-slate-100 to-brand-50 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-3xl shadow-pop">
            🏡
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-800">Villa Booking Hub</h1>
          <p className="mt-1 text-sm text-slate-500">Hệ thống quản trị booking nội bộ</p>
        </div>

        <form onSubmit={submit} className="card p-7">
          <div className="mb-4">
            <label className="label">Tên nhân viên</label>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ví dụ: Lan" className="input" />
          </div>
          <div className="mb-6">
            <label className="label">Mật khẩu</label>
            <input type="password" placeholder="••••••• (demo: nhập gì cũng được)" className="input" />
          </div>
          <button className="btn-primary w-full py-3 text-base">Đăng nhập</button>
          <p className="mt-4 text-center text-xs text-slate-400">
            Bản demo dùng dữ liệu mẫu — không cần tài khoản thật.
          </p>
        </form>
      </div>
    </div>
  )
}

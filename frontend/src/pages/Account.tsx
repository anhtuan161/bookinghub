import { useState } from 'react'
import { FormError } from '../components/AuthShell'
import { changePassword, demoMode } from '../lib/auth'
import { NAV } from '../lib/nav'
import { useSession } from '../lib/session'
import { showToast } from '../lib/toast'

export default function Account() {
  const { user } = useSession()
  const [cur, setCur] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  if (!user) return null

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr('')
    if (next !== confirm) return setErr('Mật khẩu nhập lại không khớp')
    setSaving(true)
    try {
      await changePassword(cur, next)
      setCur('')
      setNext('')
      setConfirm('')
      showToast('Đã đổi mật khẩu')
    } catch (e: any) {
      setErr(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">Tài khoản</h1>
      <div className="card grid gap-4 p-6 sm:grid-cols-2">
        <div>
          <div className="label">Họ tên</div>
          <div className="font-medium text-slate-800">{user.fullName}</div>
        </div>
        <div>
          <div className="label">Email</div>
          <div className="font-medium text-slate-800">{user.email}</div>
        </div>
        <div className="sm:col-span-2">
          <div className="label">Quyền truy cập</div>
          {user.isAdmin ? (
            <span className="badge bg-brand-50 text-brand-700">Admin — toàn quyền</span>
          ) : (
            <div className="mt-1 space-y-2">
              {NAV.map((g) => {
                const items = g.items.filter((i) => user.permissions.includes(i.perm))
                if (!items.length) return null
                return (
                  <div key={g.key} className="text-sm">
                    <span className="font-semibold text-slate-700">{g.label}:</span>{' '}
                    <span className="text-slate-600">{items.map((i) => i.label).join(', ')}</span>
                  </div>
                )
              })}
              {user.permissions.length === 0 && <span className="text-sm text-slate-500">Chưa được cấp quyền menu nào.</span>}
            </div>
          )}
        </div>
      </div>

      {!demoMode && (
        <form onSubmit={submit} className="card space-y-4 p-6">
          <h2 className="font-semibold text-slate-800">Đổi mật khẩu</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="label">Mật khẩu hiện tại</label>
              <input type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} className="input" required />
            </div>
            <div>
              <label className="label">Mật khẩu mới</label>
              <input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} className="input" required />
            </div>
            <div>
              <label className="label">Nhập lại</label>
              <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="input" required />
            </div>
          </div>
          <FormError msg={err} />
          <button disabled={saving} className="btn-primary">
            {saving ? 'Đang lưu…' : 'Đổi mật khẩu'}
          </button>
        </form>
      )}
    </div>
  )
}

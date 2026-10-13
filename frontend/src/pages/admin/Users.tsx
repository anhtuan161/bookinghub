import { useEffect, useMemo, useState } from 'react'
import Modal from '../../components/Modal'
import { api } from '../../lib/http'
import { useSession } from '../../lib/session'
import { showToast } from '../../lib/toast'

interface AdminUser {
  id: number
  email: string
  fullName: string
  status: 'pending' | 'active' | 'disabled'
  isAdmin: boolean
  note: string | null
  createdAt: string
  approvedAt: string | null
  lastLoginAt: string | null
  permissions: string[]
}
interface Catalog {
  menus: { key: string; label: string; items: { key: string; label: string; description?: string; sensitive?: boolean }[] }[]
  presets: { key: string; label: string; permissions: string[] }[]
}

const STATUS_META = {
  pending: { label: 'Chờ duyệt', cls: 'bg-amber-50 text-amber-700 ring-amber-200' },
  active: { label: 'Hoạt động', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  disabled: { label: 'Đã khoá', cls: 'bg-slate-100 text-slate-500 ring-slate-200' },
}

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' }) : '—')

export default function Users() {
  const { user: me, refresh: refreshMe } = useSession()
  const [users, setUsers] = useState<AdminUser[] | null>(null)
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [filter, setFilter] = useState<'all' | 'pending' | 'active' | 'disabled'>('all')
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<AdminUser | null>(null)
  const [audit, setAudit] = useState<any[] | null>(null)

  function load() {
    api<AdminUser[]>('/admin/users').then(setUsers).catch((e) => showToast(e.message))
  }
  useEffect(() => {
    load()
    api<Catalog>('/auth/catalog').then(setCatalog)
  }, [])

  const labelOf = useMemo(() => {
    const m = new Map<string, string>()
    catalog?.menus.forEach((g) => g.items.forEach((i) => m.set(i.key, `${g.label} › ${i.label}`)))
    return m
  }, [catalog])

  const counts = useMemo(() => {
    const c = { all: users?.length ?? 0, pending: 0, active: 0, disabled: 0 }
    users?.forEach((u) => c[u.status]++)
    return c
  }, [users])

  const shown = (users ?? []).filter(
    (u) => (filter === 'all' || u.status === filter) && (!q || `${u.email} ${u.fullName}`.toLowerCase().includes(q.toLowerCase())),
  )

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-brand-600">Quản trị</div>
          <h1 className="text-2xl font-bold text-slate-800">Người dùng & phân quyền</h1>
          <p className="mt-1 text-sm text-slate-500">
            Người dùng tự đăng ký bằng email → bạn duyệt và chọn menu được truy cập. Quyền có hiệu lực ngay.
          </p>
        </div>
        <button
          className="btn-ghost btn-sm"
          onClick={() => api<any[]>('/admin/audit?limit=200').then(setAudit).catch((e) => showToast(e.message))}
        >
          📜 Nhật ký
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(['all', 'pending', 'active', 'disabled'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${filter === f ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'}`}
          >
            {f === 'all' ? 'Tất cả' : STATUS_META[f].label} ({counts[f]})
          </button>
        ))}
        <input className="input ml-auto w-64" placeholder="Tìm email / tên" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2">Người dùng</th>
              <th className="px-4 py-2">Trạng thái</th>
              <th className="px-4 py-2">Quyền menu</th>
              <th className="px-4 py-2">Đăng nhập cuối</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {shown.map((u) => (
              <tr key={u.id} className={u.status === 'pending' ? 'bg-amber-50/40' : ''}>
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-800">
                    {u.fullName || '—'} {u.id === me?.id && <span className="text-xs text-slate-400">(bạn)</span>}
                  </div>
                  <div className="text-xs text-slate-500">{u.email}</div>
                  <div className="text-[11px] text-slate-400">Đăng ký {fmt(u.createdAt)}</div>
                </td>
                <td className="px-4 py-3">
                  <span className={`badge ring-1 ${STATUS_META[u.status].cls}`}>{STATUS_META[u.status].label}</span>
                  {u.isAdmin && <span className="badge ml-1 bg-brand-50 text-brand-700">Admin</span>}
                </td>
                <td className="max-w-md px-4 py-3">
                  {u.isAdmin ? (
                    <span className="text-xs text-slate-500">Toàn quyền</span>
                  ) : u.permissions.length ? (
                    <div className="flex flex-wrap gap-1">
                      {u.permissions.map((p) => (
                        <span key={p} className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">
                          {labelOf.get(p) ?? p}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400">Chưa có</span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">{fmt(u.lastLoginAt)}</td>
                <td className="px-4 py-3 text-right">
                  <button className={u.status === 'pending' ? 'btn-primary btn-sm' : 'btn-ghost btn-sm'} onClick={() => setEditing(u)}>
                    {u.status === 'pending' ? 'Duyệt' : 'Sửa'}
                  </button>
                </td>
              </tr>
            ))}
            {users && shown.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  Không có người dùng
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && catalog && (
        <EditUser
          user={editing}
          catalog={catalog}
          meIsAdmin={!!me?.isAdmin}
          isMe={editing.id === me?.id}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            load()
            refreshMe()
          }}
        />
      )}

      <Modal open={!!audit} title="Nhật ký hoạt động (200 dòng gần nhất)" onClose={() => setAudit(null)} width="max-w-3xl">
        <div className="max-h-[60vh] overflow-y-auto text-xs">
          <table className="w-full">
            <tbody className="divide-y divide-slate-100">
              {audit?.map((a) => (
                <tr key={a.id}>
                  <td className="whitespace-nowrap py-1.5 pr-3 text-slate-400">{fmt(a.at)}</td>
                  <td className="py-1.5 pr-3 text-slate-600">{a.user_email ?? 'hệ thống'}</td>
                  <td className="py-1.5 pr-3 font-medium text-slate-700">{a.action}</td>
                  <td className="py-1.5 pr-3 text-slate-500">{a.target}</td>
                  <td className="py-1.5 text-slate-400">{a.ip}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Modal>
    </div>
  )
}

function EditUser({
  user,
  catalog,
  meIsAdmin,
  isMe,
  onClose,
  onSaved,
}: {
  user: AdminUser
  catalog: Catalog
  meIsAdmin: boolean
  isMe: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const [status, setStatus] = useState(user.status === 'pending' ? 'active' : user.status)
  const [isAdmin, setIsAdmin] = useState(user.isAdmin)
  const [perms, setPerms] = useState<Set<string>>(new Set(user.permissions))
  const [fullName, setFullName] = useState(user.fullName)
  const [note, setNote] = useState(user.note ?? '')
  const [saving, setSaving] = useState(false)
  const [resetUrl, setResetUrl] = useState('')

  const toggle = (k: string) => {
    const n = new Set(perms)
    n.has(k) ? n.delete(k) : n.add(k)
    setPerms(n)
  }
  const toggleGroup = (keys: string[]) => {
    const n = new Set(perms)
    const all = keys.every((k) => n.has(k))
    keys.forEach((k) => (all ? n.delete(k) : n.add(k)))
    setPerms(n)
  }

  async function save() {
    setSaving(true)
    try {
      const body: any = { status, permissions: [...perms], fullName, note }
      if (meIsAdmin) body.isAdmin = isAdmin
      await api(`/admin/users/${user.id}`, { method: 'PATCH', json: body })
      showToast('Đã lưu')
      onSaved()
    } catch (e: any) {
      showToast(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function makeResetLink() {
    try {
      const r = await api<{ url: string }>(`/admin/users/${user.id}/reset-link`, { method: 'POST', json: {} })
      setResetUrl(r.url)
    } catch (e: any) {
      showToast(e.message)
    }
  }

  async function logoutAll() {
    await api(`/admin/users/${user.id}/logout-all`, { method: 'POST', json: {} })
    showToast('Đã đăng xuất mọi thiết bị của người này')
  }

  return (
    <Modal open title={user.status === 'pending' ? `Duyệt: ${user.email}` : `Sửa: ${user.email}`} onClose={onClose} width="max-w-3xl">
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label">Họ tên</label>
            <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div>
            <label className="label">Trạng thái</label>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value as any)} disabled={isMe}>
              <option value="active">Hoạt động</option>
              <option value="pending">Chờ duyệt</option>
              <option value="disabled">Khoá</option>
            </select>
          </div>
          <div>
            <label className="label">Ghi chú</label>
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="vd: lễ tân ca tối" />
          </div>
        </div>

        {meIsAdmin && (
          <label className="flex items-center gap-2 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800">
            <input type="checkbox" checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)} disabled={isMe} />
            <b>Admin</b> — toàn quyền mọi menu, kể cả menu thêm sau này
          </label>
        )}

        {!isAdmin && (
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="label mb-0">Mẫu nhanh:</span>
              {catalog.presets.map((p) => (
                <button key={p.key} type="button" className="btn-ghost btn-sm" onClick={() => setPerms(new Set(p.permissions))}>
                  {p.label}
                </button>
              ))}
              <button type="button" className="btn-ghost btn-sm" onClick={() => setPerms(new Set())}>
                Bỏ hết
              </button>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {catalog.menus.map((g) => {
                const keys = g.items.map((i) => i.key)
                const restricted = g.key === 'admin' && !meIsAdmin
                return (
                  <div key={g.key} className="rounded-xl border border-slate-200 p-3">
                    <label className="mb-2 flex items-center gap-2 font-semibold text-slate-800">
                      <input
                        type="checkbox"
                        disabled={restricted}
                        checked={keys.every((k) => perms.has(k))}
                        ref={(el) => {
                          if (el) el.indeterminate = keys.some((k) => perms.has(k)) && !keys.every((k) => perms.has(k))
                        }}
                        onChange={() => toggleGroup(keys)}
                      />
                      {g.label}
                    </label>
                    <div className="space-y-1.5 pl-1">
                      {g.items.map((i) => (
                        <label key={i.key} className="flex items-start gap-2 text-sm text-slate-700">
                          <input type="checkbox" className="mt-0.5" disabled={restricted} checked={perms.has(i.key)} onChange={() => toggle(i.key)} />
                          <span>
                            {i.label}
                            {i.sensitive && <span className="ml-1 text-[10px] text-amber-600">● dữ liệu nhạy cảm</span>}
                            {i.description && <span className="block text-[11px] text-slate-400">{i.description}</span>}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Đang lưu…' : user.status === 'pending' ? 'Duyệt & lưu quyền' : 'Lưu'}
          </button>
          <button className="btn-ghost" onClick={onClose}>
            Huỷ
          </button>
          {!isMe && (
            <>
              <button className="btn-ghost btn-sm ml-auto" onClick={makeResetLink}>
                🔑 Tạo link đặt lại mật khẩu
              </button>
              <button className="btn-ghost btn-sm" onClick={logoutAll}>
                Đăng xuất mọi thiết bị
              </button>
            </>
          )}
        </div>
        {resetUrl && (
          <div className="rounded-lg bg-slate-50 p-3 text-sm">
            <div className="mb-1 text-xs text-slate-500">Gửi link này cho người dùng (hết hạn sau 24 giờ, dùng 1 lần):</div>
            <div className="flex gap-2">
              <input className="input font-mono text-xs" readOnly value={resetUrl} onFocus={(e) => e.target.select()} />
              <button className="btn-ghost btn-sm" onClick={() => navigator.clipboard?.writeText(resetUrl).then(() => showToast('Đã chép link'))}>
                Chép
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}

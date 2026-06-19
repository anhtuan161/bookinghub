import { useEffect, useState } from 'react'
import Modal from '../components/Modal'
import { addOwnerSheet, getSheets, triggerN8nManualSync, updateOwnerSheet } from '../lib/api'
import { onDbRefresh } from '../lib/refresh'
import { DEFAULT_SHEET_PROFILE, SHEET_PROFILES, sheetProfileLabel } from '../lib/sheetProfiles'
import { showToast } from '../lib/toast'
import type { Sheet } from '../lib/types'
import { freshness } from '../lib/utils'

const SYNC_META: Record<Sheet['syncStatus'], { label: string; cls: string }> = {
  ok: { label: 'Thành công', cls: 'bg-green-100 text-green-700' },
  needs_check: { label: 'Cần kiểm tra', cls: 'bg-amber-100 text-amber-700' },
  error: { label: 'Lỗi', cls: 'bg-red-100 text-red-700' },
}

export default function Sources() {
  const [sheets, setSheets] = useState<Sheet[]>([])
  const [addOpen, setAddOpen] = useState(false)
  const [syncingN8n, setSyncingN8n] = useState(false)

  function load() {
    getSheets().then(setSheets)
  }
  useEffect(() => {
    load()
    return onDbRefresh(load)
  }, [])

  async function runN8nManual() {
    setSyncingN8n(true)
    await triggerN8nManualSync()
    setSyncingN8n(false)
    showToast('Da gui yeu cau chay n8n manual sync')
    load()
  }

  async function updateSheetProfile(sheet: Sheet, parserType: string) {
    await updateOwnerSheet(sheet.id, { parserType })
    showToast('Da cap nhat mau sheet')
    load()
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-800">Nguồn dữ liệu</h1>
          <p className="text-sm text-slate-500">Các Google Sheet của chủ nhà đang được đồng bộ.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={runN8nManual} disabled={syncingN8n} className="btn-primary">
            {syncingN8n ? 'Dang goi n8n...' : 'Chay n8n manual'}
          </button>
          <button onClick={() => setAddOpen(true)} className="btn-ghost">
            + Them chu nha
          </button>
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3">Chủ nhà</th>
              <th className="px-4 py-3">Số villa</th>
              <th className="px-4 py-3">Trạng thái</th>
              <th className="px-4 py-3">Mẫu sheet</th>
              <th className="px-4 py-3">Cập nhật</th>
              <th className="px-4 py-3">Phụ trách</th>
              <th className="px-4 py-3 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {sheets.map((s) => {
              const fr = freshness(s.lastSyncedAt)
              return (
                <tr key={s.id} className={`border-t border-slate-100 ${s.syncStatus === 'error' ? 'bg-red-50/40' : ''}`}>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-slate-700">{s.ownerName}</div>
                    <div className="text-xs text-slate-400">{s.ownerPhone} • HH {s.commissionRate}%</div>
                    {s.lastError && <div className="mt-1 text-xs text-red-600">⚠ {s.lastError}</div>}
                  </td>
                  <td className="px-4 py-3">{s.propertyCount}</td>
                  <td className="px-4 py-3">
                    <span className={`badge ${SYNC_META[s.syncStatus].cls}`}>{SYNC_META[s.syncStatus].label}</span>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      className="input h-9 min-w-[210px] text-xs"
                      value={s.parserType || DEFAULT_SHEET_PROFILE}
                      title={sheetProfileLabel(s.parserType)}
                      onChange={(e) => updateSheetProfile(s, e.target.value)}
                    >
                      {SHEET_PROFILES.map((profile) => (
                        <option key={profile.value} value={profile.value}>
                          {profile.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                      <span className={`h-2 w-2 rounded-full ${fr.dot}`} />
                      {fr.label}
                    </span>
                  </td>
                  <td className="px-4 py-3">{s.assignee}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <a href={s.url} target="_blank" className="btn-ghost btn-sm">Mở sheet</a>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <AddModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSaved={() => {
          setAddOpen(false)
          load()
        }}
      />
    </div>
  )
}

function AddModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ ownerName: '', ownerPhone: '', url: '', commissionRate: 10, parserType: DEFAULT_SHEET_PROFILE })

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.ownerName || !form.url) {
      alert('Nhập tên chủ nhà và link Google Sheet')
      return
    }
    await addOwnerSheet(form)
    showToast('Đã thêm chủ nhà')
    setForm({ ownerName: '', ownerPhone: '', url: '', commissionRate: 10, parserType: DEFAULT_SHEET_PROFILE })
    onSaved()
  }

  return (
    <Modal open={open} title="Thêm chủ nhà mới" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <L label="Tên chủ nhà">
          <input className="input" value={form.ownerName} onChange={(e) => setForm({ ...form, ownerName: e.target.value })} />
        </L>
        <L label="Số điện thoại">
          <input className="input" value={form.ownerPhone} onChange={(e) => setForm({ ...form, ownerPhone: e.target.value })} />
        </L>
        <L label="Link Google Sheet">
          <input className="input" placeholder="https://docs.google.com/spreadsheets/d/..." value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
        </L>
        <L label="Hoa hồng (%)">
          <input type="number" className="input" value={form.commissionRate} onChange={(e) => setForm({ ...form, commissionRate: Number(e.target.value) })} />
        </L>
        <L label="Mẫu sheet">
          <select className="input" value={form.parserType} onChange={(e) => setForm({ ...form, parserType: e.target.value })}>
            {SHEET_PROFILES.map((profile) => (
              <option key={profile.value} value={profile.value}>
                {profile.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-500">
            Chọn theo hình dạng Google Sheet. Nếu chưa chắc, dùng "Chưa biết" để tránh sync sai.
          </p>
        </L>
        <div className="rounded-lg bg-slate-50 px-3 py-2.5 text-xs text-slate-500">
          Sau khi thêm, nhớ chia sẻ sheet cho tài khoản hệ thống (quyền Xem) để đồng bộ được.
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-ghost">Hủy</button>
          <button className="btn-primary">Thêm</button>
        </div>
      </form>
    </Modal>
  )
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
    </label>
  )
}

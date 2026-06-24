import { useEffect, useState } from 'react'
import Modal from '../components/Modal'
import { addOwnerSheet, getSheets, triggerN8nManualSync, updateOwnerSheet } from '../lib/api'
import { onDbRefresh } from '../lib/refresh'
import { DEFAULT_SHEET_PROFILE, SHEET_PROFILES, sheetProfileFor } from '../lib/sheetProfiles'
import { showToast } from '../lib/toast'
import type { Sheet } from '../lib/types'
import { freshness } from '../lib/utils'

const SYNC_META: Record<Sheet['syncStatus'], { label: string; cls: string }> = {
  ok: { label: 'Thành công', cls: 'bg-green-100 text-green-700' },
  needs_check: { label: 'Cần kiểm tra', cls: 'bg-amber-100 text-amber-700' },
  error: { label: 'Lỗi', cls: 'bg-red-100 text-red-700' },
}

type PendingProfileChange = {
  sheet: Sheet
  nextParserType: string
}

export default function Sources() {
  const [sheets, setSheets] = useState<Sheet[]>([])
  const [addOpen, setAddOpen] = useState(false)
  const [syncingN8n, setSyncingN8n] = useState(false)
  const [pendingProfile, setPendingProfile] = useState<PendingProfileChange | null>(null)

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
    showToast('Đã gửi yêu cầu chạy n8n manual sync')
    load()
  }

  async function confirmProfileChange() {
    if (!pendingProfile) return
    await updateOwnerSheet(pendingProfile.sheet.id, { parserType: pendingProfile.nextParserType })
    setPendingProfile(null)
    showToast('Đã cập nhật mẫu sheet')
    load()
  }

  function requestProfileChange(sheet: Sheet, nextParserType: string) {
    if ((sheet.parserType || DEFAULT_SHEET_PROFILE) === nextParserType) return
    setPendingProfile({ sheet, nextParserType })
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-800">Nguồn dữ liệu</h1>
          <p className="text-sm text-slate-500">Quản lý Google Sheet chủ nhà và cách hệ thống đọc lịch từng sheet.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={runN8nManual} disabled={syncingN8n} className="btn-primary">
            {syncingN8n ? 'Đang gọi n8n...' : 'Chạy n8n manual'}
          </button>
          <button onClick={() => setAddOpen(true)} className="btn-ghost">
            + Thêm chủ nhà
          </button>
        </div>
      </div>

      <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <div className="font-semibold">Chọn theo file mẫu đã chạy đúng</div>
        <div className="mt-1 text-amber-800">
          Nhân viên không cần hiểu cấu trúc sheet. Nếu file mới nhìn giống Mẹ Bắp thì chọn Mẹ Bắp, giống Hoàng Cường thì chọn Hoàng Cường. Không chắc thì chọn "Không chắc - nhờ kỹ thuật".
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3">Chủ nhà</th>
              <th className="px-4 py-3">Số villa</th>
              <th className="px-4 py-3">Trạng thái</th>
              <th className="px-4 py-3">Cách đọc lịch</th>
              <th className="px-4 py-3">Cập nhật</th>
              <th className="px-4 py-3">Phụ trách</th>
              <th className="px-4 py-3 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {sheets.map((s) => {
              const fr = freshness(s.lastSyncedAt)
              const profile = sheetProfileFor(s.parserType)
              return (
                <tr key={s.id} className={`border-t border-slate-100 ${s.syncStatus === 'error' ? 'bg-red-50/40' : ''}`}>
                  <td className="px-4 py-3 align-top">
                    <div className="font-semibold text-slate-700">{s.ownerName}</div>
                    <div className="text-xs text-slate-400">{s.ownerPhone} • HH {s.commissionRate}%</div>
                    {s.lastError && <div className="mt-1 text-xs text-red-600">⚠ {s.lastError}</div>}
                  </td>
                  <td className="px-4 py-3 align-top">{s.propertyCount}</td>
                  <td className="px-4 py-3 align-top">
                    <span className={`badge ${SYNC_META[s.syncStatus].cls}`}>{SYNC_META[s.syncStatus].label}</span>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <div className="min-w-[290px]">
                      <select
                        className="input h-10 text-sm"
                        value={s.parserType || DEFAULT_SHEET_PROFILE}
                        title={profile.description}
                        onChange={(e) => requestProfileChange(s, e.target.value)}
                      >
                        {SHEET_PROFILES.map((item) => (
                          <option key={item.value} value={item.value}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                      <div className={`mt-2 rounded-lg px-3 py-2 text-xs ${profile.value === 'needs_manual_mapping' ? 'bg-amber-50 text-amber-800' : 'bg-slate-50 text-slate-600'}`}>
                        <div className="font-semibold">{profile.shortLabel}</div>
                        <div className="mt-0.5">{profile.example}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                      <span className={`h-2 w-2 rounded-full ${fr.dot}`} />
                      {fr.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 align-top">{s.assignee}</td>
                  <td className="px-4 py-3 align-top">
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

      <ConfirmProfileModal
        pending={pendingProfile}
        onClose={() => setPendingProfile(null)}
        onConfirm={confirmProfileChange}
      />
    </div>
  )
}

function ConfirmProfileModal({
  pending,
  onClose,
  onConfirm,
}: {
  pending: PendingProfileChange | null
  onClose: () => void
  onConfirm: () => void
}) {
  const current = sheetProfileFor(pending?.sheet.parserType)
  const next = sheetProfileFor(pending?.nextParserType)

  return (
    <Modal open={Boolean(pending)} title="Xác nhận đổi cách đọc lịch" onClose={onClose}>
      <div className="space-y-4 text-sm text-slate-600">
        <p>
          Bạn đang đổi cách hệ thống đọc lịch cho <span className="font-semibold text-slate-800">{pending?.sheet.ownerName}</span>.
        </p>
        <div className="rounded-lg bg-slate-50 px-3 py-2">
          <div>Hiện tại: <span className="font-semibold text-slate-800">{current.label}</span></div>
          <div>Đổi sang: <span className="font-semibold text-slate-800">{next.label}</span></div>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
          Nếu chọn sai, hệ thống có thể đọc sai lịch. Sau khi đổi, hãy chạy n8n riêng sheet này và kiểm tra lại dữ liệu trước khi chạy nhiều sheet.
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-ghost">Hủy</button>
          <button type="button" onClick={onConfirm} className="btn-primary">Đổi cách đọc lịch</button>
        </div>
      </div>
    </Modal>
  )
}

function AddModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ ownerName: '', ownerPhone: '', url: '', commissionRate: 10, parserType: DEFAULT_SHEET_PROFILE })
  const selectedProfile = sheetProfileFor(form.parserType)

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
        <L label="Cách đọc lịch">
          <select className="input" value={form.parserType} onChange={(e) => setForm({ ...form, parserType: e.target.value })}>
            {SHEET_PROFILES.map((profile) => (
              <option key={profile.value} value={profile.value}>
                {profile.label}
              </option>
            ))}
          </select>
          <div className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <div className="font-semibold">{selectedProfile.shortLabel}</div>
            <div className="mt-0.5">{selectedProfile.description}</div>
          </div>
        </L>
        <div className="rounded-lg bg-slate-50 px-3 py-2.5 text-xs text-slate-500">
          Sau khi thêm, nhớ chia sẻ sheet cho tài khoản hệ thống quyền xem. Nếu chưa chắc file giống mẫu nào, để "Không chắc - nhờ kỹ thuật".
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

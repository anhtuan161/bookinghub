import { useEffect, useState } from 'react'
import Modal from '../components/Modal'
import StatusBadge from '../components/StatusBadge'
import { getReviewQueue, resolveReview } from '../lib/api'
import { showToast } from '../lib/toast'
import type { ReviewItem, Status } from '../lib/types'
import { fmtVN, fmtVND } from '../lib/utils'

export default function Review() {
  const [items, setItems] = useState<ReviewItem[]>([])
  const [editing, setEditing] = useState<ReviewItem | null>(null)

  function load() {
    getReviewQueue().then(setItems)
  }
  useEffect(load, [])

  async function confirm(it: ReviewItem) {
    await resolveReview(it.id)
    showToast('Đã xác nhận')
    load()
  }

  async function saveEdit() {
    if (!editing) return
    await resolveReview(editing.id)
    showToast('Đã cập nhật')
    setEditing(null)
    load()
  }

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-1 text-2xl font-extrabold tracking-tight text-slate-800">Cần kiểm tra</h1>
      <p className="mb-4 text-sm text-slate-500">
        Những ô hệ thống đọc chưa chắc chắn. Hãy xác nhận để đưa vào lịch chính.
      </p>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-white p-10 text-center text-slate-400">
          🎉 Không còn mục nào cần kiểm tra.
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-3">Villa</th>
                <th className="px-4 py-3">Ngày</th>
                <th className="px-4 py-3">Đọc được</th>
                <th className="px-4 py-3">Hệ thống đoán</th>
                <th className="px-4 py-3">Tin cậy</th>
                <th className="px-4 py-3 text-right">Xử lý</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className="border-t">
                  <td className="px-4 py-3 font-medium">{it.propertyName}</td>
                  <td className="px-4 py-3">{fmtVN(it.date)}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-2">
                      <span className="h-4 w-4 rounded border" style={{ background: it.rawColorHex }} />
                      <code className="rounded bg-slate-100 px-1.5 py-0.5">{it.rawValue}</code>
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={it.suggestedStatus} />
                    {it.suggestedPrice != null && (
                      <span className="ml-2 text-xs text-slate-500">{fmtVND(it.suggestedPrice)}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={it.confidence < 0.6 ? 'text-red-600' : 'text-amber-600'}>
                      {Math.round(it.confidence * 100)}%
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => confirm(it)} className="btn btn-sm bg-green-600 text-white hover:bg-green-700">
                        ✓ Đúng
                      </button>
                      <button onClick={() => setEditing(it)} className="btn-ghost btn-sm">
                        Sửa
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <EditModal item={editing} onClose={() => setEditing(null)} onSave={saveEdit} />
    </div>
  )
}

function EditModal({ item, onClose, onSave }: { item: ReviewItem | null; onClose: () => void; onSave: () => void }) {
  const [status, setStatus] = useState<Status>('available')
  const [price, setPrice] = useState('')

  useEffect(() => {
    if (item) {
      setStatus(item.suggestedStatus === 'unknown' ? 'available' : item.suggestedStatus)
      setPrice(item.suggestedPrice ? String(item.suggestedPrice) : '')
    }
  }, [item])

  if (!item) return null
  const options: { v: Status; label: string; cls: string }[] = [
    { v: 'available', label: 'Còn trống', cls: 'bg-green-600' },
    { v: 'booked', label: 'Đã đặt', cls: 'bg-red-600' },
    { v: 'blocked', label: 'Đang giữ', cls: 'bg-amber-500' },
  ]

  return (
    <Modal open={!!item} title={`Sửa: ${item.propertyName} — ${fmtVN(item.date)}`} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <div className="mb-2 text-sm font-medium text-slate-600">Chọn trạng thái</div>
          <div className="grid grid-cols-3 gap-2">
            {options.map((o) => (
              <button
                key={o.v}
                onClick={() => setStatus(o.v)}
                className={`rounded-lg py-3 text-sm font-semibold text-white ${o.cls} ${
                  status === o.v ? 'ring-2 ring-offset-2 ring-slate-800' : 'opacity-70'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-500">Giá/đêm (đ)</span>
          <input
            type="number"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 outline-none focus:border-brand-500"
          />
        </label>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border px-4 py-2 text-sm">Hủy</button>
          <button onClick={onSave} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
            Lưu
          </button>
        </div>
      </div>
    </Modal>
  )
}

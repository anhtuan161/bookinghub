import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getProperties } from '../lib/api'
import { onDbRefresh } from '../lib/refresh'
import type { Property } from '../lib/types'
import { gradientFor, initials } from '../lib/utils'

export default function Villas() {
  const navigate = useNavigate()
  const [list, setList] = useState<Property[] | null>(null)
  const [q, setQ] = useState('')

  function load() {
    getProperties().then(setList)
  }

  useEffect(() => {
    load()
    return onDbRefresh(load)
  }, [])

  const filtered = useMemo(() => {
    if (!list) return []
    const k = q.trim().toLowerCase()
    if (!k) return list
    return list.filter((p) =>
      [p.name, p.ownerName, p.area, p.address, p.description].some((v) => (v ?? '').toLowerCase().includes(k)),
    )
  }, [list, q])

  if (!list) return <div className="text-slate-400">Đang tải…</div>

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-800">
          Danh sách villa <span className="text-base font-medium text-slate-400">({list.length})</span>
        </h1>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Tìm theo tên, chủ nhà, địa chỉ…"
          className="input w-72 max-w-full"
        />
      </div>

      {filtered.length === 0 && (
        <div className="rounded-xl border border-dashed bg-white p-10 text-center text-slate-400">
          Không có villa nào khớp. Thử từ khóa khác, hoặc bấm “Đồng bộ ngay” để nạp từ Google Sheet.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map((p) => (
          <div key={p.id} className="card flex flex-col overflow-hidden transition hover:-translate-y-0.5 hover:shadow-pop">
            <div className="flex h-24 items-center justify-center text-2xl font-bold text-white" style={gradientFor(p.id)}>
              {initials(p.name)}
            </div>
            <div className="flex flex-1 flex-col p-4">
              {/* Tên villa → bấm vào mở Google Sheet gốc */}
              {p.sourceSheetUrl ? (
                <a
                  href={p.sourceSheetUrl}
                  target="_blank"
                  rel="noreferrer"
                  title="Mở Google Sheet gốc"
                  className="font-semibold leading-tight text-slate-800 hover:text-brand-700 hover:underline"
                >
                  {p.name} <span className="text-xs text-slate-400">↗</span>
                </a>
              ) : (
                <h3 className="font-semibold leading-tight text-slate-800">{p.name}</h3>
              )}

              <div className="mt-1 text-xs text-slate-400">{p.ownerName}</div>
              {p.address && <div className="mt-1 text-sm text-slate-500">📍 {p.address}</div>}

              {p.description && (
                <p className="mt-2 line-clamp-3 whitespace-pre-line text-sm text-slate-600">{p.description}</p>
              )}

              {p.extraFeeNote && (
                <div className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-700 line-clamp-2">
                  ⚠️ {p.extraFeeNote}
                </div>
              )}

              <div className="mt-auto flex flex-wrap items-center gap-2 pt-3">
                <button onClick={() => navigate(`/property/${p.id}`)} className="btn-ghost btn-sm">
                  Xem lịch
                </button>
                {p.mapUrl && (
                  <a href={p.mapUrl} target="_blank" rel="noreferrer" className="btn-ghost btn-sm">
                    🗺️ Bản đồ
                  </a>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

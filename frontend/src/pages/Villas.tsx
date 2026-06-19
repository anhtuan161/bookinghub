import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getProperties } from '../lib/api'
import { onDbRefresh } from '../lib/refresh'
import type { Property } from '../lib/types'
import { gradientFor, initials } from '../lib/utils'

const CITIES = ['Đà Lạt', 'Nha Trang', 'Phan Thiết', 'HCM']

function cityFor(p: Property): string {
  const text = [p.area, p.address, p.ownerName, p.sourceSheetUrl].join(' ').toLowerCase()
  if (/nha\s*trang|khánh hòa|khanh hoa/.test(text)) return 'Nha Trang'
  if (/phan\s*thiết|phan thiet|mũi né|mui ne|bình thuận|binh thuan/.test(text)) return 'Phan Thiết'
  if (/hcm|sài gòn|sai gon|tp\.?\s*hồ\s*chí\s*minh|ho chi minh/.test(text)) return 'HCM'
  return 'Đà Lạt'
}

function sheetNameFor(p: Property): string {
  return p.ownerName || p.sourceSheetUrl || 'Chưa phân nhóm'
}

export default function Villas() {
  const navigate = useNavigate()
  const [list, setList] = useState<Property[] | null>(null)
  const [q, setQ] = useState('')
  const [city, setCity] = useState('Đà Lạt')

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
    return list.filter((p) => {
      if (cityFor(p) !== city) return false
      if (!k) return true
      return [p.name, p.ownerName, p.area, p.address, p.description].some((v) =>
        (v ?? '').toLowerCase().includes(k),
      )
    })
  }, [list, q, city])

  const cityCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const c of CITIES) counts.set(c, 0)
    for (const p of list ?? []) counts.set(cityFor(p), (counts.get(cityFor(p)) ?? 0) + 1)
    return counts
  }, [list])

  const grouped = useMemo(() => {
    const groups = new Map<string, { name: string; url: string; items: Property[] }>()
    for (const p of filtered) {
      const name = sheetNameFor(p)
      const key = `${name}|${p.sourceSheetUrl}`
      const current = groups.get(key) ?? { name, url: p.sourceSheetUrl, items: [] }
      current.items.push(p)
      groups.set(key, current)
    }
    return Array.from(groups.values()).sort((a, b) => a.name.localeCompare(b.name, 'vi'))
  }, [filtered])

  if (!list) return <div className="text-slate-400">Đang tải...</div>

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-800">
          Danh sách villa <span className="text-base font-medium text-slate-400">({list.length})</span>
        </h1>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Tìm theo tên, chủ nhà, địa chỉ..."
          className="input w-72 max-w-full"
        />
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {CITIES.map((c) => (
          <button
            key={c}
            onClick={() => setCity(c)}
            className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
              city === c
                ? 'border-brand-200 bg-brand-50 text-brand-700'
                : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
            }`}
          >
            {c} <span className="ml-1 text-xs opacity-70">({cityCounts.get(c) ?? 0})</span>
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="rounded-xl border border-dashed bg-white p-10 text-center text-slate-400">
          Không có villa nào trong nhóm này.
        </div>
      )}

      <div className="space-y-8">
        {grouped.map((group) => (
          <section key={`${group.name}|${group.url}`}>
            <div className="mb-3 flex flex-wrap items-end justify-between gap-2 border-b border-slate-200 pb-2">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">{city}</div>
                <h2 className="text-lg font-bold text-slate-800">
                  {group.name} <span className="text-sm font-medium text-slate-400">({group.items.length})</span>
                </h2>
              </div>
              {group.url && (
                <a href={group.url} target="_blank" rel="noreferrer" className="btn-ghost btn-sm">
                  Mở Google Sheet
                </a>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {group.items.map((p) => (
                <div key={p.id} className="card flex flex-col overflow-hidden transition hover:-translate-y-0.5 hover:shadow-pop">
                  <div className="flex h-24 items-center justify-center text-2xl font-bold text-white" style={gradientFor(p.id)}>
                    {initials(p.name)}
                  </div>
                  <div className="flex flex-1 flex-col p-4">
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
          </section>
        ))}
      </div>
    </div>
  )
}

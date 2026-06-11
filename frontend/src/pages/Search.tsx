import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAreas, searchAvailability } from '../lib/api'
import type { SearchResult } from '../lib/types'
import { addDays, fmtISO, fmtVN, gradientFor, initials, nightsBetween, shortPrice, startOfToday } from '../lib/utils'

export default function Search() {
  const navigate = useNavigate()
  const [areas, setAreas] = useState<string[]>([])
  const [checkin, setCheckin] = useState(fmtISO(addDays(startOfToday(), 7)))
  const [checkout, setCheckout] = useState(fmtISO(addDays(startOfToday(), 9)))
  const [guests, setGuests] = useState(6)
  const [area, setArea] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [results, setResults] = useState<SearchResult[] | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    getAreas().then(setAreas)
  }, [])

  async function doSearch(e?: React.FormEvent) {
    e?.preventDefault()
    if (nightsBetween(checkin, checkout) < 1) {
      alert('Ngày trả phòng phải sau ngày nhận phòng')
      return
    }
    setLoading(true)
    const r = await searchAvailability({
      checkin,
      checkout,
      guests,
      area: area || undefined,
      maxPrice: maxPrice ? Number(maxPrice) * 1_000_000 : undefined,
    })
    setResults(r)
    setLoading(false)
  }

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="mb-4 text-2xl font-extrabold tracking-tight text-slate-800">Tìm phòng cho khách</h1>

      <form onSubmit={doSearch} className="card mb-6 p-5">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
          <Field label="Ngày nhận phòng">
            <input type="date" value={checkin} onChange={(e) => setCheckin(e.target.value)} className="input" />
          </Field>
          <Field label="Ngày trả phòng">
            <input type="date" value={checkout} onChange={(e) => setCheckout(e.target.value)} className="input" />
          </Field>
          <Field label="Số khách">
            <input
              type="number"
              min={1}
              value={guests}
              onChange={(e) => setGuests(Number(e.target.value))}
              className="input"
            />
          </Field>
          <Field label="Khu vực">
            <select value={area} onChange={(e) => setArea(e.target.value)} className="input">
              <option value="">Tất cả</option>
              {areas.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Giá tối đa/đêm (triệu)">
            <input
              type="number"
              min={0}
              placeholder="Không giới hạn"
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
              className="input"
            />
          </Field>
        </div>
        <div className="mt-4">
          <button className="btn-primary px-7 text-base">{loading ? 'Đang tìm…' : 'TÌM PHÒNG'}</button>
        </div>
      </form>

      {results === null && (
        <div className="rounded-xl border border-dashed bg-white p-10 text-center text-slate-400">
          Nhập ngày và số khách rồi bấm <b>TÌM PHÒNG</b> để xem villa phù hợp.
        </div>
      )}

      {results && results.length === 0 && (
        <div className="rounded-xl border border-dashed bg-white p-10 text-center text-slate-500">
          Không có villa nào trống đủ điều kiện. Thử nới lỏng số khách / khoảng giá / khu vực.
        </div>
      )}

      {results && results.length > 0 && (
        <>
          <div className="mb-3 text-sm text-slate-500">
            Tìm thấy <b>{results.length}</b> villa trống từ {fmtVN(checkin)} đến {fmtVN(checkout)} ({results[0].nights} đêm)
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {results.map((r) => (
              <div key={r.property.id} className="card overflow-hidden transition hover:-translate-y-0.5 hover:shadow-pop">
                <div
                  className="flex h-28 items-center justify-center text-2xl font-bold text-white"
                  style={gradientFor(r.property.id)}
                >
                  {initials(r.property.name)}
                </div>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold leading-tight">{r.property.name}</h3>
                  </div>
                  <div className="mt-1 text-sm text-slate-500">{r.property.area}</div>
                  <div className="mt-2 text-sm">
                    👥 {r.property.capacityStandard}–{r.property.capacityMax} khách
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {r.property.rules.map((rule) => (
                      <span key={rule} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                        {rule}
                      </span>
                    ))}
                  </div>
                  <div className="mt-3 text-lg font-bold text-brand-700">
                    {shortPrice(r.avgPrice)}
                    <span className="text-xs font-normal text-slate-400"> /đêm (TB)</span>
                  </div>
                  {r.hasReview && (
                    <div className="mt-2 rounded bg-amber-50 px-2 py-1 text-xs text-amber-700">
                      ⚠️ Có ngày cần kiểm tra lại trước khi chốt
                    </div>
                  )}
                  <div className="mt-4 flex gap-2">
                    <button onClick={() => navigate(`/property/${r.property.id}`)} className="btn-ghost btn-sm flex-1">
                      Xem chi tiết
                    </button>
                    <button
                      onClick={() => navigate(`/property/${r.property.id}?book=1&checkin=${checkin}&checkout=${checkout}&guests=${guests}`)}
                      className="btn-primary btn-sm flex-1"
                    >
                      Giữ phòng
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
    </label>
  )
}

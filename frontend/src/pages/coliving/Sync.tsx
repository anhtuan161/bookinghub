import { useEffect, useState } from 'react'
import { ErrorBox, PageHeader } from '../../components/coliving/ui'
import { connectEzcloud, dateTime, disconnectEzcloud, getStatus, getSyncRuns, requestSync, type SyncRun, type SyncState } from '../../lib/coliving'
import { showToast } from '../../lib/toast'

const SNIPPET = "copy(localStorage.getItem('ngStorage-session'))"

export default function Sync() {
  const [state, setState] = useState<SyncState | null>(null)
  const [runs, setRuns] = useState<SyncRun[]>([])
  const [err, setErr] = useState('')
  const [paste, setPaste] = useState('')
  const [busy, setBusy] = useState(false)
  const [showConnect, setShowConnect] = useState(false)

  function load() {
    getStatus().then(setState).catch((e) => setErr(e.message))
    getSyncRuns().then(setRuns).catch(() => {})
  }
  useEffect(() => {
    load()
    const t = setInterval(load, 10_000)
    return () => clearInterval(t)
  }, [])

  async function connect(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setErr('')
    try {
      const r = await connectEzcloud(paste)
      setPaste('')
      setShowConnect(false)
      showToast(`Đã kết nối ezCloud: ${r.status.userName ?? ''}`)
      load()
    } catch (e: any) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function syncNow() {
    try {
      const r = await requestSync()
      showToast(r.message)
      load()
    } catch (e: any) {
      showToast(e.message)
    }
  }

  async function doDisconnect() {
    if (!confirm('Ngắt kết nối ezCloud? Dữ liệu đã đồng bộ vẫn giữ, nhưng sẽ không cập nhật nữa.')) return
    await disconnectEzcloud()
    load()
  }

  const ez = state?.ezcloud
  const expDays = ez?.expiresAt ? Math.round((Date.parse(ez.expiresAt) - Date.now()) / 86400000) : null

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Kết nối & đồng bộ ezCloud" subtitle="Hệ thống chỉ ĐỌC dữ liệu ezCloud (không sửa booking). Đồng bộ tự động định kỳ.">
        {ez?.connected && (
          <button className="btn-primary" onClick={syncNow} disabled={!!state?.pendingRequests}>
            ↻ {state?.pendingRequests ? 'Đang chờ worker…' : 'Đồng bộ ngay'}
          </button>
        )}
      </PageHeader>
      {err && <ErrorBox msg={err} />}

      <section className="card mb-5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${ez?.connected ? (ez.lastError ? 'bg-amber-500' : 'bg-emerald-500') : 'bg-slate-300'}`} />
              <h2 className="font-semibold text-slate-800">{ez?.connected ? 'Đã kết nối' : 'Chưa kết nối'}</h2>
            </div>
            {ez?.connected && (
              <dl className="mt-3 grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-3">
                <Item k="Tài khoản ezCloud" v={ez.userName} />
                <Item k="Khách sạn" v={`${ez.hotelName ?? ''} ${ez.hotelId ? `(#${ez.hotelId})` : ''}`} />
                <Item k="Kết nối bởi" v={`${ez.connectedBy ?? '—'} · ${dateTime(ez.connectedAt)}`} />
                <Item k="Token cấp lúc" v={dateTime(ez.issuedAt)} />
                <Item k="Token hết hạn" v={`${dateTime(ez.expiresAt)}${expDays !== null ? ` (còn ${expDays} ngày)` : ''}`} />
                <Item k="Làm mới gần nhất" v={dateTime(ez.lastRefreshAt)} />
                <Item k="Đồng bộ OK gần nhất" v={dateTime(state?.lastOkAt)} />
                <Item k="Chu kỳ" v={`${state?.intervalMinutes} phút`} />
                {ez.lastError && <Item k="Lỗi gần nhất" v={<span className="text-rose-600">{ez.lastError}</span>} />}
                {ez.lastRefreshError && <Item k="Lỗi làm mới token" v={<span className="text-amber-600">{ez.lastRefreshError}</span>} />}
              </dl>
            )}
          </div>
          <div className="flex gap-2">
            <button className="btn-ghost btn-sm" onClick={() => setShowConnect(!showConnect)}>
              {ez?.connected ? 'Kết nối lại' : 'Kết nối'}
            </button>
            {ez?.connected && (
              <button className="btn-ghost btn-sm text-rose-600" onClick={doDisconnect}>
                Ngắt
              </button>
            )}
          </div>
        </div>

        {(showConnect || (state && !ez?.connected)) && (
          <form onSubmit={connect} className="mt-5 space-y-3 rounded-xl bg-slate-50 p-4">
            <h3 className="font-semibold text-slate-800">Dán phiên đăng nhập của tài khoản bot ezCloud</h3>
            <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-600">
              <li>
                Mở{' '}
                <a href="https://pms.ezcloudhotel.com/#/home" target="_blank" rel="noreferrer" className="font-medium text-brand-600 underline">
                  pms.ezcloudhotel.com
                </a>{' '}
                và đăng nhập bằng <b>tài khoản bot</b> (chỉ quyền xem).
              </li>
              <li>
                Bấm <b>F12</b> → tab <b>Console</b> → dán lệnh sau rồi Enter (lệnh này chép phiên vào clipboard):
                <div className="mt-1 flex items-center gap-2">
                  <code className="rounded bg-white px-2 py-1 text-xs ring-1 ring-slate-200">{SNIPPET}</code>
                  <button type="button" className="btn-ghost btn-sm" onClick={() => navigator.clipboard?.writeText(SNIPPET).then(() => showToast('Đã chép lệnh'))}>
                    Chép lệnh
                  </button>
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  Chrome chặn dán lần đầu: gõ tay <code className="rounded bg-white px-1">allow pasting</code> rồi Enter, sau đó dán lại lệnh.
                  Hoặc không cần Console: tab <b>Application</b> → <b>Local storage</b> → <code>https://pms.ezcloudhotel.com</code> → dòng{' '}
                  <code>ngStorage-session</code> → bấm vào ô Value, Ctrl+A, Ctrl+C.
                </div>
              </li>
              <li>Quay lại đây, dán (Ctrl+V) vào ô dưới rồi bấm Lưu. Sau đó đóng tab ezCloud của bot, đừng mở lại để tránh 2 nơi cùng làm mới token.</li>
            </ol>
            <textarea
              className="input h-28 font-mono text-xs"
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              placeholder='{"access_token":"…","refresh_token":"…",…}'
              spellCheck={false}
              autoComplete="off"
            />
            <div className="flex items-center gap-3">
              <button className="btn-primary" disabled={busy || paste.length < 20}>
                {busy ? 'Đang kiểm tra…' : 'Lưu & kiểm tra'}
              </button>
              <span className="text-xs text-slate-400">Phiên được mã hoá trên server, không hiển thị lại.</span>
            </div>
          </form>
        )}
      </section>

      <section className="card overflow-x-auto">
        <h2 className="border-b border-slate-100 px-4 py-3 font-semibold text-slate-800">Lịch sử đồng bộ</h2>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Bắt đầu</th>
              <th className="px-3 py-2">Kiểu</th>
              <th className="px-3 py-2">Kết quả</th>
              <th className="px-3 py-2 text-right">Booking</th>
              <th className="px-3 py-2 text-right">Mới/Đổi/Xoá</th>
              <th className="px-3 py-2 text-right">Tiền phòng</th>
              <th className="px-3 py-2 text-right">Thời gian</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {runs.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2 text-slate-600">{dateTime(r.started_at)}</td>
                <td className="px-3 py-2 text-slate-500">{r.trigger === 'manual' ? 'Bấm tay' : 'Tự động'}</td>
                <td className="px-3 py-2">
                  {r.ok === null ? (
                    <span className="text-slate-400">đang chạy…</span>
                  ) : r.ok ? (
                    <span className="text-emerald-600">OK{r.stats?.baseline ? ' (lần đầu)' : ''}</span>
                  ) : (
                    <span className="text-rose-600" title={r.error ?? ''}>
                      Lỗi: {(r.error ?? '').slice(0, 80)}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{r.stats?.fetched ?? '—'}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {r.stats ? `${r.stats.inserted}/${r.stats.updated}/${r.stats.removed}` : '—'}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {r.stats?.chargesFetched ?? 0}
                  {r.stats?.chargesFailed ? <span className="text-rose-500"> ({r.stats.chargesFailed} lỗi)</span> : null}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-500">{r.stats?.ms ? `${(r.stats.ms / 1000).toFixed(1)}s` : '—'}</td>
              </tr>
            ))}
            {runs.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-slate-400">
                  Chưa có lượt đồng bộ nào
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  )
}

function Item({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-slate-400">{k}</dt>
      <dd className="font-medium text-slate-700">{v || '—'}</dd>
    </div>
  )
}

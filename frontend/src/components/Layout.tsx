import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { getUser, logout } from '../lib/auth'
import { refreshDataFromDb, reviewCount, triggerN8nManualSync } from '../lib/api'
import { notifyDbRefresh } from '../lib/refresh'
import { showToast } from '../lib/toast'
import { initials } from '../lib/utils'

const NAV = [
  { to: '/search', label: 'Tìm phòng', icon: '🔍' },
  { to: '/villas', label: 'Danh sách villa', icon: '🏡' },
  { to: '/review', label: 'Cần kiểm tra', icon: '⚠️', badge: true },
  { to: '/bookings', label: 'Yêu cầu giữ phòng', icon: '📋' },
  { to: '/sources', label: 'Nguồn dữ liệu', icon: '🗂️' },
  { to: '/dashboard', label: 'Tổng quan', icon: '📊' },
]

export default function Layout() {
  const navigate = useNavigate()
  const user = getUser() || 'Nhân viên'
  const [syncing, setSyncing] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [reviews, setReviews] = useState(reviewCount())

  useEffect(() => {
    const t = setInterval(() => setReviews(reviewCount()), 1000)
    return () => clearInterval(t)
  }, [])

  async function handleSync() {
    setSyncing(true)
    try {
      await triggerN8nManualSync()
      showToast('Da gui yeu cau chay n8n manual sync')
    } finally {
      setSyncing(false)
    }
  }

  async function handleRefreshDb() {
    setRefreshing(true)
    try {
      await refreshDataFromDb()
      notifyDbRefresh()
      setReviews(reviewCount())
      showToast('refresh dữ liệu')
    } finally {
      setRefreshing(false)
    }
  }

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="flex items-center gap-3 px-5 py-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-lg text-white shadow-sm">
            🏡
          </div>
          <div>
            <div className="text-[15px] font-bold leading-tight text-slate-800">Villa Booking Hub</div>
            <div className="text-xs text-slate-400">Quản trị nội bộ</div>
          </div>
        </div>

        <div className="px-5 pb-2 pt-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Menu
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) =>
                `group flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  isActive
                    ? 'bg-brand-50 text-brand-700 shadow-sm ring-1 ring-brand-100'
                    : 'text-slate-600 hover:bg-slate-100'
                }`
              }
            >
              <span className="flex items-center gap-3">
                <span className="text-base">{n.icon}</span>
                {n.label}
              </span>
              {n.badge && reviews > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[11px] font-bold text-white">
                  {reviews}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="m-3 rounded-xl bg-slate-50 px-3 py-2.5 text-[11px] leading-relaxed text-slate-400">
          Dữ liệu đồng bộ từ <span className="font-semibold text-slate-500">Google Sheet</span> của chủ nhà.
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/80 px-6 py-3 backdrop-blur">
          <div className="text-sm text-slate-500">
            Xin chào, <span className="font-semibold text-slate-800">{user}</span> 👋
          </div>
          <div className="flex items-center gap-4">
            <button onClick={handleRefreshDb} disabled={refreshing} className="btn-ghost">
              <span className={refreshing ? 'animate-spin' : ''}>↻</span>
              {refreshing ? 'Đang cập nhật...' : 'Cập nhật dữ liệu'}
            </button>
            <button onClick={handleSync} disabled={syncing} className="btn-primary">
              <span className={syncing ? 'animate-spin' : ''}>↻</span>
              {syncing ? 'Dang goi n8n...' : 'Chay n8n manual'}
            </button>
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">
                {initials(user)}
              </div>
              <button onClick={handleLogout} className="text-sm text-slate-500 hover:text-slate-800">
                Đăng xuất
              </button>
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-auto p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

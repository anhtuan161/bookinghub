import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { can } from '../lib/auth'
import { refreshDataFromDb, reviewCount, triggerN8nManualSync } from '../lib/api'
import { visibleNav, type NavGroup } from '../lib/nav'
import { notifyDbRefresh } from '../lib/refresh'
import { useSession } from '../lib/session'
import { showToast } from '../lib/toast'
import { initials } from '../lib/utils'

const OPEN_KEY = 'bh_nav_open'

function loadOpen(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(OPEN_KEY) ?? '{}')
  } catch {
    return {}
  }
}

export default function Layout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useSession()
  const groups = visibleNav(user)
  const [open, setOpen] = useState<Record<string, boolean>>(loadOpen)
  const [mobileNav, setMobileNav] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [reviews, setReviews] = useState(reviewCount())

  const inBookingHub = location.pathname.startsWith('/booking-hub')

  useEffect(() => {
    const t = setInterval(() => setReviews(reviewCount()), 1000)
    return () => clearInterval(t)
  }, [])
  useEffect(() => setMobileNav(false), [location.pathname])

  function toggle(key: string, current: boolean) {
    const next = { ...open, [key]: !current }
    setOpen(next)
    try {
      localStorage.setItem(OPEN_KEY, JSON.stringify(next))
    } catch {}
  }

  async function handleSync() {
    setSyncing(true)
    try {
      await triggerN8nManualSync()
      showToast('Đã gửi yêu cầu chạy n8n manual sync')
    } catch (e: any) {
      showToast(e.message)
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
      showToast('Đã cập nhật dữ liệu')
    } catch (e: any) {
      showToast(e.message)
    } finally {
      setRefreshing(false)
    }
  }

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  const name = user?.fullName || user?.email || 'Nhân viên'

  const sidebar = (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="flex items-center gap-3 px-5 py-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-lg text-white shadow-sm">
          🏡
        </div>
        <div>
          <div className="text-[15px] font-bold leading-tight text-slate-800">Thomstay Hub</div>
          <div className="text-xs text-slate-400">Quản trị nội bộ</div>
        </div>
      </div>

      <nav className="flex-1 space-y-2 overflow-y-auto px-3 pb-4">
        {groups.map((g) => (
          <Group
            key={g.key}
            group={g}
            expanded={open[g.key] ?? (location.pathname.startsWith(g.base) || g.key !== 'admin')}
            onToggle={toggle}
            reviews={reviews}
          />
        ))}
        {groups.length === 0 && (
          <div className="rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
            Bạn chưa được cấp quyền menu nào. Liên hệ quản trị.
          </div>
        )}
      </nav>

      <div className="border-t border-slate-100 p-3">
        <NavLink
          to="/account"
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-xl px-3 py-2 text-sm ${isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100'}`
          }
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
            {initials(name)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{name}</span>
            <span className="block truncate text-[11px] text-slate-400">{user?.isAdmin ? 'Admin' : user?.email}</span>
          </span>
        </NavLink>
      </div>
    </aside>
  )

  return (
    <div className="flex min-h-screen">
      <div className="sticky top-0 hidden h-screen lg:block">{sidebar}</div>
      {mobileNav && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <div className="h-full">{sidebar}</div>
          <button aria-label="Đóng menu" className="flex-1 bg-black/30" onClick={() => setMobileNav(false)} />
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-200 bg-white/80 px-4 py-3 backdrop-blur lg:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button className="btn-ghost btn-sm lg:hidden" onClick={() => setMobileNav(true)} aria-label="Mở menu">
              ☰
            </button>
            <div className="truncate text-sm text-slate-500">
              Xin chào, <span className="font-semibold text-slate-800">{name}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            {inBookingHub && (
              <>
                <button onClick={handleRefreshDb} disabled={refreshing} className="btn-ghost btn-sm sm:btn">
                  <span className={refreshing ? 'animate-spin' : ''}>↻</span>
                  <span className="hidden sm:inline">{refreshing ? 'Đang cập nhật...' : 'Cập nhật dữ liệu'}</span>
                </button>
                {can(user, 'bookinghub.sources') && (
                  <button onClick={handleSync} disabled={syncing} className="btn-primary btn-sm sm:btn">
                    <span className={syncing ? 'animate-spin' : ''}>↻</span>
                    <span className="hidden sm:inline">{syncing ? 'Đang gọi n8n...' : 'Chạy n8n sync'}</span>
                  </button>
                )}
              </>
            )}
            <button onClick={handleLogout} className="text-sm text-slate-500 hover:text-slate-800">
              Đăng xuất
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

function Group({
  group,
  expanded,
  onToggle,
  reviews,
}: {
  group: NavGroup
  expanded: boolean
  onToggle: (key: string, current: boolean) => void
  reviews: number
}) {
  return (
    <div>
      <button
        onClick={() => onToggle(group.key, expanded)}
        className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400 hover:text-slate-600"
        aria-expanded={expanded}
      >
        <span className="flex items-center gap-2">
          <span className="text-sm">{group.icon}</span>
          {group.label}
        </span>
        <span className={`transition ${expanded ? 'rotate-90' : ''}`}>›</span>
      </button>
      {expanded && (
        <div className="mt-1 space-y-0.5">
          {group.items.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) =>
                `flex items-center justify-between rounded-xl px-3 py-2 text-sm font-medium transition ${
                  isActive ? 'bg-brand-50 text-brand-700 shadow-sm ring-1 ring-brand-100' : 'text-slate-600 hover:bg-slate-100'
                }`
              }
            >
              <span className="flex items-center gap-3">
                <span className="text-base">{n.icon}</span>
                {n.label}
              </span>
              {n.badge === 'review' && reviews > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[11px] font-bold text-white">
                  {reviews}
                </span>
              )}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  )
}

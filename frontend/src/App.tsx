import type { ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import Layout from './components/Layout'
import Toaster from './components/Toaster'
import { can } from './lib/auth'
import { homePath } from './lib/nav'
import { useSession } from './lib/session'
import Account from './pages/Account'
import Bookings from './pages/Bookings'
import Dashboard from './pages/Dashboard'
import Login from './pages/Login'
import Pending from './pages/Pending'
import PropertyDetail from './pages/PropertyDetail'
import Register from './pages/Register'
import ResetPassword from './pages/ResetPassword'
import Review from './pages/Review'
import Search from './pages/Search'
import Sources from './pages/Sources'
import Villas from './pages/Villas'
import Users from './pages/admin/Users'
import ColivingBookings from './pages/coliving/Bookings'
import ColivingCalendar from './pages/coliving/Calendar'
import ColivingOverview from './pages/coliving/Overview'
import ColivingRevenue from './pages/coliving/Revenue'
import ColivingSync from './pages/coliving/Sync'

function Loading() {
  return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Đang tải…</div>
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useSession()
  const location = useLocation()
  if (loading) return <Loading />
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  if (user.status !== 'active') return <Navigate to="/pending" replace />
  return <>{children}</>
}

function Perm({ perm, children }: { perm: string | string[]; children: ReactNode }) {
  const { user } = useSession()
  const perms = Array.isArray(perm) ? perm : [perm]
  if (!can(user, ...perms))
    return (
      <div className="card mx-auto mt-10 max-w-md p-8 text-center">
        <div className="text-4xl">🔒</div>
        <h2 className="mt-3 text-lg font-semibold text-slate-800">Không có quyền truy cập</h2>
        <p className="mt-1 text-sm text-slate-500">Liên hệ quản trị để được cấp quyền mục này.</p>
      </div>
    )
  return <>{children}</>
}

function Home() {
  const { user } = useSession()
  return <Navigate to={homePath(user)} replace />
}

function Section({ base }: { base: 'booking-hub' | 'coliving' | 'admin' }) {
  const { user } = useSession()
  const path = homePath(user)
  // vào thẳng nhóm → trang đầu tiên được phép trong nhóm đó
  const first = {
    'booking-hub': ['search', 'villas', 'review', 'requests', 'sources', 'dashboard'].map((p) => `/booking-hub/${p}`),
    coliving: ['overview', 'calendar', 'bookings', 'revenue', 'sync'].map((p) => `/coliving/${p}`),
    admin: ['/admin/users'],
  }[base]
  const permOf: Record<string, string> = {
    '/booking-hub/requests': 'bookinghub.requests',
    '/coliving/sync': 'coliving.manage',
    '/admin/users': 'admin.users',
  }
  const target = first.find((p) => can(user, permOf[p] ?? (p.startsWith('/booking-hub') ? `bookinghub.${p.split('/')[2]}` : `coliving.${p.split('/')[2]}`)))
  return <Navigate to={target ?? path} replace />
}

export default function App() {
  const { loading } = useSession()
  if (loading) return <Loading />
  return (
    <>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/pending" element={<Pending />} />
        <Route
          element={
            <RequireAuth>
              <Layout />
            </RequireAuth>
          }
        >
          <Route path="/" element={<Home />} />
          <Route path="/account" element={<Account />} />

          {/* Booking Hub (villa) */}
          <Route path="/booking-hub" element={<Section base="booking-hub" />} />
          <Route path="/booking-hub/search" element={<Perm perm="bookinghub.search"><Search /></Perm>} />
          <Route path="/booking-hub/villas" element={<Perm perm="bookinghub.villas"><Villas /></Perm>} />
          <Route path="/booking-hub/property/:id" element={<Perm perm={['bookinghub.search', 'bookinghub.villas']}><PropertyDetail /></Perm>} />
          <Route path="/booking-hub/review" element={<Perm perm="bookinghub.review"><Review /></Perm>} />
          <Route path="/booking-hub/requests" element={<Perm perm="bookinghub.requests"><Bookings /></Perm>} />
          <Route path="/booking-hub/sources" element={<Perm perm="bookinghub.sources"><Sources /></Perm>} />
          <Route path="/booking-hub/dashboard" element={<Perm perm="bookinghub.dashboard"><Dashboard /></Perm>} />

          {/* Thomstay Coliving */}
          <Route path="/coliving" element={<Section base="coliving" />} />
          <Route path="/coliving/overview" element={<Perm perm="coliving.overview"><ColivingOverview /></Perm>} />
          <Route path="/coliving/calendar" element={<Perm perm="coliving.calendar"><ColivingCalendar /></Perm>} />
          <Route path="/coliving/bookings" element={<Perm perm="coliving.bookings"><ColivingBookings /></Perm>} />
          <Route path="/coliving/revenue" element={<Perm perm="coliving.revenue"><ColivingRevenue /></Perm>} />
          <Route path="/coliving/sync" element={<Perm perm="coliving.manage"><ColivingSync /></Perm>} />

          {/* Quản trị */}
          <Route path="/admin" element={<Section base="admin" />} />
          <Route path="/admin/users" element={<Perm perm="admin.users"><Users /></Perm>} />

          {/* Đường dẫn cũ → mới */}
          <Route path="/search" element={<Navigate to="/booking-hub/search" replace />} />
          <Route path="/villas" element={<Navigate to="/booking-hub/villas" replace />} />
          <Route path="/property/:id" element={<LegacyProperty />} />
          <Route path="/review" element={<Navigate to="/booking-hub/review" replace />} />
          <Route path="/bookings" element={<Navigate to="/booking-hub/requests" replace />} />
          <Route path="/sources" element={<Navigate to="/booking-hub/sources" replace />} />
          <Route path="/dashboard" element={<Navigate to="/booking-hub/dashboard" replace />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster />
    </>
  )
}

function LegacyProperty() {
  const { pathname, search } = useLocation()
  return <Navigate to={`/booking-hub${pathname}${search}`} replace />
}

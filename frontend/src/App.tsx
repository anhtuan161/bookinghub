import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import Toaster from './components/Toaster'
import { getUser } from './lib/auth'
import Login from './pages/Login'
import Search from './pages/Search'
import Villas from './pages/Villas'
import PropertyDetail from './pages/PropertyDetail'
import Review from './pages/Review'
import Bookings from './pages/Bookings'
import Sources from './pages/Sources'
import Dashboard from './pages/Dashboard'
import type { ReactNode } from 'react'

function RequireAuth({ children }: { children: ReactNode }) {
  if (!getUser()) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          element={
            <RequireAuth>
              <Layout />
            </RequireAuth>
          }
        >
          <Route path="/" element={<Navigate to="/search" replace />} />
          <Route path="/search" element={<Search />} />
          <Route path="/villas" element={<Villas />} />
          <Route path="/property/:id" element={<PropertyDetail />} />
          <Route path="/review" element={<Review />} />
          <Route path="/bookings" element={<Bookings />} />
          <Route path="/sources" element={<Sources />} />
          <Route path="/dashboard" element={<Dashboard />} />
        </Route>
        <Route path="*" element={<Navigate to="/search" replace />} />
      </Routes>
      <Toaster />
    </>
  )
}

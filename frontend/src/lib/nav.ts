// =============================================================
//  MENU CHÍNH — mỗi mục gắn 1 quyền (khớp backend/src/app/permissions.ts).
//  Thêm chức năng mới: thêm nhóm/mục ở đây + quyền ở backend + Route trong App.tsx.
// =============================================================
import { can, type User } from './auth'

export interface NavItem {
  to: string
  label: string
  icon: string
  perm: string
  badge?: 'review'
}
export interface NavGroup {
  key: string
  label: string
  icon: string
  base: string
  items: NavItem[]
}

export const NAV: NavGroup[] = [
  {
    key: 'coliving',
    label: 'Thomstay Coliving',
    icon: '🏠',
    base: '/coliving',
    items: [
      { to: '/coliving/overview', label: 'Tổng quan hôm nay', icon: '📊', perm: 'coliving.overview' },
      { to: '/coliving/calendar', label: 'Lịch phòng', icon: '🗓️', perm: 'coliving.calendar' },
      { to: '/coliving/bookings', label: 'Booking', icon: '📋', perm: 'coliving.bookings' },
      { to: '/coliving/revenue', label: 'Doanh thu', icon: '💰', perm: 'coliving.revenue' },
      { to: '/coliving/sync', label: 'Kết nối ezCloud', icon: '🔌', perm: 'coliving.manage' },
    ],
  },
  {
    key: 'bookinghub',
    label: 'Booking Hub',
    icon: '🏡',
    base: '/booking-hub',
    items: [
      { to: '/booking-hub/search', label: 'Tìm phòng', icon: '🔍', perm: 'bookinghub.search' },
      { to: '/booking-hub/villas', label: 'Danh sách villa', icon: '🏘️', perm: 'bookinghub.villas' },
      { to: '/booking-hub/review', label: 'Cần kiểm tra', icon: '⚠️', perm: 'bookinghub.review', badge: 'review' },
      { to: '/booking-hub/requests', label: 'Yêu cầu giữ phòng', icon: '📝', perm: 'bookinghub.requests' },
      { to: '/booking-hub/sources', label: 'Nguồn dữ liệu', icon: '🗂️', perm: 'bookinghub.sources' },
      { to: '/booking-hub/dashboard', label: 'Tổng quan villa', icon: '📈', perm: 'bookinghub.dashboard' },
    ],
  },
  {
    key: 'admin',
    label: 'Quản trị',
    icon: '⚙️',
    base: '/admin',
    items: [{ to: '/admin/users', label: 'Người dùng & quyền', icon: '👥', perm: 'admin.users' }],
  },
]

export function visibleNav(user: User | null): NavGroup[] {
  return NAV.map((g) => ({ ...g, items: g.items.filter((i) => can(user, i.perm)) })).filter((g) => g.items.length > 0)
}

// Trang đầu tiên người dùng được phép vào (dùng cho "/" và sau đăng nhập).
export function homePath(user: User | null): string {
  const groups = visibleNav(user)
  return groups[0]?.items[0]?.to ?? '/account'
}

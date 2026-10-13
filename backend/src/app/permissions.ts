// =============================================================
//  DANH MỤC QUYỀN = MENU. Thêm chức năng mới:
//   1. Thêm item vào MENUS (key dạng '<nhóm>.<trang>').
//   2. Backend: bảo vệ route bằng requirePerm('<key>').
//   3. Frontend: thêm mục NAV với perm tương ứng (src/lib/nav.ts).
//  Admin (is_admin) có mọi quyền. Quyền lưu ở bảng app_user_permissions.
// =============================================================

export interface PermItem {
  key: string
  label: string
  description?: string
  sensitive?: boolean // xem được dữ liệu cá nhân khách / tiền
}
export interface PermGroup {
  key: string
  label: string
  items: PermItem[]
}

export const MENUS: PermGroup[] = [
  {
    key: 'bookinghub',
    label: 'Booking Hub (villa)',
    items: [
      { key: 'bookinghub.search', label: 'Tìm phòng' },
      { key: 'bookinghub.villas', label: 'Danh sách villa' },
      { key: 'bookinghub.review', label: 'Cần kiểm tra', description: 'Duyệt ô lịch không chắc chắn' },
      { key: 'bookinghub.requests', label: 'Yêu cầu giữ phòng', sensitive: true },
      { key: 'bookinghub.sources', label: 'Nguồn dữ liệu & đồng bộ', description: 'Sửa cấu hình sheet, chạy n8n' },
      { key: 'bookinghub.dashboard', label: 'Tổng quan villa' },
    ],
  },
  {
    key: 'coliving',
    label: 'Thomstay Coliving',
    items: [
      { key: 'coliving.overview', label: 'Tổng quan hôm nay', description: 'Công suất, khách đến/đi, cảnh báo', sensitive: true },
      { key: 'coliving.calendar', label: 'Lịch phòng' },
      { key: 'coliving.bookings', label: 'Danh sách booking', description: 'Tên, SĐT, email khách', sensitive: true },
      { key: 'coliving.revenue', label: 'Báo cáo doanh thu', sensitive: true },
      { key: 'coliving.manage', label: 'Kết nối & đồng bộ ezCloud', description: 'Dán phiên ezCloud, chạy đồng bộ' },
      { key: 'coliving.write', label: 'Ghi lên ezCloud', description: 'Nhập giá phòng, check-in (thay đổi dữ liệu thật trên ezCloud)', sensitive: true },
    ],
  },
  {
    key: 'admin',
    label: 'Quản trị',
    items: [{ key: 'admin.users', label: 'Người dùng & phân quyền', description: 'Duyệt đăng ký, cấp quyền menu' }],
  },
]

export const ALL_PERMISSIONS = MENUS.flatMap((g) => g.items.map((i) => i.key))
export const isKnownPermission = (k: string) => ALL_PERMISSIONS.includes(k)

// Mẫu nhanh khi cấp quyền (chỉ là gợi ý ở UI, DB vẫn lưu từng quyền).
export const PRESETS = [
  { key: 'coliving_manager', label: 'Quản lý Coliving (chỉ xem)', permissions: MENUS[1].items.map((i) => i.key).filter((k) => k !== 'coliving.write') },
  { key: 'coliving_operator', label: 'Quản lý Coliving + ghi ezCloud', permissions: MENUS[1].items.map((i) => i.key) },
  { key: 'coliving_staff', label: 'Lễ tân Coliving', permissions: ['coliving.overview', 'coliving.calendar', 'coliving.bookings'] },
  { key: 'villa_sale', label: 'Sale villa', permissions: ['bookinghub.search', 'bookinghub.villas', 'bookinghub.requests'] },
  { key: 'villa_ops', label: 'Vận hành Booking Hub', permissions: MENUS[0].items.map((i) => i.key) },
]

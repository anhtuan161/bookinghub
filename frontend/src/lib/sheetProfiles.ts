export const SHEET_PROFILES = [
  {
    value: 'column_villas_month_tabs',
    label: 'Mẫu A - lịch ngang',
    shortLabel: 'Lịch ngang, ngày 01/07',
    description: 'Dùng khi mỗi cột là một căn, mỗi dòng là một ngày dạng 01/07 hoặc 19/07.',
    example: 'Nhìn thấy cột Ngày có 01/07, 02/07, 19/07.',
  },
  {
    value: 'weekday_day_columns_month_tabs',
    label: 'Mẫu B - có cột Thứ/Ngày',
    shortLabel: 'Có cột Thứ/Ngày',
    description: 'Dùng khi sheet có cột Thứ và cột Ngày chỉ là số 1-31, tháng nằm ở tên tab.',
    example: 'Nhìn thấy T2, T3, CN bên cạnh ngày 1, 2, 3.',
  },
  {
    value: 'needs_manual_mapping',
    label: 'Chưa biết - cần setup',
    shortLabel: 'Chưa biết, chưa sync',
    description: 'Dùng khi chưa chắc sheet giống mẫu nào. Hệ thống sẽ không sync để tránh sai dữ liệu.',
    example: 'Chọn mục này nếu cần kỹ thuật kiểm tra trước.',
  },
] as const

export const DEFAULT_SHEET_PROFILE = 'needs_manual_mapping'

export function sheetProfileFor(value?: string) {
  return SHEET_PROFILES.find((profile) => profile.value === value) ?? SHEET_PROFILES[2]
}

export function sheetProfileLabel(value?: string) {
  return sheetProfileFor(value).label
}

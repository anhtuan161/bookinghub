export const SHEET_PROFILES = [
  {
    value: 'column_villas_month_tabs',
    label: 'Mẫu A - ngày 01/07',
    description: 'Tên căn nằm ngang, mỗi dòng là ngày dạng 01/07 hoặc 19/07.',
  },
  {
    value: 'weekday_day_columns_month_tabs',
    label: 'Mẫu B - cột Thứ/Ngày',
    description: 'Có cột Thứ, cột Ngày là số 1-31, tháng/năm lấy từ tên tab.',
  },
  {
    value: 'needs_manual_mapping',
    label: 'Chưa biết - cần setup',
    description: 'Dùng khi sheet mới khác hai mẫu trên, tránh sync sai dữ liệu.',
  },
] as const

export const DEFAULT_SHEET_PROFILE = 'column_villas_month_tabs'

export function sheetProfileLabel(value?: string) {
  return SHEET_PROFILES.find((profile) => profile.value === value)?.label ?? 'Mẫu A - ngày 01/07'
}

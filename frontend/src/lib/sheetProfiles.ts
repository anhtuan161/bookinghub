export const SHEET_PROFILES = [
  {
    value: 'column_villas_month_tabs',
    label: 'Giống Mẹ Bắp',
    shortLabel: 'Đã chạy đúng với sheet Mẹ Bắp',
    description: 'Chọn mục này khi sheet mới nhìn giống file Mẹ Bắp đã test thành công.',
    example: 'Không chắc thì không chọn mục này. Hãy để "Không chắc - nhờ kỹ thuật".',
  },
  {
    value: 'weekday_day_columns_month_tabs',
    label: 'Giống Hoàng Cường',
    shortLabel: 'Đã chạy đúng với sheet Hoàng Cường',
    description: 'Chọn mục này khi sheet mới nhìn giống file Hoàng Cường đã test thành công.',
    example: 'Không chắc thì không chọn mục này. Hãy để "Không chắc - nhờ kỹ thuật".',
  },
  {
    value: 'needs_manual_mapping',
    label: 'Không chắc - nhờ kỹ thuật',
    shortLabel: 'An toàn: chưa đồng bộ sheet này',
    description: 'Chọn mục này khi nhân viên không chắc sheet giống file nào. Hệ thống sẽ không sync để tránh sai dữ liệu.',
    example: 'Đây là lựa chọn an toàn nhất cho sheet mới hoặc sheet lạ.',
  },
] as const

export const DEFAULT_SHEET_PROFILE = 'needs_manual_mapping'

export function sheetProfileFor(value?: string) {
  return SHEET_PROFILES.find((profile) => profile.value === value) ?? SHEET_PROFILES[2]
}

export function sheetProfileLabel(value?: string) {
  return sheetProfileFor(value).label
}

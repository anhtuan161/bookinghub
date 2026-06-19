import type { Property } from './types'

export const CITIES = ['Đà Lạt', 'Nha Trang', 'Phan Thiết', 'HCM']

export function cityFor(p: Property): string {
  const text = [p.area, p.address, p.ownerName, p.sourceSheetUrl].join(' ').toLowerCase()
  if (/nha\s*trang|khánh hòa|khanh hoa/.test(text)) return 'Nha Trang'
  if (/phan\s*thiết|phan thiet|mũi né|mui ne|bình thuận|binh thuan/.test(text)) return 'Phan Thiết'
  if (/hcm|sài gòn|sai gon|tp\.?\s*hồ\s*chí\s*minh|ho chi minh/.test(text)) return 'HCM'
  return 'Đà Lạt'
}

export function sheetNameFor(p: Property): string {
  return p.ownerName || p.sourceSheetUrl || 'Chưa phân nhóm'
}

export function sheetKeyFor(p: Property): string {
  return `${sheetNameFor(p)}|${p.sourceSheetUrl}`
}

// =============================================================
//  Phần dùng chung cho mọi nhà cung cấp AI bóc tách (Claude/Gemini).
//  - Kiểu dữ liệu kết quả
//  - Hàm dựng prompt (đưa giá trị ô + màu nền + bảng nghĩa màu)
// =============================================================
import type { RawTab, Status } from '../types.js'

export interface ExtractedRow {
  property_name: string
  date: string // YYYY-MM-DD
  status: Status
  price: number | null
  min_nights: number
  note: string
  confidence: number
}

export function buildPrompt(tab: RawTab, colorMapping: Record<string, Status>, year: number): string {
  const cellLines = tab.cells
    .map((c) => `r${c.row}c${c.col}="${c.value}"${c.bgHex ? ` [bg:${c.bgHex}]` : ''}`)
    .join('\n')
  const legend = Object.entries(colorMapping)
    .map(([hex, st]) => `${hex} = ${st}`)
    .join('; ')
  return [
    `Đây là dữ liệu một tab Google Sheet lịch villa (tab: "${tab.title}", năm ${year}).`,
    `Mỗi dòng là một ô: vị trí, giá trị, và [bg:màu nền] nếu có.`,
    `BẢNG NGHĨA MÀU của chủ nhà: ${legend || '(chưa cấu hình — suy luận thận trọng)'}.`,
    ``,
    `QUY TẮC:`,
    `- Ô tô màu "booked" (theo bảng nghĩa) dù có giá → status=booked.`,
    `- Ô chứa TÊN KHÁCH thay cho giá → booked.`,
    `- Giá dạng "7tr/7tr5", "3tr/3tr5/4tr5" → tách thành số (7tr = 7000000).`,
    `- Ký hiệu "Tạm giữ","Cọc","MB","Bảo trì" → blocked.`,
    `- KHÔNG chắc → status=unknown và confidence thấp (<0.6). Tuyệt đối không tự khẳng định "available" khi không chắc.`,
    `- Chỉ lấy ngày từ hôm nay trở đi.`,
    ``,
    `Trả về danh sách rows, mỗi phần tử là 1 (villa, ngày) với: property_name, date (YYYY-MM-DD), status (available|booked|blocked|unknown), price (số hoặc null), min_nights, note, confidence (0..1).`,
    ``,
    `DỮ LIỆU Ô:`,
    cellLines,
  ].join('\n')
}

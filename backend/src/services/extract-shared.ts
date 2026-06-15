// =============================================================
//  Phần dùng chung cho mọi nhà cung cấp AI bóc tách (Claude/Gemini/OpenRouter).
//  - Kiểu dữ liệu kết quả
//  - Phân loại MÀU NỀN → trạng thái (trong code, không phụ thuộc model)
//  - Hàm dựng prompt (đưa giá trị ô + NHÃN trạng thái màu đã tính sẵn)
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

// ---------- phân loại màu nền → trạng thái (deterministic) ----------
const STATUS_LABEL: Record<Status, string> = {
  booked: 'ĐÃ ĐẶT',
  available: 'TRỐNG',
  blocked: 'KHÓA/GIỮ',
  unknown: 'KHÔNG RÕ',
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}
function colorDist2(a: [number, number, number], b: [number, number, number]): number {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2
}
// Ngưỡng "gần" 1 màu trong bảng nghĩa (~khoảng cách RGB 173). Đủ rộng để khớp
// cùng họ màu (đỏ đậm/đỏ tươi), đủ hẹp để đỏ KHÔNG bị nhầm sang xanh.
const NEAR2 = 30_000

/**
 * Quyết định trạng thái của 1 ô CHỈ dựa trên màu nền:
 *  - Không có màu (ô trắng/không tô)  → null (để giá trị ô + AI quyết định).
 *  - Màu gần 1 màu trong bảng nghĩa   → dùng đúng nghĩa đó (vd xanh = available).
 *  - CÓ màu nhưng không khớp bảng nghĩa → 'booked' (theo yêu cầu: ô tô màu = đã đặt).
 */
export function classifyColor(bgHex: string | null | undefined, mapping: Record<string, Status>): Status | null {
  if (!bgHex) return null
  const target = hexToRgb(bgHex)
  let best: Status | null = null
  let bestD = Infinity
  for (const [hex, st] of Object.entries(mapping)) {
    if (!/^#?[0-9a-fA-F]{6}$/.test(hex)) continue
    const d = colorDist2(target, hexToRgb(hex.startsWith('#') ? hex : '#' + hex))
    if (d < bestD) {
      bestD = d
      best = st
    }
  }
  if (best && bestD <= NEAR2) return best
  return 'booked'
}

export function buildPrompt(tab: RawTab, colorMapping: Record<string, Status>, year: number): string {
  const cellLines = tab.cells
    .map((c) => {
      const cs = classifyColor(c.bgHex, colorMapping)
      // Nhãn KẾT LUẬN màu (đã tính sẵn trong code) — model phải tuân theo.
      const tag = cs ? ` [nền màu${c.bgHex ? ' ' + c.bgHex : ''} → ${STATUS_LABEL[cs]}]` : ''
      return `r${c.row}c${c.col}="${c.value}"${tag}`
    })
    .join('\n')
  const legend = Object.entries(colorMapping)
    .map(([hex, st]) => `${hex} = ${st}`)
    .join('; ')
  return [
    `Đây là dữ liệu một tab Google Sheet lịch villa (tab: "${tab.title}", năm ${year}).`,
    `Mỗi dòng là một ô: vị trí, giá trị, và NHÃN [nền màu → TRẠNG THÁI] nếu ô có tô màu.`,
    `BẢNG NGHĨA MÀU của chủ nhà: ${legend || '(chưa cấu hình)'}.`,
    ``,
    `QUY TẮC QUAN TRỌNG NHẤT — MÀU NỀN QUYẾT ĐỊNH TRẠNG THÁI:`,
    `- Nhãn [nền màu → …] đã được hệ thống tính sẵn. BẮT BUỘC dùng đúng trạng thái đó cho ô.`,
    `- Ô có [nền màu → ĐÃ ĐẶT] → status=booked, KỂ CẢ khi ô có ghi giá tiền. Tuyệt đối KHÔNG để available.`,
    `- Ô có [nền màu → TRỐNG] → status=available.`,
    `- Ô có [nền màu → KHÓA/GIỮ] → status=blocked.`,
    `- Ô KHÔNG có nhãn nền màu (ô trắng/không tô): suy từ giá trị — có TÊN KHÁCH / "Tạm giữ","Cọc","MB","Bảo trì" → booked/blocked; chỉ có giá hoặc trống → available.`,
    ``,
    `QUY TẮC GIÁ & NGÀY:`,
    `- Giá "7tr/7tr5", "3tr/3tr5/4tr5" → tách thành số (7tr = 7000000).`,
    `- Chỉ lấy ngày từ hôm nay trở đi.`,
    `- Ô tô màu mà bạn không chắc nghĩa → vẫn ưu tiên booked (an toàn cho chủ nhà), confidence thấp.`,
    ``,
    `Trả về danh sách rows, mỗi phần tử là 1 (villa, ngày) với: property_name, date (YYYY-MM-DD), status (available|booked|blocked|unknown), price (số hoặc null), min_nights, note, confidence (0..1).`,
    ``,
    `DỮ LIỆU Ô:`,
    cellLines,
  ].join('\n')
}

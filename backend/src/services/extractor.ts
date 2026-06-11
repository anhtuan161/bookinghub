// =============================================================
//  Bóc tách dữ liệu sheet bằng Claude (structured output qua tool use).
//  Đưa cho AI: giá trị ô + màu nền + bảng nghĩa màu của chủ nhà.
//  Trả về: danh sách {property_name, date, status, price, confidence...}
//  Chỉ kích hoạt khi DEMO_MODE=false.
// =============================================================
import Anthropic from '@anthropic-ai/sdk'
import { config } from '../config.js'
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

// Tool buộc Claude trả về JSON đúng cấu trúc (forced tool_choice).
const EXTRACT_TOOL: Anthropic.Tool = {
  name: 'record_availability',
  description:
    'Ghi lại lịch trống/đã đặt và giá của từng villa theo từng ngày, sau khi đọc dữ liệu Google Sheet.',
  input_schema: {
    type: 'object',
    properties: {
      rows: {
        type: 'array',
        description: 'Mỗi phần tử là 1 (villa, ngày).',
        items: {
          type: 'object',
          properties: {
            property_name: { type: 'string' },
            date: { type: 'string', description: 'Định dạng YYYY-MM-DD' },
            status: { type: 'string', enum: ['available', 'booked', 'blocked', 'unknown'] },
            price: { type: ['number', 'null'] },
            min_nights: { type: 'integer' },
            note: { type: 'string' },
            confidence: { type: 'number', description: '0..1; thấp nếu không chắc' },
          },
          required: ['property_name', 'date', 'status', 'confidence'],
          additionalProperties: false,
        },
      },
    },
    required: ['rows'],
    additionalProperties: false,
  },
}

let client: Anthropic | null = null
function getClient(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: config.anthropicApiKey })
  return client
}

function buildPrompt(tab: RawTab, colorMapping: Record<string, Status>, year: number): string {
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
    `DỮ LIỆU Ô:`,
    cellLines,
  ].join('\n')
}

/** Bóc tách 1 tab → các dòng chuẩn hóa. */
export async function extractTab(
  tab: RawTab,
  colorMapping: Record<string, Status>,
  year: number,
): Promise<ExtractedRow[]> {
  const resp = await getClient().messages.create({
    model: config.llmModel,
    max_tokens: 16000,
    tools: [EXTRACT_TOOL],
    tool_choice: { type: 'tool', name: 'record_availability' },
    messages: [{ role: 'user', content: buildPrompt(tab, colorMapping, year) }],
  })
  const block = resp.content.find((b) => b.type === 'tool_use')
  if (!block || block.type !== 'tool_use') return []
  const input = block.input as { rows?: ExtractedRow[] }
  return input.rows ?? []
}

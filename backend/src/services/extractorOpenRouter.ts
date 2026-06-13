// =============================================================
//  Bóc tách qua OpenRouter (API tương thích OpenAI). Dùng khi LLM_PROVIDER=openrouter.
//  Model free (vd: google/gemma-4-26b-a4b-it:free) THƯỜNG KHÔNG hỗ trợ tool/function
//  calling, nên ở đây ta yêu cầu model trả JSON thuần qua prompt rồi parse thủ công
//  (kèm fallback bóc JSON từ khối ```...``` nếu model lỡ bọc markdown).
// =============================================================
import OpenAI from 'openai'
import { config } from '../config.js'
import type { RawTab, Status } from '../types.js'
import { buildPrompt, type ExtractedRow } from './extract-shared.js'

let client: OpenAI | null = null
function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({
      apiKey: config.openrouterApiKey,
      baseURL: config.openrouterBaseUrl,
      // OpenRouter khuyến nghị (không bắt buộc) gắn 2 header này để định danh app.
      defaultHeaders: {
        'HTTP-Referer': 'https://bookinghub.app',
        'X-Title': 'bookinghub',
      },
    })
  }
  return client
}

// Cố gắng lấy JSON object đầu tiên từ text (kể cả khi bị bọc trong ```json ... ```).
function parseRows(text: string): ExtractedRow[] {
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim()
  const candidates: string[] = [cleaned]
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start !== -1 && end > start) candidates.push(cleaned.slice(start, end + 1))
  for (const c of candidates) {
    try {
      const parsed = JSON.parse(c) as { rows?: ExtractedRow[] }
      if (Array.isArray(parsed.rows)) return parsed.rows
    } catch {
      // thử ứng viên kế tiếp
    }
  }
  return []
}

export async function extractTabOpenRouter(
  tab: RawTab,
  colorMapping: Record<string, Status>,
  year: number,
): Promise<ExtractedRow[]> {
  const prompt = buildPrompt(tab, colorMapping, year)
  const resp = await getClient().chat.completions.create({
    model: config.openrouterModel,
    temperature: 0,
    messages: [
      {
        role: 'system',
        content:
          'Bạn là công cụ bóc tách dữ liệu. CHỈ trả về một JSON object hợp lệ dạng ' +
          '{"rows": [...]}, không kèm lời giải thích, không bọc trong markdown.',
      },
      { role: 'user', content: prompt },
    ],
  })
  const text = resp.choices[0]?.message?.content ?? ''
  return parseRows(text)
}

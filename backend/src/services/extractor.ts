// =============================================================
//  Bóc tách bằng Claude (Anthropic) — structured output qua tool use.
//  Dùng khi LLM_PROVIDER=anthropic.
// =============================================================
import Anthropic from '@anthropic-ai/sdk'
import { config } from '../config.js'
import type { RawTab, Status } from '../types.js'
import { buildPrompt, type ExtractedRow } from './extract-shared.js'

const EXTRACT_TOOL: Anthropic.Tool = {
  name: 'record_availability',
  description: 'Ghi lại lịch trống/đã đặt và giá của từng villa theo từng ngày.',
  input_schema: {
    type: 'object',
    properties: {
      rows: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            property_name: { type: 'string' },
            date: { type: 'string', description: 'YYYY-MM-DD' },
            status: { type: 'string', enum: ['available', 'booked', 'blocked', 'unknown'] },
            price: { type: ['number', 'null'] },
            min_nights: { type: 'integer' },
            note: { type: 'string' },
            confidence: { type: 'number' },
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

export async function extractTabAnthropic(
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
  return (block.input as { rows?: ExtractedRow[] }).rows ?? []
}

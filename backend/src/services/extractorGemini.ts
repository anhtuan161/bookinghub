// =============================================================
//  Bóc tách bằng Google Gemini — structured output qua responseSchema (JSON mode).
//  Dùng khi LLM_PROVIDER=gemini. Có gói free ở Google AI Studio (ai.google.dev).
// =============================================================
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai'
import { config } from '../config.js'
import type { RawTab, Status } from '../types.js'
import { buildPrompt, type ExtractedRow } from './extract-shared.js'

const RESPONSE_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    rows: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          property_name: { type: SchemaType.STRING },
          date: { type: SchemaType.STRING, description: 'YYYY-MM-DD' },
          status: { type: SchemaType.STRING, format: 'enum', enum: ['available', 'booked', 'blocked', 'unknown'] },
          price: { type: SchemaType.NUMBER, nullable: true },
          min_nights: { type: SchemaType.INTEGER, nullable: true },
          note: { type: SchemaType.STRING, nullable: true },
          confidence: { type: SchemaType.NUMBER },
        },
        required: ['property_name', 'date', 'status', 'confidence'],
      },
    },
  },
  required: ['rows'],
} as const

let genAI: GoogleGenerativeAI | null = null
function getClient(): GoogleGenerativeAI {
  if (!genAI) genAI = new GoogleGenerativeAI(config.geminiApiKey)
  return genAI
}

export async function extractTabGemini(
  tab: RawTab,
  colorMapping: Record<string, Status>,
  year: number,
): Promise<ExtractedRow[]> {
  const model = getClient().getGenerativeModel({
    model: config.geminiModel,
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA as any,
    },
  })
  const result = await model.generateContent(buildPrompt(tab, colorMapping, year))
  const text = result.response.text()
  try {
    const parsed = JSON.parse(text) as { rows?: ExtractedRow[] }
    return parsed.rows ?? []
  } catch {
    return []
  }
}

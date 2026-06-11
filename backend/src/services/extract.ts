// Dispatcher: chọn nhà cung cấp AI bóc tách theo LLM_PROVIDER.
import { config } from '../config.js'
import type { RawTab, Status } from '../types.js'
import { extractTabAnthropic } from './extractor.js'
import { extractTabGemini } from './extractorGemini.js'
import type { ExtractedRow } from './extract-shared.js'

export async function extractTab(
  tab: RawTab,
  colorMapping: Record<string, Status>,
  year: number,
): Promise<ExtractedRow[]> {
  if (config.llmProvider === 'anthropic') return extractTabAnthropic(tab, colorMapping, year)
  return extractTabGemini(tab, colorMapping, year) // mặc định: gemini
}

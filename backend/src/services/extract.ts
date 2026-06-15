// Dispatcher: chọn nhà cung cấp AI bóc tách theo LLM_PROVIDER.
import { config } from '../config.js'
import type { RawTab, Status } from '../types.js'
import { extractTabAnthropic } from './extractor.js'
import { extractTabGemini } from './extractorGemini.js'
import { extractTabOpenRouter } from './extractorOpenRouter.js'
import { runThrottled } from './llm-rate.js'
import type { ExtractedRow } from './extract-shared.js'

export async function extractTab(
  tab: RawTab,
  colorMapping: Record<string, Status>,
  year: number,
): Promise<ExtractedRow[]> {
  // Mọi lời gọi LLM đi qua throttle + retry-on-429 (xem llm-rate.ts).
  return runThrottled(() => {
    if (config.llmProvider === 'anthropic') return extractTabAnthropic(tab, colorMapping, year)
    if (config.llmProvider === 'openrouter') return extractTabOpenRouter(tab, colorMapping, year)
    return extractTabGemini(tab, colorMapping, year) // mặc định: gemini
  })
}

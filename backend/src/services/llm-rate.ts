// =============================================================
//  Điều tiết tốc độ gọi LLM dùng chung cho mọi provider:
//   1) THROTTLE: bảo đảm khoảng cách tối thiểu giữa 2 request liên tiếp
//      (tránh bắn dồn dập vượt rate limit free tier).
//   2) RETRY + BACKOFF: gặp 429 thì chờ rồi thử lại (ưu tiên Retry-After/
//      retryDelay do nhà cung cấp gợi ý), thay vì để cả sheet rơi vào 'error'.
// =============================================================
import { config } from '../config.js'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Hàng đợi nối tiếp: mỗi call chỉ chạy sau khi call trước đã giãn đủ khoảng cách.
let chain: Promise<unknown> = Promise.resolve()
let lastStartedAt = 0

function isRateLimit(err: any): boolean {
  const status = err?.status ?? err?.statusCode ?? err?.response?.status
  if (status === 429) return true
  const msg = String(err?.message ?? err ?? '')
  return /\b429\b|too many requests|rate limit|quota|RESOURCE_EXHAUSTED/i.test(msg)
}

// Lấy thời gian chờ (ms) do nhà cung cấp gợi ý, nếu có:
//  - OpenAI/Anthropic: header 'retry-after' (giây)
//  - Gemini: trong message có dạng "retryDelay":"5s"
function suggestedDelayMs(err: any): number | null {
  const header = err?.headers?.['retry-after'] ?? err?.response?.headers?.['retry-after']
  if (header && !Number.isNaN(Number(header))) return Number(header) * 1000
  const m = String(err?.message ?? '').match(/retryDelay"?\s*:?\s*"?(\d+(?:\.\d+)?)s/i)
  if (m) return Math.ceil(Number(m[1]) * 1000)
  return null
}

/**
 * Chạy `fn` (một lời gọi LLM) qua throttle + retry-on-429.
 * Các lời gọi được nối tiếp và giãn cách >= llmMinIntervalMs.
 */
export function runThrottled<T>(fn: () => Promise<T>): Promise<T> {
  const task = chain.then(async () => {
    for (let attempt = 0; ; attempt++) {
      const gap = config.llmMinIntervalMs - (Date.now() - lastStartedAt)
      if (gap > 0) await sleep(gap)
      lastStartedAt = Date.now()
      try {
        return await fn()
      } catch (err) {
        if (!isRateLimit(err) || attempt >= config.llmMaxRetries) throw err
        const backoff = suggestedDelayMs(err) ?? Math.min(60_000, 2 ** attempt * 1000)
        console.warn(`[llm] 429 rate limit — chờ ${backoff}ms rồi thử lại (lần ${attempt + 1}/${config.llmMaxRetries})`)
        await sleep(backoff)
      }
    }
  })
  // Giữ hàng đợi sống dù task này lỗi (không để 1 lỗi làm kẹt các call sau).
  chain = task.then(
    () => undefined,
    () => undefined,
  )
  return task as Promise<T>
}

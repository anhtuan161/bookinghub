import 'dotenv/config'

export const config = {
  demoMode: (process.env.DEMO_MODE ?? 'true').toLowerCase() !== 'false',
  port: Number(process.env.PORT ?? 8787),

  // Có DATABASE_URL → lưu dữ liệu vào PostgreSQL (Supabase); không có → in-memory.
  databaseUrl: process.env.DATABASE_URL ?? '',
  usePg: !!process.env.DATABASE_URL,

  // Auth: AUTH_REQUIRED=true → mọi API (trừ /health) cần JWT Supabase hợp lệ.
  authRequired: (process.env.AUTH_REQUIRED ?? 'false').toLowerCase() === 'true',
  supabaseJwtSecret: process.env.SUPABASE_JWT_SECRET ?? '',
  // URL project Supabase (để verify token ES256 qua JWKS). Ưu tiên SUPABASE_URL;
  // nếu trống thì suy từ project-ref trong DATABASE_URL (postgres.<ref>...).
  supabaseUrl: (() => {
    if (process.env.SUPABASE_URL) return process.env.SUPABASE_URL.replace(/\/+$/, '')
    const m = (process.env.DATABASE_URL ?? '').match(/postgres\.([a-z0-9]+)[:.]/)
    return m ? `https://${m[1]}.supabase.co` : ''
  })(),

  googleServiceAccountJson: process.env.GOOGLE_SERVICE_ACCOUNT_JSON ?? '',
  googleServiceAccountFile: process.env.GOOGLE_SERVICE_ACCOUNT_FILE ?? '',

  // Nhà cung cấp AI bóc tách: 'gemini' (có gói free), 'anthropic' (Claude),
  // hoặc 'openrouter' (API tương thích OpenAI — chọn model tuỳ ý, có model free).
  llmProvider: (process.env.LLM_PROVIDER ?? 'gemini').toLowerCase(),

  // Anthropic (Claude)
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
  llmModel: process.env.LLM_MODEL ?? 'claude-sonnet-4-6',

  // Google Gemini
  geminiApiKey: process.env.GEMINI_API_KEY ?? '',
  geminiModel: process.env.GEMINI_MODEL ?? 'gemini-2.0-flash',

  // OpenRouter (https://openrouter.ai) — tương thích OpenAI.
  openrouterApiKey: process.env.OPENROUTER_API_KEY ?? '',
  openrouterModel: process.env.OPENROUTER_MODEL ?? 'google/gemma-4-26b-a4b-it:free',
  openrouterBaseUrl: process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1',

  // Sheet bị lỗi (vd 429) sẽ được cron thử lại sau ngần này phút (không khoá vĩnh viễn).
  errorRetryMinutes: Number(process.env.ERROR_RETRY_MINUTES ?? 15),
  syncIntervalMinutes: Number(process.env.SYNC_INTERVAL_MINUTES ?? 2),
  syncBatchSize: Number(process.env.SYNC_BATCH_SIZE ?? 2),
  syncWindowMonths: Number(process.env.SYNC_WINDOW_MONTHS ?? 6),
  reviewConfidence: Number(process.env.REVIEW_CONFIDENCE ?? 0.8),
  dataStaleMinutes: Number(process.env.DATA_STALE_MINUTES ?? 120),
}

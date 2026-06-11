import 'dotenv/config'

export const config = {
  demoMode: (process.env.DEMO_MODE ?? 'true').toLowerCase() !== 'false',
  port: Number(process.env.PORT ?? 8787),

  // Có DATABASE_URL → lưu dữ liệu vào PostgreSQL (Supabase); không có → in-memory.
  databaseUrl: process.env.DATABASE_URL ?? '',
  usePg: !!process.env.DATABASE_URL,

  googleServiceAccountJson: process.env.GOOGLE_SERVICE_ACCOUNT_JSON ?? '',
  googleServiceAccountFile: process.env.GOOGLE_SERVICE_ACCOUNT_FILE ?? '',

  // Nhà cung cấp AI bóc tách: 'gemini' (có gói free) hoặc 'anthropic' (Claude).
  llmProvider: (process.env.LLM_PROVIDER ?? 'gemini').toLowerCase(),

  // Anthropic (Claude)
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
  llmModel: process.env.LLM_MODEL ?? 'claude-sonnet-4-6',

  // Google Gemini
  geminiApiKey: process.env.GEMINI_API_KEY ?? '',
  geminiModel: process.env.GEMINI_MODEL ?? 'gemini-2.0-flash',

  syncIntervalMinutes: Number(process.env.SYNC_INTERVAL_MINUTES ?? 2),
  syncBatchSize: Number(process.env.SYNC_BATCH_SIZE ?? 2),
  syncWindowMonths: Number(process.env.SYNC_WINDOW_MONTHS ?? 6),
  reviewConfidence: Number(process.env.REVIEW_CONFIDENCE ?? 0.8),
  dataStaleMinutes: Number(process.env.DATA_STALE_MINUTES ?? 120),
}

import 'dotenv/config'

export const config = {
  demoMode: (process.env.DEMO_MODE ?? 'true').toLowerCase() !== 'false',
  port: Number(process.env.PORT ?? 8787),

  googleServiceAccountJson: process.env.GOOGLE_SERVICE_ACCOUNT_JSON ?? '',
  googleServiceAccountFile: process.env.GOOGLE_SERVICE_ACCOUNT_FILE ?? '',

  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
  llmModel: process.env.LLM_MODEL ?? 'claude-sonnet-4-6',

  syncIntervalMinutes: Number(process.env.SYNC_INTERVAL_MINUTES ?? 2),
  syncBatchSize: Number(process.env.SYNC_BATCH_SIZE ?? 2),
  syncWindowMonths: Number(process.env.SYNC_WINDOW_MONTHS ?? 6),
  reviewConfidence: Number(process.env.REVIEW_CONFIDENCE ?? 0.8),
  dataStaleMinutes: Number(process.env.DATA_STALE_MINUTES ?? 120),
}

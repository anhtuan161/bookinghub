import 'dotenv/config'
import { readFileSync } from 'node:fs'

// Đọc secret từ biến môi trường X hoặc từ file chỉ định bởi X_FILE (Docker secret).
function secret(name: string): string {
  const direct = process.env[name]
  if (direct) return direct.trim()
  const file = process.env[`${name}_FILE`]
  if (!file) return ''
  try {
    return readFileSync(file, 'utf8').trim()
  } catch {
    return ''
  }
}

const list = (v: string | undefined) =>
  (v ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)

export const config = {
  demoMode: (process.env.DEMO_MODE ?? 'true').toLowerCase() !== 'false',
  port: Number(process.env.PORT ?? 8787),

  // Có DATABASE_URL → lưu dữ liệu vào PostgreSQL (Supabase); không có → in-memory.
  databaseUrl: secret('DATABASE_URL'),
  usePg: !!secret('DATABASE_URL'),

  // ====== App DB (Postgres nội bộ docker-core): user, phân quyền, Thomstay Coliving ======
  // Không có → tắt đăng nhập thật + Coliving (frontend chạy chế độ demo).
  appDatabaseUrl: secret('APP_DATABASE_URL'),
  // Khoá 32 byte (hex/base64/chuỗi bất kỳ) để mã hoá secret lưu trong DB (phiên ezCloud).
  appSecretKey: secret('APP_SECRET_KEY'),
  // Cookie phiên đăng nhập chỉ gửi qua HTTPS (bật khi public qua Cloudflare).
  cookieSecure: (process.env.COOKIE_SECURE ?? 'false').toLowerCase() === 'true',
  sessionDays: Number(process.env.SESSION_DAYS ?? 30),
  // Email được tự cấp quyền admin khi đăng ký, CHỈ khi hệ thống chưa có admin nào.
  bootstrapAdminEmails: list(process.env.BOOTSTRAP_ADMIN_EMAILS),
  // Origin được phép gọi API kèm cookie (dev Vite). Cùng origin thì không cần.
  corsOrigins: list(process.env.CORS_ORIGINS),
  trustProxy: (process.env.TRUST_PROXY ?? 'false').toLowerCase() === 'true',
  // Thư mục frontend đã build (Docker: /app/public) → backend phục vụ luôn web.
  staticDir: process.env.STATIC_DIR ?? '',
  publicUrl: (process.env.PUBLIC_URL ?? '').replace(/\/+$/, ''),
  timezone: process.env.TZ_APP ?? 'Asia/Ho_Chi_Minh',

  // ====== Thomstay Coliving: ezCloud PMS (API nội bộ, chỉ ĐỌC) ======
  ezcloudBaseUrl: (process.env.EZCLOUD_BASE_URL ?? 'https://pms.ezcloudhotel.com').replace(/\/+$/, ''),
  ezcloudSyncMinutes: Number(process.env.EZCLOUD_SYNC_MINUTES ?? 15),
  ezcloudChargesPerRun: Number(process.env.EZCLOUD_CHARGES_PER_RUN ?? 400),
  ezcloudRequestGapMs: Number(process.env.EZCLOUD_REQUEST_GAP_MS ?? 300),
  telegramBotToken: secret('TELEGRAM_BOT_TOKEN'),
  telegramChatId: secret('TELEGRAM_CHAT_ID'),
  dailySummaryHour: Number(process.env.DAILY_SUMMARY_HOUR ?? 7),

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
  // Giãn nhịp gọi LLM: khoảng cách tối thiểu giữa 2 request (ms) để không vượt
  // rate limit free tier (2.0 Flash ~15 req/phút → 4000ms là an toàn).
  llmMinIntervalMs: Number(process.env.LLM_MIN_INTERVAL_MS ?? 4000),
  // Số lần thử lại khi bị 429 (rate limit), dùng exponential backoff.
  llmMaxRetries: Number(process.env.LLM_MAX_RETRIES ?? 3),

  syncIntervalMinutes: Number(process.env.SYNC_INTERVAL_MINUTES ?? 2),
  syncBatchSize: Number(process.env.SYNC_BATCH_SIZE ?? 2),
  syncWindowMonths: Number(process.env.SYNC_WINDOW_MONTHS ?? 6),
  backendSyncEnabled: (process.env.BACKEND_SYNC_ENABLED ?? 'false').toLowerCase() === 'true',
  n8nManualSyncWebhookUrl: process.env.N8N_MANUAL_SYNC_WEBHOOK_URL ?? '',
  reviewConfidence: Number(process.env.REVIEW_CONFIDENCE ?? 0.8),
  dataStaleMinutes: Number(process.env.DATA_STALE_MINUTES ?? 120),
}

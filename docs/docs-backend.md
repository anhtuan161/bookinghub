# Tài Liệu Backend — Villa Booking Hub

> Backend đọc Google Sheet chủ nhà (kèm màu nền), dùng AI bóc tách về dữ liệu chuẩn, lưu vào PostgreSQL (Supabase), và phục vụ API tìm phòng cho webapp. **Không dùng n8n.** Đồng bộ định kỳ 5 phút, không real-time.

## 1. Kiến trúc

```
Google Sheets (Service Account)
        │  Sheets API (includeGridData=true → đọc backgroundColor)
        ▼
[Sync Service] ── cron 5' + webhook "Sync ngay"
        │  text ô + màu nền + bảng nghĩa màu của chủ nhà
        ▼
[AI Extractor] ── LLM → JSON chuẩn + confidence
        │
        ├─ confidence cao  → availability_calendar
        └─ confidence thấp → review_queue (nhân viên duyệt)
        ▼
[PostgreSQL / Supabase]  ← nguồn sự thật
        ▲
[REST API]  ── /search, /sync, /review, /bookings, /sheets
        ▲
   Webapp FE (Lovable)
```

## 2. Stack

| Thành phần | Lựa chọn |
|---|---|
| Ngôn ngữ | Node.js (NestJS) **hoặc** Python (FastAPI) |
| Database | PostgreSQL qua **Supabase** |
| Google Sheet | **Service Account** + Google Sheets API v4, `spreadsheets.get?includeGridData=true` |
| AI bóc tách | LLM có structured output (Claude / Gemini) |
| Auth | Supabase Auth |
| Hosting FE | **Vercel** (Lovable publish thẳng lên) |
| Hosting BE/API | **Supabase Edge Functions** (Deno) — không cần server riêng |
| Lịch sync | **Supabase pg_cron + pg_net** gọi Edge Function (xem mục 11) |
| Thông báo | Telegram Bot / Zalo OA (giai đoạn chatbot) |

## 3. Luồng đồng bộ (Sync Service)

1. Cron mỗi 5' (hoặc webhook khi nhân viên bấm "Đồng bộ ngay") lấy danh sách sheet đang active.
2. Với mỗi sheet: gọi Sheets API `includeGridData=true` để lấy **giá trị + backgroundColor** từng ô.
3. **Lọc phạm vi:** chỉ giữ tab/vùng từ **tháng hiện tại → +6 tháng**. Bỏ tab cũ, tab ảnh. Tab không nhận diện được tháng → đánh dấu `needs_check`.
4. Dò ô chứa link `spreadsheets/...` (sheet con) → thêm vào hàng đợi sync.
5. Đẩy (text + màu + bảng nghĩa màu của chủ nhà) sang AI Extractor.
6. Ghi kết quả: confidence cao → `availability_calendar`; thấp → `review_queue`.
7. Ghi `sync_logs` (số dòng parse, số dòng review, lỗi).

**Chống ghi đè sai:** mỗi sync ghi đè theo `(property_id, date)`; lưu snapshot trước khi ghi để đối chiếu/khôi phục.

## 4. AI Extractor

**Input:** với mỗi vùng lịch → text các ô, màu nền các ô, bảng nghĩa màu + ký hiệu của chủ nhà.

**Prompt yêu cầu LLM trả về JSON** mỗi (villa, ngày):
```json
{
  "property_name": "...", "date": "2026-06-20",
  "status": "available|booked|blocked|unknown",
  "price": 1300000, "min_nights": 1,
  "capacity_standard": 6, "capacity_max": 8,
  "extra_fee_note": "...", "rules": ["..."],
  "confidence": 0.0
}
```

**Quy tắc bắt buộc:**
- Ô màu đỏ (theo bảng nghĩa) dù có giá → `booked`.
- Ô chứa tên khách thay cho giá → `booked`.
- Giá "7tr/7tr5", "3tr/3tr5/4tr5" → tách theo loại phòng/unit.
- Ký hiệu "MB", "Tạm Giữ", "Cọc", "Bảo trì" → map theo bảng nghĩa.
- **Không chắc → `unknown` + confidence thấp → đẩy review_queue.** Tuyệt đối không tự khẳng định "available".

## 5. Schema database (rút gọn)

```sql
owners(id, name, phone, commission_rate, note, created_at)

properties(id, owner_id, name, area, address, bedrooms,
  capacity_standard, capacity_max, amenities jsonb, rules jsonb,
  images jsonb, base_price, extra_fee_note, last_synced_at)

sheets(id, owner_id, url, title, parent_sheet_id null,
  color_mapping jsonb,            -- {"#ff0000":"booked","#00ff00":"available"}
  sync_status,                    -- ok | error | needs_check
  last_synced_at, assignee, last_error)

availability_calendar(
  id, property_id, date, status,  -- available|booked|blocked|unknown
  price, min_nights, capacity_standard, capacity_max,
  note, rules jsonb,
  source_sheet_id, source_tab, source_updated_at, synced_at,
  confidence,
  UNIQUE(property_id, date))

review_queue(id, property_id, date, raw_value, raw_color_hex,
  suggested_status, suggested_price, confidence,
  source_sheet_id, created_at, resolved bool)

booking_requests(id, property_id, customer_name, customer_contact,
  channel, checkin, checkout, guests, quoted_price,
  status, assignee, note, created_at, updated_at)

sync_logs(id, sheet_id, started_at, finished_at, status,
  rows_parsed, rows_review, error)

profiles(id, email, full_name, role)  -- role: sale | manager
```

Index: `availability_calendar(property_id, date)`, `(date, status)`.

## 6. REST API (hợp đồng với FE)

> Base: `/api`. Auth: Bearer JWT (Supabase). Tất cả trả JSON.

### Tìm phòng
```
POST /api/search/availability
body: { checkin, checkout, guests, area?, minPrice?, maxPrice?, amenities? }
resp: [{ property, avgPrice, hasReview }]
```
Logic: villa mà **mọi ngày trong [checkin, checkout) đều `available`**, đủ sức chứa, đủ min_nights, hợp ngân sách & rules, status không phải unknown. `hasReview=true` nếu có ngày `needs_review` trong khoảng.

### Đồng bộ
```
POST /api/sync/now
body: { sheetId? | propertyId? }   // không có → sync tất cả
resp: { started: true }
```

### Cần kiểm tra
```
GET  /api/review                         → ReviewItem[]
POST /api/review/:id/resolve
body: { status, price?, action: "confirm"|"edit" }
→ ghi vào availability_calendar, set resolved=true
```

### Yêu cầu giữ phòng
```
GET   /api/bookings?status=&assignee=    → BookingRequest[]
POST  /api/bookings                      → tạo
PATCH /api/bookings/:id                  body: { status }
```

### Nguồn dữ liệu
```
GET   /api/sheets                        → Sheet[]
POST  /api/sheets                        body: { ownerName, ownerPhone, url, commissionRate }
PATCH /api/sheets/:id                    body: { colorMapping?, assignee? }
```

### Tổng quan
```
GET /api/dashboard/stats
resp: { totalProperties, availableToday, pendingBookings, reviewCount, errorSheets }
```

## 7. Truy cập Google Sheet

- Tạo **1 Google Service Account** chuyên dụng. Chủ nhà share sheet (quyền Viewer) vào email service account đó.
- Bật Google Sheets API trong Google Cloud project.
- Lưu credentials trong biến môi trường (không commit).
- Đọc màu: `effectiveFormat.backgroundColor` của từng cell trong `sheets[].data[].rowData[].values[]`.

## 8. Biến môi trường

```
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
GOOGLE_SERVICE_ACCOUNT_JSON=     # hoặc đường dẫn file
LLM_API_KEY=
LLM_MODEL=
SYNC_INTERVAL_MINUTES=5
SYNC_WINDOW_MONTHS=6
REVIEW_CONFIDENCE_THRESHOLD=0.8
DATA_STALE_MINUTES=120
```

## 9. Bảo mật & độ ổn định

- Backend chỉ **đọc** sheet gốc, không ghi.
- RLS trên Supabase: nhân viên chỉ đọc dữ liệu, ghi qua API có kiểm soát.
- Sync 1 sheet lỗi **không** làm hỏng sheet khác (try/catch theo từng sheet, ghi `sync_logs`).
- Hosting managed tự restart khi crash → không cần sysadmin.
- Retry có giới hạn khi gọi Sheets API / LLM; lỗi quá ngưỡng → set sheet `error` + báo FE.

## 10. Thứ tự build (khớp lộ trình v3)

1. Service Account + đọc thử 1 sheet kèm màu (POC).
2. AI Extractor + bảng `availability_calendar` + `review_queue`.
3. Sync Service (cron 5') + `/api/sync/now`.
4. `/api/search/availability` + `/api/review/*` (cho FE Lovable nối vào).
5. `/api/bookings/*`, `/api/sheets/*`, `/api/dashboard/stats`.
6. (Giai đoạn sau) Chatbot + Telegram/Zalo handoff.

## 11. Triển khai trên Vercel + Supabase (khuyến nghị)

**Chỉ 2 nền tảng — đúng mục tiêu "ít thứ phải canh".**

```
┌── Vercel ───────────────┐     ┌── Supabase ───────────────────────┐
│ Webapp React (Lovable)  │ ──▶ │ PostgreSQL  (dữ liệu)             │
│  - tĩnh + gọi API        │     │ Auth        (đăng nhập)           │
└─────────────────────────┘     │ Edge Functions (REST API + sync)  │
                                │ pg_cron + pg_net (hẹn giờ sync)   │
                                │ Function Secrets (Google SA, LLM) │
                                └───────────────────────────────────┘
                                          │ Sheets API + LLM
                                          ▼
                                 Google Sheets chủ nhà
```

**Phân vai:**
- **Vercel:** chỉ chứa frontend (Lovable → GitHub → Vercel, deploy tự động mỗi lần sửa). Nhanh, miễn phí ở mức nhỏ, tự cấp HTTPS.
- **Supabase:** Postgres + Auth + **Edge Functions** đóng vai REST API (`/search`, `/review`, `/bookings`, `/sheets`, `/sync`). Sync chạy bằng **pg_cron** gọi Edge Function.

### 11.1. Điểm CẦN LƯU Ý: sync là tác vụ nặng, phải chạy theo lô

Edge Function (và serverless nói chung) có **giới hạn thời gian mỗi lần chạy** (Supabase ~150s, gói cao hơn dài hơn). Đọc 50 sheet lớn + gọi LLM cho từng sheet **không thể** xong trong 1 lần gọi. Vì vậy **không** sync tất cả trong một lần. Thay vào đó dùng mô hình **hàng đợi rút dần (queue drain):**

1. `pg_cron` chạy mỗi 1–2 phút, gọi Edge Function `sync-tick`.
2. Mỗi lần `sync-tick` chỉ xử lý **1–3 sheet "đến hạn nhất"** (theo `last_synced_at` cũ nhất), xong thì cập nhật `last_synced_at` rồi thoát — luôn nằm trong giới hạn thời gian.
3. Lần gọi sau lấy sheet kế tiếp. Sau vài vòng, toàn bộ 50 sheet được làm mới.

> Hệ quả thực tế: không phải "tất cả 50 sheet mới cùng lúc mỗi 5 phút", mà là **làm mới luân phiên, mỗi sheet được cập nhật ~mỗi 10–20 phút**. Vì bạn **không cần real-time**, điều này hoàn toàn ổn. Nút **"Đồng bộ ngay"** vẫn cho phép nhân viên ép làm mới 1 sheet/1 villa tức thì trước khi chốt khách.

### 11.2. Khi nào cần thêm nền tảng thứ 3

Chỉ khi **một sheet đơn lẻ quá lớn** khiến 1 lần `sync-tick` vẫn vượt giới hạn thời gian (hiếm, vì ta đã lọc chỉ tháng hiện tại trở đi). Lúc đó tách **riêng phần worker sync** sang **Railway/Render** (một background worker chạy vòng lặp bình thường), còn FE vẫn ở Vercel, DB/Auth/API vẫn ở Supabase. Không cần đổi gì ở FE.

### 11.3. Các bước deploy

1. Tạo project Supabase → chạy migration tạo bảng (mục 5) → bật RLS.
2. Bật **Auth** (email/mật khẩu) → tạo tài khoản nhân viên + bảng `profiles`.
3. Viết các **Edge Functions**: `search`, `review-resolve`, `bookings`, `sheets`, `sync-tick`. Khai báo secrets (Google SA JSON, LLM key).
4. Bật **pg_cron** + **pg_net**, tạo job gọi `sync-tick` mỗi 1–2 phút.
5. Trong Lovable: nối Supabase (Auth + đọc bảng) và trỏ các hàm `searchAvailability/syncNow/resolveReview` sang URL Edge Functions → **Publish lên Vercel** (qua GitHub).
6. Cấu hình biến môi trường FE (`SUPABASE_URL`, `SUPABASE_ANON_KEY`) trên Vercel.

### 11.4. Chi phí ước lượng (giai đoạn đầu)
- **Vercel Hobby:** miễn phí (đủ cho nội bộ).
- **Supabase Free/Pro:** Free để chạy thử; lên **Pro (~25$/tháng)** khi cần Edge Functions chạy ổn định, pg_cron tần suất cao, dung lượng DB lớn hơn.
- **LLM:** trả theo lượng dùng — vì chỉ đọc tháng hiện tại trở đi và sync luân phiên nên chi phí thấp; có thể cache, chỉ gọi LLM lại khi ô thay đổi.

**Tổng:** giai đoạn đầu gần như **chỉ tốn tiền LLM + ~25$/tháng Supabase Pro**, không phải nuôi server.

# Villa Booking Hub — Backend

API cho webapp nội bộ: tìm phòng, cần kiểm tra, yêu cầu giữ phòng, nguồn dữ liệu, đồng bộ.
**Phần đăng nhập (auth) làm ở giai đoạn sau** theo yêu cầu — hiện API mở để dev nhanh.

## Hai chế độ chạy

| Chế độ | Cần gì | Dùng khi |
|---|---|---|
| **DEMO** (mặc định) | Không cần gì | Chạy ngay, nối frontend, xem luồng hoạt động bằng dữ liệu mẫu |
| **LIVE** | Google Service Account + Anthropic API key | Đọc Google Sheet thật (kèm màu) + Claude bóc tách |

## Chạy local

```bash
cd backend
npm install
cp .env.example .env     # mặc định DEMO_MODE=true — chạy được luôn
npm run dev
```
Server: **http://localhost:8787** · kiểm tra: http://localhost:8787/api/health

## Nối với frontend
Trong thư mục `frontend`, tạo file `.env` với:
```
VITE_API_URL=http://localhost:8787/api
```
rồi sửa `frontend/src/lib/api.ts` để gọi API thật (mỗi hàm có URL tương ứng bên dưới). Khi chưa đặt `VITE_API_URL`, frontend vẫn chạy bằng mock.

## Các endpoint (khớp hợp đồng FE)

| Method | Path | Dùng cho |
|---|---|---|
| GET  | `/api/properties` · `/api/properties/:id` | danh sách / chi tiết villa |
| GET  | `/api/properties/:id/availability?year=&month=` | lịch tháng (month 0–11) |
| GET  | `/api/areas` | danh sách khu vực |
| POST | `/api/search/availability` | tìm phòng `{checkin,checkout,guests,area?,maxPrice?}` |
| GET  | `/api/review` · POST `/api/review/:id/resolve` | cần kiểm tra |
| GET/POST | `/api/bookings` · PATCH `/api/bookings/:id` | yêu cầu giữ phòng |
| GET/POST | `/api/sheets` · PATCH `/api/sheets/:id` | nguồn dữ liệu |
| POST | `/api/sync/now` | đồng bộ ngay `{sheetId?}` |
| GET  | `/api/dashboard/stats` | tổng quan |

## Bật chế độ LIVE (đọc sheet thật)

1. Tạo **Google Service Account**, bật Google Sheets API, tải JSON key.
2. Chia sẻ các Google Sheet chủ nhà cho email service account (quyền Xem).
3. Điền `.env`:
   ```
   DEMO_MODE=false
   GOOGLE_SERVICE_ACCOUNT_JSON={...}   # hoặc GOOGLE_SERVICE_ACCOUNT_FILE=./sa.json
   ANTHROPIC_API_KEY=sk-ant-...
   LLM_MODEL=claude-sonnet-4-6         # hoặc claude-haiku-4-5 (rẻ hơn)
   ```
4. Kiểm thử 1 lần: `npm run sync:once`

### Vì sao đọc màu nền?
Trạng thái còn/hết phòng của các sheet nằm chủ yếu ở **màu nền ô**. Backend dùng
`spreadsheets.get?includeGridData=true` để lấy `backgroundColor`, rồi đưa cả
giá trị + màu + bảng nghĩa màu của chủ nhà cho Claude bóc tách (structured output
qua tool use). Ô không chắc → đẩy vào **Cần kiểm tra** thay vì đoán bừa.

### Model bóc tách
- `claude-sonnet-4-6` (mặc định) — cân bằng chính xác/chi phí cho sheet lộn xộn. **$3 / $15** mỗi 1M token (vào/ra).
- `claude-haiku-4-5` — rẻ hơn (**$1 / $5**), dùng khi sheet đơn giản.
- `claude-opus-4-8` — mạnh nhất, đắt hơn.
Chi phí thấp vì chỉ đọc tháng hiện tại trở đi + sync luân phiên.

## Đồng bộ theo lô (queue-drain)
Cron chạy mỗi `SYNC_INTERVAL_MINUTES` phút, mỗi lần chỉ xử lý `SYNC_BATCH_SIZE`
sheet "cũ nhất" → không bao giờ vượt giới hạn thời gian. Nút **Đồng bộ ngay** ép
làm mới tức thì 1 sheet. Không cần real-time.

## Lên production
- Dữ liệu hiện ở `src/store.ts` (in-memory). Production: chạy `db/schema.sql` trên
  Supabase rồi thay `store.ts` bằng adapter PostgreSQL — **route không phải đổi**.
- Deploy: FE trên Vercel, BE/API trên Supabase Edge Functions (hoặc Render). Xem
  `../docs/docs-backend.md`.

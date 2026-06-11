# Booking Hub — Tài liệu dự án & bàn giao

> Tài liệu này dành cho **AI hoặc lập trình viên tiếp theo** để nắm nhanh: mục tiêu,
> kiến trúc, trạng thái hiện tại, quyết định thiết kế, và cách tiếp tục/phát triển.
> Đọc kèm: `docs/giai-phap-v3.md` (giải pháp tổng thể), `docs/docs-frontend.md`,
> `docs/docs-backend.md` (đặc tả chi tiết).

Cập nhật lần cuối: 2026-06 (sau khi deploy production Lớp A).

---

## 1. Mục tiêu dự án

**Bối cảnh:** Agency cho thuê villa tại Việt Nam (Đà Lạt), bán phòng cho **~50 chủ nhà**.
Mỗi chủ nhà chỉ dùng **Google Sheet** với định dạng riêng, **trạng thái phòng mã hóa
bằng MÀU NỀN ô** (đỏ = đã đặt…), giá ghi kiểu người đọc ("7tr/7tr5"). Nhân viên phải
mở từng sheet để tra phòng khi khách hỏi → chậm, dễ sai, không scale.

**Mục tiêu:**
1. **Tập trung hóa** dữ liệu booking từ nhiều sheet về **một nguồn sự thật** (DB).
2. **Chuẩn hóa** dữ liệu lộn xộn (màu + chữ tự do) thành cấu trúc truy vấn được.
3. **Webapp nội bộ** cho nhân viên (không rành công nghệ) tra phòng nhanh, quản lý
   yêu cầu giữ phòng, duyệt dữ liệu không chắc.
4. (Giai đoạn sau) **Chatbot AI** tư vấn khách dựa trên dữ liệu đã chuẩn hóa.

**Ràng buộc cốt lõi:** ổn định, dễ vận hành cho nhân viên không rành công nghệ;
không cần real-time (đồng bộ định kỳ là đủ).

---

## 2. Kiến trúc & công nghệ

```
Người dùng (nhân viên)
      │
      ▼
┌─────────────┐   HTTPS/REST    ┌──────────────┐   SQL    ┌──────────────┐
│  Frontend   │ ───────────────▶│   Backend    │ ────────▶│  Supabase    │
│ React+Vite  │  VITE_API_URL   │ Express/TS   │  pooler  │  PostgreSQL  │
│  (Vercel)   │◀─────────────── │  (Render)    │◀──────── │  (database)  │
└─────────────┘                 └──────┬───────┘          └──────────────┘
                                       │ (LIVE mode)
                          Google Sheets API (đọc màu nền)
                                       + Claude (bóc tách)
```

| Lớp | Công nghệ | Host |
|---|---|---|
| Frontend | React 18 + Vite + Tailwind + react-router | **Vercel** |
| Backend/API | Node + Express + TypeScript | **Render** |
| Database | PostgreSQL | **Supabase** |
| Đọc Google Sheet | `googleapis`, `includeGridData=true` (lấy `backgroundColor`) | (trong backend) |
| Bóc tách AI | Claude `claude-sonnet-4-6` (tool use → structured JSON) | Anthropic API |
| Đồng bộ | `node-cron` queue-drain | (trong backend) |

**Vì sao topology này** (không dùng n8n, không Edge Functions): backend là Node/Express
chạy liên tục (có cron + nạp dữ liệu lúc khởi động) → hợp **Render** hơn serverless.
Vercel chỉ phục vụ frontend tĩnh. Supabase đóng vai Database (+ Auth ở giai đoạn sau).

---

## 3. Trạng thái hiện tại (đã chạy production)

| Hạng mục | Trạng thái | Ghi chú |
|---|---|---|
| Frontend | 🟢 Live | https://bookinghub-chi.vercel.app |
| Backend API | 🟢 Live | https://bookinghub-lu6y.onrender.com/api |
| Database | 🟢 Nối | Supabase Postgres, đã chạy `schema.sql` + seed |
| FE↔BE↔DB | 🟢 Thông | Đã kiểm chứng ghi xuyên suốt tới Supabase |
| `DEMO_MODE` | 🟡 `true` | Chạy bằng dữ liệu mẫu; **chưa đọc Google Sheet thật** |
| Auth/đăng nhập | 🔴 Chưa làm | API đang **mở** (ai có URL đều gọi được) |
| Chatbot | 🔴 Chưa làm | Giai đoạn sau |

**Repo:** https://github.com/anhtuan161/bookinghub (Private), nhánh `master`.

---

## 4. Cấu trúc mã nguồn

```
bookinghub/
├─ frontend/                 # Webapp React (Vercel)
│  ├─ src/
│  │  ├─ lib/
│  │  │  ├─ api.ts           # ★ Lớp truy cập dữ liệu. Có VITE_API_URL → gọi backend; trống → mock
│  │  │  ├─ types.ts, utils.ts, auth.ts (demo), toast.ts
│  │  ├─ components/         # Layout, Modal, Toaster, StatusBadge
│  │  └─ pages/              # Login, Search, PropertyDetail, Review, Bookings, Sources, Dashboard
│  ├─ vercel.json            # framework=vite + SPA rewrite
│  └─ .env.example           # VITE_API_URL
│
├─ backend/                  # API Express/TS (Render)
│  ├─ src/
│  │  ├─ index.ts            # khởi động: db.init() → listen + cron queue-drain
│  │  ├─ config.ts           # đọc ENV (DEMO_MODE, DATABASE_URL, LLM_MODEL, SYNC_*)
│  │  ├─ store.ts            # ★ Kho in-memory (nguồn dữ liệu routes đọc). Seed sẵn. Ghi → gọi db.*
│  │  ├─ db.ts               # ★ Adapter Postgres: tạo bảng, seed, hydrate, ghi-xuyên-suốt
│  │  ├─ routes.ts           # tất cả endpoint REST
│  │  ├─ services/
│  │  │  ├─ sheets.ts        # đọc Google Sheet kèm màu nền (LIVE)
│  │  │  ├─ extractor.ts     # Claude bóc tách (LIVE), forced tool_choice
│  │  │  └─ sync.ts          # điều phối đồng bộ queue-drain
│  │  └─ scripts/            # db-init.ts, sync-once.ts
│  ├─ db/schema.sql          # lược đồ PostgreSQL
│  └─ .env.example
│
├─ docs/                     # Tài liệu (giải pháp v3, đặc tả FE/BE, phân tích sheet thật, file này)
├─ render.yaml               # Blueprint deploy backend lên Render
└─ README.md
```

**3 file quan trọng nhất để hiểu hệ thống:** `backend/src/store.ts`,
`backend/src/db.ts`, `frontend/src/lib/api.ts`.

---

## 5. Hai trục cấu hình (rất quan trọng)

Backend có **2 cờ độc lập**:

1. **`DEMO_MODE`** (true/false) — *nguồn dữ liệu lịch*:
   - `true`: dùng dữ liệu mẫu trong bộ nhớ, **không** gọi Google/Claude.
   - `false` (LIVE): đọc Google Sheet thật + Claude bóc tách.
2. **`DATABASE_URL`** (có/không) — *nơi lưu trữ*:
   - Có → ghi/đọc PostgreSQL (Supabase). Health báo `storage: postgres`.
   - Không → chỉ in-memory (mất khi restart). Health báo `storage: memory`.

Hiện production: `DEMO_MODE=true` + có `DATABASE_URL` → **dữ liệu mẫu nhưng lưu bền vào Supabase**.

---

## 6. Hợp đồng API (REST, base `/api`)

| Method | Path | Mô tả |
|---|---|---|
| GET | `/health` | trạng thái (mode, storage, model) |
| GET | `/properties` · `/properties/:id` | villa |
| GET | `/properties/:id/availability?year=&month=` | lịch tháng (month 0–11) |
| GET | `/areas` | khu vực |
| POST | `/search/availability` | `{checkin,checkout,guests,area?,maxPrice?}` |
| GET | `/review` · POST `/review/:id/resolve` | cần kiểm tra |
| GET/POST | `/bookings` · PATCH `/bookings/:id` | yêu cầu giữ phòng |
| GET/POST | `/sheets` · PATCH `/sheets/:id` | nguồn dữ liệu |
| POST | `/sync/now` | đồng bộ ngay `{sheetId?}` |
| GET | `/dashboard/stats` | tổng quan |

Frontend gọi qua các hàm trong `frontend/src/lib/api.ts` (mỗi hàm map 1 endpoint).

---

## 7. Quyết định thiết kế (đọc kỹ trước khi sửa)

1. **Đọc MÀU NỀN ô** là bắt buộc — trạng thái phòng của sheet thật nằm ở màu, mất khi
   xuất CSV/text. Dùng `spreadsheets.get?includeGridData=true`.
2. **AI bóc tách thay parser code cứng** — vì 50 sheet định dạng khác nhau (thậm chí
   khác giữa các tab cùng file). Parser cứng bảo trì vô tận. Claude đọc "mềm" hơn.
3. **Ô không chắc → hàng `needs_review`**, KHÔNG đoán bừa "available". Chống đặt trùng.
4. **Đồng bộ queue-drain** (mỗi nhịp vài sheet cũ nhất) — tránh timeout, không cần real-time.
5. **Chỉ đọc tháng hiện tại trở đi** (`isFutureMonthTab` trong `sheets.ts`).
6. **Kho in-memory + ghi-xuyên-suốt Postgres** (không truy vấn DB mỗi request):
   `db.init()` nạp DB → bộ nhớ lúc khởi động; mọi thay đổi ghi đồng thời xuống DB
   (best-effort, không làm sập API nếu DB lỗi). Routes đọc đồng bộ từ bộ nhớ → đơn giản, nhanh.
7. **Luôn xác nhận chủ nhà ở bước chốt cuối** — hệ thống là "lớp lọc nhanh", không tự khóa phòng.

---

## 8. Chạy local

```bash
# Backend
cd backend && npm install && cp .env.example .env
# (tùy chọn) điền DATABASE_URL = chuỗi pooler Supabase để lưu bền
npm run dev            # http://localhost:8787 ; npm run db:init để tạo bảng+seed

# Frontend
cd frontend && npm install
# .env: VITE_API_URL=http://localhost:8787/api  (trống = chạy mock)
npm run dev            # http://localhost:5173
```

## 9. Deploy (tham chiếu)

- **Frontend → Vercel:** Root Directory = `frontend`, Framework = Vite, env `VITE_API_URL` = `<backend>/api`. Đổi env phải **Redeploy** (VITE nhúng lúc build).
- **Backend → Render:** Blueprint đọc `render.yaml` (rootDir=backend, build `npm install --include=dev && npm run build`, start `npm start`). Env: `DEMO_MODE`, `DATABASE_URL` (secret). PORT do Render tự cấp.
- **Database → Supabase:** chạy `backend/db/schema.sql`; dùng **Session pooler** connection string (host `...pooler.supabase.com`, IPv4) — KHÔNG dùng direct host (chỉ IPv6).

---

## 10. Lộ trình tiếp theo (ưu tiên giảm dần)

### A. Auth / đăng nhập (KHUYẾN NGHỊ LÀM TRƯỚC khi đổ dữ liệu thật)
API đang mở. Phương án: **Supabase Auth** (email/mật khẩu) cho FE; backend verify JWT.
Bảng `profiles(role: sale|manager)` đã có trong schema. Bảo vệ các route ghi.
Tối thiểu nhanh: 1 API key header dùng chung giữa FE↔BE.

### B. Bật LIVE mode (đọc Google Sheet thật)
1. Tạo **Google Service Account** (Google Cloud) → bật Sheets API → tải JSON key.
2. **Share** các sheet chủ nhà cho email service account (quyền Xem).
3. Tạo **`ANTHROPIC_API_KEY`** (console.anthropic.com, cần billing).
4. Đặt trên Render: `DEMO_MODE=false`, `GOOGLE_SERVICE_ACCOUNT_JSON`, `ANTHROPIC_API_KEY`.
5. **Test 1 sheet trước**: `npm run sync:once` ở local, kiểm tra kết quả + chỉnh
   `colorMapping` (bảng nghĩa màu) cho từng chủ nhà.
   > ⚠️ **Logic ghép tên villa trong `sync.ts` còn ngây thơ** (`p.name.includes(row.property_name.slice(0,6))`).
   > Cần cải thiện: map theo cấu hình rõ ràng (cột nào ↔ villa nào) thay vì đoán theo tên.
6. Bật rộng dần; theo dõi tỷ lệ `needs_review`.

### C. Nâng cấp lưu trữ thật sự (nếu scale)
Kho in-memory hợp 1 instance Render. Nếu chạy **nhiều instance**, chúng sẽ phân kỳ
(mỗi cái 1 bản nhớ). Khi đó chuyển sang **truy vấn Postgres trực tiếp per-request**
(viết lại `store.ts` thành async DB calls) hoặc dùng 1 instance + bộ nhớ là cache.

### D. Chatbot tư vấn khách (giai đoạn sau)
Dùng `/search/availability` làm "bộ não tìm phòng" + Claude function calling. Bot chỉ
tư vấn + tạo lead, KHÔNG tự khóa phòng. Tích hợp Facebook/Zalo qua webhook.

### E. Hoàn thiện vận hành
Quản lý ảnh/tiện ích villa, báo cáo doanh thu/hoa hồng, scoring villa, gợi ý căn thay thế.

---

## 11. Việc dang dở / cảnh báo (PHẢI BIẾT)

- 🔴 **Mật khẩu DB đã lộ** (trong lịch sử chat khi setup): **đổi `Reset database password`** trên
  Supabase + cập nhật `DATABASE_URL` ở Render & `.env`. Có thể còn dòng `DATABASE_URL`
  trùng trên Render — xóa bớt.
- 🔴 **API chưa có auth** — bất kỳ ai có URL đều đọc/ghi được. Làm (A) trước khi đưa dữ liệu
  chủ nhà/khách thật lên.
- 🟡 **LIVE mode chưa test end-to-end** với sheet thật; `sync.ts` ghép villa còn ngây thơ (mục B5).
- 🟡 **Lịch availability** ở DEMO sinh tự động (deterministic theo hash ngày); dữ liệu thật
  chỉ có sau khi LIVE sync ghi vào `availability_calendar`.
- ℹ️ **Render free "ngủ"** sau ~15' không dùng → request đầu chờ ~50s. Nâng gói $7/tháng nếu cần luôn bật.
- ℹ️ **`.env` đã gitignore** — không commit secret. Mọi khóa đặt ở Render/Vercel Environment Variables.

---

## 12. Hướng dẫn cho AI/dev tiếp theo

1. **Trước khi sửa**, đọc mục 7 (quyết định thiết kế) — đừng thay AI-bóc-tách bằng parser cứng,
   đừng bỏ bước `needs_review`, đừng để chatbot tự khóa phòng.
2. **Thêm endpoint mới:** thêm vào `backend/src/routes.ts` + hàm tương ứng trong
   `frontend/src/lib/api.ts` (nhớ nhánh `if (API_URL)` + fallback mock).
3. **Thêm bảng/cột:** sửa `backend/db/schema.sql` + hàm seed/hydrate/persist trong `db.ts`.
4. **Sửa dữ liệu mẫu:** `backend/src/store.ts` (seed) và `frontend/src/lib/api.ts` (mock FE).
5. **Khi build LIVE:** trọng tâm là `services/sheets.ts` (đọc đúng vùng + màu) và
   `services/extractor.ts` (prompt + bảng nghĩa màu). Test bằng `npm run sync:once`.
6. **Commit:** nhánh `master`, push lên `anhtuan161/bookinghub`. Render auto-deploy backend khi push.
7. **Giữ phong cách:** tiếng Việt cho UI/nhãn; nhân viên không rành công nghệ → giao diện đơn giản,
   trạng thái luôn kèm chữ (không chỉ màu), nút to, có toast xác nhận.

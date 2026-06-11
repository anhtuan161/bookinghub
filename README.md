# Booking Hub — Quản trị & bán phòng villa cho agency

Hệ thống tập trung hóa dữ liệu booking villa từ nhiều Google Sheet chủ nhà (mỗi nhà
một định dạng, trạng thái mã hóa bằng **màu nền**), chuẩn hóa về một nguồn sự thật,
phục vụ nhân viên tra phòng nhanh và (giai đoạn sau) chatbot tư vấn khách.

## Cấu trúc

```
frontend/   Webapp nội bộ (React + Vite + Tailwind) — deploy Vercel
backend/    API (Express + TypeScript): đọc Google Sheet kèm màu → Claude bóc tách
            → chuẩn hóa → phục vụ tìm phòng. Có chế độ DEMO (chạy ngay) và LIVE.
docs/       Tài liệu giải pháp (v3), đặc tả FE/BE, phân tích dữ liệu thật.
```

## Chạy nhanh (local, dữ liệu mẫu)

```bash
# Terminal 1 — backend
cd backend && npm install && cp .env.example .env && npm run dev   # http://localhost:8787

# Terminal 2 — frontend
cd frontend && npm install
# tạo .env: VITE_API_URL=http://localhost:8787/api  (bỏ trống nếu muốn chạy mock thuần)
npm run dev                                                        # http://localhost:5173
```

Đăng nhập: nhập tên bất kỳ (auth thật làm ở giai đoạn sau).

## Deploy

- **Frontend → Vercel**: import thư mục `frontend`, đặt env `VITE_API_URL` trỏ tới backend.
- **Backend + Database → Supabase** (Edge Functions + Postgres) hoặc Render. Xem `docs/docs-backend.md`.

## Nguyên tắc cốt lõi

- Đọc **màu nền ô** Google Sheet (`includeGridData=true`) — trạng thái phòng nằm ở màu.
- **AI bóc tách** thay parser cứng; ô không chắc → hàng **Cần kiểm tra** (không đoán bừa).
- **Đồng bộ định kỳ theo lô** (queue-drain), có nút Đồng bộ ngay; không cần real-time.
- Chatbot/nhân viên **không tự khóa phòng** — bước chốt cuối luôn xác nhận với chủ nhà.

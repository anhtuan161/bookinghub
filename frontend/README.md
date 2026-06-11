# Villa Booking Hub — Frontend (bản demo chạy local)

Webapp nội bộ cho nhân viên agency tra phòng villa, duyệt dữ liệu cần kiểm tra, quản lý yêu cầu giữ phòng và nguồn dữ liệu (Google Sheet chủ nhà).

> Bản này chạy bằng **dữ liệu mẫu (mock)** — chưa nối Google Sheet / backend thật. Mục đích: xem giao diện và luồng thao tác.

## Yêu cầu
- **Node.js 18 trở lên** (kiểm tra: `node -v`). Nếu chưa có, tải tại https://nodejs.org

## Chạy local
```bash
cd frontend
npm install
npm run dev
```
Mở trình duyệt tại địa chỉ hiện ra (mặc định **http://localhost:5173**).

Đăng nhập: nhập tên bất kỳ (vd "Lan"), mật khẩu nhập gì cũng được (bản demo).

## Các màn hình
| Trang | Chức năng |
|---|---|
| **Tìm phòng** | Nhập ngày + số khách + khu vực + giá → ra danh sách villa còn trống |
| **Chi tiết villa** | Lịch tháng (màu trạng thái + giá từng ngày) + nút tạo yêu cầu giữ phòng |
| **Cần kiểm tra** | Duyệt các ô hệ thống đọc chưa chắc chắn (Đúng / Sửa 1 chạm) |
| **Yêu cầu giữ phòng** | Bảng Kanban theo trạng thái, đổi trạng thái từng yêu cầu |
| **Nguồn dữ liệu** | Danh sách Google Sheet chủ nhà + nút "Đồng bộ ngay" + thêm chủ nhà |
| **Tổng quan** | Các chỉ số nhanh |

## Quy ước màu trạng thái
- 🟢 Xanh = Còn trống · 🔴 Đỏ = Đã đặt · 🟡 Vàng = Đang giữ · ⚪ Xám = Cần kiểm tra

## Cấu trúc mã nguồn
```
src/
  lib/
    types.ts    Kiểu dữ liệu
    api.ts      ★ Lớp truy cập dữ liệu (đang dùng MOCK). Nối thật chỉ sửa file này.
    utils.ts    Hàm tiện ích (ngày, tiền, màu trạng thái)
    auth.ts     Đăng nhập demo (localStorage)
    toast.ts    Thông báo
  components/   Layout, Modal, Toaster, StatusBadge
  pages/        Login, Search, PropertyDetail, Review, Bookings, Sources, Dashboard
```

## Khi nối dữ liệu thật
Mở `src/lib/api.ts`, thay phần thân các hàm (`searchAvailability`, `getReviewQueue`, `syncNow`, ...) bằng lời gọi Supabase / REST backend theo `../docs/docs-backend.md`. Giao diện không phải sửa.

## Lệnh build (tùy chọn)
```bash
npm run build     # tạo bản tĩnh trong dist/
npm run preview   # chạy thử bản build
```

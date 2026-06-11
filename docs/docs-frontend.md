# Tài Liệu Frontend — Villa Booking Hub (Webapp Nội Bộ)

> Webapp cho nhân viên sale tra phòng, duyệt dữ liệu cần kiểm tra, quản lý yêu cầu giữ phòng và nguồn dữ liệu. Mục tiêu: **đơn giản tối đa cho người không rành công nghệ.**

## 1. Stack & nguyên tắc

- **React + Vite + Tailwind + shadcn/ui** (mặc định của Lovable).
- **Supabase** cho auth + đọc dữ liệu danh sách; **gọi REST backend** cho các thao tác cần logic server (tìm phòng, sync, duyệt review).
- **Lớp truy cập dữ liệu tập trung** ở `src/lib/api.ts` — toàn bộ FE chỉ gọi qua đây. Đổi từ mock sang thật = sửa 1 file.
- Tiếng Việt 100%. Mỗi trạng thái = **màu + chữ** (không chỉ dựa vào màu).

## 2. Quy ước trạng thái & màu

| Trạng thái | Mã | Màu | Chữ hiển thị |
|---|---|---|---|
| Còn trống | `available` | Xanh lá | "Còn trống" |
| Đã đặt | `booked` | Đỏ | "Đã đặt" |
| Đang giữ / khóa | `blocked` | Vàng/Cam | "Đang giữ" |
| Chưa rõ | `unknown` / cần review | Xám + viền vàng | "Cần kiểm tra" |

**Độ mới dữ liệu:** chấm xanh nếu sync < 30 phút; vàng nếu 30'–2h; đỏ + cảnh báo nếu > 2h ("Cần đồng bộ lại trước khi chốt").

## 3. Sơ đồ điều hướng

```
/login                      Đăng nhập
/  (= /search)              Tìm phòng (mặc định)
/property/:id               Chi tiết villa + lịch
/review                     Cần kiểm tra
/bookings                   Yêu cầu giữ phòng (Kanban)
/sources                    Nguồn dữ liệu (sheets)
/dashboard                  Tổng quan
```

Layout: sidebar trái (5 mục) + header (tên NV, Đăng xuất, nút "Đồng bộ ngay").

## 4. Đặc tả từng màn hình

### 4.1. Tìm phòng (`/search`) — trang chính
- **Form tìm:** ngày nhận, ngày trả, số khách, khu vực, khoảng giá. Nút "TÌM PHÒNG".
- **Kết quả:** danh sách card. Card gồm: ảnh, tên, khu vực, sức chứa (chuẩn–tối đa), **giá TB/đêm cho khoảng đã chọn**, nhãn rules, dòng "Cập nhật lúc HH:MM" + chấm độ mới.
- Card có cảnh báo vàng nếu khoảng ngày chứa ngày `needs_review`.
- Nút "Xem chi tiết" + "Tạo yêu cầu giữ phòng".
- Sắp xếp: giá tăng dần (mặc định) / sức chứa.
- Gọi: `searchAvailability(params)`.

### 4.2. Chi tiết villa (`/property/:id`)
- Thông tin: ảnh, tên, khu vực, địa chỉ, sức chứa, tiện ích, rules, ghi chú phụ thu.
- **Lịch tháng:** mỗi ô ngày = giá viết tắt + nền màu trạng thái; tooltip hiện đầy đủ (trạng thái, giá, ghi chú, độ tin cậy, nguồn). Chỉ từ tháng hiện tại; ngày quá khứ làm mờ.
- Dòng nguồn + nút "Đồng bộ căn này".
- Nút "Tạo yêu cầu giữ phòng" → form (tên khách, kênh, liên hệ, ngày, số khách, giá báo, ghi chú).
- Gọi: `getProperty(id)`, `getAvailability(id, month)`, `createBookingRequest(payload)`, `syncNow({propertyId})`.

### 4.3. Cần kiểm tra (`/review`)
- Bảng: villa, ngày, **giá trị gốc** (text + ô minh họa màu nền gốc), **hệ thống đoán** (trạng thái + giá), **độ tin cậy %**.
- 2 nút/dòng: "✓ Đúng" và "Sửa" (popup: 3 nút trạng thái + ô giá + Lưu).
- Bộ đếm "Còn X mục" hiển thị ở sidebar.
- Gọi: `getReviewQueue()`, `resolveReview(id, {status, price, action})`.

### 4.4. Yêu cầu giữ phòng (`/bookings`)
- **Kanban** theo cột: Mới → Đang tư vấn → Chờ khách → Chờ chủ nhà xác nhận → Chờ cọc → Đã cọc → Đã xác nhận (+ Hủy/Mất khách thu gọn).
- Thẻ: khách, villa, ngày, số khách, giá báo, kênh, NV phụ trách. Kéo-thả đổi trạng thái.
- Lọc theo NV / trạng thái.
- Gọi: `getBookingRequests(filter)`, `updateBookingStatus(id, status)`.

### 4.5. Nguồn dữ liệu (`/sources`)
- Bảng sheet: chủ nhà, số villa, trạng thái sync, cập nhật cuối, NV phụ trách, nút "Đồng bộ ngay" + "Mở sheet gốc".
- Nút "Thêm chủ nhà mới" (tên, SĐT, link sheet, % hoa hồng).
- Dòng lỗi tô đỏ + "Xem chi tiết lỗi".
- Gọi: `getSheets()`, `syncNow({sheetId})`, `addOwnerSheet(payload)`.

### 4.6. Tổng quan (`/dashboard`)
- Thẻ số liệu: tổng villa, villa trống hôm nay, yêu cầu đang chờ, mục cần kiểm tra, sheet lỗi.
- Gọi: `getDashboardStats()`.

## 5. Hợp đồng dữ liệu (types)

```ts
// src/lib/types.ts
type Status = 'available' | 'booked' | 'blocked' | 'unknown';
type BookingStatus =
  | 'new' | 'consulting' | 'waiting_customer'
  | 'waiting_owner' | 'waiting_deposit' | 'deposit_received'
  | 'confirmed' | 'cancelled' | 'lost';

interface Property {
  id: string;
  name: string;
  ownerId: string;
  area: string;
  bedrooms: number;
  capacityStandard: number;
  capacityMax: number;
  amenities: string[];
  rules: string[];        // vd "Nhận thú cưng", "Không loa kéo"
  images: string[];
  basePrice: number;
  extraFeeNote: string;
  address: string;
  lastSyncedAt: string;   // ISO
}

interface AvailabilityDay {
  date: string;           // YYYY-MM-DD
  status: Status;
  price: number | null;
  minNights: number;
  note: string;
  confidence: number;     // 0..1
  sourceSheetUrl: string;
  sourceUpdatedAt: string;
}

interface ReviewItem {
  id: string;
  propertyId: string;
  propertyName: string;
  date: string;
  rawValue: string;       // text gốc trong ô
  rawColorHex: string;    // màu nền gốc
  suggestedStatus: Status;
  suggestedPrice: number | null;
  confidence: number;
}

interface BookingRequest {
  id: string;
  propertyId: string;
  propertyName: string;
  customerName: string;
  customerContact: string;
  channel: 'facebook' | 'instagram' | 'zalo' | 'website' | 'other';
  checkin: string;
  checkout: string;
  guests: number;
  quotedPrice: number;
  status: BookingStatus;
  assignee: string;
  note: string;
  createdAt: string;
}

interface Sheet {
  id: string;
  ownerName: string;
  ownerPhone: string;
  url: string;
  propertyCount: number;
  syncStatus: 'ok' | 'error' | 'needs_check';
  lastSyncedAt: string;
  assignee: string;
  commissionRate: number;
  lastError?: string;
}
```

## 6. Lớp API (`src/lib/api.ts`)

Tất cả hàm dưới đây trước mắt trả mock, sau nối thật:

```ts
searchAvailability(params): Promise<{property: Property, avgPrice: number, hasReview: boolean}[]>
getProperty(id): Promise<Property>
getAvailability(propertyId, month): Promise<AvailabilityDay[]>
getReviewQueue(): Promise<ReviewItem[]>
resolveReview(id, {status, price, action}): Promise<void>
getBookingRequests(filter?): Promise<BookingRequest[]>
createBookingRequest(payload): Promise<BookingRequest>
updateBookingStatus(id, status): Promise<void>
getSheets(): Promise<Sheet[]>
addOwnerSheet(payload): Promise<Sheet>
syncNow(target?: {sheetId?: string, propertyId?: string}): Promise<{started: boolean}>
getDashboardStats(): Promise<{...}>
```

**Quy ước nối thật:**
- `searchAvailability`, `syncNow`, `resolveReview` → gọi REST backend (logic server).
- Còn lại có thể đọc/ghi trực tiếp Supabase (nếu RLS cho phép) hoặc qua backend.

## 7. Đăng nhập & phân quyền

- Supabase Auth (email + mật khẩu).
- Bảng `profiles` lưu `role` (`sale` / `manager`). Manager thấy thêm trang Tổng quan + Nguồn dữ liệu; Sale thấy Tìm phòng / Cần kiểm tra / Yêu cầu.
- Bảo vệ route: chưa đăng nhập → đẩy về `/login`.

## 8. Lưu ý UX cho người không rành công nghệ

- Nút hành động chính luôn to, màu nổi, có chữ rõ ("TÌM PHÒNG", "Đồng bộ ngay").
- Mọi thao tác có **toast xác nhận** ("Đã lưu", "Đã cập nhật").
- Tránh bảng quá nhiều cột; ưu tiên card.
- Luôn hiện "Cập nhật lúc..." để nhân viên biết dữ liệu mới hay cũ.
- Không dùng từ kỹ thuật (sync → "đồng bộ", parser/AI → ẩn đi).

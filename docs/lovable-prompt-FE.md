# Prompt cho Lovable — Webapp Nội Bộ Quản Trị Booking Villa

> Cách dùng: copy toàn bộ nội dung trong khối "PROMPT" bên dưới, dán vào Lovable. Sau khi Lovable dựng xong khung, dùng các phần "Prompt bổ sung theo từng trang" để tinh chỉnh từng màn hình.

---

## PROMPT CHÍNH (dán vào Lovable đầu tiên)

```
Xây cho tôi một webapp nội bộ tên "Villa Booking Hub" cho một agency cho thuê villa tại Việt Nam.

NGƯỜI DÙNG: nhân viên sale KHÔNG rành công nghệ. Vì vậy giao diện phải CỰC KỲ đơn giản, ít chữ, nút to dễ bấm, tiếng Việt 100%, không dùng thuật ngữ kỹ thuật.

CÔNG NGHỆ: React + Tailwind + shadcn/ui. Dùng Supabase cho auth và dữ liệu (tôi sẽ nối Supabase sau — bây giờ hãy dùng MOCK DATA và tạo một lớp truy cập dữ liệu riêng ở src/lib/api.ts để sau này tôi chỉ cần thay 1 file là nối API thật).

BỐ CỤC CHUNG:
- Layout có sidebar bên trái cố định + khu nội dung bên phải.
- Sidebar gồm các mục: Tìm phòng, Cần kiểm tra, Yêu cầu giữ phòng, Nguồn dữ liệu, Tổng quan.
- Trên cùng bên phải: tên nhân viên đang đăng nhập + nút Đăng xuất + nút lớn "Đồng bộ ngay".
- Responsive, dùng tốt trên laptop và tablet.

QUY ƯỚC MÀU TRẠNG THÁI (dùng nhất quán toàn app):
- Còn trống = xanh lá.
- Đã đặt = đỏ.
- Đang giữ/khóa = vàng/cam.
- Chưa rõ / cần kiểm tra = xám có viền vàng nhấp nháy nhẹ.
Luôn kèm CHỮ bên cạnh màu (vì nhân viên có thể không phân biệt màu).

CÁC TRANG:

1) ĐĂNG NHẬP: form email + mật khẩu đơn giản (Supabase Auth). Sau đăng nhập vào thẳng trang "Tìm phòng".

2) TÌM PHÒNG (trang chính, mặc định):
- Khu tìm kiếm ở trên: chọn Ngày nhận phòng, Ngày trả phòng (date picker), Số khách (ô số), Khu vực (dropdown), Khoảng giá (slider hoặc 2 ô từ–đến). Nút lớn "TÌM PHÒNG".
- Bên dưới: danh sách kết quả dạng card. Mỗi card: ảnh villa, tên villa, khu vực, sức chứa (tiêu chuẩn–tối đa), giá trung bình/đêm cho khoảng ngày đã chọn, các nhãn rules (vd "Nhận thú cưng", "Không loa kéo"), và một dòng nhỏ "Cập nhật lúc HH:MM" + chấm trạng thái dữ liệu mới/cũ.
- Mỗi card có nút "Xem chi tiết" và nút "Tạo yêu cầu giữ phòng".
- Nếu một villa có ngày nào đó trong khoảng bị "cần kiểm tra", card hiện cảnh báo vàng "Cần kiểm tra lại trước khi chốt".

3) CHI TIẾT VILLA (mở từ card):
- Trên: ảnh + tên + khu vực + địa chỉ + sức chứa + tiện ích + rules + ghi chú phụ thu.
- Một LỊCH THÁNG (calendar) hiển thị trạng thái từng ngày bằng màu + giá ghi trong ô ngày. Có nút chuyển tháng. Chỉ hiển thị từ tháng hiện tại trở đi.
- Dòng "Nguồn: [tên sheet chủ nhà] — cập nhật lúc HH:MM" + nút nhỏ "Đồng bộ căn này".
- Nút lớn "Tạo yêu cầu giữ phòng" mở form: tên khách, kênh liên hệ (Facebook/Instagram/Zalo/Website), số điện thoại/nick, ngày nhận–trả, số khách, giá báo khách, ghi chú. Nút "Lưu yêu cầu".

4) CẦN KIỂM TRA (review queue):
- Bảng các ô dữ liệu mà hệ thống đọc KHÔNG chắc chắn. Mỗi dòng: tên villa, ngày, "giá trị gốc đọc được" (text + ô màu nhỏ minh họa màu nền gốc), "hệ thống đoán" (trạng thái + giá), độ tin cậy (%).
- Mỗi dòng có 2 nút lớn: "✓ Đúng" (xác nhận theo hệ thống đoán) và "Sửa" (mở popup cho nhân viên chọn lại trạng thái: Còn trống / Đã đặt / Đang giữ, và sửa giá).
- Sau khi xử lý, dòng biến mất khỏi danh sách. Có bộ đếm "Còn X mục cần kiểm tra" ở sidebar.

5) YÊU CẦU GIỮ PHÒNG (booking requests):
- Dạng bảng Kanban theo cột trạng thái: Mới → Đang tư vấn → Chờ khách → Chờ chủ nhà xác nhận → Chờ cọc → Đã cọc → Đã xác nhận. (Có thêm cột Hủy / Mất khách ở cuối, thu gọn.)
- Mỗi thẻ: tên khách, tên villa, ngày nhận–trả, số khách, giá báo, kênh, nhân viên phụ trách. Kéo-thả để đổi trạng thái, hoặc bấm thẻ để mở chi tiết và đổi trạng thái bằng dropdown.
- Nút lọc theo nhân viên / theo trạng thái.

6) NGUỒN DỮ LIỆU (sheets):
- Bảng danh sách sheet của chủ nhà. Mỗi dòng: tên chủ nhà, số villa, trạng thái đồng bộ (Thành công / Lỗi / Cần kiểm tra), "Cập nhật lần cuối lúc...", nhân viên phụ trách, nút "Đồng bộ ngay" cho từng dòng và nút "Mở sheet gốc".
- Trên cùng có nút "Thêm chủ nhà mới" (form: tên chủ nhà, số điện thoại, link Google Sheet, % hoa hồng).
- Dòng nào lỗi thì tô đỏ + có nút "Xem chi tiết lỗi".

7) TỔNG QUAN (dashboard):
- Vài thẻ số liệu: Tổng số villa, Số villa còn trống hôm nay, Số yêu cầu giữ phòng đang chờ xử lý, Số mục cần kiểm tra, Số sheet lỗi. Đơn giản, to, dễ đọc.

YÊU CẦU KỸ THUẬT QUAN TRỌNG:
- Tạo file src/lib/api.ts chứa TẤT CẢ hàm lấy/ghi dữ liệu (searchAvailability, getProperty, getReviewQueue, resolveReview, getBookingRequests, createBookingRequest, updateBookingStatus, getSheets, syncNow, addOwnerSheet). Trước mắt các hàm này trả về MOCK DATA hợp lý (ít nhất 8 villa mẫu, dữ liệu lịch 2 tháng tới, vài mục cần kiểm tra, vài yêu cầu giữ phòng). Comment rõ chỗ nào sẽ thay bằng gọi Supabase/API thật.
- Định nghĩa các kiểu dữ liệu (types) cho Property, AvailabilityDay, ReviewItem, BookingRequest, Sheet ở src/lib/types.ts.
- Mọi nhãn, nút, thông báo bằng tiếng Việt.
```

---

## Prompt bổ sung theo từng trang (dùng khi cần tinh chỉnh)

**Tinh chỉnh Tìm phòng:**
```
Ở trang Tìm phòng, thêm: khi chưa nhập gì thì hiện gợi ý "Nhập ngày và số khách để tìm villa phù hợp". Khi không có kết quả, hiện thông báo thân thiện + gợi ý nới lỏng điều kiện. Sắp xếp kết quả theo giá tăng dần, có nút đổi sang sắp theo sức chứa.
```

**Tinh chỉnh lịch Chi tiết Villa:**
```
Lịch tháng: mỗi ô ngày hiện số ngày + giá viết tắt (vd 1.3tr) + nền màu theo trạng thái. Di chuột vào ô hiện tooltip: trạng thái đầy đủ, giá đầy đủ, ghi chú, độ tin cậy, nguồn cập nhật. Ngày quá khứ làm mờ và không bấm được.
```

**Tinh chỉnh Cần kiểm tra:**
```
Popup "Sửa" phải thật đơn giản: 3 nút lớn chọn trạng thái (Còn trống / Đã đặt / Đang giữ) + 1 ô nhập giá + nút Lưu. Sau khi lưu hiện toast "Đã cập nhật".
```

---

## Ghi chú khi nối dữ liệu thật (cho lập trình viên, sau khi Lovable build xong)

- Chỉ cần thay phần thân các hàm trong `src/lib/api.ts` bằng lời gọi Supabase client hoặc gọi REST tới backend (xem `docs-backend.md`).
- Bật Supabase Auth cho trang Đăng nhập.
- `syncNow()` và `searchAvailability()` gọi tới endpoint backend (không đọc trực tiếp từ Supabase) vì cần logic server.
- Các hàm đọc danh sách (properties, review queue, booking requests, sheets) có thể đọc trực tiếp Supabase hoặc qua API — xem hợp đồng dữ liệu trong `docs-frontend.md`.

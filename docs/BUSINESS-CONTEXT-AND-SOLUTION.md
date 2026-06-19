# VillaOS - Bối cảnh kinh doanh, vấn đề và giải pháp đề xuất

Ngày cập nhật: 2026-06-19

Tài liệu này dùng để đánh giá hướng đi hiện tại của VillaOS có phù hợp với bài toán quản trị booking villa hay không. Nội dung viết theo góc nhìn business trước, kỹ thuật sau.

## 1. Bối cảnh kinh doanh

Agency đang bán phòng/villa tại Việt Nam thông qua nhiều kênh như Facebook, Instagram, website, Zalo hoặc tư vấn trực tiếp.

Nguồn hàng đến từ nhiều chủ nhà. Mỗi chủ nhà thường quản lý lịch phòng bằng Google Sheet riêng và chia sẻ sheet đó cho nhiều agency cùng bán. Agency không sở hữu hoàn toàn nguồn dữ liệu gốc, mà chỉ được quyền xem và khai thác dữ liệu để tư vấn khách.

Đặc điểm vận hành hiện tại:

- Khoảng 50 chủ nhà, tương lai có thể tăng tiếp.
- Mỗi chủ nhà có một hoặc nhiều Google Sheet.
- Mỗi file Google Sheet có thể có nhiều tab theo tháng.
- Mỗi chủ nhà tự thiết kế format sheet, không thống nhất.
- Màu ô thường thể hiện trạng thái đã book, giữ phòng, hoặc ghi chú đặc biệt.
- Ô không màu thường được hiểu là còn trống.
- Sheet có thể thay đổi liên tục vì nhiều agency khác cũng bán cùng nguồn phòng.
- Nhân viên phải kiểm tra thủ công từng sheet khi khách hỏi.

## 2. Vấn đề cốt lõi

Bài toán không chỉ là "đọc Google Sheet". Vấn đề thật là agency đang thiếu một trung tâm dữ liệu đáng tin cậy để ra quyết định booking nhanh.

Các nỗi đau chính:

1. Dữ liệu phân mảnh

Mỗi chủ nhà gửi một file riêng. Nhân viên phải nhớ file nào của ai, tab tháng nào, căn nào nằm ở cột nào. Khi số lượng chủ nhà tăng lên, thao tác thủ công sẽ rất dễ sai.

2. Format không đồng nhất

Sheet s1 có thể dùng ngày dạng `19/07`. Sheet s2 lại dùng cột `Thứ` và cột `Ngày` là số `19`, tháng/năm nằm trong tên tab. Sheet s3/s4/s5 có thể tiếp tục khác nữa.

3. Dữ liệu thay đổi thường xuyên

Vì chủ nhà và agency khác cùng cập nhật, dữ liệu agency nhìn thấy có thể lỗi thời nếu không được đồng bộ định kỳ hoặc có nút cập nhật chủ động.

4. Tư vấn khách bị chậm

Khi khách hỏi "ngày này còn căn nào cho 12 người không?", nhân viên phải mở nhiều sheet, lọc bằng mắt, đối chiếu sức chứa, giá, ghi chú, phụ thu. Đây là điểm nghẽn tăng trưởng.

5. Khó xây chatbot nếu chưa có dữ liệu chuẩn

AI chatbot không nên đọc trực tiếp Google Sheet hỗn loạn. Chatbot cần một database đã chuẩn hóa: căn, sức chứa, giá, lịch trống, ghi chú, luật nhà, link map, trạng thái kiểm tra.

6. Rủi ro sai booking

Nếu hệ thống đoán sai format sheet hoặc nhầm màu, có thể tư vấn nhầm phòng đã book là còn trống. Đây là rủi ro business lớn nhất.

## 3. Mục tiêu sản phẩm

Mục tiêu của VillaOS là biến nhiều Google Sheet rời rạc thành một nền tảng dữ liệu booking tập trung.

Luồng mục tiêu:

```text
Google Sheet chủ nhà
-> n8n đọc dữ liệu và màu ô
-> chuẩn hóa vào PostgreSQL/Supabase
-> UI dashboard/search đọc từ DB
-> nhân viên tư vấn nhanh
-> chatbot AI tư vấn dựa trên DB
-> nếu khách chốt, tạo yêu cầu để nhân viên xử lý thanh toán/khóa phòng
```

Database là trung tâm. Google Sheet là nguồn đầu vào. UI, dashboard, chatbot và báo cáo đều đọc từ database, không đọc trực tiếp từ Google Sheet.

## 4. Nguyên tắc thiết kế giải pháp

1. Không làm hỏng dữ liệu đúng đang có

Nếu thêm sheet mới hoặc parser mới, không được ảnh hưởng sheet cũ như s1.

2. Không đoán quá nhiều

Nếu sheet chưa rõ format, hệ thống phải đưa vào trạng thái cần setup, không cố sync sai vào database.

3. Người vận hành không phải sửa SQL

Nhân viên non-tech cần chọn được "mẫu sheet" trên UI thay vì chỉnh `parser_type` trong database.

4. Một workflow n8n, nhiều mẫu parser

Không nên tạo 20 workflow cho 20 sheet. Nên dùng một workflow chính, mỗi sheet chọn một mẫu đọc dữ liệu.

5. Có vòng kiểm tra trước khi scale

Sheet mới phải được test riêng bằng `only_sheet_ids`, so sánh số căn/lịch/giá trước khi đưa vào lịch chạy định kỳ.

6. Chatbot không tự khóa phòng

Chatbot có thể tư vấn và tạo booking request, nhưng bước thanh toán và khóa phòng nên để nhân viên xác nhận.

## 5. Giải pháp hiện tại đang làm

### 5.1 Database trung tâm

Supabase Postgres giữ dữ liệu chuẩn:

- `sheets`: nguồn Google Sheet của từng chủ nhà.
- `properties`: danh sách căn/villa đã chuẩn hóa.
- `availability_calendar`: lịch theo từng căn/ngày.
- `review_queue`: dữ liệu chưa chắc chắn cần người kiểm tra.
- `booking_requests`: yêu cầu booking từ khách.

Ý nghĩa business: DB trở thành tài sản dữ liệu chính của agency. Sau này dashboard, chatbot, báo cáo doanh thu, kiểm tra tồn phòng đều dựa vào DB.

### 5.2 n8n làm tầng đồng bộ

n8n đọc Google Sheet qua Google Sheets API, bao gồm:

- giá trị ô;
- màu nền ô;
- tên tab;
- tab thông tin căn nếu có;
- lịch theo tháng.

n8n sau đó chuẩn hóa dữ liệu vào DB.

Lý do dùng n8n:

- Dễ chỉnh flow vận hành.
- Có thể chạy manual hoặc schedule.
- Phù hợp giai đoạn đầu khi format sheet còn biến động.
- Giảm rủi ro phải deploy backend mỗi lần chỉnh nhỏ luồng sync.

### 5.3 UI quản trị nguồn dữ liệu

Trang `Nguồn dữ liệu` đang được bổ sung để người vận hành:

- xem danh sách Google Sheet;
- mở sheet gốc;
- chọn mẫu sheet;
- gọi n8n manual sync;
- refresh dữ liệu từ DB;
- theo dõi trạng thái sync.

Điểm quan trọng: người vận hành không cần nhớ mã kỹ thuật như `column_villas_month_tabs`. UI hiển thị bằng ngôn ngữ dễ hiểu.

### 5.4 Mẫu sheet thay cho parser kỹ thuật

Thay vì để người dùng nhớ s1/s2/s3 dùng parser gì, hệ thống dùng khái niệm "Mẫu sheet".

Hiện có:

| Tên vận hành | Ý nghĩa | Mã kỹ thuật |
| --- | --- | --- |
| Mẫu A - ngày 01/07 | Sheet có ngày dạng `01/07`, `19/07`; tên căn nằm theo cột | `column_villas_month_tabs` |
| Mẫu B - cột Thứ/Ngày | Sheet có cột `Thứ`, cột `Ngày` là số `1..31`; tháng/năm lấy từ tên tab | `weekday_day_columns_month_tabs` |
| Chưa biết - cần setup | Sheet mới chưa chắc format | `needs_manual_mapping` |

Với cách này, khi có s3/s4/s5:

- Nếu giống s1: chọn Mẫu A.
- Nếu giống s2: chọn Mẫu B.
- Nếu chưa rõ: chọn Chưa biết, không sync vội.
- Nếu format mới xuất hiện nhiều lần: tạo Mẫu C có tên dễ hiểu.

### 5.5 Quy tắc màu

Quy tắc hiện tại:

- Ô có màu: mặc định coi là `booked`, trừ khi có mapping đặc biệt.
- Ô không màu và có giá: `available`.
- Ô không màu và trống: `available` với confidence cao hơn trước.
- Từ khóa như bảo trì, giữ chỗ, nghỉ: `blocked`.
- Dữ liệu không rõ: đưa vào `review_queue`.

Đây là hướng bảo thủ hơn: ưu tiên không bán nhầm phòng đã có màu.

## 6. Vì sao không nên để parser ngày càng phình ra

Nếu cứ mỗi sheet mới lại thêm vài dòng logic vào một parser chung, sau 20 sheet hệ thống sẽ rất khó bảo trì:

- sửa cho s3 có thể làm hỏng s1;
- khó biết logic nào dành cho sheet nào;
- nhân viên không biết sheet đang dùng luật nào;
- test trở nên rối;
- chatbot có thể dùng dữ liệu sai mà không ai phát hiện.

Vì vậy hướng đúng hơn là:

```text
Một workflow n8n
-> nhiều mẫu sheet rõ tên
-> mỗi sheet chọn một mẫu
-> sheet lạ thì dừng ở "Chưa biết"
-> chỉ thêm mẫu mới khi format lặp lại hoặc đủ quan trọng
```

## 7. Quy trình thêm 20 sheet sau này

Quy trình đề xuất cho người vận hành:

1. Nhận Google Sheet từ chủ nhà.
2. Chia sẻ sheet cho Google Service Account.
3. Thêm sheet trên UI `Nguồn dữ liệu`.
4. Chọn khu vực, ví dụ Đà Lạt, Nha Trang, Phan Thiết, HCM.
5. Chọn `Mẫu sheet`.
6. Nếu không chắc, chọn `Chưa biết - cần setup`.
7. Chạy n8n manual chỉ cho sheet đó.
8. Kiểm tra:
   - số căn có đúng không;
   - tên căn có đúng không;
   - ngày đã tô màu có ra booked không;
   - ngày không màu có ra available không;
   - giá có đúng không;
   - ghi chú/cảnh báo có vào đúng không.
9. Nếu đúng, bật sheet vào batch chạy định kỳ.
10. Nếu sai, không sửa DB trực tiếp; chỉnh mẫu/parser rồi chạy lại.

## 8. Rủi ro hiện tại

1. Chất lượng Google Sheet không ổn định

Chủ nhà có thể đổi format, thêm cột, gộp ô, đổi tên tab. Đây là rủi ro thường xuyên.

2. Màu có thể mang nhiều nghĩa khác nhau

Một số chủ nhà có thể dùng màu đỏ là booked, màu vàng là giữ chỗ, màu xanh là trống. Cần `color_mapping` theo từng sheet nếu phát sinh.

3. Sheet có nhiều block lịch trong cùng một tab

Ví dụ s2 có block chính và block Penthouse riêng. Parser cần hỗ trợ tốt hơn nếu muốn đọc toàn bộ block phụ.

4. Dữ liệu thông tin căn có thể lệch với lịch tháng

Tab `Thông tin căn` có thể thiếu hoặc khác tên so với tab lịch. Hướng hiện tại là lấy tên căn từ lịch tháng làm chính, tab thông tin chỉ bổ sung nếu match được tên.

5. Review queue có thể nhiều

Nếu confidence threshold quá cao hoặc parser chưa đủ luật, nhiều dòng sẽ vào `Cần kiểm tra`. Cần theo dõi tỷ lệ review sau mỗi lần sync.

6. Sync sai nguy hiểm hơn sync thiếu

Nếu chưa chắc, nên không sync hoặc đưa vào review. Sync thiếu có thể sửa sau; sync sai có thể làm nhân viên tư vấn nhầm.

## 9. Tiêu chí đánh giá giải pháp có phù hợp không

Giải pháp này phù hợp nếu:

- Agency muốn DB là trung tâm lâu dài.
- Có kế hoạch xây chatbot, dashboard, báo cáo.
- Chấp nhận giai đoạn đầu cần onboarding từng mẫu sheet.
- Ưu tiên dữ liệu đúng hơn sync thật nhanh.
- Muốn người vận hành non-tech có thể thêm sheet qua UI.
- Không muốn tạo một workflow n8n riêng cho từng chủ nhà.

Giải pháp này chưa phù hợp nếu:

- Chỉ cần quản lý 2-3 sheet và không scale.
- Muốn real-time tuyệt đối từng giây.
- Không muốn kiểm tra/onboard sheet mới.
- Chủ nhà không cho đọc bằng Google Service Account.
- Agency muốn AI tự chốt/khóa phòng hoàn toàn không qua nhân viên.

## 10. Hướng phát triển tiếp theo

Phase gần nhất nên tập trung vào độ tin cậy sync:

1. Hoàn thiện UI quản lý sheet

Cho phép đổi mẫu sheet, active/inactive, khu vực, người phụ trách, chạy sync riêng từng sheet.

2. Hoàn thiện n8n profile parser

Tách rõ logic Mẫu A, Mẫu B, sau đó thêm Mẫu C khi có format mới thật sự.

3. Thêm màn hình kiểm thử sheet mới

Sau khi sync, UI hiển thị:

- số căn đọc được;
- số ngày đọc được;
- số dòng cần kiểm tra;
- vài ngày mẫu để so sánh với Google Sheet.

4. Chuẩn hóa quy trình clear/re-sync an toàn

Người vận hành không xóa DB thủ công. Nên có nút hoặc flow chỉ xóa dữ liệu của một sheet rồi sync lại.

5. Chuẩn bị chatbot

Chatbot chỉ đọc từ API/DB đã chuẩn hóa, không đọc Google Sheet trực tiếp.

## 11. Kết luận

Vấn đề chính của agency là phân mảnh dữ liệu và rủi ro sai lịch khi scale nhiều chủ nhà. Giải pháp đang làm đi theo hướng đúng nếu mục tiêu là xây nền tảng dữ liệu booking dài hạn.

Điểm cần giữ chặt là không biến parser thành một khối đoán mọi thứ. Mỗi format phổ biến nên trở thành một "Mẫu sheet" dễ hiểu cho người vận hành. Sheet chưa rõ thì dừng lại để setup, không sync bừa.

Nếu làm đúng hướng này, VillaOS có thể scale từ vài sheet lên khoảng 20-50 sheet mà vẫn giữ được kiểm soát dữ liệu, đồng thời tạo nền cho dashboard và chatbot tư vấn sau này.

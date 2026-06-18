# VillaOS n8n Google Sheets Sync

File import:

```text
villaos-google-sheets-sync.json
```

Workflow này dùng n8n để đồng bộ lịch booking từ Google Sheet chủ nhà vào PostgreSQL/Supabase. DB vẫn là trung tâm dữ liệu, website/backend/chatbot chỉ đọc DB hoặc đọc qua API backend.

## 1. Cần Chuẩn Bị

### Postgres Credential

Trong n8n tạo credential:

```text
Postgres
```

Trỏ tới database trung tâm đang dùng cho VillaOS.

Nếu dùng Supabase trên Render/n8n server ngoài Supabase, nên dùng connection string dạng pooler.

#### Lấy DATABASE_URL / Postgres Credential Ở Đâu

Nếu dùng Supabase:

```text
Supabase Dashboard
-> chọn project
-> Connect
-> Connection string
-> chọn Pooler
```

Khuyến nghị:

```text
Session pooler
```

Sau đó copy các thông tin sang n8n credential `Postgres`:

```text
Host: host pooler của Supabase
Database: postgres
User: postgres.<project-ref>
Password: mật khẩu database
Port: thường là 5432 với session pooler
SSL: bật/require
```

Nếu dùng Render Postgres:

```text
Render Dashboard
-> PostgreSQL
-> Info
-> External Database URL hoặc Internal Database URL
```

Nếu n8n và database cùng nằm trong Render private network thì dùng Internal Database URL. Nếu n8n chạy ngoài Render thì dùng External Database URL.

### Google Sheets Service Account Credential

Trong n8n t?o credential:

```text
Google Service Account
```

?i?n t? file JSON service account:

```text
Service Account Email / Client Email: bookinghub@website1-474603.iam.gserviceaccount.com
Private Key: to?n b? private_key, g?m c? -----BEGIN PRIVATE KEY----- v? -----END PRIVATE KEY-----
```

V? workflow g?i Google Sheets API qua node `HTTP Request`, trong credential n?u n8n c? tu? ch?n sau th? ph?i b?t:

```text
Set up for use in HTTP Request node: ON
```

Scopes c?n khai b?o:

```text
https://www.googleapis.com/auth/spreadsheets.readonly
```

N?u mu?n d?ng chung cho Drive/Sheets sau n?y, c? th? th?m:

```text
https://www.googleapis.com/auth/drive.readonly
```

Kh?ng c?n Client ID / Client Secret. Kh?ng c?n Authorized redirect URIs. ?? l? c? ch? OAuth2 user, kh?ng ph?i Service Account.

C?c ch? nh? ph?i share Google Sheet quy?n Viewer cho email service account:

```text
bookinghub@website1-474603.iam.gserviceaccount.com
```

Workflow d?ng HTTP Request g?i Google Sheets API v?i:

```text
includeGridData=true
```

L? do: tr?ng th?i ph?ng trong sheet c?a b?n ph? thu?c nhi?u v?o m?u n?n ?, kh?ng ch? text.

## 2. Import Workflow

Trong n8n:

```text
Workflows
-> Import from File
-> chọn villaos-google-sheets-sync.json
```

Sau khi import, mở các node sau và gắn credential thật:

```text
Load Active Sheets From DB
Upsert Properties
Upsert Availability
Upsert Review Queue
Update Sheet Sync Status
```

Gắn credential Postgres.

Node:

```text
Read Sheet With Cell Colors
```

GắG?n credential Google Service Account.

## 3. Dữ Liệu Đầu Vào Từ Bảng sheets

Workflow đọc danh sách sheet từ bảng `sheets`.

Query hiện tại:

```sql
select id, owner_id, url, spreadsheet_id, title, color_mapping, last_synced_at
from sheets
where coalesce(sync_status, 'ok') <> 'disabled'
order by last_synced_at asc nulls first
limit 10;
```

Mỗi dòng trong `sheets` nên có:

```text
id
owner_id
url
spreadsheet_id
title
color_mapping
sync_status
last_synced_at
```

Ví dụ `color_mapping`:

```json
{
  "#ff0000": "booked",
  "#ffff00": "booked"
}
```

Quy tắc riêng của dự án:

```text
Ô có màu nền -> mặc định là đã book
Ô không màu -> mới được xem là còn trống
```

Vì vậy không nên map màu xanh thành `available` nếu sheet của chủ nhà dùng màu để đánh dấu booking. Trường hợp có màu đặc biệt nghĩa là bảo trì/tạm giữ, có thể map màu đó thành `blocked`; còn mặc định mọi màu đều được xem là `booked`.

## 4. Dữ Liệu Được Ghi Vào DB

Workflow ghi vào:

```text
owners
properties
availability_calendar
review_queue
sync_logs
sheets
```

### properties

Workflow cố đọc thông tin từng căn từ phần header phía trên lịch:

```text
tên căn / tên cột
sức chứa
giá nền
phụ thu
quy định riêng
ghi chú riêng
```

Các dữ liệu này được chuẩn hóa vào `properties`.

### availability_calendar

Ghi lịch từng ngày:

```text
property_id
date
status
price
min_nights
note
source_sheet_id
confidence
```

### review_queue

Nếu ô không chắc chắn, ví dụ thiếu giá, text lạ, màu chưa map, hoặc confidence thấp, workflow không ghi thẳng vào lịch chính mà đưa vào `review_queue`.

## 5. Cách Chạy

Có 2 trigger:

```text
Manual Sync
Schedule Every 15 Minutes
```

Nên chạy thử `Manual Sync` trước với 1-2 sheet, kiểm tra dữ liệu trong DB, sau đó mới bật schedule.

## 6. Lưu Ý Quan Trọng

Workflow này là bản sync rule-based đầu tiên. Nó phù hợp để chạy 10 sheet ban đầu và tạo nền dữ liệu trung tâm.

## 7. Thêm Google Sheet Chủ Nhà Mới

Mỗi dòng trong bảng `sheets` nên có cấu hình parser:

```text
parser_type
parser_config
```

Parser n8n hiện hỗ trợ:

```text
column_villas_month_tabs
```

Format kỳ vọng:

```text
Tab tháng chứa lịch
Ngày nằm theo hàng
Villa/căn nằm theo cột
Tab tháng có row "Tên căn" làm nguồn chính cho tên property
Ô có màu nền = booked
Ô không màu = available candidate
Tab Thông tin nếu có thì chứa tên căn / mô tả / địa chỉ / map / lưu ý
```

Quy tắc hiện tại:

```text
Tên căn trong tab tháng là nguồn chính.
Tab Thông tin căn chỉ bổ sung ghi chú, mô tả, địa chỉ, Google Map nếu tên match.
Không tạo property chỉ vì nó xuất hiện trong tab Thông tin căn.
```

Nếu sheet mới khác format, đặt:

```text
parser_type = needs_manual_mapping
sync_status = needs_check
```

n8n sẽ không cố parse sheet đó, mà ghi sync summary `needs_check` để tránh tạo sai villa hoặc duplicate.

SQL hỗ trợ:

```text
n8n/sql-parser-config.sql
```

Với các sheet quá khác format, nên làm thêm một trong hai hướng:

```text
1. Thêm parser_type/parser_config theo từng sheet.
2. Gọi AI extractor khi rule-based parser không chắc.
```

Nguyên tắc vẫn giữ nguyên:

```text
Không chắc -> review_queue
Chắc chắn -> availability_calendar
DB là nguồn sự thật
Chatbot chỉ đọc API/DB, không đọc Google Sheet trực tiếp
```

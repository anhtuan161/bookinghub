# VillaOS — Đánh giá giải pháp & hướng sửa (Claude)

Ngày: 2026-06-19
Người soát: Claude (Opus 4.8)
Phạm vi: đọc toàn bộ `docs/BUSINESS-CONTEXT-AND-SOLUTION.md`, `n8n/SHEET-PROFILES.md`, workflow `n8n/villaos-google-sheets-sync.json`, và code thực tế `backend/src/{db,routes,store,types}.ts`, `frontend/src/{lib/api,lib/sheetProfiles,pages/Sources}`.

Tài liệu này bổ sung cho `BUSINESS-CONTEXT-AND-SOLUTION.md`: phần đó mô tả *giải pháp đang làm*; phần này đánh giá *giải pháp có ổn không* và *cần sửa gì để scale tới 20–50 sheet*.

---

## 1. Kết luận

**Hướng đi đúng.** Kiến trúc "DB là trung tâm — n8n là tầng sync — mỗi sheet chọn 1 Mẫu — sheet lạ thì dừng ở `needs_manual_mapping`" là cách làm chuẩn cho bài toán nhiều chủ nhà, format loạn. Triết lý "sync sai nguy hiểm hơn sync thiếu" và logic an toàn s1/s2 đã được implement đúng như tài liệu mô tả.

Tuy nhiên có **một lỗ hổng kiến trúc nghiêm trọng** (dữ liệu lệch giữa RAM và DB) và vài rủi ro phải xử lý **trước khi** lên 20 sheet. Phần parser bạn vừa sửa (an toàn s1/s2, Mẫu trên UI, PATCH lưu DB, skip `needs_manual_mapping`) không có vấn đề — rủi ro nằm ở tầng sync/đọc, không phải ở parser.

---

## 2. Điểm tốt cần giữ

- DB (Supabase Postgres) là nguồn sự thật; UI/chatbot đọc từ DB, không đọc thẳng Google Sheet.
- Một workflow n8n, nhiều Mẫu — không tạo 20 workflow cho 20 chủ nhà.
- Khái niệm "Mẫu sheet" cho người non-tech, không bắt nhớ `parser_type` kỹ thuật.
- `needs_manual_mapping` chặn sync sheet chưa rõ format → tránh đẩy rác vào DB.
- Quy tắc màu bảo thủ: ô có màu mặc định `booked`, chỉ ô không màu mới `available`.
- Logic Mẫu B chỉ đọc ngày dạng số `1..31` khi có `T2..T7/CN` liền kề → không nhận bừa số đơn như Mẫu A. (Đã verify đúng trong code: `findDateInRow` + `isWeekdayMarker`.)

---

## 3. Rủi ro xếp theo mức độ

### 🔴 R1 — Backend đọc RAM, n8n ghi thẳng Postgres → dữ liệu lệch (nghiêm trọng nhất)

Mâu thuẫn trực tiếp với mục tiêu "chatbot đọc từ API/DB chuẩn".

- `getDay()` đọc từ `Map overrides` trong RAM (`backend/src/store.ts`).
- n8n ghi thẳng vào `availability_calendar` trong Postgres, **không qua backend**.
- Backend chỉ nạp RAM khi `init()` lúc khởi động, hoặc khi gọi `POST /data/reload` thủ công (`backend/src/db.ts`). **Không có auto re-hydrate sau mỗi lần n8n sync.**

Hệ quả: n8n đánh dấu villa đã booked, nhưng `/search/availability` và `/properties/:id/availability` vẫn trả "available" (RAM cũ) tới khi có người bấm refresh → **chatbot/nhân viên tư vấn phòng đã book là còn trống** (đúng rủi ro #6 tài liệu muốn tránh nhất).

**Hướng sửa (chọn 1):**
1. Endpoint search/availability đọc thẳng Postgres (đúng nhất cho "DB là trung tâm"); hoặc
2. Re-hydrate định kỳ (vd 60–120s) ngoài lúc init; hoặc
3. n8n gọi `POST /data/reload` ở node cuối sau khi ghi xong.

> Khuyến nghị: (1) cho đường availability/search vì đó là dữ liệu thay đổi nhiều nhất và ảnh hưởng trực tiếp tới tư vấn khách.

### 🔴 R2 — SQL injection / vỡ query trong node n8n Postgres

Các node Postgres dựng SQL bằng nội suy chuỗi `{{$json.x}}`. Phần lớn field có qua hàm `sql()` (escape `'`) nhưng **vài field thì không**:

- Node *Upsert Properties*, phần `owner_upsert`: dùng `'{{$json.owner_name}}'` **thô** (không phải `owner_name_sql`). `owner_name` = tiêu đề sheet do người vận hành nhập. Một dấu `'` (vd `Mẹ Bắp's Homestay`) là **vỡ query / inject được**.
- Tên villa, ghi chú lấy từ cell sheet — nội dung do chủ nhà kiểm soát, chảy vào SQL qua template.

Escape kiểu nhân đôi dấu nháy chỉ là vá tạm.

**Hướng sửa:** chuyển sang **query tham số hóa** (`$1, $2…`) của node Postgres thay vì template literal. Làm trước khi onboard sheet từ nguồn ngoài.

### 🟠 R3 — Chỉ upsert, không reconcile → dữ liệu rác tồn đọng

Sync chỉ `INSERT … ON CONFLICT UPDATE`, không bao giờ xóa.

- **Đổi tên villa**: `property_id = sheetId + slug(name)`. Chủ nhà đổi tên → tạo property mới, property cũ + toàn bộ lịch tồn vĩnh viễn, search vẫn trả về.
- **Xóa/đổi cấu trúc 1 ngày**: row cũ trong `availability_calendar` thành stale, không ai dọn.

**Hướng sửa:** đánh dấu row không thấy trong lần sync này là stale, hoặc xóa theo `(sheet_id, khoảng ngày)` trước khi ghi lại (delete-then-insert trong cùng transaction theo từng sheet).

### 🟠 R4 — "Có màu = booked" + chưa có UI sửa `color_mapping`

Mặc định mọi ô có màu → booked. An toàn theo hướng đã chọn, nhưng với chủ nhà dùng *xanh = trống / vàng = giữ tạm*, sheet mới bị đánh booked gần hết → **bán hụt**. Backend đã hỗ trợ `color_mapping` per-sheet (PATCH `/sheets/:id`) nhưng **UI Sources chỉ cho đổi Mẫu, chưa cho sửa `color_mapping`** → cơ chế ngoại lệ màu có mà người vận hành không chạm tới được.

**Hướng sửa:** thêm ô chỉnh `color_mapping` trên UI Nguồn dữ liệu (hex → trạng thái).

### 🟡 R5 — Thiếu màn hình preview/test khi onboard (chính là mục 10.3 tài liệu)

Quy trình onboard nói "chạy n8n manual rồi kiểm tra số villa/ngày/giá" nhưng UI **không hiển thị gì để đối chiếu**. Ở 20 sheet, ngồi nhìn mắt là không khả thi và dễ bỏ sót lỗi.

**Hướng sửa:** màn hình preview: sync thử 1 sheet → hiện "đọc được N căn, M ngày, K dòng cần kiểm tra, đây là vài ngày mẫu" để so với Google Sheet.

### 🟡 R6 — Một hàm parser khổng lồ phân nhánh `if`

Mẫu A và B đi qua **cùng một hàm** `Normalize Villas And Calendar` với nhánh `if (usesWeekdayDayColumns)`. OK cho 2 format; khi có Mẫu C/D sẽ phình đúng như rủi ro mục 6 tài liệu cảnh báo.

**Hướng sửa:** xem mục 4 (config-driven). Tách engine parser khỏi định nghĩa format.

---

## 4. Scale tới 20 sheet: "20 sheet ≠ 20 parser"

### 4.1 Thực tế: 20 chủ nhà ≈ 4–6 format

Chủ nhà copy/bắt chước nhau; sheet booking villa thường rơi vào vài nhóm:

- Lịch lưới: ngày theo dòng, villa theo cột (= **Mẫu A**).
- Cột Thứ + cột Ngày số, tháng theo tab (= **Mẫu B**).
- Mỗi tab là 1 villa.
- Mỗi tháng là 1 block xếp dọc, nhiều villa chồng nhau.
- Kiểu merge ô / pivot.

→ 20 sheet thường gom về **~5 Mẫu**. **Việc đầu tiên: survey cả 20 sheet, chụp màn hình, phân nhóm** trước khi viết thêm code. Không build parser kiểu gặp đâu vá đó.

### 4.2 Đòn bẩy quyết định: parser theo **config**, không theo **code**

Hiện "Mẫu A vs B" là nhánh `if` cứng trong JS. Nếu giữ vậy, mỗi format mới = sửa code n8n + redeploy + nguy cơ làm hỏng sheet cũ.

Nhưng schema **đã có cột `parser_config jsonb`** và code đã đọc vài key (`date_mode`, `empty_uncolored_confidence`...). Hãy đẩy mạnh: biến "Mẫu" thành **bộ tham số**, không phải khối code:

```jsonc
parser_config = {
  "date_mode": "day_from_tab",        // hoặc "full_date"
  "name_row_hint": "Tên căn",          // dòng chứa tên villa
  "date_columns": [0, 1],              // cột chứa ngày/thứ
  "color_meaning": { "red": "booked", "green": "available", "yellow": "blocked" },
  "first_data_col": 2
}
```

Khi đó:
- **Mẫu A/B/C** chỉ là *preset* của config (dễ cho người vận hành).
- Sheet thứ 15 hơi khác Mẫu A → **chỉnh config trên UI**, không đụng n8n, không redeploy.
- Một engine parser duy nhất đọc config — không phình theo số sheet.

Đây là khác biệt giữa "scale tới 5 sheet" và "scale tới 50 sheet".

### 4.3 Ở 20 sheet, thứ tốn tiền KHÔNG phải parser — mà là:

**a) Công verify mỗi lần onboard** → bắt buộc có màn hình preview (R5).

**b) Chủ nhà đổi format sau khi đã chạy ổn.** Với 20 sheet, tuần nào cũng sẽ có 1–2 sheet bị sửa (thêm cột, đổi tên tab, gộp ô). → Cần **bộ phát hiện gãy**: sheet trước OK 4 căn, lần này ra 0 căn hoặc review vọt lên 80% → tự chuyển `needs_check` + cảnh báo, **không ghi đè dữ liệu tốt bằng rác**. Workflow hiện chưa có.

### 4.4 Giới hạn kỹ thuật ở mức 20 (biết để phòng)

- **Google API quota**: 20 sheet × `includeGridData=true` mỗi 15 phút là payload nặng. `batch_size=10` + `order by last_synced_at asc` đã chia tải — giữ nguyên, đừng sync hết 20 cùng lúc; sheet lớn giãn chu kỳ.
- **R1 (staleness)** và **R3 (rác)** đều nhân lên theo số sheet → phải fix trước khi lên 20.

---

## 5. Lộ trình đề xuất (3 → 20 sheet)

| Bước | Việc | Lý do |
| --- | --- | --- |
| 0 | Survey 20 sheet, phân nhóm format | Biết thực sự cần mấy Mẫu |
| 1 | **Fix R1 — staleness RAM↔DB** | Nền tảng; không có thì search/chatbot không đáng tin |
| 2 | **Parser config-driven (R6)** | Biến Mẫu thành preset của `parser_config` |
| 3 | **Màn hình preview onboard (R5)** + **phát hiện gãy (4.3b)** | Verify 20 sheet không kiệt sức, không ghi đè rác |
| 4 | **Reconcile dữ liệu stale (R3)** | Dọn property/lịch ma |
| 5 | **Tham số hóa SQL trong n8n (R2)** | Trước khi mở cho nguồn ngoài |
| 6 | UI sửa `color_mapping` (R4) | Xử lý chủ nhà dùng màu khác chuẩn |

Thứ tự ưu tiên gọn: **R1 → config-driven → preview/phát hiện gãy**.

---

## 6. Kết luận

Kiến trúc **chịu được 20–50 sheet**, với điều kiện:

1. Gom format thành ~5 Mẫu **config-driven** thay vì code-driven (đừng mỗi sheet lạ lại thêm `if`).
2. Đầu tư vào **preview onboard + phát hiện gãy** thay vì viết thêm parser.
3. Fix **staleness RAM↔DB** để DB thật sự là nguồn sự thật cho UI/chatbot.

Nếu giữ kiểu vá `if` cho từng sheet và để backend đọc RAM lệch DB, thì tới ~10 sheet hệ thống sẽ bắt đầu sai lịch và khó bảo trì. Làm đúng 3 điều trên thì hướng hiện tại đủ vững để lên nền chatbot sau này.

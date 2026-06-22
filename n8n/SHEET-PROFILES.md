# VillaOS Sheet Profiles

Tai lieu nay danh cho nguoi van hanh. Muc tieu la them nhieu Google Sheet chu nha ma khong phai sua SQL thu cong.

## Nguyen tac

Moi Google Sheet phai duoc gan 1 "Mau sheet" tren UI `Nguon du lieu`.

Khong can nho ma ky thuat. Tren UI chi can chon theo hinh dang sheet:

| Ten tren UI | Khi nao dung | Ma luu trong DB |
| --- | --- | --- |
| Mau A - ngay 01/07 | Sheet co cot ngay dang `01/07`, `19/07`; ten can nam ngang theo cot | `column_villas_month_tabs` |
| Mau B - cot Thu/Ngay | Sheet co cot `Thu`, cot `Ngay` la so `1..31`; thang/nam lay tu ten tab nhu `Thang 7/2026` | `weekday_day_columns_month_tabs` |
| Chua biet - can setup | Sheet moi khac 2 mau tren, chua chac cach doc | `needs_manual_mapping` |

## Quy trinh them sheet moi

1. Vao UI `Nguon du lieu`.
2. Bam `+ Them chu nha`.
3. Nhap ten chu nha, so dien thoai, link Google Sheet.
4. Chon `Mau sheet`.
5. Neu sheet giong s1, chon `Mau A - ngay 01/07`.
6. Neu sheet giong s2, chon `Mau B - cot Thu/Ngay`.
7. Neu khong chac, chon `Chua biet - can setup`.
8. Chay n8n manual voi `only_sheet_ids` cua sheet vua them de test rieng.
9. Kiem tra so villa, lich trong/booked, gia va muc `Can kiem tra`.
10. Chi bat batch/schedule cho sheet do sau khi data dung.

## Luat an toan

- `Mau A` khong doc ngay dang so don `19`, nen khong bi nham voi format s2.
- `Mau B` moi doc ngay dang so don `1..31`, va chi doc khi hang do co `T2..T7` hoac `CN` ben canh.
- `Chua biet` se bi n8n bo qua va ghi trang thai can setup, tranh day du lieu sai vao DB.

## Khi n8n bao rows_parsed = 0

Neu output sync tra ve `rows_parsed = 0`, khong tiep tuc import them sheet khac. Kiem tra theo thu tu:

1. Mo node `Build Google API Request`, xem `parser_type`.
   - Sheet giong s1 phai la `column_villas_month_tabs`.
   - Sheet giong s2 phai la `weekday_day_columns_month_tabs`.
   - Neu s2 van la `column_villas_month_tabs`, parser se khong doc cot `Ngay` dang so `1..31`.
2. Mo node `Build Ranged Google API Request`, xem `selected_tabs`.
   - Neu `selected_tabs` rong hoac chi co `Thong tin`, ten tab thang khong duoc nhan dien.
   - Tab thang nen co dang `Thang 7/2026`, `07.2026`, `07/2026`.
3. Mo node `Read Sheet With Cell Colors`, xem co tra ve `sheets[].data[].rowData` khong.
   - Neu khong co rowData, Google API dang khong doc dung range/tab.
4. Mo node `Normalize Villas And Calendar`, xem `error_sql`.
   - Workflow moi se ghi them `parser`, `selected_tabs`, `tabs_scanned`, `tabs_with_date_rows`.
   - Neu `tabs_with_date_rows=none`, loi nam o viec nhan dien ngay.
   - Neu co date rows nhung van 0, loi nam o viec nhan dien cot villa/property.

Voi sheet s2 Hoang Cuong, nguyen nhan thuong gap nhat la DB chua gan dung Mau B. Sua bang UI `Nguon du lieu` -> cot `Mau sheet` -> chon `Mau B - cot Thu/Ngay`, sau do chay lai `only_sheet_ids = 's2'`.

## Khi gap s3/s4/s5

- Giong s1: chon `Mau A`.
- Giong s2: chon `Mau B`.
- Khac nhe: ghi lai anh/chup cau truc, sau do them field vao `parser_config` hoac tao bien the moi cua profile.
- Khac han: tao profile moi co ten de hieu, vi du `Mau C - moi tab la 1 villa`.

Nguyen tac quan trong: khong sua parser chung de chieu tung sheet. Them profile co chu dich, test rieng, roi moi dua vao schedule.

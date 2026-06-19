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

## Khi gap s3/s4/s5

- Giong s1: chon `Mau A`.
- Giong s2: chon `Mau B`.
- Khac nhe: ghi lai anh/chup cau truc, sau do them field vao `parser_config` hoac tao bien the moi cua profile.
- Khac han: tao profile moi co ten de hieu, vi du `Mau C - moi tab la 1 villa`.

Nguyen tac quan trong: khong sua parser chung de chieu tung sheet. Them profile co chu dich, test rieng, roi moi dua vao schedule.

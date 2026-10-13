# ezCloud PMS - API noi bo (do tu web app, 2026-10-13, Claude)

ezCloud (`https://pms.ezcloudhotel.com`) KHONG co API cong khai. Day la cac endpoint web app cua ho goi (AngularJS + Kendo). Co the doi bat ky luc nao -> worker bao loi ro rang, sua `backend/src/coliving/ezcloud.ts`.
**Dong bo tu dong CHI DOC.** Ghi chi qua `backend/src/coliving/writes.ts` (nguoi bam tren web, quyen `coliving.write`, co `EZCLOUD_WRITE_ENABLED=true`), dung 3 endpoint ghi da do that o muc "Endpoint GHI" ben duoi. Cac endpoint ghi khac (`Booking/Save`, `Booking/Cancel`, `Booking/AddPayment`, `Booking/AssignRoom`, `Booking/Move`, checkout...) CHUA do -> KHONG goi.
(`GET api/Reservation/ProcessReservation` la DOC - web goi khi mo booking, du ten nghe nhu xu ly.)

Khach san: `Thom House Da Lat`, HotelId 16857, 11 phong. Tai khoan bot: `tuanlai1611@gmail.com`.
**Quyen tai khoan bot (do 2026-10-13): `ROLE_HOTEL_STAFF` - DAY DU quyen ghi** (check-in/out, sua gia, huy, thu tien, so quy, xoa khach...). Khong phai chi-xem. Khuyen user thu hep role con: xem booking + check-in/out + sua gia.
Cau hinh khach san: `IsOffNoshow=false` (tinh no-show), `TimeInPrivate 14:00`, `TimeOutPrivate 12:00`, `NightAuditTime 00:00`.

## Xac thuc

- Dang nhap UI: OIDC `https://id.ezcloud.vn/` -> `POST api/Account/UserAuthentication` -> localStorage `ngStorage-session` (= `ezIdData`): `access_token` (bearer), `refresh_token`, `token_type`, `userName`, `HotelId`, `UserId`, `.issued`, `.expires`.
- Header moi request: `Authorization: Bearer <access_token>`, `Content-Type: application/json`, `Language: en`.
- `access_token` song 60 ngay (`expires_in` 5184000).
- Lam moi: `POST api/Account/Refresh` body `{"refresh_token":"..."}` (kem header bearer). Web app goi khi con < 59 ngay (tuc sau ~1 ngay). Tra ve session moi (cung dang). Chua kiem chung refresh_token co xoay vong khong -> code luon luu ngay token moi.
- Lay phien thu cong: tren tab ezCloud da dang nhap, Console: `copy(localStorage.getItem('ngStorage-session'))`.

## Endpoint doc dang dung

| Endpoint | Dung cho | Ghi chu |
|---|---|---|
| `POST api/Booking/GetFrontOfficeBooking` | danh sach booking (moi nguon, ca huy) | body ben duoi; `data.ReservationRooms`, `data.TotalRecords`; pageSize 500 ~4s cho 604 dong |
| `GET api/Reservation/GetRoomChargesList?reservationRoomId=<id>` | tien phong tung dem | `roomCharges[]`: `Type` (DAY_PRICE...), `PriceKey` `DAY20260914`, `StartDate`, `Value`, `Status` |
| `GET api/room-view/get-all-resource?date=YYYY-MM-DD` | so do phong hom nay | `Data.rooms[]`: RoomId, RoomName, RoomTypeName, FloorName, HouseStatus (DIRTY/CLEAN), RoomStatus, ReservationType, ReservationRoom(s) |
| `GET api/time-line/get-all-resource?date=YYYY-MM-DD` | timeline (chua dung) | `resourceData`, `eventData` (booking quanh ngay), `roomTypes` |
| `GET api/Room/DashboardForApp?from=Tuesday%20October%2013,%202026` | so lieu ngay | `Dashboard.todayStats_*`, `Total_Revenue`, `Total_Payment`, `hotelGuests` |
| `GET api/Dashboard/GetListGuestByType?SearchType=ARRIVALS&SearchDate=YYYY-MM-DD` | khach den (chua dung) | |
| `GET api/Account/GetCurrentUser`, `GET api/Hotel/GetCurrentHotel` | kiem tra phien khi ket noi | |
| `GET api/Booking/GetReportConfig?reportTemplateId=1&isDefault=true` | `ReportTemplateDefaultId`=1 | |

Body `GetFrontOfficeBooking` (worker lay toan bo, ArrivalDate 2015-01-01 -> nam+3):

```json
{"ReportTemplateDefaultId":1,"GuestName":"","Phone":"","Email":"","IdentityNumber":"","PassportNumber":"","Address":"",
 "ReservationNumber":"","OtaNumber":"","RoomName":"","Adults":"","Children":"","CountryId":null,"SourceIds":[],"CompanyIds":[],
 "MarketIds":[],"BookingStatus":[],"CommissionType":[],"BirthDayFrom":null,"BirthDayTo":null,"OccupiedNightFrom":null,
 "OccupiedNightTo":null,"ArrivalDateFrom":"2015-01-01T00:00:00","ArrivalDateTo":"2029-12-31T23:59:00","DepartureDateFrom":null,
 "DepartureDateTo":null,"CreatedUser":[],"CreatedDateFrom":null,"CreatedDateTo":null,"CancelUser":[],"CancelDateFrom":null,
 "CancelDateTo":null,"pageSize":500,"OrderBy":"ArrivalDate","Ascending":1,"AscendingGroup":-1,"take":500,"skip":0,"page":1}
```

Truong 1 dong (ReservationRoom): ReservationRoomId (khoa), ReservationId, ReservationNumber, ReservationCode, BookingStatus (BOOKED/CHECKIN/CHECKOUT/CANCELLED), ArrivalDate, DepartureDate (UTC, 14:00/12:00 gio VN), Nights, RoomId/RoomName (null = chua gan), RoomTypeName, RoomPriceName (loai gia), SourceName (`ONLINE` = OTA qua channel manager; null = tao tay), MarketName, CMBookingId, CMChannelRef (ma OTA), Price (gia/dem hien thi), NetPrice/GrossPrice/Commission (dang null), Fullname, Mobile, Email, CountryName, IdentityNumber, PassportNumber, Birthday, Address/Ward/District/Province (KHONG luu - bi bo khoi `raw` trong sync.ts), CreatedUserName, CreatedDate, CancelDate, CancelReason, BookingNote, ReservationNote.

Quan sat 2026-10-13: 604 dong (BOOKED 61, CHECKIN 10, CHECKOUT 289, CANCELLED 140); SourceName ONLINE 88, null 412; nhieu booking dai han `Price=0` va tien dem = 0 (user se sua tren ezCloud).

## Endpoint doc chi tiet booking (dong bo dich vu + khoan thu, them 2026-10-13)

| Endpoint | Tra ve | Ghi chu |
|---|---|---|
| `GET api/Reservation/GetReservationRoomV3?reservationRoomId=` | BookingStatus, ArrivalDate, DepartureDate, Price, RoomPriceId, DiscountFlat/Percentage, Foc, `RoomExtraServicesList` (chi Amount, khong mo ta), `PaymentsList` (chi Amount, khong ngay), `lstPriceAdjustments` | 2-60 KB |
| `GET api/Reservation/ProcessReservation?date=YYYY-MM-DD&reservationRoomId=` | `BookingServiceList[].LstRoomExtraServiceModels[]` (RoomExtraServiceId, RoomExtraServiceName, RoomExtraServiceItemName, Amount, Quantity, TotalAmount, CreatedDate, IsDeleted), `PaymentList[]` (PaymentId, Amount, CreatedDate, PaymentTypeName NEW_PAYMENT/REFUND, PaymentMethodId, IsDeleted, UserCreated) | 20-110 KB -> chi goi khi V3 co dich vu/khoan thu |

Quan sat: booking dai han gia 0 nhung co **khoan thu that** (vd P201 thu 6.000.000d ngay 01/10) -> tien thue thang dang ghi bang thanh toan. Bao cao co them "Thuc thu" (theo ngay thu).

## Endpoint GHI (do that 2026-10-13 tren booking #493, user thao tac tren web ezCloud)

| Thao tac | Request | Ket qua / luu y |
|---|---|---|
| Sua gia tung dem | `POST api/Booking/UpdatePriceAdjustment` body `{LstPriceAdjustmentModels:[{DayName:"MON",Day:"14/09",SubDay:"",Title:"14/09",Value,Amount,RoomChargeId:0,StartDate,EndDate,Type:"DAY_PRICE",ReservationRoomId,RoomPriceId,PriceKey:"DAY20260914",OldValue}], DiscountFlat, DiscountPercentage, FOC, ReservationRoomId, RoomPriceId, languageKeys:{...chuoi thong bao tieng Viet...}}` | `{success:true,message:"SUCCESS"}`. Gui DU tat ca dem cua booking (dem khong doi giu Value cu). Chi la gia cua booking, khong doi gia ban OTA. |
| Check-in | `POST api/Booking/Checkin?reservationRoomId=<id>` body rong `""` | OK: `{success:true,data:{RoomId,RoomName}}`. Phong dang bi booking khac chiem: `{success:false,message:"Xung đột với booking khác!",data:{ReservationRoomId,BookingStatus,ArrivalDate,DepartureDate,Rooms:{RoomName}}}` (vd #41774181 P202 CHECKIN tu 07/2026 chua check-out). |
| Check-in muon (da qua ngay den) | ezCloud **doi ArrivalDate = luc check-in**, chi con dem tu hom nay; web ezCloud (IsOffNoshow=false) roi goi `POST api/Booking/AddExtraService` `[{ReservationRoomId,RoomExtraServiceName:"EXTRA_SERVICES",RoomExtraServiceDescription:"Phòng cả ngày dd/mm/yyyy - dd/mm/yyyy",Amount:<tong gia cac dem da qua>,Quantity:1}]` (POST gui ngay, hop thoai chi de xem) | Webapp lam y het. Sync doc dich vu "Phong ca ngay ..." -> chia tien vao tung dem + `stay_from` giu ngay o that. => NHAP GIA TRUOC KHI CHECK-IN, neu khong dich vu = 0d. |

Cau hinh gia (doc `GET api/Config/RoomTypes/GetAllRoomTypeTimeVer3`): moi loai gia cua tung hang phong co `UseWeeklyPrice/WeeklyPrice`, `UseMonthlyPrice/MonthlyPrice` (2026-10-13: deu TAT). Trang cau hinh `#/config/RoomTypeVer3` - tai khoan bot KHONG co quyen ("Khong du quyen truy cap"), user dung tai khoan chu. Bat gia thang -> tien phong co dong `Type: MONTH_PRICE` (StartDate..EndDate) -> sync chia deu vao cac dem; webapp "Nhap gia" chi sua DAY_PRICE (booking co WEEK/MONTH_PRICE -> sua tren ezCloud).

Chua do / KHONG goi: check-out (`Booking/Checkout`?), doi phong, huy, them thanh toan, sua dich vu.

## Endpoint chua dung (ung vien cho bao cao thu tien)

`api/statistics/get-revenue-detail-statistics` (POST), `api/statistics/get-daily-payment-list|summary` (POST, theo ca `ShiftId`), `api/Invoices/InvoicesSearch`, `api/Room/GetRevenueNewChart?fromDate&toDate&bookingSourceType&moduleType&isRoomCheckOut&isUseTaxFee` (tra rong voi ALL/ALL - can dung tham so dung), `api/Search/GetPaymentHistory`. Can do them truoc khi dung.

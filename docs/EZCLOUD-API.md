# ezCloud PMS - API noi bo (do tu web app, 2026-10-13, Claude)

ezCloud (`https://pms.ezcloudhotel.com`) KHONG co API cong khai. Day la cac endpoint web app cua ho goi (AngularJS + Kendo). Co the doi bat ky luc nao -> worker bao loi ro rang, sua `backend/src/coliving/ezcloud.ts`.
**CHI GOI ENDPOINT DOC.** Danh sach endpoint GHI (khong bao gio goi tu dong): `Booking/Save`, `Booking/Cancel`, `Booking/Checkin`, `Booking/AddPayment`, `Booking/AssignRoom`, `Booking/Move`, `Reservation/ProcessReservation`, ...

Khach san: `Thom House Da Lat`, HotelId 16857, 11 phong. Tai khoan bot: `tuanlai1611@gmail.com`.

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

## Endpoint chua dung (ung vien cho bao cao thu tien)

`api/statistics/get-revenue-detail-statistics` (POST), `api/statistics/get-daily-payment-list|summary` (POST, theo ca `ShiftId`), `api/Invoices/InvoicesSearch`, `api/Room/GetRevenueNewChart?fromDate&toDate&bookingSourceType&moduleType&isRoomCheckOut&isUseTaxFee` (tra rong voi ALL/ALL - can dung tham so dung), `api/Search/GetPaymentHistory`. Can do them truoc khi dung.

-- Thomstay Coliving: dữ liệu kéo từ ezCloud PMS (chỉ đọc). Worker: src/coliving/sync.ts.
-- Ngày giờ ezCloud trả UTC; *_date là ngày theo giờ Việt Nam (Asia/Ho_Chi_Minh).

create table if not exists cl_rooms (
  room_id           bigint primary key,
  name              text not null,
  room_type         text,
  room_type_id      bigint,
  floor             text,
  sort_order        int,
  house_status      text,   -- CLEAN / DIRTY / ...
  room_status       text,   -- trạng thái phòng theo ezCloud (CHECKIN, OVERDUE, ...)
  reservation_type  text,
  active            boolean not null default true,
  updated_at        timestamptz not null default now()
);

create table if not exists cl_bookings (
  reservation_room_id  bigint primary key,       -- 1 dòng = 1 phòng trong 1 đặt phòng
  reservation_id       bigint,
  reservation_number   int,
  reservation_code     text,
  status               text,                     -- BOOKED | CHECKIN | CHECKOUT | CANCELLED | NOSHOW
  arrival_at           timestamptz,
  departure_at         timestamptz,
  arrival_date         date,
  departure_date       date,
  nights               int,
  room_id              bigint,                   -- null = chưa gán phòng
  room_name            text,
  room_type            text,
  room_price_name      text,
  source_name          text,                     -- null = tạo tay / trực tiếp
  market_name          text,
  company_name         text,
  ota_ref              text,                     -- CMChannelRef (mã OTA)
  cm_booking_id        text,
  price                numeric,                  -- giá/đêm hiển thị trong danh sách ezCloud
  adults               int,
  children             int,
  guest_name           text,
  guest_phone          text,
  guest_email          text,
  guest_country        text,
  booking_note         text,
  reservation_note     text,
  created_by           text,
  created_at_pms       timestamptz,
  cancelled_at         timestamptz,
  cancel_reason        text,
  raw                  jsonb,
  hash                 text,                     -- băm các trường quan trọng → phát hiện thay đổi
  charges_hash         text,                     -- hash lúc lấy tiền phòng theo đêm gần nhất
  charges_synced_at    timestamptz,
  room_total           numeric,                  -- tổng tiền phòng (cộng cl_booking_nights)
  first_seen_at        timestamptz not null default now(),
  last_seen_at         timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  missing_since        timestamptz                -- không còn thấy trên ezCloud (bị xoá)
);
create index if not exists idx_cl_bookings_arrival on cl_bookings(arrival_date);
create index if not exists idx_cl_bookings_departure on cl_bookings(departure_date);
create index if not exists idx_cl_bookings_status on cl_bookings(status);
create index if not exists idx_cl_bookings_room on cl_bookings(room_id);

-- Tiền phòng theo từng đêm (api/Reservation/GetRoomChargesList) → doanh thu chính xác theo ngày/tháng.
create table if not exists cl_booking_nights (
  reservation_room_id  bigint not null references cl_bookings(reservation_room_id) on delete cascade,
  night                date not null,
  amount               numeric not null default 0,
  primary key (reservation_room_id, night)
);
create index if not exists idx_cl_nights_night on cl_booking_nights(night);

-- Nhật ký thay đổi phát hiện khi đồng bộ (mới / đổi / huỷ / bị xoá).
create table if not exists cl_booking_events (
  id                   bigserial primary key,
  reservation_room_id  bigint,
  kind                 text not null,            -- new | changed | cancelled | status | removed
  summary              text,
  changes              jsonb,
  at                   timestamptz not null default now(),
  notified_at          timestamptz
);
create index if not exists idx_cl_events_at on cl_booking_events(at desc);

create table if not exists cl_sync_runs (
  id           bigserial primary key,
  trigger      text,                             -- schedule | manual | startup
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  ok           boolean,
  stats        jsonb,
  error        text
);
create index if not exists idx_cl_sync_runs_started on cl_sync_runs(started_at desc);

-- Yêu cầu "Đồng bộ ngay" từ web → worker nhận trong vòng ~20 giây.
create table if not exists cl_sync_requests (
  id            bigserial primary key,
  requested_at  timestamptz not null default now(),
  requested_by  bigint,
  picked_at     timestamptz,
  done_at       timestamptz
);

-- Số liệu Dashboard của ezCloud theo ngày (api/Room/DashboardForApp), lưu bản mới nhất mỗi ngày.
create table if not exists cl_daily_kpi (
  day         date primary key,
  data        jsonb not null,
  updated_at  timestamptz not null default now()
);

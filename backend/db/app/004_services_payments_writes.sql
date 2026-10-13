-- Dịch vụ + khoản thu của booking (api/Reservation/ProcessReservation) và nhật ký GHI lên ezCloud.
-- Check-in muộn: ezCloud dời ngày đến sang lúc check-in và gom các đêm đã qua thành dịch vụ
-- "Phòng cả ngày dd/mm/yyyy - dd/mm/yyyy" → stay_from giữ ngày bắt đầu ở thật, tiền dịch vụ đó được chia vào cl_booking_nights.

alter table cl_bookings
  add column if not exists stay_from date,              -- ngày bắt đầu ở thật (<= arrival_date)
  add column if not exists services_total numeric,      -- tổng dịch vụ (kể cả "Phòng cả ngày")
  add column if not exists paid_total numeric,          -- tổng đã thu (trừ hoàn)
  add column if not exists details_synced_at timestamptz;

create table if not exists cl_booking_services (
  id                   bigint primary key,              -- RoomExtraServiceId
  reservation_room_id  bigint not null references cl_bookings(reservation_room_id) on delete cascade,
  name                 text,                            -- EXTRA_SERVICES / MINIBAR / LAUNDRY ...
  item_name            text,                            -- vd "Phòng cả ngày 14/09/2026 - 12/10/2026"
  amount               numeric,
  quantity             numeric,
  total                numeric,
  is_room              boolean not null default false,  -- dịch vụ thay tiền phòng (no-show / check-in muộn)
  period_from          date,
  period_to            date,
  created_at_pms       timestamptz,
  deleted              boolean not null default false
);
create index if not exists idx_cl_services_rr on cl_booking_services(reservation_room_id);

create table if not exists cl_booking_payments (
  id                   bigint primary key,              -- PaymentId
  reservation_room_id  bigint not null references cl_bookings(reservation_room_id) on delete cascade,
  amount               numeric not null,                -- hoàn tiền là số âm
  paid_at              timestamptz,
  type_name            text,                            -- NEW_PAYMENT / REFUND / ...
  method_id            int,
  description          text,
  created_by           text,
  deleted              boolean not null default false
);
create index if not exists idx_cl_payments_rr on cl_booking_payments(reservation_room_id);
create index if not exists idx_cl_payments_paid on cl_booking_payments(paid_at);

-- Mọi lệnh GHI lên ezCloud từ webapp (ai, lúc nào, gửi gì, ezCloud trả gì, kiểm tra lại ra sao).
create table if not exists cl_write_log (
  id                   bigserial primary key,
  at                   timestamptz not null default now(),
  user_id              bigint,
  user_email           text,
  action               text not null,                   -- set_price | checkin
  reservation_room_id  bigint,
  params               jsonb,
  request              jsonb,
  response             jsonb,
  ok                   boolean,
  verify               jsonb,
  error                text
);
create index if not exists idx_cl_write_log_at on cl_write_log(at desc);

-- ================================================================
--  Lược đồ PostgreSQL (Supabase) cho production.
--  Bản backend hiện chạy bằng kho in-memory (src/store.ts) để dev nhanh.
--  Khi lên production: chạy file này, rồi thay src/store.ts bằng adapter
--  truy vấn các bảng dưới đây (giữ nguyên chữ ký hàm để route không đổi).
-- ================================================================

create table if not exists owners (
  id              text primary key,
  name            text not null,
  phone           text,
  commission_rate numeric default 10,
  note            text,
  created_at      timestamptz default now()
);

create table if not exists sheets (
  id               text primary key,
  owner_id         text references owners(id),
  url              text not null,
  spreadsheet_id   text not null,
  title            text,
  parent_sheet_id  text,
  color_mapping    jsonb default '{}',         -- {"#ff0000":"booked","#00ff00":"available"}
  sync_status      text default 'needs_check', -- ok | error | needs_check
  last_synced_at   timestamptz,
  assignee         text,
  last_error       text
);

create table if not exists properties (
  id                 text primary key,
  owner_id           text references owners(id),
  name               text not null,
  area               text,
  address            text,
  bedrooms           int,
  capacity_standard  int,
  capacity_max       int,
  amenities          jsonb default '[]',
  rules              jsonb default '[]',
  images             jsonb default '[]',
  base_price         numeric,
  extra_fee_note     text,
  source_sheet_id    text references sheets(id),
  source_sheet_url   text,
  description        text,
  map_url            text,
  last_synced_at     timestamptz
);
-- Bổ sung cột cho DB đã tạo từ trước (an toàn chạy lại nhiều lần):
alter table properties add column if not exists source_sheet_url text;
alter table properties add column if not exists description      text;
alter table properties add column if not exists map_url          text;

create table if not exists availability_calendar (
  property_id        text references properties(id),
  date               date not null,
  status             text not null,            -- available | booked | blocked | unknown
  price              numeric,
  min_nights         int default 1,
  note               text,
  source_sheet_id    text,
  source_updated_at  timestamptz,
  synced_at          timestamptz default now(),
  confidence         numeric default 1,
  primary key (property_id, date)
);
create index if not exists idx_avail_date_status on availability_calendar(date, status);

create table if not exists review_queue (
  id                text primary key,
  property_id       text references properties(id),
  date              date,
  raw_value         text,
  raw_color_hex     text,
  suggested_status  text,
  suggested_price   numeric,
  confidence        numeric,
  source_sheet_id   text,
  created_at        timestamptz default now(),
  resolved          boolean default false
);

create table if not exists booking_requests (
  id               text primary key,
  property_id      text references properties(id),
  customer_name    text,
  customer_contact text,
  channel          text,
  checkin          date,
  checkout         date,
  guests           int,
  quoted_price     numeric,
  status           text default 'new',
  assignee         text,
  note             text,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

create table if not exists sync_logs (
  id           bigserial primary key,
  sheet_id     text,
  started_at   timestamptz,
  finished_at  timestamptz,
  status       text,
  rows_parsed  int,
  rows_review  int,
  error        text
);

-- profiles (auth) — làm ở giai đoạn sau theo yêu cầu
create table if not exists profiles (
  id         uuid primary key,
  email      text,
  full_name  text,
  role       text default 'sale'   -- sale | manager
);

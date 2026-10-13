-- App DB (Postgres nội bộ docker-core): người dùng, phiên, phân quyền theo menu, nhật ký.
-- Chạy tự động khi backend khởi động (src/app/db.ts → bảng app_migrations).

create table if not exists app_users (
  id             bigserial primary key,
  email          text not null unique,          -- luôn lưu chữ thường
  full_name      text not null default '',
  password_hash  text not null,                 -- scrypt$N$r$p$salt$hash
  status         text not null default 'pending' check (status in ('pending', 'active', 'disabled')),
  is_admin       boolean not null default false, -- admin = có mọi quyền
  note           text,
  created_at     timestamptz not null default now(),
  approved_at    timestamptz,
  approved_by    bigint references app_users(id),
  last_login_at  timestamptz
);

-- Quyền = khoá menu (vd 'coliving.revenue'). Danh mục ở src/app/permissions.ts.
create table if not exists app_user_permissions (
  user_id     bigint not null references app_users(id) on delete cascade,
  permission  text not null,
  granted_at  timestamptz not null default now(),
  granted_by  bigint references app_users(id),
  primary key (user_id, permission)
);

-- Phiên đăng nhập: cookie chứa token ngẫu nhiên, DB chỉ lưu sha256 → thu hồi được.
create table if not exists app_sessions (
  id_hash       text primary key,
  user_id       bigint not null references app_users(id) on delete cascade,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null,
  last_seen_at  timestamptz not null default now(),
  ip            text,
  user_agent    text
);
create index if not exists idx_app_sessions_user on app_sessions(user_id);

-- Link đặt lại mật khẩu do admin tạo (chưa có SMTP → admin gửi link cho người dùng).
create table if not exists app_password_resets (
  token_hash  text primary key,
  user_id     bigint not null references app_users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_by  bigint references app_users(id)
);

create table if not exists app_audit_log (
  id       bigserial primary key,
  at       timestamptz not null default now(),
  user_id  bigint,
  action   text not null,
  target   text,
  detail   jsonb,
  ip       text
);
create index if not exists idx_app_audit_at on app_audit_log(at desc);

-- Cấu hình/khoá-giá trị. Cột secret_enc: giá trị bí mật mã hoá AES-256-GCM bằng APP_SECRET_KEY.
create table if not exists app_settings (
  key         text primary key,
  value       jsonb,
  secret_enc  text,
  updated_at  timestamptz not null default now()
);

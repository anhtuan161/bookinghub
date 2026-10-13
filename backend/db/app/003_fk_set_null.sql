-- Cho phép xoá người dùng (CLI/dọn dữ liệu) mà không vướng khoá ngoại "ai duyệt / ai cấp quyền".
alter table app_users drop constraint if exists app_users_approved_by_fkey,
  add constraint app_users_approved_by_fkey foreign key (approved_by) references app_users(id) on delete set null;
alter table app_user_permissions drop constraint if exists app_user_permissions_granted_by_fkey,
  add constraint app_user_permissions_granted_by_fkey foreign key (granted_by) references app_users(id) on delete set null;
alter table app_password_resets drop constraint if exists app_password_resets_created_by_fkey,
  add constraint app_password_resets_created_by_fkey foreign key (created_by) references app_users(id) on delete set null;

# Thomstay Hub (Booking Hub + Thomstay Coliving) - HANDOFF cho AI/nguoi tiep theo

Cap nhat: 2026-10-13 (Claude) | Nhanh dang chay: `feat/coliving-auth` | Viet ASCII theo luat workspace.

Doc file nay TRUOC khi sua code/deploy. Doc them: `docs/EZCLOUD-API.md` (API noi bo ezCloud). Tai lieu goc cua Booking Hub (villa): `README.md`, `docs/*.md` khac.

## 1. Tong quan

| Muc | Gia tri |
|---|---|
| URL | `http://100.86.217.48:8097` (Tailscale) / `http://190.168.1.223:8097` (LAN). KHONG public. |
| May | docker-core (VM 100), stack `/data/compose/bookinghub/` |
| Container | `bookinghub` (web + API, cong 8097->8787), `bookinghub-worker` (dong bo ezCloud) - cung image `bookinghub:<ts>-<sha>` |
| Kho code goc | docker-core `/data/src/bookinghub.git` (bare). Hook `post-receive` mirror sang Gitea `thomstay/bookinghub` (private, `http://100.86.217.48:3030/thomstay/bookinghub`) |
| Upstream | GitHub `anhtuan161/bookinghub` (remote `github` trong kho bare). CHUA push nhanh moi len GitHub (can user dong y). |
| Ban lam viec | Workspace `B:\6.workspace\VPS\Projects\bookinghub\` (git clone, remote `origin` = docker-core bare) |
| Ban cu | `Projects/n8n/villaos/` = clone GitHub cu, giu cho tai lieu n8n (villaos-sync). KHONG sua code o do nua. |
| DB villa | Supabase (giong ban Vercel/Render) - n8n `villaos-sync` ghi vao, app doc |
| DB app | Postgres noi bo (container `postgres`), database/role `bookinghub` - user, quyen, Coliving |

Menu (moi muc = 1 quyen):

| Nhom | Muc | Quyen | Trang |
|---|---|---|---|
| Thomstay Coliving | Tong quan hom nay | `coliving.overview` | `/coliving/overview` |
| | Lich phong | `coliving.calendar` | `/coliving/calendar` |
| | Booking (co SDT/email khach) | `coliving.bookings` | `/coliving/bookings` |
| | Doanh thu | `coliving.revenue` | `/coliving/revenue` |
| | Ket noi ezCloud | `coliving.manage` | `/coliving/sync` |
| Booking Hub | Tim phong / Danh sach villa / Can kiem tra / Yeu cau giu phong / Nguon du lieu / Tong quan villa | `bookinghub.search/villas/review/requests/sources/dashboard` | `/booking-hub/*` (link cu `/search`... tu chuyen) |
| Quan tri | Nguoi dung & quyen | `admin.users` | `/admin/users` |

## 2. Kien truc code (chi phan moi)

```
Dockerfile                      3 stage: build frontend (tsc+vite, VITE_API_URL=/api) -> build backend (tsc) -> runtime node:22-alpine
deploy/homelab/                 docker-compose.yml, setup.sh (DB+secret, 1 lan), deploy.sh (git archive commit -> build -> up)
backend/db/app/NNN_*.sql        migration App DB, tu chay khi API/worker khoi dong (bang app_migrations, advisory lock)
backend/src/app/                db.ts (pool+migrate+audit), crypto.ts (scrypt, AES-GCM), auth.ts (cookie session, requirePerm),
                                permissions.ts (DANH MUC QUYEN = MENU), routes.ts (/api/auth, /api/admin), safe-router.ts
backend/src/coliving/           ezcloud.ts (client API noi bo ezCloud + phien), sync.ts (dong bo), queries.ts (bao cao),
                                routes.ts (/api/coliving), notify.ts (Telegram)
backend/src/worker.ts           vong lap 20s: dong bo moi EZCLOUD_SYNC_MINUTES hoac khi co yeu cau "Dong bo ngay"
backend/src/cli.ts              users | make-admin <email> | disable <email> | reset-link <email> | migrate
backend/src/index.ts            mount route; route villa cu duoc bao ve bang villaGuard (map duong dan -> quyen)
frontend/src/lib/nav.ts         MENU frontend (khop permissions.ts)
frontend/src/lib/session.tsx    AuthProvider (useSession), lib/http.ts (fetch cookie), lib/auth.ts
frontend/src/pages/coliving/*   Overview, Calendar, Bookings, Revenue, Sync; components/coliving/ui.tsx
frontend/src/pages/admin/Users.tsx  duyet dang ky + cap quyen + link dat lai mat khau + nhat ky
```

Che do: co `APP_DATABASE_URL` -> dang nhap that + Coliving. Khong co -> che do cu (Vercel/Render: mo hoac JWT Supabase). Frontend khong co `VITE_API_URL` -> demo (mock).

## 3. Dang nhap & phan quyen

- Dang ky bang email + mat khau (>= 8 ky tu) tai `/register` -> trang thai `pending` -> admin vao `/admin/users` duyet + tick menu. Chua co SMTP: khong gui mail xac nhan; admin duyet thay cho xac minh email.
- Admin dau tien: email trong `BOOTSTRAP_ADMIN_EMAILS` (file `/data/compose/bookinghub/.env`) tu thanh admin KHI dang ky, chi khi he thong CHUA co admin nao. Hien dat: `tuanlai161@gmail.com, anhtuan161@gmail.com, minhquandalatld@gmail.com`. Cach khac: user dang ky xong -> `ssh docker-core "docker exec bookinghub node dist/cli.js make-admin <email>"`.
- Phien: cookie `bh_sid` httpOnly, SameSite=Lax, 30 ngay truot; DB luu sha256 (bang `app_sessions`) -> thu hoi duoc. `COOKIE_SECURE=true` khi public HTTPS.
- Quen mat khau: admin bam "Tao link dat lai mat khau" (24h, 1 lan) va gui cho nguoi dung; hoac CLI `reset-link`.
- Chi admin (`is_admin`) moi: doi co admin, cap `admin.users`, sua tai khoan admin khac. Khong the ha/khoa admin cuoi cung.
- Gioi han thu: login 10 lan/15 phut/email, 30/IP; dang ky 10/gio/IP (bo nho, reset khi restart).
- Nhat ky: bang `app_audit_log` (dang nhap, dang ky, sua quyen, ket noi ezCloud...), xem o `/admin/users` -> Nhat ky.

### Them chuc nang/menu moi (QUY TRINH)

1. `backend/src/app/permissions.ts`: them item `{ key: '<nhom>.<trang>', label }` vao MENUS (nhom moi thi them group).
2. Backend: route moi `router.get(..., requirePerm('<key>'), ...)` (dung `safeRouter()` cho handler async). Bang moi -> file `backend/db/app/00N_*.sql` (tang so, khong sua file cu da chay).
3. Frontend: them muc vao `frontend/src/lib/nav.ts` (perm khop), them `<Route>` boc `<Perm perm="...">` trong `App.tsx`.
4. Admin vao `/admin/users` tick quyen moi cho nguoi can dung (admin tu dong co).

## 4. Thomstay Coliving (ezCloud)

- ezCloud PMS khong co API cong khai -> dung API noi bo cua web app (chi DOC). Chi tiet endpoint + body: `docs/EZCLOUD-API.md`.
- Tai khoan ezCloud: tai khoan BOT rieng `tuanlai1611@gmail.com` (user xac nhan la tai khoan bot). Mat khau user giu, KHONG luu o dau ca.
- Phien: user dan JSON `localStorage['ngStorage-session']` vao `/coliving/sync` (huong dan co tren trang). Server kiem tra (GetCurrentUser), luu MA HOA (AES-256-GCM, khoa `/data/.secrets/bookinghub/app_secret_key`) vao `app_settings('ezcloud.session')`. Token song 60 ngay; worker refresh (`POST api/Account/Refresh`) khi token da cap > 20h, luu token moi ngay lap tuc (phong refresh_token xoay vong). Refresh hong + token het han -> loi "phien" -> Telegram (neu bat) + banner tren web -> user dan lai.
- KHONG mo ezCloud bang tai khoan bot o trinh duyet khac sau khi dan (2 noi cung refresh co the lam mat hieu luc nhau).
- Moi luot dong bo (mac dinh 15 phut, `EZCLOUD_SYNC_MINUTES`):
  1. `GetFrontOfficeBooking` lay TOAN BO booking (~600, 1-2 request) -> upsert `cl_bookings` (hash tren dong goc). Luot dau = baseline (khong sinh su kien). Sau do sinh `cl_booking_events`: new / changed / cancelled / status / removed (khong con tren ezCloud -> `missing_since`, khong xoa) / restored.
  2. `GetRoomChargesList` (tien phong tung dem) cho booking moi/doi hash + booking dang/sap o (1 lan/20h), toi da `EZCLOUD_CHARGES_PER_RUN`=400/luot, cach nhau 300ms -> `cl_booking_nights`, `cl_bookings.room_total`.
  3. `room-view/get-all-resource` (so do phong, house status) -> `cl_rooms`; `Room/DashboardForApp` -> `cl_daily_kpi`.
  4. Neu ezCloud tra 0 booking -> dung (tranh danh dau xoa nham).
- Quy uoc bao cao (`queries.ts`): booking hieu luc = khong CANCELLED/NOSHOW va con tren ezCloud; dem o = arrival_date .. truoc departure_date (day-use = 1 dem); BOOKED da qua ngay den van tinh la dang o (le tan hay quen check-in) + canh bao. Doanh thu = tong tien phong theo dem tu ezCloud (accrual theo dem o). ADR = doanh thu/dem ban; RevPAR = doanh thu/(so phong x ngay). Phan khuc: ngan (<7 dem), trung (7-27), dai han (>=28 = coliving).
- Canh bao Tong quan: trung phong (2 booking chong ngay cung phong), chua gan phong, qua ngay den chua check-in, qua ngay di chua check-out, BOOKED da qua ngay di (60 ngay), chua co gia phong, dong bo tre (> 3 chu ky).
- Du lieu goc (2026-10-13): 11 phong, 604 booking (2025-07 -> 2026-07+), nhieu booking dai han gia 0 -> user se sua gia tren ezCloud (doanh thu that do user nhap sai truoc do).
- Telegram (tuy chon): ghi bot token vao `/data/.secrets/bookinghub/telegram_bot_token`, chat id vao `telegram_chat_id` (user tu nhap), restart worker. Gui: thay doi booking (24h gan nhat, gom 1 tin/luot) + tom tat 7h sang (`DAILY_SUMMARY_HOUR`). Tin co ten khach -> chi dung chat/nhom noi bo.

## 5. Van hanh

| Viec | Lenh |
|---|---|
| Deploy commit hien tai | `bash deploy/homelab/deploy.sh` (tu workspace `Projects/bookinghub`; commit truoc, script canh bao neu con file chua commit) |
| Rollback | `ssh docker-core 'cd /data/compose/bookinghub && sed -i "s/^RELEASE=.*/RELEASE=<tag>/" .env && docker compose up -d --no-build'` (tag trong `releases.log`) |
| Log | `ssh docker-core 'docker logs --tail 100 bookinghub-worker'` / `bookinghub` |
| Dong bo ngay | Web `/coliving/sync` -> "Dong bo ngay" (hoac `insert into cl_sync_requests default values`) |
| User | `ssh docker-core 'docker exec bookinghub node dist/cli.js users'` |
| SQL | `ssh docker-core 'docker exec -it postgres psql -U n8n -d bookinghub'` |
| Khoi tao lai (idempotent) | `bash deploy/homelab/setup.sh` |

Secret (`/data/.secrets/bookinghub/`, uid 1000, file 400, KHONG in ra):

| File | Noi dung | Mat thi |
|---|---|---|
| `app_database_url` | Postgres role `bookinghub` (sinh ngau nhien) | chay lai setup se KHONG sinh lai (role da co) -> dat lai mat khau role bang tay |
| `app_secret_key` | khoa ma hoa phien ezCloud trong DB | dan lai phien ezCloud |
| `supabase_database_url` | chuoi pooler Supabase (chep tu credential n8n `Postgres pooler villaos supabase`, 2026-10-13) | lay lai tu n8n / Supabase |
| `telegram_bot_token`, `telegram_chat_id` | trong, user tu nhap | - |

Backup: DB `bookinghub` nam trong `pg_dumpall` hang dem (`pg-backup.timer`, ma hoa). Thu muc secret KHONG nam trong backup.

## 6. Kiem thu da chay (2026-10-13)

- E2E auth/quyen tren 127.0.0.1:8097 (tai khoan `*@thomstay.test`, da xoa): 36 muc dung + 1 ky vong viet sai (`/api/nope` khi chua dang nhap tra 401 thay vi 404 - hanh vi dung) (anon 401, pending 403, admin, cap quyen tung menu, 403 dung cho menu khong duoc cap, tu nang quyen 403, doi/dat lai mat khau, link dung 1 lan, khoa tai khoan, admin cuoi, deep link SPA).
- Dong bo voi ezCloud GIA (DB test rieng, da xoa): 21/21 (refresh token, baseline, khong doi, moi/doi/huy/xoa, lay lai tien phong khi doi ngay, canh bao trung phong/qua ngay den/thieu gia, doanh thu nam/ngay, lich, tim kiem, phien hong).
- CHUA kiem voi ezCloud THAT: cho user dan phien (buoc 7).

## 7. Viec tiep theo

- [ ] USER: dang ky tai khoan admin tai `/register` (email trong BOOTSTRAP_ADMIN_EMAILS) -> `/coliving/sync` dan phien bot ezCloud. AI: xem log worker luot dau, doi chieu so lieu voi ezCloud (so booking, cong suat hom nay, doanh thu 1 thang).
- [ ] USER: sua gia cac booking dai han gia 0 tren ezCloud (trang Doanh thu liet ke).
- [ ] USER (tuy chon): token + chat id Telegram.
- [ ] AI: public qua Cloudflare (`hub.thomstay.com`?) chi sau khi co admin: route tunnel -> `bookinghub:8787`, dat `PUBLIC_URL=https://...`, `COOKIE_SECURE=true`, `TRUST_PROXY=true` trong `.env` stack; can user dong y + them route.
- [ ] AI: SMTP (gui link xac nhan email / dat lai mat khau tu dong) khi user co tai khoan mail gui.
- [ ] AI: (da duoc user dong y 2026-10-13, de sau) day lich trong/da dat 11 phong Thom House vao Booking Hub (Supabase `properties` + `availability_calendar`, nguon `ezcloud`) de sale tra cung villa - KHONG day thong tin khach.
- [ ] AI: bao cao thu tien that (api/statistics/... - chua do), doi soat cong no OTA; hop dong/tien coc khach dai han.
- [ ] USER quyet: merge `feat/coliving-auth` vao `master` va push GitHub? Luu y: ban Vercel/Render se can backend co App DB, neu khong frontend chay che do demo-login.

## 8. Lich su

- 2026-10-13 Claude: do API ezCloud; dung kho bare + Gitea mirror; them App DB, dang ky/duyet/quyen menu, gom menu Booking Hub, them Thomstay Coliving (worker + 5 trang), Docker 1 image, deploy docker-core :8097; e2e auth 36/36, sync gia 21/21.

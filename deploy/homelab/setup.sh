#!/usr/bin/env bash
# Khoi tao 1 lan (idempotent) tren docker-core: DB + role rieng trong Postgres hien co, thu muc secret.
# Mat khau/khoa sinh NGAU NHIEN tren server, ghi file 400 (uid 1000), KHONG in ra man hinh.
# Chay tu may co `ssh docker-core`:  bash deploy/homelab/setup.sh
# Tuy chon: SUPABASE_ENV=<duong dan backend/.env cu> -> chep DATABASE_URL (Supabase) len server ma khong in ra.
set -euo pipefail
HOST="${DEPLOY_HOST:-docker-core}"

if [[ -n "${SUPABASE_ENV:-}" && -f "$SUPABASE_ENV" ]]; then
  if grep -q '^DATABASE_URL=.\+' "$SUPABASE_ENV"; then
    grep '^DATABASE_URL=' "$SUPABASE_ENV" | head -1 | cut -d= -f2- | tr -d '\r' \
      | ssh "$HOST" 'sudo mkdir -p /data/.secrets/bookinghub && sudo tee /data/.secrets/bookinghub/supabase_database_url.new >/dev/null'
    echo "supabase_database_url: da chep tu $SUPABASE_ENV"
  fi
fi

ssh "$HOST" 'bash -s' <<'REMOTE'
set -euo pipefail
SEC=/data/.secrets/bookinghub
sudo mkdir -p "$SEC" /data/compose/bookinghub
sudo chown "$(id -un):$(id -gn)" /data/compose/bookinghub
sudo chmod 700 "$SEC"

# 1. Role + database rieng (superuser cua container postgres la n8n)
if ! docker exec postgres psql -U n8n -d postgres -tAc "select 1 from pg_roles where rolname='bookinghub'" | grep -q 1; then
  PW="$(openssl rand -hex 24)"
  printf "create role bookinghub login password '%s' connection limit 30;\n" "$PW" \
    | docker exec -i postgres psql -U n8n -d postgres -v ON_ERROR_STOP=1 -q
  printf 'postgres://bookinghub:%s@postgres:5432/bookinghub\n' "$PW" | sudo tee "$SEC/app_database_url" >/dev/null
  unset PW
  echo "role bookinghub: da tao"
else
  echo "role bookinghub: da co"
fi
if ! docker exec postgres psql -U n8n -d postgres -tAc "select 1 from pg_database where datname='bookinghub'" | grep -q 1; then
  docker exec postgres psql -U n8n -d postgres -v ON_ERROR_STOP=1 -q -c "create database bookinghub owner bookinghub" \
    -c "revoke all on database bookinghub from public"
  echo "database bookinghub: da tao"
else
  echo "database bookinghub: da co"
fi

# 2. Khoa ma hoa secret trong DB (phien ezCloud). Mat file nay = phai ket noi lai ezCloud.
sudo test -s "$SEC/app_secret_key" || { openssl rand -hex 32 | sudo tee "$SEC/app_secret_key" >/dev/null; echo "app_secret_key: da sinh"; }

# 3. Supabase (Booking Hub villa) - neu vua chep .new thi thay
if sudo test -s "$SEC/supabase_database_url.new"; then sudo mv "$SEC/supabase_database_url.new" "$SEC/supabase_database_url"; fi
sudo test -e "$SEC/supabase_database_url" || sudo touch "$SEC/supabase_database_url"

# 4. File trong cho secret user tu nhap sau (Telegram)
for f in telegram_bot_token telegram_chat_id; do sudo test -e "$SEC/$f" || sudo touch "$SEC/$f"; done

sudo chown -R 1000:1000 "$SEC"
sudo chmod 500 "$SEC"
sudo sh -c "chmod 400 $SEC/*"
echo "secret dir: $(sudo ls "$SEC" | tr '\n' ' ')"
echo "supabase_database_url: $(sudo test -s $SEC/supabase_database_url && echo co || echo TRONG)"
REMOTE

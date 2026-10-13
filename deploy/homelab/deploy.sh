#!/usr/bin/env bash
# Deploy Booking Hub + Coliving len docker-core tu 1 COMMIT git (khong deploy file chua commit).
#   bash deploy/homelab/deploy.sh            # deploy HEAD
#   REF=<commit|branch> bash deploy/homelab/deploy.sh
# Buoc: push len kho goc docker-core:/data/src/bookinghub.git (hook mirror sang Gitea) -> git archive -> build image
#       (tsc frontend + backend trong Dockerfile) -> up -d -> kiem tra health.
# Rollback: ssh docker-core 'cd /data/compose/bookinghub && RELEASE=<tag cu> docker compose up -d --no-build'
#           (tag cu: xem /data/compose/bookinghub/releases.log)
set -euo pipefail
HOST="${DEPLOY_HOST:-docker-core}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
STACK=/data/compose/bookinghub
cd "$ROOT"
export GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=safe.directory GIT_CONFIG_VALUE_0='*'

REF="${REF:-HEAD}"
SHA="$(git rev-parse --short=10 "$REF")"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ -n "$(git status --porcelain)" ]]; then
  echo "CANH BAO: co thay doi chua commit -> KHONG duoc deploy (chi deploy $SHA)."
fi
TS="$(date +%Y%m%d-%H%M%S)"
TAG="$TS-$SHA"
echo "== Release $TAG ($BRANCH) -> $HOST"

# 1. Day code len kho goc tren docker-core (+ mirror Gitea qua hook)
git push -q origin "$BRANCH" 2>&1 | grep -v '^$' || true

# 2. Source = git archive cua commit (sach, khong .env/node_modules)
git archive --format=tar "$REF" | ssh "$HOST" "set -e; rm -rf $STACK/src.new; mkdir -p $STACK/src.new; tar -C $STACK/src.new -xf -
  rm -rf $STACK/src.old; [ -d $STACK/src ] && mv $STACK/src $STACK/src.old; mv $STACK/src.new $STACK/src"

# 3. Compose (backup neu doi)
if ! ssh "$HOST" "cmp -s - $STACK/docker-compose.yml" < deploy/homelab/docker-compose.yml; then
  ssh "$HOST" "set -e; [ -f $STACK/docker-compose.yml ] && mkdir -p /data/backups && cp $STACK/docker-compose.yml /data/backups/bookinghub.compose.$TS || true; cat > $STACK/docker-compose.yml" < deploy/homelab/docker-compose.yml
  echo "   cap nhat docker-compose.yml"
fi

# 4. Build + chay; .env cua stack giu RELEASE + bien khong bi mat (BOOTSTRAP_ADMIN_EMAILS...)
ssh "$HOST" "set -e; cd $STACK; touch .env
  grep -v '^RELEASE=' .env > .env.tmp || true; echo RELEASE=$TAG >> .env.tmp; mv .env.tmp .env
  docker compose build --quiet bookinghub
  docker compose up -d
  echo $TAG >> releases.log"

# 5. Kiem tra
st=""
for i in $(seq 1 40); do
  st="$(ssh "$HOST" "docker inspect -f '{{.State.Health.Status}}' bookinghub bookinghub-worker 2>/dev/null | tr '\n' ' '")"
  [[ "$st" == "healthy healthy " ]] && break
  sleep 3
done
echo "   health: $st"
ssh "$HOST" "curl -fsS http://127.0.0.1:8097/api/health; echo; curl -s -o /dev/null -w '   / -> %{http_code}\n' http://127.0.0.1:8097/"
if [[ "$st" != "healthy healthy " ]]; then
  echo "LOI: container chua healthy"
  ssh "$HOST" "docker logs --tail 40 bookinghub; docker logs --tail 40 bookinghub-worker"
  exit 1
fi
# 6. Don image cu: giu 5 ban moi nhat de rollback (moi ban chi khac ~1 MB, phan con lai dung chung layer)
ssh "$HOST" "docker image ls bookinghub --format '{{.Tag}}' | sort -r | tail -n +6 | xargs -r -I{} docker image rm -f bookinghub:{} >/dev/null 2>&1 || true"
echo "== OK: http://100.86.217.48:8097 (Tailscale) | http://190.168.1.223:8097 (LAN)"

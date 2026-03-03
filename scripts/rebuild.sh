#!/bin/bash
cd "$(dirname "$0")/.."

set -euo pipefail

# Worktreeを複数同時に動かしても衝突しないように、Composeのプロジェクト名をパスから安定生成する。
if [ -z "${COMPOSE_PROJECT_NAME:-}" ]; then
  if command -v python3 >/dev/null 2>&1; then
    export COMPOSE_PROJECT_NAME="pado_$(python3 - <<'PY'
import hashlib, os
print(hashlib.sha1(os.getcwd().encode('utf-8')).hexdigest()[:10])
PY
)"
  fi
fi

# Worktreeごとのネットワーク衝突を避けるため、サブネットと固定IPをプロジェクト単位で自動生成する。
if [ -z "${PADO_SUBNET:-}" ] || [ -z "${PADO_APP_IP:-}" ]; then
  if command -v python3 >/dev/null 2>&1; then
    eval "$(python3 - <<'PY'
import hashlib, os
proj = os.environ.get("COMPOSE_PROJECT_NAME") or hashlib.sha1(os.getcwd().encode("utf-8")).hexdigest()[:10]
h = hashlib.sha1(proj.encode("utf-8")).hexdigest()
oct3 = (int(h[:4], 16) % 200) + 20  # 20..219
subnet = f"172.32.{oct3}.0/24"
ip = f"172.32.{oct3}.10"
print(f'export PADO_SUBNET="{subnet}"')
print(f'export PADO_APP_IP="{ip}"')
PY
)"
  fi
fi

echo "Stopping and removing containers..."
docker compose down --remove-orphans

# ポートが既に使用中の場合でも起動できるように、空きポートを自動選択する（デフォルト: 8087）
if [ -z "${PADO_PORT:-}" ]; then
  if command -v python3 >/dev/null 2>&1; then
    for p in 8087 8088 8089 8090 8091 8092 8093 8094; do
      if python3 - <<PY
import socket
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
try:
    s.bind(('0.0.0.0', $p))
    s.close()
    raise SystemExit(0)
except OSError:
    s.close()
    raise SystemExit(1)
PY
      then
        export PADO_PORT="$p"
        break
      fi
    done
  fi
fi
PADO_PORT="${PADO_PORT:-8087}"

echo "Building test container..."
echo "NOTE: 依存関係の再インストール（npm install）が走ると数分かかることがあります。止まって見えてもビルド中です。"
docker compose --progress=plain build pado-test

echo "Generating version..."
docker compose run --rm --entrypoint /bin/bash \
    -v "$(pwd)/scripts:/app/scripts" \
    -v "$(pwd)/package.json:/app/package.json" \
    pado-test \
    -c "chmod +x scripts/generate_version.sh && ./scripts/generate_version.sh"

echo "Building app container..."
docker compose build pado-app

echo "Starting application..."
docker compose up -d --force-recreate pado-app pado-app-public

echo "Done! App is running at http://localhost:${PADO_PORT}"

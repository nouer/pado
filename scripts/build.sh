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

# デフォルトは 8087。必要なら PADO_PORT を指定する。
PADO_PORT="${PADO_PORT:-8087}"
./scripts/generate_version.sh
./scripts/build-docs.sh
echo "Building and starting containers..."
docker compose up -d --build pado-app pado-app-public
echo "Done! App is running at http://localhost:${PADO_PORT}"

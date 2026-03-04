#!/bin/bash
# Build documentation HTML files for web publishing.
#
# Usage:
#     bash scripts/build-docs.sh
#
# Converts docs/manual.md and docs/promotion.md to HTML files
# in local_app/ and copies images to local_app/docs-images/.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

DOCS_DIR="$PROJECT_DIR/docs"
APP_DIR="$PROJECT_DIR/local_app"
IMAGES_SRC="$DOCS_DIR/images"
IMAGES_DST="$APP_DIR/docs-images"

echo "=== ドキュメントHTML生成 ==="

# Copy images
echo "画像コピー: $IMAGES_SRC → $IMAGES_DST"
rm -rf "$IMAGES_DST"
mkdir -p "$IMAGES_DST"
cp "$IMAGES_SRC"/*.png "$IMAGES_DST/"
echo "  $(ls "$IMAGES_DST" | wc -l) 件コピー完了"

# Generate HTML files
for name in manual promotion; do
    src="$DOCS_DIR/${name}.md"
    dst="$APP_DIR/${name}.html"
    if [ -f "$src" ]; then
        echo "HTML生成: $src → $dst"
        python3 "$SCRIPT_DIR/md-to-html.py" "$src" "$dst"
    else
        echo "スキップ: $src が見つかりません"
    fi
done

echo "=== 完了 ==="

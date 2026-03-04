#!/bin/bash
# generate-icons.sh - SVGからPWAアイコンPNGを生成
# 依存: rsvg-convert (librsvg2-bin)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ICONS_DIR="$SCRIPT_DIR/../local_app/icons"

ICON_SVG="$ICONS_DIR/icon.svg"
MASKABLE_SVG="$ICONS_DIR/icon-maskable.svg"

if ! command -v rsvg-convert &>/dev/null; then
    echo "Error: rsvg-convert が見つかりません。librsvg2-bin をインストールしてください。"
    exit 1
fi

echo "=== PWAアイコン生成 ==="

# 通常アイコン
echo "icon-512.png (512x512) ..."
rsvg-convert -w 512 -h 512 "$ICON_SVG" -o "$ICONS_DIR/icon-512.png"

echo "icon-192.png (192x192) ..."
rsvg-convert -w 192 -h 192 "$ICON_SVG" -o "$ICONS_DIR/icon-192.png"

echo "apple-touch-icon.png (180x180) ..."
rsvg-convert -w 180 -h 180 "$ICON_SVG" -o "$ICONS_DIR/apple-touch-icon.png"

echo "favicon-32.png (32x32) ..."
rsvg-convert -w 32 -h 32 "$ICON_SVG" -o "$ICONS_DIR/favicon-32.png"

echo "favicon-16.png (16x16) ..."
rsvg-convert -w 16 -h 16 "$ICON_SVG" -o "$ICONS_DIR/favicon-16.png"

# Maskable アイコン
echo "icon-maskable-512.png (512x512) ..."
rsvg-convert -w 512 -h 512 "$MASKABLE_SVG" -o "$ICONS_DIR/icon-maskable-512.png"

echo ""
echo "=== 生成完了 ==="
ls -la "$ICONS_DIR"/*.png

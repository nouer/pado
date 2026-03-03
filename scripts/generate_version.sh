#!/bin/bash
cd "$(dirname "$0")/.."

# Extract version from package.json
if [ -f "package.json" ]; then
    VERSION=$(grep -o '"version": "[^"]*"' package.json | cut -d'"' -f4)
else
    VERSION="unknown"
fi

# NOTE:
# - ビルド環境が alpine 等で tzdata が入っていない場合、`TZ=Asia/Tokyo` が解決できず
#   UTCのままになり「JST表記なのに9時間ズレる」ことがあります。
# - zoneinfo が使える場合は Asia/Tokyo を使い、使えない場合は POSIX TZ 文字列(JST-9)でフォールバックします。
if TZ='Asia/Tokyo' date +%z 2>/dev/null | grep -q '^+0900$'; then
    BUILD_TZ='Asia/Tokyo'
else
    BUILD_TZ='JST-9'
fi

BUILD_TIME=$(TZ="$BUILD_TZ" date "+%Y-%m-%d %H:%M:%S JST")

echo "Generating version.js with Version: $VERSION, Build Time: $BUILD_TIME"

cat > local_app/version.js <<EOF
window.APP_INFO = {
    version: "$VERSION",
    buildTime: "$BUILD_TIME"
};
EOF

# Service Worker の CACHE_NAME をバージョン+ビルドハッシュで更新
BUILD_HASH=$(date +%s)
CACHE_NAME="pado-v${VERSION}-${BUILD_HASH}"
sed -i "s|const CACHE_NAME = 'pado-[^']*'|const CACHE_NAME = '${CACHE_NAME}'|" local_app/sw.js
echo "Updated sw.js CACHE_NAME: ${CACHE_NAME}"

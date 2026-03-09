#!/usr/bin/env python3
"""
iOS PWA スプラッシュ画像生成スクリプト

既存のアイコンPNG (icon-512.png) を使い、各iOSデバイスサイズの
スプラッシュ画像を生成する。
デザイン: 白背景 (#ffffff) + 中央にアイコン + アプリ名
"""

from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
import sys

# デバイスサイズ定義 (width x height)
SPLASH_SIZES = [
    (640,  1136,  "iPhone SE1/5"),
    (750,  1334,  "iPhone 6/7/8/SE2/SE3"),
    (1125, 2436,  "iPhone X/XS/11Pro/12mini"),
    (828,  1792,  "iPhone XR/11/12/13/14"),
    (1170, 2532,  "iPhone 12Pro/13/14"),
    (1179, 2556,  "iPhone 14Pro/15/16"),
    (1290, 2796,  "iPhone 14ProMax/15Plus/16Plus"),
    (1320, 2868,  "iPhone 16ProMax"),
    (1536, 2048,  "iPad"),
    (1668, 2388,  "iPad Pro 11\""),
    (2048, 2732,  "iPad Pro 12.9\""),
]

BACKGROUND_COLOR = (255, 255, 255)
TEXT_COLOR = (30, 64, 175)  # #1e40af (Pado primary)
APP_NAME = "Pado 帳票管理"


def generate_splash_images():
    base_dir = Path(__file__).resolve().parent.parent / "local_app" / "icons"
    icon_path = base_dir / "icon-512.png"
    splash_dir = base_dir / "splash"
    splash_dir.mkdir(exist_ok=True)

    if not icon_path.exists():
        print(f"Error: {icon_path} not found")
        sys.exit(1)

    icon_src = Image.open(icon_path).convert("RGBA")

    # フォント (システムフォントを試す)
    font = None
    font_paths = [
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/opentype/noto/NotoSansCJKjp-Regular.otf",
        "/usr/share/fonts/truetype/fonts-japanese-gothic.ttf",
        "/System/Library/Fonts/ヒラギノ角ゴシック W3.ttc",
    ]

    for fp in font_paths:
        if Path(fp).exists():
            try:
                font = ImageFont.truetype(fp, 48)
                break
            except Exception:
                continue

    generated = 0
    for width, height, device_name in SPLASH_SIZES:
        img = Image.new("RGB", (width, height), BACKGROUND_COLOR)

        # アイコンサイズ: 短辺の20%
        icon_size = int(min(width, height) * 0.20)
        icon_resized = icon_src.resize((icon_size, icon_size), Image.LANCZOS)

        # 中央に配置 (やや上寄り)
        x = (width - icon_size) // 2
        y = (height - icon_size) // 2 - int(height * 0.05)
        img.paste(icon_resized, (x, y), icon_resized)

        # アプリ名テキスト
        if font:
            draw = ImageDraw.Draw(img)
            font_size = max(28, int(min(width, height) * 0.035))
            try:
                text_font = ImageFont.truetype(font.path, font_size)
            except Exception:
                text_font = font
            bbox = draw.textbbox((0, 0), APP_NAME, font=text_font)
            tw = bbox[2] - bbox[0]
            tx = (width - tw) // 2
            ty = y + icon_size + int(height * 0.03)
            draw.text((tx, ty), APP_NAME, fill=TEXT_COLOR, font=text_font)

        out_path = splash_dir / f"splash-{width}x{height}.png"
        img.save(out_path, "PNG", optimize=True)
        generated += 1
        print(f"  Generated: {out_path.name} ({width}x{height}) - {device_name}")

    print(f"\nDone: {generated} splash images in {splash_dir}")


if __name__ == "__main__":
    generate_splash_images()

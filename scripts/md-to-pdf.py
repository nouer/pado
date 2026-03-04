#!/usr/bin/env python3
"""
Markdown to PDF converter using markdown-it-py + Chromium.

Usage:
    python3 scripts/md-to-pdf.py <input.md> [output.pdf]

Requirements (pre-installed):
    - python3 with markdown-it-py
    - chromium-browser (snap)

Note: Snap Chromium cannot access /tmp. Temporary HTML is written
next to the source markdown file to ensure accessibility.
"""

import base64
import mimetypes
import re
import subprocess
import sys
from pathlib import Path

from markdown_it import MarkdownIt

CSS_STYLES = """
@page {
    size: A4;
    margin: 20mm 18mm;
}

body {
    font-family: 'Noto Serif CJK JP', 'Noto Sans CJK JP', serif;
    font-size: 11pt;
    line-height: 1.8;
    color: #1a1a1a;
}

h1 {
    font-family: 'Noto Sans CJK JP', sans-serif;
    font-size: 20pt;
    font-weight: bold;
    text-align: center;
    margin-top: 0;
    margin-bottom: 1.2em;
    padding-bottom: 0.4em;
    border-bottom: 2px solid #333;
}

h2 {
    font-family: 'Noto Sans CJK JP', sans-serif;
    font-size: 15pt;
    font-weight: bold;
    margin-top: 1.8em;
    margin-bottom: 0.6em;
    padding-bottom: 0.2em;
    border-bottom: 1px solid #ccc;
}

h3 {
    font-family: 'Noto Sans CJK JP', sans-serif;
    font-size: 12pt;
    font-weight: bold;
    margin-top: 1.2em;
    margin-bottom: 0.4em;
}

h4 {
    font-family: 'Noto Sans CJK JP', sans-serif;
    font-size: 11pt;
    font-weight: bold;
    margin-top: 1em;
    margin-bottom: 0.3em;
}

p {
    margin: 0.6em 0;
    text-align: justify;
}

ul, ol {
    margin: 0.6em 0;
    padding-left: 2em;
}

li {
    margin: 0.3em 0;
}

table {
    border-collapse: collapse;
    width: 100%;
    margin: 1em 0;
    font-size: 10pt;
}

th, td {
    border: 1px solid #999;
    padding: 6px 10px;
    text-align: left;
}

th {
    background-color: #f0f0f0;
    font-weight: bold;
}

hr {
    border: none;
    border-top: 1px solid #ccc;
    margin: 1.5em 0;
}

code {
    font-family: 'UDEV Gothic NF', 'Cica', 'Noto Sans Mono CJK JP', monospace;
    font-size: 9pt;
    background-color: #f5f5f5;
    padding: 0.15em 0.3em;
    border-radius: 3px;
}

pre {
    background-color: #f5f5f5;
    padding: 0.8em;
    overflow-x: auto;
    font-size: 9pt;
    line-height: 1.4;
    border-radius: 4px;
}

pre code {
    background: none;
    padding: 0;
}

blockquote {
    border-left: 3px solid #ccc;
    margin: 0.8em 0;
    padding: 0.2em 0 0.2em 1em;
    color: #555;
}

strong {
    font-weight: bold;
}

img {
    max-width: 100%;
    height: auto;
    display: block;
    margin: 0.5em auto;
}
"""


def embed_images_as_base64(html: str, base_dir: Path) -> str:
    """Embed images as base64 data URIs (snap Chromium blocks file:// access)."""
    def replace_src(match):
        src = match.group(1)
        if src.startswith(('http://', 'https://', 'data:')):
            return match.group(0)
        if src.startswith('file://'):
            img_path = Path(src[7:])
        else:
            img_path = (base_dir / src).resolve()
        if not img_path.exists():
            print(f"Warning: 画像が見つかりません: {img_path}", file=sys.stderr)
            return match.group(0)
        mime = mimetypes.guess_type(str(img_path))[0] or 'image/png'
        b64 = base64.b64encode(img_path.read_bytes()).decode()
        return f'src="data:{mime};base64,{b64}"'

    return re.sub(r'src="([^"]*)"', replace_src, html)


def markdown_to_pdf(md_file: str, pdf_file: str | None = None) -> str:
    md_path = Path(md_file).resolve()
    if not md_path.exists():
        print(f"Error: ファイルが見つかりません: {md_file}", file=sys.stderr)
        sys.exit(1)

    if pdf_file is None:
        pdf_file = str(md_path.with_suffix('.pdf'))
    pdf_path = Path(pdf_file).resolve()

    # Markdown → HTML
    md = MarkdownIt('commonmark', {'html': True})
    md.enable('table')
    md_content = md_path.read_text(encoding='utf-8')
    html_body = md.render(md_content)

    # Embed images as base64 data URIs
    html_body = embed_images_as_base64(html_body, md_path.parent)

    full_html = f"""<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<title>{md_path.stem}</title>
<style>{CSS_STYLES}</style>
</head>
<body>
{html_body}
</body>
</html>"""

    # Write temporary HTML next to source file (snap can't access /tmp)
    tmp_html_path = md_path.parent / f'.{md_path.stem}_tmp.html'
    tmp_html_path.write_text(full_html, encoding='utf-8')

    try:
        # HTML → PDF via Chromium
        result = subprocess.run(
            [
                'chromium-browser',
                '--headless',
                '--disable-gpu',
                '--no-sandbox',
                '--disable-software-rasterizer',
                '--allow-file-access-from-files',
                '--no-pdf-header-footer',
                f'--print-to-pdf={pdf_path}',
                f'file://{tmp_html_path}',
            ],
            capture_output=True,
            text=True,
        )
        if not pdf_path.exists():
            print("Error: PDF生成に失敗しました", file=sys.stderr)
            if result.stderr:
                print(result.stderr, file=sys.stderr)
            sys.exit(1)
    finally:
        tmp_html_path.unlink(missing_ok=True)

    return str(pdf_path)


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 scripts/md-to-pdf.py <input.md> [output.pdf]")
        sys.exit(1)

    md_file = sys.argv[1]
    pdf_file = sys.argv[2] if len(sys.argv) > 2 else None
    output = markdown_to_pdf(md_file, pdf_file)
    print(f"生成完了: {output}")


if __name__ == "__main__":
    main()

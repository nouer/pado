#!/usr/bin/env python3
"""
Markdown to HTML converter for web publishing.

Usage:
    python3 scripts/md-to-html.py <input.md> <output.html> [--images-dir docs-images]

Requirements:
    - python3 with markdown-it-py
"""

import argparse
import re
import sys
from pathlib import Path

from markdown_it import MarkdownIt

CSS_STYLES = """
* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: 'Noto Serif CJK JP', 'Hiragino Mincho ProN', 'Yu Mincho', serif;
    font-size: 16px;
    line-height: 1.8;
    color: #1a1a1a;
    background-color: #f8f8f8;
}

.container {
    max-width: 860px;
    margin: 0 auto;
    padding: 24px 32px 64px;
    background-color: #fff;
    min-height: 100vh;
}

nav.back-link {
    margin-bottom: 24px;
    padding-bottom: 12px;
    border-bottom: 1px solid #eee;
}

nav.back-link a {
    color: #2563eb;
    text-decoration: none;
    font-size: 14px;
}

nav.back-link a:hover {
    text-decoration: underline;
}

h1 {
    font-family: 'Noto Sans CJK JP', 'Hiragino Kaku Gothic ProN', sans-serif;
    font-size: 28px;
    font-weight: bold;
    text-align: center;
    margin-top: 0;
    margin-bottom: 1.2em;
    padding-bottom: 0.4em;
    border-bottom: 2px solid #333;
}

h2 {
    font-family: 'Noto Sans CJK JP', 'Hiragino Kaku Gothic ProN', sans-serif;
    font-size: 22px;
    font-weight: bold;
    margin-top: 2em;
    margin-bottom: 0.6em;
    padding-bottom: 0.2em;
    border-bottom: 1px solid #ccc;
}

h3 {
    font-family: 'Noto Sans CJK JP', 'Hiragino Kaku Gothic ProN', sans-serif;
    font-size: 18px;
    font-weight: bold;
    margin-top: 1.5em;
    margin-bottom: 0.4em;
}

h4 {
    font-family: 'Noto Sans CJK JP', 'Hiragino Kaku Gothic ProN', sans-serif;
    font-size: 16px;
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
    font-size: 15px;
}

th, td {
    border: 1px solid #999;
    padding: 8px 12px;
    text-align: left;
}

th {
    background-color: #f0f0f0;
    font-weight: bold;
}

hr {
    border: none;
    border-top: 1px solid #ccc;
    margin: 2em 0;
}

code {
    font-family: 'UDEV Gothic NF', 'Cica', monospace;
    font-size: 14px;
    background-color: #f5f5f5;
    padding: 0.15em 0.3em;
    border-radius: 3px;
}

pre {
    background-color: #f5f5f5;
    padding: 1em;
    overflow-x: auto;
    font-size: 14px;
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

a {
    color: #2563eb;
    text-decoration: none;
}

a:hover {
    text-decoration: underline;
}

sub {
    font-size: 12px;
    color: #888;
}

@media (max-width: 600px) {
    .container {
        padding: 16px 16px 48px;
    }

    h1 {
        font-size: 22px;
    }

    h2 {
        font-size: 19px;
    }

    h3 {
        font-size: 16px;
    }

    table {
        font-size: 13px;
    }

    th, td {
        padding: 6px 8px;
    }
}
"""


def rewrite_image_paths(html: str, images_dir: str) -> str:
    """Rewrite image paths from images/XX.png to docs-images/XX.png."""
    html = re.sub(
        r'src="images/([^"]*)"',
        rf'src="/{images_dir}/\1"',
        html,
    )
    html = re.sub(
        r'!\[([^\]]*)\]\(images/([^)]*)\)',
        rf'![\1](/{images_dir}/\2)',
        html,
    )
    return html


def rewrite_app_links(html: str) -> str:
    """Rewrite relative app links to absolute root paths."""
    html = html.replace('../local_app/index.html', '/')
    html = html.replace('./index.html', '/')
    return html


def extract_title(md_content: str) -> str:
    """Extract the first H1 heading as the page title."""
    match = re.search(r'^#\s+(.+)$', md_content, re.MULTILINE)
    if match:
        return match.group(1).strip()
    return 'Pado'


def extract_description(md_content: str) -> str:
    """Extract a short description from the first paragraph."""
    lines = md_content.split('\n')
    for line in lines:
        line = line.strip()
        if line and not line.startswith('#') and not line.startswith('---') and not line.startswith('|'):
            clean = re.sub(r'\*\*([^*]+)\*\*', r'\1', line)
            clean = re.sub(r'<[^>]+>', '', clean)
            if len(clean) > 10:
                return clean[:160]
    return 'Pado — 個人事業主・小規模事業者向けの帳票管理アプリ'


def markdown_to_html(md_file: str, html_file: str, images_dir: str = 'docs-images') -> str:
    md_path = Path(md_file).resolve()
    if not md_path.exists():
        print(f"Error: ファイルが見つかりません: {md_file}", file=sys.stderr)
        sys.exit(1)

    html_path = Path(html_file).resolve()

    # Markdown → HTML
    md = MarkdownIt('commonmark', {'html': True})
    md.enable('table')
    md_content = md_path.read_text(encoding='utf-8')
    html_body = md.render(md_content)

    # Rewrite paths
    html_body = rewrite_image_paths(html_body, images_dir)
    html_body = rewrite_app_links(html_body)

    title = extract_title(md_content)
    description = extract_description(md_content)

    full_html = f"""<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{title} — Pado</title>
<meta name="description" content="{description}">
<meta property="og:title" content="{title} — Pado">
<meta property="og:description" content="{description}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Pado 帳票管理">
<link rel="icon" href="/icons/favicon-32.png" type="image/png">
<style>{CSS_STYLES}</style>
</head>
<body>
<div class="container">
<nav class="back-link"><a href="/">\u2190 Pado \u30a2\u30d7\u30ea\u306b\u623b\u308b</a></nav>
{html_body}
</div>
</body>
</html>"""

    html_path.parent.mkdir(parents=True, exist_ok=True)
    html_path.write_text(full_html, encoding='utf-8')

    return str(html_path)


def main():
    parser = argparse.ArgumentParser(description='Markdown to HTML converter for web publishing')
    parser.add_argument('input', help='Input markdown file')
    parser.add_argument('output', help='Output HTML file')
    parser.add_argument('--images-dir', default='docs-images',
                        help='Image directory path relative to web root (default: docs-images)')
    args = parser.parse_args()

    output = markdown_to_html(args.input, args.output, args.images_dir)
    print(f"生成完了: {output}")


if __name__ == "__main__":
    main()

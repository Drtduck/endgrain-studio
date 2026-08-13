"""Собирает самодостаточный HTML из markdown-инструкции для рабочего стола."""
import html
import os
import re
import sys

import markdown

SRC = sys.argv[1]
DST = sys.argv[2]

text = open(SRC, encoding="utf-8").read()
title = re.search(r"^#\s+(.+)$", text, re.M).group(1).strip()

# Чекбоксы markdown в настоящие input, чтобы список можно было отмечать мышью.
body = markdown.markdown(text, extensions=["tables", "fenced_code", "toc", "sane_lists"])
body = body.replace("<li>[ ] ", '<li class="task"><input type="checkbox"> ')
body = body.replace("<li>[x] ", '<li class="task"><input type="checkbox" checked> ')

PAGE = """<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<style>
  :root {{
    color-scheme: light;
    --bg: #f0ede7;
    --surface: #faf8f5;
    --ink: #2b251f;
    --ink-soft: #5a4e42;
    --line: #ddd5c9;
    --accent: #14594a;
    --warn-bg: #fdf3e3;
    --warn-line: #e6c98a;
  }}
  * {{ box-sizing: border-box; }}
  body {{
    margin: 0;
    padding: 40px 20px 80px;
    background: var(--bg);
    color: var(--ink);
    font: 17px/1.65 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }}
  main {{
    max-width: 820px;
    margin: 0 auto;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 14px;
    padding: 40px 44px 56px;
    box-shadow: 0 12px 40px rgba(43, 37, 31, .07);
  }}
  h1 {{ font-size: 30px; line-height: 1.25; margin: 0 0 28px; }}
  h2 {{ font-size: 23px; margin: 44px 0 14px; padding-top: 20px; border-top: 1px solid var(--line); }}
  h3 {{ font-size: 19px; margin: 30px 0 10px; color: var(--ink-soft); }}
  p, li {{ margin: 10px 0; }}
  a {{ color: var(--accent); }}
  code {{
    background: #efe9e0;
    border-radius: 4px;
    padding: 2px 5px;
    font: 14px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;
    word-break: break-word;
  }}
  pre {{
    background: #26211c;
    color: #f2ece3;
    border-radius: 10px;
    padding: 16px 18px;
    overflow-x: auto;
  }}
  pre code {{ background: none; color: inherit; padding: 0; }}
  .table-wrap {{ overflow-x: auto; margin: 18px 0; }}
  table {{ border-collapse: collapse; width: 100%; font-size: 15px; }}
  th, td {{ border: 1px solid var(--line); padding: 9px 12px; text-align: left; vertical-align: top; }}
  th {{ background: #efe9e0; }}
  blockquote {{
    margin: 18px 0;
    padding: 12px 18px;
    background: var(--warn-bg);
    border-left: 4px solid var(--warn-line);
    border-radius: 0 8px 8px 0;
  }}
  li.task {{ list-style: none; margin-left: -22px; }}
  li.task input {{ margin-right: 9px; transform: translateY(1px); }}
  footer {{
    max-width: 820px;
    margin: 20px auto 0;
    color: var(--ink-soft);
    font-size: 13px;
    text-align: right;
  }}
  @media print {{
    body {{ background: #fff; padding: 0; }}
    main {{ border: 0; box-shadow: none; padding: 0; }}
  }}
</style>
</head>
<body>
<main>
{body}
</main>
<footer>Источник: {src} в репозитории endgrain-studio</footer>
</body>
</html>
"""

body = body.replace("<table>", '<div class="table-wrap"><table>').replace("</table>", "</table></div>")
page = PAGE.format(title=html.escape(title), body=body, src=html.escape(os.path.relpath(SRC, os.getcwd())))
os.makedirs(os.path.dirname(DST), exist_ok=True)
open(DST, "w", encoding="utf-8").write(page)
print(DST, os.path.getsize(DST), "байт")

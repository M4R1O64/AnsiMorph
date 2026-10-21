#!/usr/bin/env python3
"""Extract every Korean UI string from index.html (or app.html) as translation keys.

Usage: python3 tools/i18n-extract.py [app.html] > i18n/keys.json
Sources:
  - static HTML text nodes and title/placeholder/aria-label attributes (before the main <script>)
  - T('...') / __t('...') call arguments in the script (may contain {placeholders})
  - other Korean string literals in the script (static strings that end up in the DOM;
    HTML snippets are split into their text nodes)
Console messages and thrown errors are skipped.
"""
import json, re, sys
from html.parser import HTMLParser

HANGUL = re.compile(r'[가-힣]')

class TextGrab(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out = []; self.skip = 0
    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style'): self.skip += 1
        for k, v in attrs:
            if k in ('title', 'placeholder', 'aria-label') and v and HANGUL.search(v): self.out.append(v.strip())
    def handle_endtag(self, tag):
        if tag in ('script', 'style') and self.skip: self.skip -= 1
    def handle_data(self, d):
        if self.skip: return
        t = d.strip()
        if t and HANGUL.search(t): self.out.append(t)

def html_texts(fragment):
    g = TextGrab(); g.feed(fragment); g.close(); return g.out

def js_unescape(s):
    return s.encode('utf-8').decode('unicode_escape').encode('latin-1').decode('utf-8') if '\\' in s else s

def main():
    path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
    src = open(path, encoding='utf-8').read()
    body = src.index('<body')
    mscript = src.index('<script>', body)
    keys = []
    keys += html_texts(src[body:mscript])
    js = src[mscript:]
    # main page script only (stop at the exported-HTML template / end)
    lines = js.split('\n')
    lit = re.compile(r"(?:__t|\bT)\(\s*'((?:[^'\\]|\\.)*)'|(?:__t|\bT)\(\s*\"((?:[^\"\\]|\\.)*)\"")
    anylit = re.compile(r"'((?:[^'\\\n]|\\.)*)'|\"((?:[^\"\\\n]|\\.)*)\"|`([^`$]*)`")
    for ln in lines:
        t = ln.strip()
        if t.startswith('//') or not HANGUL.search(ln) or '/*I18N_BEGIN*/' in ln: continue   # (skip the embedded dictionary itself)
        code = ln
        # drop trailing line comments (heuristic: ' // ' outside quotes)
        m = re.search(r"\s//\s", code)
        if m:
            before = code[:m.start()]
            if before.count("'") % 2 == 0 and before.count('"') % 2 == 0 and before.count('`') % 2 == 0:
                code = before
        if re.search(r'console\.(warn|error|log)|new Error\(', code):
            # keep only T() args on such lines
            for a, b in lit.findall(code):
                x = js_unescape(a or b)
                if HANGUL.search(x): keys.append(x)
            continue
        for a, b in lit.findall(code):
            x = js_unescape(a or b)
            if HANGUL.search(x): keys.append(x)
        for a, b, c in anylit.findall(code):
            x = a or b or c
            if not x or not HANGUL.search(x): continue
            x = js_unescape(x)
            if '<' in x and '>' in x: keys += html_texts(x)
            else: keys.append(x.strip() if x.strip() == x.strip() else x)
    seen = set(); out = []
    for k in keys:
        k2 = k if k.strip() == k else k  # keep exact (leading ' · ' etc. matter for T keys)
        if k2 not in seen: seen.add(k2); out.append(k2)
    json.dump(out, sys.stdout, ensure_ascii=False, indent=1)
    sys.stderr.write(f'{len(out)} keys\n')

main()

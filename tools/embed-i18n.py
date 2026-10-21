#!/usr/bin/env python3
"""Embed i18n/*.json translations into the app (between /*I18N_BEGIN*/ and /*I18N_END*/).

Usage: python3 tools/embed-i18n.py [index.html]
Each i18n/<lang>.json maps the Korean source string to its translation.
"""
import json, os, sys
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(root, 'index.html')
d = {}
for f in sorted(os.listdir(os.path.join(root, 'i18n'))):
    if f.endswith('.json') and f != 'keys.json':
        d[f[:-5]] = json.load(open(os.path.join(root, 'i18n', f), encoding='utf-8'))
src = open(path, encoding='utf-8').read()
a, b = '/*I18N_BEGIN*/', '/*I18N_END*/'
i, j = src.index(a) + len(a), src.index(b)
blob = json.dumps(d, ensure_ascii=False, separators=(',', ':'))
blob = blob.replace('</', '<\\/')   # never close the <script> early
src = src[:i] + blob + src[j:]
open(path, 'w', encoding='utf-8').write(src)
print(f'embedded {", ".join(f"{k}:{len(v)}" for k, v in d.items())} into {os.path.basename(path)}')

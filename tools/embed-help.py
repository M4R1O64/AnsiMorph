#!/usr/bin/env python3
"""Embed the help screenshots into the app (between /*HELP_SHOTS*/ and /*HELP_SHOTS_END*/).

Usage: python3 tools/embed-help.py index.html [raw_png_dir]
With raw_png_dir, the PNGs from tools/help-shots.js are first shrunk to help/<lang>_<name>.webp.
"""
import sys, os, re, json, base64, glob
from PIL import Image

app = sys.argv[1]
root = os.path.dirname(os.path.abspath(app))
hd = os.path.join(root, 'help')
os.makedirs(hd, exist_ok=True)
if len(sys.argv) > 2:
    for f in sorted(glob.glob(os.path.join(sys.argv[2], '*.png'))):
        im = Image.open(f).convert('RGB')
        w, h = im.size
        css = w / 2                       # shots are taken at 2x
        tw = min(w, int(css * 1.5), 1100)   # keep 1.5x for sharp text on HiDPI screens
        if tw < w:
            im = im.resize((tw, round(h * tw / w)), Image.LANCZOS)
        out = os.path.join(hd, os.path.basename(f)[:-4] + '.webp')
        im.save(out, 'WEBP', quality=64, method=6)
        with open(out + '.w', 'w') as fw:   # display width in CSS px
            fw.write(str(round(css)))
data, total = {}, 0
for f in sorted(glob.glob(os.path.join(hd, '*.webp'))):
    lang, name = os.path.basename(f)[:-5].split('_', 1)
    b = open(f, 'rb').read()
    total += len(b)
    w = int(open(f + '.w').read()) if os.path.exists(f + '.w') else 0
    data.setdefault(lang, {})[name] = ['data:image/webp;base64,' + base64.b64encode(b).decode(), w]
s = open(app, encoding='utf-8').read()
js = json.dumps(data, separators=(',', ':'))
s2, n = re.subn(r'/\*HELP_SHOTS\*/.*?/\*HELP_SHOTS_END\*/', lambda m: '/*HELP_SHOTS*/' + js + '/*HELP_SHOTS_END*/', s, flags=re.S)
assert n == 1, n
open(app, 'w', encoding='utf-8').write(s2)
print(f'embedded {sum(len(v) for v in data.values())} shots ({total / 1024:.0f} KB webp) into {app}')

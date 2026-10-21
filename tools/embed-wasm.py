#!/usr/bin/env python3
"""Embed wasm/kern.wasm (built by wasm/build.sh) into index.html as base64 (const KERN_B64 = '...').

Usage: python3 tools/embed-wasm.py [index.html]
"""
import base64, os, sys
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(root, 'index.html')
b64 = base64.b64encode(open(os.path.join(root, 'wasm', 'kern.wasm'), 'rb').read()).decode('ascii')
src = open(path, encoding='utf-8').read()
tag = "const KERN_B64 = '"
i = src.index(tag) + len(tag); j = src.index("'", i)
open(path, 'w', encoding='utf-8').write(src[:i] + b64 + src[j:])
print(f'embedded kern.wasm ({len(b64)} base64 chars) into {os.path.basename(path)}')

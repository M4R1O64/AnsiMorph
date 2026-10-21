#!/bin/sh
# Build the WebAssembly SIMD core (glyph features, exact error, line DP) and embed it into index.html.
# Needs clang with the wasm32 target and wasm-ld (e.g. LLVM 15+).
set -e
cd "$(dirname "$0")"
clang --target=wasm32 -O3 -msimd128 -nostdlib -fno-builtin -Wl,--no-entry -Wl,--import-memory -Wl,--export-dynamic -o kern.wasm kern.c dp.c
ls -la kern.wasm
python3 ../tools/embed-wasm.py

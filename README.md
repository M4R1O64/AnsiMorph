# AnsiMorph

Turn images into colored ANSI art that fits in a single Discord message.

**English** · [한국어](README.ko.md) · [日本語](README.ja.md)

![AnsiMorph screenshot](docs/screenshot-en.png)

## Features

- Four modes: Braille dots, half blocks, text/ASCII glyph matching, vector edges
- 16-color, truecolor and optional 256-color output for Discord ` ```ansi ` blocks
- Always fits the character limit (2,000 by default) by optimizing where colors change
- **✦ Find best settings** suggests column count, colors and preprocessing for the limit
- Shows the error versus the original after every change
- Runs entirely in the browser (WebAssembly + background worker); images are never uploaded
- English, 한국어, 日本語

## Usage

1. Open `index.html` in a browser.
2. Drop, paste or pick an image.
3. Choose a mode and color mode, or press **✦ Find best settings** and pick a card.
4. Press **Copy Discord ANSI** and paste into Discord.

Truecolor and 256-color support depends on the Discord client; 16-color codes are the most widely supported.

## Development

- No build step: the whole app is `index.html`.
- WebAssembly core: `wasm/` — rebuild and embed with `sh wasm/build.sh` (clang with the `wasm32` target).
- Translations: edit `i18n/*.json`, then run `python3 tools/embed-i18n.py`.
- Tests: `npm install && npm test`.

## License

[MIT](LICENSE). Screenshot photo: “Chelsea” by Stéfan van der Walt (CC0), from scikit-image.

(function () {
  function axisWeights(sN, dN) {
    const start = new Int32Array(dN), count = new Int32Array(dN), idx = [], wts = [];
    const sc = sN / dN;
    for (let d = 0; d < dN; d++) {
      start[d] = idx.length;
      if (sc >= 1) {
        const a = d * sc, b = a + sc;
        for (let s = Math.floor(a); s < b && s < sN; s++) { const w = Math.min(b, s + 1) - Math.max(a, s); if (w > 1e-9) { idx.push(s); wts.push(w / sc); } }
      } else {
        const p = (d + 0.5) * sc - 0.5, i0 = Math.floor(p), t = p - i0;
        const c0 = Math.max(0, Math.min(sN - 1, i0)), c1 = Math.max(0, Math.min(sN - 1, i0 + 1));
        if (c0 === c1) { idx.push(c0); wts.push(1); } else { idx.push(c0, c1); wts.push(1 - t, t); }
      }
      count[d] = idx.length - start[d];
    }
    return { start, count, idx: Int32Array.from(idx), w: Float32Array.from(wts) };
  }
  function resample(src, dw, dh) {
    const sw = src.w, sh = src.h, s = src.data;
    const out = new Float32Array(dw * dh * 3);
    const AX = axisWeights(sw, dw), AY = axisWeights(sh, dh);
    const tmp = new Float32Array(dw * sh * 3);
    for (let y = 0; y < sh; y++) for (let dx = 0; dx < dw; dx++) {
      let r = 0, g = 0, b = 0; const st = AX.start[dx], n = AX.count[dx];
      for (let k = 0; k < n; k++) { const i = (y * sw + AX.idx[st + k]) * 4, w = AX.w[st + k]; r += s[i] * w; g += s[i + 1] * w; b += s[i + 2] * w; }
      const t = (y * dw + dx) * 3; tmp[t] = r; tmp[t + 1] = g; tmp[t + 2] = b;
    }
    for (let dy = 0; dy < dh; dy++) { const st = AY.start[dy], n = AY.count[dy];
      for (let dx = 0; dx < dw; dx++) { let r = 0, g = 0, b = 0;
        for (let k = 0; k < n; k++) { const t = (AY.idx[st + k] * dw + dx) * 3, w = AY.w[st + k]; r += tmp[t] * w; g += tmp[t + 1] * w; b += tmp[t + 2] * w; }
        const o = (dy * dw + dx) * 3; out[o] = r; out[o + 1] = g; out[o + 2] = b; } }
    return out;
  }
  // sRGB 감마 공간 평균 대신 선형광 평균이 눈에 보이는 혼합에 가깝다 → 비교 전 선형화 후 평균, 다시 감마
  const LIN = new Float32Array(256); for (let i = 0; i < 256; i++) { const c = i / 255; LIN[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  const toLin = (d) => { const o = new Float32Array(d.length); for (let i = 0; i < d.length; i++) o[i] = (i & 3) === 3 ? 255 : LIN[d[i]] * 255; return o; };
  const gam = (v) => { const c = Math.max(0, v / 255); return 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055); };
  function srcData() {
    if (window.__evSrc) return window.__evSrc;
    const img = state.image, W = img.naturalWidth, H = img.naturalHeight;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const c = cv.getContext('2d'); c.drawImage(img, 0, 0);
    return (window.__evSrc = { w: W, h: H, data: toLin(c.getImageData(0, 0, W, H).data) });
  }
  function parseAnsi(text) {
    // ```ansi\n ... ``` → 줄별 [{ch, fg, bg}]
    let body = text.replace(/^```ansi\n/, '').replace(/```$/, '');
    const lines = body.split('\n'); if (lines[lines.length - 1] === '') lines.pop();
    const DF = DEF_FG, DB = null;
    let fg = null, bg = null;
    const x256 = (n) => { if (n >= 232) { const v = 8 + 10 * (n - 232); return { r: v, g: v, b: v }; } n -= 16; const C = [0, 95, 135, 175, 215, 255]; return { r: C[(n / 36) | 0], g: C[((n / 6) | 0) % 6], b: C[n % 6] }; };
    const RP = window.__REAL;   // 실측 디스코드 렌더링 (코드 → 색), 없으면 앱 팔레트
    const look = (code) => { if (RP) { const v = RP.pal[code % 10 + (code >= 40 && code < 50 ? 40 : 30)]; return (code >= 90) ? null : (v ? { r: v[0], g: v[1], b: v[2] } : null); } const e = ENTRY_BY_CODE.get(code); return e ? { r: e.r, g: e.g, b: e.b } : null; };
    const out = [];
    for (const ln of lines) {
      const row = [];
      for (let i = 0; i < ln.length; i++) {
        if (ln.charCodeAt(i) === 27) {
          const j = ln.indexOf('m', i); const ps = ln.slice(i + 2, j).split(';').map(Number); i = j;
          for (let k = 0; k < ps.length; k++) {
            const p = ps[k];
            if (p === 0) { fg = null; bg = null; }
            else if (p === 38 || p === 48) {
              let c; if (ps[k + 1] === 2) { c = { r: ps[k + 2], g: ps[k + 3], b: ps[k + 4] }; k += 4; } else { c = x256(ps[k + 2]); k += 2; }
              if (p === 38) fg = c; else bg = c;
            } else if ((p >= 30 && p <= 37) || (p >= 90 && p <= 97)) fg = look(p);
            else if ((p >= 40 && p <= 47) || (p >= 100 && p <= 107)) bg = look(p);
          }
          continue;
        }
        row.push({ ch: ln[i], fg, bg });
      }
      if (!state.carryAnsi) { fg = null; bg = null; }
      out.push(row);
    }
    return out;
  }
  window.__evPrep = function (c, extra) {
    state.noRenderWorker = true;
    if (!window.__evBase) { window.__evBase = {}; for (const [k, v] of Object.entries(state)) if (v === null || ['string', 'number', 'boolean'].includes(typeof v)) window.__evBase[k] = v; }
    for (const k of Object.keys(state)) if (!(k in window.__evBase) && (state[k] === null || ['string', 'number', 'boolean'].includes(typeof state[k])) && !['imageLoaded', 'lastAnsiText', 'lastLambda'].includes(k)) delete state[k];
    Object.assign(state, window.__evBase, { targetLen: 2000, alignStrength: 100, alignOn: true }, extra, c);
    rebuildEntryMap();
    if (state.colorMode !== 'discord_true') setPaletteSet(state.paletteSet || 'ext16');
    if (window.__REAL && window.__REAL.engine && !window.__engPatched) {
      // 엔진도 실측값으로: 팔레트(30~37/40~47 만), 기본 배경·글자색, 배경이 줄 전체를 덮음
      const P = window.__REAL.pal;
      const fg = [], bg = [];
      for (let i = 0; i < 8; i++) { fg.push({ code: 30 + i, r: P[30 + i][0], g: P[30 + i][1], b: P[30 + i][2] }); bg.push({ code: 40 + i, r: P[40 + i][0], g: P[40 + i][1], b: P[40 + i][2] }); }
      PALETTE_SETS.real = { fg, bg }; window.__engPatched = true;
      DEF_BG.r = window.__REAL.bg[0]; DEF_BG.g = window.__REAL.bg[1]; DEF_BG.b = window.__REAL.bg[2];
      DEF_FG.r = window.__REAL.fg[0]; DEF_FG.g = window.__REAL.fg[1]; DEF_FG.b = window.__REAL.fg[2];
      _DEFL = null;
    }
    if (window.__REAL && window.__REAL.engine) {
      if (state.colorMode !== 'discord_true') setPaletteSet('real');
      const cm = measureCellModel(); const one = (a) => a.map(() => 1);
      cm.br.b = one(cm.br.b); cm.hb.b = one(cm.hb.b); cm.gl.b = one(cm.gl.b); if (cm.hb4) cm.hb4.b = one(cm.hb4.b);
      state.cellModel = cm;
    }
    buildGlyphLibrary();
    const t0 = performance.now();
    processAndRenderASCII();
    const ms = performance.now() - t0;
    const text = state.lastAnsiText;
    const rows = parseAnsi(text);
    window.__evRows = rows;
    let ov = document.getElementById('__ev');
    if (!ov) { ov = document.createElement('div'); ov.id = '__ev'; document.body.appendChild(ov); }
    const RB = window.__REAL ? window.__REAL.bg : [DEF_BG.r, DEF_BG.g, DEF_BG.b], RF = window.__REAL ? window.__REAL.fg : [DEF_FG.r, DEF_FG.g, DEF_FG.b];
    ov.style.cssText = `position:fixed;left:0;top:0;z-index:2147483647;margin:0;padding:0;background:rgb(${RB[0]},${RB[1]},${RB[2]});color:rgb(${RF[0]},${RF[1]},${RF[2]});font:14px/18px ${DISCORD_CODE_FONT};white-space:pre;width:1800px;height:1400px;overflow:hidden;font-kerning:none;`;
    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    let html = '';
    for (const r of rows) {
      let cur = null, run = '';
      const SP = window.__REAL ? 'display:inline-block;height:18px;vertical-align:top;' : '';
      const flush = () => { if (run) html += cur ? `<span style="${SP}${cur}">${esc(run)}</span>` : esc(run); run = ''; };
      for (const c of r) {
        const st = (c.fg ? `color:rgb(${c.fg.r},${c.fg.g},${c.fg.b});` : '') + (c.bg ? `background:rgb(${c.bg.r},${c.bg.g},${c.bg.b});` : '');
        if (st !== cur) { flush(); cur = st; }
        run += c.ch;
      }
      flush(); html += '\n';
    }
    ov.innerHTML = html;
    const cols = state.resolution, nrows = rows.length;
    const sp = document.createElement('span'); sp.textContent = (state.algorithm === 'braille' ? '⣿' : state.algorithm === 'half_block' ? '█' : 'M').repeat(50); ov.appendChild(sp);
    const cw = sp.getBoundingClientRect().width / 50; sp.remove();
    return { W: Math.round(cols * cw), H: nrows * 18, cols, rows: nrows, len: text.length, ms, cw };
  };
  function ssimL(A, B, w, h) {
    // 휘도 SSIM (7×7 상자 창, 겹침 이동 2칸)
    const la = new Float32Array(w * h), lb = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) { la[i] = 0.299 * A[i * 3] + 0.587 * A[i * 3 + 1] + 0.114 * A[i * 3 + 2]; lb[i] = 0.299 * B[i * 3] + 0.587 * B[i * 3 + 1] + 0.114 * B[i * 3 + 2]; }
    const C1 = (0.01 * 255) ** 2, C2 = (0.03 * 255) ** 2, R = 3;
    let s = 0, n = 0;
    for (let y = R; y < h - R; y += 2) for (let x = R; x < w - R; x += 2) {
      let ma = 0, mb = 0, va = 0, vb = 0, cv = 0, k = 0;
      for (let yy = y - R; yy <= y + R; yy++) for (let xx = x - R; xx <= x + R; xx++) { const a = la[yy * w + xx], b = lb[yy * w + xx]; ma += a; mb += b; va += a * a; vb += b * b; cv += a * b; k++; }
      ma /= k; mb /= k; va = va / k - ma * ma; vb = vb / k - mb * mb; cv = cv / k - ma * mb;
      s += ((2 * ma * mb + C1) * (2 * cv + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2)); n++;
    }
    return n ? s / n : 1;
  }
  window.__evScore = async function (b64, info) {
    const im = new Image(); im.src = 'data:image/png;base64,' + b64; await im.decode();
    const cv = document.createElement('canvas'); cv.width = im.width; cv.height = im.height;
    const x = cv.getContext('2d'); x.drawImage(im, 0, 0);
    const shot = { w: im.width, h: im.height, data: toLin(x.getImageData(0, 0, im.width, im.height).data) };
    const src = srcData();
    const res = {};
    // 고정 축척: 열 수와 무관하게 가로 96 / 192 로 줄여 비교 (열 수가 다른 결과끼리 비교용)
    { const FW = 96, FH = Math.max(1, Math.round(FW * src.h / src.w));
      const a = resample(shot, FW, FH), s2 = resample(src, FW, FH);
      for (let i = 0; i < a.length; i++) { a[i] = gam(a[i]); s2[i] = gam(s2[i]); }
      let sum = 0; for (let i = 0; i < a.length; i += 3) { const dr = a[i] - s2[i], dg = a[i + 1] - s2[i + 1], db = a[i + 2] - s2[i + 2]; sum += Math.sqrt(0.3 * dr * dr + 0.59 * dg * dg + 0.11 * db * db); }
      res.fix = sum / (a.length / 3);
      const GW = 192, GH = Math.max(1, Math.round(GW * src.h / src.w));
      const b = resample(shot, GW, GH), t = resample(src, GW, GH);
      for (let i = 0; i < b.length; i++) { b[i] = gam(b[i]); t[i] = gam(t[i]); }
      res.ssimFix = ssimL(b, t, GW, GH); }
    // 정밀 축척 (v20): 칸당 4×8 · 8×16 — 글자 모양 세부(획)까지 보는 비교
    for (const [nm, fx, fy] of [['mid', 4, 8], ['fine', 8, 16]]) {
      const w = info.cols * fx, h = info.rows * fy;
      const a = resample(shot, w, h), s2 = resample(src, w, h);
      for (let i = 0; i < a.length; i++) { a[i] = gam(a[i]); s2[i] = gam(s2[i]); }
      let sum = 0; for (let i = 0; i < a.length; i += 3) { const dr = a[i] - s2[i], dg = a[i + 1] - s2[i + 1], db = a[i + 2] - s2[i + 2]; sum += Math.sqrt(0.3 * dr * dr + 0.59 * dg * dg + 0.11 * db * db); }
      res[nm + 'E'] = sum / (a.length / 3); res[nm + 'S'] = ssimL(a, s2, w, h);
    }
    for (const [name, w, h] of [['dot', info.cols * 2, info.rows * 4], ['cell', info.cols, info.rows]]) {
      const a = resample(shot, w, h), s = resample(src, w, h);
      for (let i = 0; i < a.length; i++) { a[i] = gam(a[i]); s[i] = gam(s[i]); }
      let sum = 0;
      for (let i = 0; i < a.length; i += 3) { const dr = a[i] - s[i], dg = a[i + 1] - s[i + 1], db = a[i + 2] - s[i + 2]; sum += Math.sqrt(0.3 * dr * dr + 0.59 * dg * dg + 0.11 * db * db); }
      res[name] = sum / (a.length / 3);
      if (name === 'cell') { let bL = 0, bC = 0; for (let i = 0; i < a.length; i += 3) { const la = 0.299 * a[i] + 0.587 * a[i + 1] + 0.114 * a[i + 2], ls = 0.299 * s[i] + 0.587 * s[i + 1] + 0.114 * s[i + 2]; bL += la - ls; const ca = Math.hypot(a[i] - la, a[i + 2] - la), cs = Math.hypot(s[i] - ls, s[i + 2] - ls); bC += ca - cs; } res.biasL = bL / (a.length / 3); res.biasC = bC / (a.length / 3); }
      { let ok = 0; for (let i = 0; i < a.length; i += 3) { const p = oklab(a[i], a[i + 1], a[i + 2]), q = oklab(s[i], s[i + 1], s[i + 2]); ok += Math.sqrt(labDsq(p, q)) * 100; } res['ok' + name] = ok / (a.length / 3); }
      if (name === 'dot') res.ssim = ssimL(a, s, w, h);
      if (name === 'dot' && (state.algorithm === 'braille' || state.algorithm === 'half_block') && window.__evPredict) {
        const HB = state.algorithm === 'half_block';
        const R = window.__evRows, CM = cellModel(); const DB = DEF_BG;
        for (const lm of [true, false]) {
          state.linearMix = lm; let e = 0, n = 0; const o = [0, 0, 0];
          for (let y = 0; y < info.rows; y++) for (let x = 0; x < info.cols; x++) {
            const c = R[y] && R[y][x]; const ch = c ? c.ch : ' '; const code = (ch === ' ' || ch === '\u2800') ? 0 : (ch.charCodeAt(0) - 0x2800) & 255;
            const fg = (c && c.fg) || DEF_FG, bg = (c && c.bg) || DB;
            if (HB) {
              for (let hh = 0; hh < 4; hh++) { const half = hh < 2 ? 0 : 1; const on = ch === '\u2588' || (half === 0 ? ch === '\u2580' : ch === '\u2584');
                dispMix({ r: fg.r, g: fg.g, b: fg.b }, { r: bg.r, g: bg.g, b: bg.b }, on ? CM.hb.a[half] : 0, (c && c.bg) ? CM.hb.b[half] : 0, o);
                for (let dx = 0; dx < 2; dx++) { const i = ((y * 4 + hh) * w + x * 2 + dx) * 3; const dr = o[0] - a[i], dg = o[1] - a[i + 1], db = o[2] - a[i + 2]; e += Math.sqrt(.3 * dr * dr + .59 * dg * dg + .11 * db * db); n++; } }
            } else
            for (let d = 0; d < 8; d++) { const X = x * 2 + BR_DX[d], Y = y * 4 + BR_DY[d], rg = BR_DY[d] * 2 + BR_DX[d];
              dispMix({ r: fg.r, g: fg.g, b: fg.b }, { r: bg.r, g: bg.g, b: bg.b }, (code & BR_BIT[d]) ? CM.br.a[rg] : 0, (c && c.bg) ? CM.br.b[rg] : 0, o);
              const i = (Y * w + X) * 3; const dr = o[0] - a[i], dg = o[1] - a[i + 1], db = o[2] - a[i + 2]; e += Math.sqrt(.3 * dr * dr + .59 * dg * dg + .11 * db * db); n++; }
          }
          res[lm ? 'predLin' : 'predS'] = e / n;
        }
        state.linearMix = undefined;
      }
      if (name === 'dot' && state.algorithm === 'hog_ssim' && window.__evPredict) for (const LMX of [false, true]) { state.linearMix = LMX;
        const R = window.__evRows, CM = cellModel(); const DB = DEF_BG; let e = 0, n = 0; const o = [0, 0, 0];
        for (let y = 0; y < info.rows; y++) for (let x = 0; x < info.cols; x++) {
          const c = R[y] && R[y][x]; const ch = c ? c.ch : ' '; const blank = ch === ' ';
          const fg = (c && c.fg) || DEF_FG, bg = (c && c.bg) || DB;
          const cov = blank ? null : (ch === '\u2588' ? null : state.glyphCov.get(ch));
          const acc = new Float64Array(24);
          for (let j = 0; j < 32; j++) { const row8 = (j / 4) | 0, col4 = j % 4; const a2 = blank ? 0 : (ch === '\u2588' ? CM.gl.full[row8] : (cov ? cov[j] : 0));
            dispMix({ r: fg.r, g: fg.g, b: fg.b }, { r: bg.r, g: bg.g, b: bg.b }, a2, (c && c.bg) ? CM.gl.b[row8] : 0, o);
            const bI = (row8 >> 1) * 2 + (col4 >> 1); acc[bI * 3] += o[0] / 4; acc[bI * 3 + 1] += o[1] / 4; acc[bI * 3 + 2] += o[2] / 4; }
          for (let bI = 0; bI < 8; bI++) { const X = x * 2 + (bI % 2), Y = y * 4 + (bI >> 1); const i = (Y * w + X) * 3; const dr = acc[bI * 3] - a[i], dg = acc[bI * 3 + 1] - a[i + 1], db = acc[bI * 3 + 2] - a[i + 2]; e += Math.sqrt(.3 * dr * dr + .59 * dg * dg + .11 * db * db); n++; }
        }
        res[state.linearMix === true ? 'predGlyphLin' : 'predGlyph'] = e / n;
      }
      if (name === 'dot' && state.algorithm === 'hog_ssim') state.linearMix = undefined;
    }
    return res;
  };
})();

// AnsiMorph v21 — 줄 단위 최적화(DP) 핵심 (app.html 의 dpOptimize JS 와 같은 계산 · 같은 순서 · 배정밀도)
typedef unsigned int u32;
__attribute__((import_module("env"), import_name("dotcb"))) extern int dotcb(int cell, int cf, int cb);   // JS: 이어 쓰기 후보 평가 (scratch 에 후보를 써 준다)

#define CAP 8192
#define HS 8192
#define NID 8192
#define SHS 256

static inline u32 hsh19(int key) { return ((u32)key * 2654435761u) >> 19; }
static inline u32 hsh24(int key) { return ((u32)key * 2654435761u) >> 24; }

// 작업 버퍼: JS 가 크기만큼 잡아 넘긴다. 앞부분 머리(세대 번호 등)는 실행 사이에 이어진다 (0 으로 시작)
typedef struct {
    int gen, sgen, vgen, pad;
} Head;

__attribute__((export_name("dp_worksize")))
int dp_worksize(int HB, int maxN) {
    long long b = 64;
    b += (long long)CAP * 4 * 7 + (long long)CAP * 8 * 2;      // nF nB nPrev nRf nRb nRef qIdx / nCost nLn
    b += (long long)HS * 4 * 4;                                // 해시 (세대, 키, 값, 빈칸) 묶음
    b += (long long)maxN * HB * 4 * 6;                         // hF hB hPrev hRf hRb hRef
    b += (long long)HB * (4 * 2 + 8 * 2) * 2 + HB * (4 + 8);   // p/q, sel/selC
    b += (long long)NID * 4 * 8 + SHS * 4 * 3;                 // stamps
    return (int)(b + 256);
}

#define AL8(p) (((p) + 7) & ~7)

__attribute__((export_name("dp_run")))
double dp_run(const int* PR, double lambda0) {
    const int nRows = PR[0];
    const int* rowLen = (const int*)PR[1];
    const int HB = PR[2], carry = PR[3], TAIL = PR[4], LEADG = PR[5], dual = PR[6];
    const double* lamRows = (const double*)PR[7];
    const double* cW = (const double*)PR[8]; const double* cEmin = (const double*)PR[9]; const double* cEBN = (const double*)PR[10];
    const int* cSt = (const int*)PR[11]; const int* cFxSt = (const int*)PR[12]; const int* cFxN = (const int*)PR[13];
    const int* cVrSt = (const int*)PR[14]; const int* cVrN = (const int*)PR[15]; const int* cFlags = (const int*)PR[16];
    const double* SE = (const double*)PR[17]; const double* SPEN = (const double*)PR[18];
    const int* SFI = (const int*)PR[19]; const int* SBI = (const int*)PR[20]; const int* SBL = (const int*)PR[21];
    const int* FXL = (const int*)PR[22]; const int* VRL = (const int*)PR[23];
    const int* lenById = (const int*)PR[24];
    char* W = (char*)PR[25];
    const int maxN = PR[26];
    int* outRef = (int*)PR[27]; int* outF = (int*)PR[28]; int* outB = (int*)PR[29];
    double* rowE = (double*)PR[30]; int* rowTail = (int*)PR[31];
    char* DC = (char*)PR[32]; const u32 dcSlots = (u32)PR[33]; char* SCR = (char*)PR[34];
    const int FAST = PR[35];
    int* dcCnt = (int*)PR[36];   // 칸별 캐시 개수

    Head* H = (Head*)W;
    char* q = W + 64;
    int* nF = (int*)q; q += CAP * 4; int* nB = (int*)q; q += CAP * 4; int* nPrev = (int*)q; q += CAP * 4; int* nRf = (int*)q; q += CAP * 4; int* nRb = (int*)q; q += CAP * 4; int* nRef = (int*)q; q += CAP * 4; int* qIdx = (int*)q; q += CAP * 4;
    q = (char*)AL8((u32)q);
    double* nCost = (double*)q; q += CAP * 8; double* nLn = (double*)q; q += CAP * 8;
    int* HT = (int*)q; q += HS * 16;   // [세대, 키, 값, -] × HS
    // v24: 세대 표시(stamp) 배열은 빔 폭과 무관한 위치에 — 같은 작업 공간을 더 작은 빔으로 다시 쓸 때, 빔 크기에 따라 위치가 바뀌면
    // 이전 호출의 다른 자료(hF 등)를 세대 표시로 잘못 읽어 엉뚱한 후보를 고를 수 있었다 (드물게 글자가 비는 오류)
    int* fG = (int*)q; q += NID * 4; int* fF1 = (int*)q; q += NID * 4; int* fF2 = (int*)q; q += NID * 4;
    int* bG = (int*)q; q += NID * 4; int* bF1 = (int*)q; q += NID * 4; int* bF2 = (int*)q; q += NID * 4;
    int* vbG = (int*)q; q += NID * 4; int* vbT = (int*)q; q += NID * 4;
    int* sKey = (int*)q; q += SHS * 4; int* sVal = (int*)q; q += SHS * 4; int* sGn = (int*)q; q += SHS * 4;
    int* hF = (int*)q; q += maxN * HB * 4; int* hB = (int*)q; q += maxN * HB * 4; int* hPrev = (int*)q; q += maxN * HB * 4;
    int* hRf = (int*)q; q += maxN * HB * 4; int* hRb = (int*)q; q += maxN * HB * 4; int* hRef = (int*)q; q += maxN * HB * 4;
    q = (char*)AL8((u32)q);
    double* pCost = (double*)q; q += HB * 8; double* pLn = (double*)q; q += HB * 8; double* qCost = (double*)q; q += HB * 8; double* qLn = (double*)q; q += HB * 8; double* selC = (double*)q; q += HB * 8;
    int* pF = (int*)q; q += HB * 4; int* pB = (int*)q; q += HB * 4; int* qF = (int*)q; q += HB * 4; int* qB = (int*)q; q += HB * 4; int* sel = (int*)q; q += HB * 4;

    double lambda = lamRows ? lamRows[0] : lambda0;
    double lim = 45 / (lambda > 1e-6 ? lambda : 1e-6);
    double total = 0; int carryF = 0, carryB = 0;
    int m = 0;
    int gen = H->gen;
    int cell0 = 0;

#define RELAX(si_, cf_, cb_, base_, bl_, ref_, blank_, f_, b_, ec_) do { \
        const int _cf = (cf_), _cb = (cb_), _f = (f_), _b = (b_), _bl = (blank_); \
        const int ff = _f < 0 ? _cf : _f, bb = _b < 0 ? _cb : _b; \
        const int wantF = _bl ? _cf : ff; \
        int xf, xb = bb; double len; \
        if ((_cb != 0 && bb == 0) || (_cf != 0 && wantF == 0)) { xf = _bl ? 0 : ff; len = 4 + (xf ? 1 + lenById[xf] : 0) + (bb ? 1 + lenById[bb] : 0); } \
        else { xf = wantF; len = 0; int cnt = 0; if (wantF != 0 && wantF != _cf) { len += lenById[wantF]; cnt++; } if (bb != 0 && bb != _cb) { len += lenById[bb]; cnt++; } if (cnt) len += cnt + 2; } \
        len += 1; \
        const double cost = (base_) + len + (ec_); \
        const int key = xf * 8192 + xb; u32 hp = hsh19(key); int done_ = 0; \
        while (HT[hp * 4] == gen) { if (HT[hp * 4 + 1] == key) { const int j = HT[hp * 4 + 2]; if (cost < nCost[j]) { nCost[j] = cost; nLn[j] = (bl_) + len; nPrev[j] = (si_); nRef[j] = (ref_); nRf[j] = _bl ? 0 : ff; nRb[j] = bb; } done_ = 1; break; } hp = (hp + 1) & (HS - 1); } \
        if (!done_ && m < CAP) { HT[hp * 4] = gen; HT[hp * 4 + 1] = key; HT[hp * 4 + 2] = m; nF[m] = xf; nB[m] = xb; nCost[m] = cost; nLn[m] = (bl_) + len; nPrev[m] = (si_); nRef[m] = (ref_); nRf[m] = _bl ? 0 : ff; nRb[m] = bb; m++; } \
    } while (0)

#define RELAXD(si_, xf_, xb_, cost_, ln_, ref_) do { \
        const int key = (xf_) * 8192 + (xb_); u32 hp = hsh19(key); int done_ = 0; const double cost = (cost_); \
        while (HT[hp * 4] == gen) { if (HT[hp * 4 + 1] == key) { const int j = HT[hp * 4 + 2]; if (cost < nCost[j]) { nCost[j] = cost; nLn[j] = (ln_); nPrev[j] = (si_); nRef[j] = (ref_); nRf[j] = (xf_); nRb[j] = (xb_); } done_ = 1; break; } hp = (hp + 1) & (HS - 1); } \
        if (!done_ && m < CAP) { HT[hp * 4] = gen; HT[hp * 4 + 1] = key; HT[hp * 4 + 2] = m; nF[m] = (xf_); nB[m] = (xb_); nCost[m] = cost; nLn[m] = (ln_); nPrev[m] = (si_); nRef[m] = (ref_); nRf[m] = (xf_); nRb[m] = (xb_); m++; } \
    } while (0)

    for (int y = 0; y < nRows; y++) {
        if (lamRows) { lambda = lamRows[y]; lim = 45 / (lambda > 1e-6 ? lambda : 1e-6); }
        const int n = rowLen[y];
        int np = 1;
        pF[0] = carry ? carryF : 0; pB[0] = carry ? carryB : 0; pCost[0] = 0; pLn[0] = 0;
        double tailCost = __builtin_inf(); int tailX = -1, tailS = -1; double tailLn = 0;
        if (carry && LEADG && carryB != 0 && n > 0 && cEBN[cell0] <= 20) { pF[0] = 0; pB[0] = 0; pCost[0] = 4; pLn[0] = 4; }
        for (int x = 0; x < n; x++) {
            const int c = cell0 + x;
            const double w = cW[c];
            if (TAIL) {
                const double eb = lambda * w * cEBN[c];
                const double tc = tailCost + eb;
                double be = __builtin_inf(); int bs = -1; double bl2 = 0;
                for (int si = 0; si < np; si++) {
                    if (pCost[si] >= be) break;
                    const double rs = (!carry && (pF[si] != 0 || pB[si] != 0)) ? 4 : 0;
                    const double cc = pCost[si] + rs;
                    if (cc < be) { be = cc; bs = si; bl2 = pLn[si] + rs; }
                }
                if (be + eb < tc) { tailCost = be + eb; tailX = x; tailS = bs; tailLn = bl2; }
                else tailCost = tc;
            }
            gen++; m = 0;
            const double lw = lambda * w;
            const double eLim = cEmin[c] + lim / w;
            const int st = cSt[c];
            const double* sE = SE + st; const double* sPen = SPEN + st; const int* sFi = SFI + st; const int* sBi = SBI + st; const int* sBl = SBL + st;
            const int* FX = FXL + cFxSt[c]; const int nFX = cFxN[c];
            const int* VR = VRL + cVrSt[c]; const int nVR = cVrN[c];
            const int flags = cFlags[c];
            const int fast = FAST && (nFX > 3 || nVR > 1);
            int firstNZ = -1;
            int sgen = 0;
            if (fast) {
                sgen = ++H->sgen;
                for (int si = 0; si < np; si++) {
                    const int f = pF[si], b = pB[si];
                    if (firstNZ < 0 && b != 0) firstNZ = si;
                    if (fG[f] != sgen) { fG[f] = sgen; fF1[f] = si; fF2[f] = -1; } else if (fF2[f] < 0) fF2[f] = si;
                    if (bG[b] != sgen) { bG[b] = sgen; bF1[b] = si; bF2[b] = -1; } else if (bF2[b] < 0) bF2[b] = si;
                    const int key = f * 8192 + b; u32 hp = hsh24(key);
                    while (sGn[hp] == sgen) hp = (hp + 1) & (SHS - 1);
                    sGn[hp] = sgen; sKey[hp] = key; sVal[hp] = si;
                }
            }
            int vrFast = 0, vrZ = -1, vgen = 0;
            if (fast && (flags & 2) && nVR > 2) {
                vrFast = 1; vgen = ++H->vgen;
                for (int t = 0; t < nVR; t++) { const int bb = sBi[VR[t]]; if (bb == 0) vrZ = t; else { vbG[bb] = vgen; vbT[bb] = t; } }
            }
            for (int t = 0; t < nFX; t++) {
                const int k0 = FX[t]; if (sE[k0] > eLim) continue;
                const int ff = sFi[k0], bb = sBi[k0];
                double best = __builtin_inf(); int bsi = 0; double blen = 0;
                if (fast && ff != 0 && bb != 0) {
                    const double Lf = lenById[ff], Lb = lenById[bb];
                    int sA = -1;
                    { const int key = ff * 8192 + bb; u32 hp = hsh24(key); while (sGn[hp] == sgen) { if (sKey[hp] == key) { sA = sVal[hp]; break; } hp = (hp + 1) & (SHS - 1); } }
                    if (sA >= 0) { best = pCost[sA]; bsi = sA; blen = 0; }
                    if (fG[ff] == sgen) { int s1 = fF1[ff]; if (s1 == sA) s1 = fF2[ff]; if (s1 >= 0) { const double cc = pCost[s1] + Lb + 3; if (cc < best || (cc == best && s1 < bsi)) { best = cc; bsi = s1; blen = Lb + 3; } } }
                    if (bG[bb] == sgen) { int s1 = bF1[bb]; if (s1 == sA) s1 = bF2[bb]; if (s1 >= 0) { const double cc = pCost[s1] + Lf + 3; if (cc < best || (cc == best && s1 < bsi)) { best = cc; bsi = s1; blen = Lf + 3; } } }
                    int sD = 0; while (sD < np && (pF[sD] == ff || pB[sD] == bb)) sD++;
                    if (sD < np) { const double cc = pCost[sD] + Lf + Lb + 4; if (cc < best || (cc == best && sD < bsi)) { best = cc; bsi = sD; blen = Lf + Lb + 4; } }
                } else {
                    for (int si = 0; si < np; si++) {
                        if (pCost[si] >= best) break;
                        const int cf = pF[si], cb = pB[si];
                        double len;
                        if ((cb != 0 && bb == 0) || (cf != 0 && ff == 0)) len = 4 + (ff ? 1 + lenById[ff] : 0) + (bb ? 1 + lenById[bb] : 0);
                        else { len = 0; int cnt = 0; if (ff != 0 && ff != cf) { len += lenById[ff]; cnt++; } if (bb != 0 && bb != cb) { len += lenById[bb]; cnt++; } if (cnt) len += cnt + 2; }
                        const double cost = pCost[si] + len;
                        if (cost < best) { best = cost; bsi = si; blen = len; }
                    }
                }
                RELAXD(bsi, ff, bb, best + 1 + lw * sE[k0] + sPen[k0], pLn[bsi] + blen + 1, k0);
            }
            for (int si = 0; si < np; si++) {
                const int cf = pF[si], cb = pB[si]; const double base = pCost[si], bl = pLn[si];
                const int firstCf = fast && fF1[cf] == si;
                if (vrFast && !firstCf) {
                    int tA = -1, tZ = -1;
                    if (cb > 0 && vbG[cb] == vgen) tA = vbT[cb];
                    if (vrZ >= 0 && (cb == 0 || si == firstNZ)) tZ = vrZ;
                    if (tA >= 0 && tZ >= 0 && tZ < tA) { const int qq = tA; tA = tZ; tZ = qq; }
                    if (tA >= 0) { const int k0 = VR[tA]; if (!(sE[k0] > eLim)) RELAX(si, cf, cb, base, bl, k0, 1, sFi[k0], sBi[k0], lw * sE[k0] + sPen[k0]); }
                    if (tZ >= 0 && tZ != tA) { const int k0 = VR[tZ]; if (!(sE[k0] > eLim)) RELAX(si, cf, cb, base, bl, k0, 1, sFi[k0], sBi[k0], lw * sE[k0] + sPen[k0]); }
                } else {
                    for (int t = 0; t < nVR; t++) {
                        const int k0 = VR[t]; if (sE[k0] > eLim) continue;
                        if (fast && sBl[k0] == 1 && sFi[k0] < 0) {
                            const int bb = sBi[k0];
                            if (bb > 0) { if (!firstCf && cb != bb) continue; }
                            else if (bb == 0) { if (cb != 0 && si != firstNZ) continue; }
                        }
                        RELAX(si, cf, cb, base, bl, k0, sBl[k0] == 1, sFi[k0], sBi[k0], lw * sE[k0] + sPen[k0]);
                    }
                }
                if (flags & 1) {
                    // 이어 쓰기 후보: 캐시 (칸, 상태) → 후보 목록. 없으면 JS 에 물어 본다
                    const int key = cf * 8192 + cb;
                    const char* ent = 0; int nr = 0;
                    // 칸마다 64칸짜리 작은 표 (한 칸을 처리하는 동안 같은 표만 보므로 캐시에 머문다)
                    char* tab = DC + (u32)c * (64u * 80u);
                    u32 hs = (u32)key * 0x9E3779B1u; hs = hs >> 26;   // 피보나치 해싱 (상위 6비트)
                    for (;;) {
                        int* sl = (int*)(tab + hs * 80u);
                        if (sl[2] == 0) break;
                        if (sl[1] == key) { ent = (const char*)sl; nr = sl[2]; break; }
                        hs = (hs + 1) & 63u;
                    }
                    if (!ent) {
                        nr = dotcb(c, cf, cb);
                        ent = SCR - 16;
                        if (nr >= 1 && nr <= 2 && dcCnt[c] < 44) {
                            int* sl = (int*)(tab + hs * 80u);
                            sl[1] = key; sl[2] = nr;
                            { const int* src = (const int*)SCR; int* dst = sl + 4; for (int u = 0; u < nr * 8; u++) dst[u] = src[u]; }
                            dcCnt[c]++;
                        }
                    }
                    if (nr > 0) {
                        int bk = -1; double bv = __builtin_inf();
                        const char* cand = (nr <= 2 && ent != SCR - 16) ? ent + 16 : SCR;
                        for (int k = 0; k < nr; k++) { const double* d = (const double*)(cand + k * 32); const double v = lw * d[0] + d[1]; if (v < bv) { bv = v; bk = k; } }
                        if (bk >= 0) {
                            const int* ci = (const int*)(cand + bk * 32 + 16);
                            RELAX(si, cf, cb, base, bl, -(ci[3] + 1), ci[2], ci[0], dual ? ci[1] : 0, bv);
                        }
                    }
                }
            }
            // 상위 HB 개 (비용, 생성 순서)
            const int keep = HB < m ? HB : m;
            if (m > keep * 2) {
                // (비용, 생성 순서) 기준 keep 번째까지 고른 뒤 정렬 — 아래 삽입 방식과 같은 결과
                for (int i = 0; i < m; i++) qIdx[i] = i;
                int lo = 0, hi = m - 1; const int K = keep - 1;
                while (lo < hi) {
                    const int pv = qIdx[(lo + hi) >> 1]; const double pc = nCost[pv];
                    int i = lo, j = hi;
                    while (i <= j) {
                        int a = qIdx[i]; while (nCost[a] < pc || (nCost[a] == pc && a < pv)) a = qIdx[++i];
                        int b = qIdx[j]; while (nCost[b] > pc || (nCost[b] == pc && b > pv)) b = qIdx[--j];
                        if (i <= j) { qIdx[i] = b; qIdx[j] = a; i++; j--; }
                    }
                    if (K <= j) hi = j; else if (K >= i) lo = i; else break;
                }
                for (int r2 = 0; r2 < keep; r2++) {
                    const int v = qIdx[r2]; const double cc = nCost[v];
                    int j = r2;
                    while (j > 0 && (selC[j - 1] > cc || (selC[j - 1] == cc && sel[j - 1] > v))) { selC[j] = selC[j - 1]; sel[j] = sel[j - 1]; j--; }
                    selC[j] = cc; sel[j] = v;
                }
            } else {
                int ns = 0;
                for (int i = 0; i < m; i++) {
                    const double cst = nCost[i];
                    if (ns == keep && cst >= selC[keep - 1]) continue;
                    int j = ns < keep ? ns++ : keep - 1;
                    while (j > 0 && selC[j - 1] > cst) { selC[j] = selC[j - 1]; sel[j] = sel[j - 1]; j--; }
                    selC[j] = cst; sel[j] = i;
                }
            }
            for (int r2 = 0; r2 < keep; r2++) {
                const int bi2 = sel[r2]; const int o = x * HB + r2;
                hF[o] = nF[bi2]; hB[o] = nB[bi2]; hPrev[o] = nPrev[bi2]; hRf[o] = nRf[bi2]; hRb[o] = nRb[bi2]; hRef[o] = nRef[bi2];
                qF[r2] = nF[bi2]; qB[r2] = nB[bi2]; qCost[r2] = nCost[bi2]; qLn[r2] = nLn[bi2];
            }
            { int* t; double* td; t = pF; pF = qF; qF = t; t = pB; pB = qB; qB = t; td = pCost; pCost = qCost; qCost = td; td = pLn; pLn = qLn; qLn = td; }
            np = keep;
        }
        // 줄 끝
        int bi = 0; double bc = __builtin_inf(), bl = 0;
        for (int i = 0; i < np; i++) {
            const double rs = (!carry && (pF[i] != 0 || pB[i] != 0)) ? 4 : 0;
            const double cc = pCost[i] + rs;
            if (cc < bc) { bc = cc; bi = i; bl = pLn[i] + rs; }
        }
        int xEnd = n - 1, tailF = -1, tailB = -1;
        rowTail[y] = -1;
        if (tailCost < bc) {
            rowTail[y] = tailX;
            bl = tailLn; bi = tailS; xEnd = tailX - 1;
            if (tailX == 0) { tailF = carry ? carryF : 0; tailB = carry ? carryB : 0; }
            else { const int o = (tailX - 1) * HB + bi; tailF = hF[o]; tailB = hB[o]; }
        }
        total += bl + 1;
        if (rowE) rowE[y] = ((tailF >= 0 ? tailCost : bc) - bl) / lambda;
        if (tailF >= 0) { carryF = tailF; carryB = tailB; }
        else if (np) { carryF = pF[bi]; carryB = pB[bi]; }
        for (int x = xEnd; x >= 0; x--) {
            const int o = x * HB + bi;
            outRef[cell0 + x] = hRef[o]; outF[cell0 + x] = hRf[o]; outB[cell0 + x] = hRb[o];
            bi = hPrev[o];
        }
        cell0 += n;
    }
    H->gen = gen;
    return total + 8 + 3;
}

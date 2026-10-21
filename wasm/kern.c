// AnsiMorph v21 SIMD kernels (wasm32 + simd128). 빌드: ./build.sh (clang --target=wasm32 -msimd128)
// 메모리는 JS 가 만들어 넘긴다 (--import-memory). 0~1MB 는 스택용으로 비워 둔다.
#include <wasm_simd128.h>
typedef unsigned int u32;

static inline float hsum(v128_t v) {
    return (wasm_f32x4_extract_lane(v, 0) + wasm_f32x4_extract_lane(v, 1)) + (wasm_f32x4_extract_lane(v, 2) + wasm_f32x4_extract_lane(v, 3));
}

// 글자별 닫힌 식 특징: X_c[kk] = q1·Σ_i a_i·P_c[i] + q2·Σ_b a8_b·P8_c[b]   (a = cov[idx[kk]], N 은 4의 배수)
__attribute__((export_name("xfeat")))
void xfeat(const float* cov, int N, const int* idx, int nG, const float* wr, const float* wg, const float* wb,
           const float* cov8, const float* p8, float q1, float q2, float* oR, float* oG, float* oB) {
    for (int kk = 0; kk < nG; kk++) {
        const u32 k = (u32)idx[kk];
        const float* a = cov + k * (u32)N;
        v128_t ar = wasm_f32x4_splat(0), ag = ar, ab = ar, ar2 = ar, ag2 = ar, ab2 = ar;
        int i = 0;
        for (; i + 8 <= N; i += 8) {
            v128_t av = wasm_v128_load(a + i), bv = wasm_v128_load(a + i + 4);
            ar = wasm_f32x4_add(ar, wasm_f32x4_mul(av, wasm_v128_load(wr + i)));
            ag = wasm_f32x4_add(ag, wasm_f32x4_mul(av, wasm_v128_load(wg + i)));
            ab = wasm_f32x4_add(ab, wasm_f32x4_mul(av, wasm_v128_load(wb + i)));
            ar2 = wasm_f32x4_add(ar2, wasm_f32x4_mul(bv, wasm_v128_load(wr + i + 4)));
            ag2 = wasm_f32x4_add(ag2, wasm_f32x4_mul(bv, wasm_v128_load(wg + i + 4)));
            ab2 = wasm_f32x4_add(ab2, wasm_f32x4_mul(bv, wasm_v128_load(wb + i + 4)));
        }
        for (; i < N; i += 4) {
            v128_t av = wasm_v128_load(a + i);
            ar = wasm_f32x4_add(ar, wasm_f32x4_mul(av, wasm_v128_load(wr + i)));
            ag = wasm_f32x4_add(ag, wasm_f32x4_mul(av, wasm_v128_load(wg + i)));
            ab = wasm_f32x4_add(ab, wasm_f32x4_mul(av, wasm_v128_load(wb + i)));
        }
        float r = hsum(wasm_f32x4_add(ar, ar2)) * q1, g = hsum(wasm_f32x4_add(ag, ag2)) * q1, b = hsum(wasm_f32x4_add(ab, ab2)) * q1;
        if (q2 > 0) {
            const float* c8 = cov8 + k * 8u;
            for (int t = 0; t < 8; t++) { const float c = c8[t] * q2; r += c * p8[t]; g += c * p8[8 + t]; b += c * p8[16 + t]; }
        }
        oR[kk] = r; oG[kk] = g; oB[kk] = b;
    }
}

// 닫힌 식 상위 2개: G_k = u0·X0 + u1·X1 + u2·X2 + uW·X3 + uWW·X4 + P_k
// (X0~X2 는 칸별, X3·X4·P 는 글자 상수. 길이 n4 는 4의 배수 — 채운 칸의 P 는 +무한대)
__attribute__((export_name("scan2")))
void scan2(const float* x0, const float* x1, const float* x2, const float* x3, const float* x4, const float* pp, int n4,
           float u0, float u1, float u2, float uW, float uWW, int* res, float* resf) {
    v128_t U0 = wasm_f32x4_splat(u0), U1 = wasm_f32x4_splat(u1), U2 = wasm_f32x4_splat(u2), UW = wasm_f32x4_splat(uW), UWW = wasm_f32x4_splat(uWW);
    const float INF = __builtin_inff();
    v128_t b1 = wasm_f32x4_splat(INF), b2 = b1;
    v128_t i1 = wasm_i32x4_splat(-1), i2 = i1;
    v128_t idx = wasm_i32x4_make(0, 1, 2, 3), four = wasm_i32x4_splat(4);
    for (int k = 0; k < n4; k += 4) {
        v128_t G = wasm_f32x4_mul(U0, wasm_v128_load(x0 + k));
        G = wasm_f32x4_add(G, wasm_f32x4_mul(U1, wasm_v128_load(x1 + k)));
        G = wasm_f32x4_add(G, wasm_f32x4_mul(U2, wasm_v128_load(x2 + k)));
        G = wasm_f32x4_add(G, wasm_f32x4_mul(UW, wasm_v128_load(x3 + k)));
        G = wasm_f32x4_add(G, wasm_f32x4_mul(UWW, wasm_v128_load(x4 + k)));
        G = wasm_f32x4_add(G, wasm_v128_load(pp + k));
        v128_t lt1 = wasm_f32x4_lt(G, b1), lt2 = wasm_f32x4_lt(G, b2);
        v128_t nb2 = wasm_v128_bitselect(b1, wasm_v128_bitselect(G, b2, lt2), lt1);
        v128_t ni2 = wasm_v128_bitselect(i1, wasm_v128_bitselect(idx, i2, lt2), lt1);
        b1 = wasm_v128_bitselect(G, b1, lt1); i1 = wasm_v128_bitselect(idx, i1, lt1);
        b2 = nb2; i2 = ni2;
        idx = wasm_i32x4_add(idx, four);
    }
    float bv[8]; int bi[8];
    wasm_v128_store(bv, b1); wasm_v128_store(bv + 4, b2); wasm_v128_store(bi, i1); wasm_v128_store(bi + 4, i2);
    float v1 = INF, v2 = INF; int j1 = -1, j2 = -1;
    for (int t = 0; t < 8; t++) {
        const int j = bi[t]; const float v = bv[t]; if (j < 0) continue;
        if (v < v1 || (v == v1 && j < j1)) { v2 = v1; j2 = j1; v1 = v; j1 = j; }
        else if (v < v2 || (v == v2 && j < j2)) { v2 = v; j2 = j; }
    }
    res[0] = j1; res[1] = j2; resf[0] = v1; resf[1] = v2;
}

// 실제 오차의 부분 픽셀 합 s = Σ_i d_i  (가중치 1, 3분할 혼합 모델)
//  화면색 c = a ≤ kb ? D + kb·(bc−D) + a·(fc−bc) : D + a·(fc−D)
//  d = √(0.30·dr² + 0.59·dg² + 0.11·db² + CK·(색차²)),  fr(어두운 생략 허용) 이면 min(d, |D−c|)
__attribute__((export_name("exacts")))
double exacts(const float* a, const float* pr, const float* pg, const float* pb, const int* frm, const float* kb, int N,
              float fR, float fG, float fB, float bR, float bG, float bB, float DR, float DG, float DB, float CK) {
    const v128_t D_r = wasm_f32x4_splat(DR), D_g = wasm_f32x4_splat(DG), D_b = wasm_f32x4_splat(DB);
    const v128_t BmD_r = wasm_f32x4_splat(bR - DR), BmD_g = wasm_f32x4_splat(bG - DG), BmD_b = wasm_f32x4_splat(bB - DB);
    const v128_t FmB_r = wasm_f32x4_splat(fR - bR), FmB_g = wasm_f32x4_splat(fG - bG), FmB_b = wasm_f32x4_splat(fB - bB);
    const v128_t FmD_r = wasm_f32x4_splat(fR - DR), FmD_g = wasm_f32x4_splat(fG - DG), FmD_b = wasm_f32x4_splat(fB - DB);
    const v128_t W0 = wasm_f32x4_splat(0.30f), W1 = wasm_f32x4_splat(0.59f), W2 = wasm_f32x4_splat(0.11f);
    const v128_t Y0 = wasm_f32x4_splat(0.299f), Y1 = wasm_f32x4_splat(0.587f), Y2 = wasm_f32x4_splat(0.114f), CKv = wasm_f32x4_splat(CK);
    const int chroma = CK > 0;
    v128_t s = wasm_f32x4_splat(0), s2 = s;
    for (int i = 0; i < N; i += 4) {
        const v128_t av = wasm_v128_load(a + i), kv = wasm_v128_load(kb + i);
        const v128_t le = wasm_f32x4_le(av, kv);
        // a ≤ kb: D + kb(b−D) + a(f−b)  /  a > kb: D + a(f−D)
        v128_t cr = wasm_v128_bitselect(wasm_f32x4_add(wasm_f32x4_add(D_r, wasm_f32x4_mul(kv, BmD_r)), wasm_f32x4_mul(av, FmB_r)), wasm_f32x4_add(D_r, wasm_f32x4_mul(av, FmD_r)), le);
        v128_t cg = wasm_v128_bitselect(wasm_f32x4_add(wasm_f32x4_add(D_g, wasm_f32x4_mul(kv, BmD_g)), wasm_f32x4_mul(av, FmB_g)), wasm_f32x4_add(D_g, wasm_f32x4_mul(av, FmD_g)), le);
        v128_t cb = wasm_v128_bitselect(wasm_f32x4_add(wasm_f32x4_add(D_b, wasm_f32x4_mul(kv, BmD_b)), wasm_f32x4_mul(av, FmB_b)), wasm_f32x4_add(D_b, wasm_f32x4_mul(av, FmD_b)), le);
        const v128_t dr = wasm_f32x4_sub(wasm_v128_load(pr + i), cr), dg = wasm_f32x4_sub(wasm_v128_load(pg + i), cg), db = wasm_f32x4_sub(wasm_v128_load(pb + i), cb);
        v128_t q = wasm_f32x4_add(wasm_f32x4_add(wasm_f32x4_mul(W0, wasm_f32x4_mul(dr, dr)), wasm_f32x4_mul(W1, wasm_f32x4_mul(dg, dg))), wasm_f32x4_mul(W2, wasm_f32x4_mul(db, db)));
        const v128_t er = wasm_f32x4_sub(D_r, cr), eg = wasm_f32x4_sub(D_g, cg), eb = wasm_f32x4_sub(D_b, cb);
        v128_t q2 = wasm_f32x4_add(wasm_f32x4_add(wasm_f32x4_mul(W0, wasm_f32x4_mul(er, er)), wasm_f32x4_mul(W1, wasm_f32x4_mul(eg, eg))), wasm_f32x4_mul(W2, wasm_f32x4_mul(eb, eb)));
        if (chroma) {
            v128_t y = wasm_f32x4_add(wasm_f32x4_add(wasm_f32x4_mul(Y0, dr), wasm_f32x4_mul(Y1, dg)), wasm_f32x4_mul(Y2, db));
            v128_t u = wasm_f32x4_sub(db, y), v = wasm_f32x4_sub(dr, y);
            q = wasm_f32x4_add(q, wasm_f32x4_mul(CKv, wasm_f32x4_add(wasm_f32x4_mul(u, u), wasm_f32x4_mul(v, v))));
            y = wasm_f32x4_add(wasm_f32x4_add(wasm_f32x4_mul(Y0, er), wasm_f32x4_mul(Y1, eg)), wasm_f32x4_mul(Y2, eb));
            u = wasm_f32x4_sub(eb, y); v = wasm_f32x4_sub(er, y);
            q2 = wasm_f32x4_add(q2, wasm_f32x4_mul(CKv, wasm_f32x4_add(wasm_f32x4_mul(u, u), wasm_f32x4_mul(v, v))));
        }
        const v128_t fm = wasm_v128_load(frm + i);
        q = wasm_v128_bitselect(wasm_f32x4_min(q, q2), q, fm);   // √ 은 단조 → 제곱에서 최소를 고른 뒤 한 번만
        const v128_t d = wasm_f32x4_sqrt(q);
        if (i & 4) s2 = wasm_f32x4_add(s2, d); else s = wasm_f32x4_add(s, d);
    }
    return (double)hsum(wasm_f32x4_add(s, s2));
}

// ── 실제 오차 전체 (부분 픽셀 합 + 2×2 묶음 평균색 항 + 칸 평균색 항) ──
// G: 준비 단계마다 한 번 채우는 공통 값 (double 배열)
//   [0..2] D(기본 배경색) r,g,b  [3] CK(부분 픽셀 색차 가중)  [4] CKP(묶음 색차 가중)  [5] POOL  [6] CPOOL  [7] BPX(묶음당 부분 픽셀 수)  [8] N  [9] wsum
// 칸 정보 C (double): [0..23] 묶음별 원본 합 (r 8개, g 8개, b 8개)  [24..31] 묶음별 어두운 점 수
// A8/E8: 글자별 묶음 상수 (double, 8개씩), K8: 묶음별 Σkb
static inline double wdcd(double dr, double dg, double db, double ck) {
    double q = 0.30 * dr * dr + 0.59 * dg * dg + 0.11 * db * db;
    if (ck > 0) { const double y = 0.299 * dr + 0.587 * dg + 0.114 * db, u = db - y, v = dr - y; q += ck * (u * u + v * v); }
    return __builtin_sqrt(q);
}
__attribute__((export_name("exacte")))
double exacte(const float* cov, int k, const float* pr, const int* frm, const float* kb, const double* G, const double* C,
              const double* A8, const double* E8, const double* K8, double fR, double fG, double fB, double bR, double bG, double bB) {
    const int N = (int)G[8];
    const double DR = G[0], DG = G[1], DB = G[2], CK = G[3], CKP = G[4], POOL = G[5], CPOOL = G[6], BPX = G[7], wsum = G[9];
    const double s = exacts(cov + (u32)k * (u32)N, pr, pr + N, pr + 2 * N, frm, kb, N, (float)fR, (float)fG, (float)fB, (float)bR, (float)bG, (float)bB, (float)DR, (float)DG, (float)DB, (float)CK);
    if (!(POOL > 0)) return s / wsum;
    const double* a8 = A8 + (u32)k * 8u; const double* e8 = E8 + (u32)k * 8u;
    double sp = 0, cr0 = 0, cg0 = 0, cb0 = 0, nfr = 0;
    for (int b = 0; b < 8; b++) {
        const double A = a8[b], E = e8[b], K = K8[b];
        const double pR = C[b] - (BPX * DR + K * (bR - DR) + A * (fR - bR) + E * (bR - DR));
        const double pG = C[8 + b] - (BPX * DG + K * (bG - DG) + A * (fG - bG) + E * (bG - DG));
        const double pB = C[16 + b] - (BPX * DB + K * (bB - DB) + A * (fB - bB) + E * (bB - DB));
        const double dr = pR / BPX, dg = pG / BPX, db = pB / BPX, nf = C[24 + b];
        double d = wdcd(dr, dg, db, CKP);
        if (nf >= BPX) d = d < 0 ? d : 0;
        sp += d; cr0 += dr; cg0 += dg; cb0 += db; nfr += nf;
    }
    double e = (1 - POOL) * s / wsum + POOL * sp / 8;
    if (CPOOL > 0 && nfr < N) { cr0 /= 8; cg0 /= 8; cb0 /= 8; e = (1 - CPOOL) * e + CPOOL * wdcd(cr0, cg0, cb0, CKP); }
    return e;
}

// ── 글자 모양 1차 선별 (matchGlyphPrecise): 2×4 블록 8차원 근사 이득으로 상위 PRE 개 ──
//  s_k = ((Σ a8_k·P8 − LSG_k·mu)² / LVG_k + E·(ph · OH_k)) · LAM_k   (LOK_k 인 글자만)
//  c8t/oht: 블록 i 별로 글자 NL4 개씩 (전치) · 결과는 이득 내림차순 (같으면 앞 번호 우선)
__attribute__((export_name("gpre")))
int gpre(const float* c8t, const float* oht, const float* lsg, const float* lvg, const float* lam, const int* lok, int NL4,
         const float* p8, const float* ph, float mu, float E, int useO, int PRE, int* cand, float* csc) {
    int nc = 0;
    v128_t P[8], H[8];
    for (int i = 0; i < 8; i++) { P[i] = wasm_f32x4_splat(p8[i]); H[i] = wasm_f32x4_splat(ph[i]); }
    const v128_t MU = wasm_f32x4_splat(mu), EE = wasm_f32x4_splat(E);
    float thr = -__builtin_inff();
    for (int k = 0; k < NL4; k += 4) {
        v128_t d = wasm_f32x4_mul(wasm_v128_load(c8t + k), P[0]);
        for (int i = 1; i < 8; i++) d = wasm_f32x4_add(d, wasm_f32x4_mul(wasm_v128_load(c8t + i * NL4 + k), P[i]));
        const v128_t c = wasm_f32x4_sub(d, wasm_f32x4_mul(wasm_v128_load(lsg + k), MU));
        v128_t s = wasm_f32x4_div(wasm_f32x4_mul(c, c), wasm_v128_load(lvg + k));
        if (useO) {
            v128_t dd = wasm_f32x4_mul(wasm_v128_load(oht + k), H[0]);
            for (int i = 1; i < 8; i++) dd = wasm_f32x4_add(dd, wasm_f32x4_mul(wasm_v128_load(oht + i * NL4 + k), H[i]));
            s = wasm_f32x4_add(s, wasm_f32x4_mul(EE, dd));
        }
        s = wasm_f32x4_mul(s, wasm_v128_load(lam + k));
        float sv[4]; wasm_v128_store(sv, s);
        for (int t = 0; t < 4; t++) {
            if (!lok[k + t]) continue;
            const float v = sv[t];
            if (nc < PRE) { int j = nc++; while (j > 0 && csc[j - 1] < v) { csc[j] = csc[j - 1]; cand[j] = cand[j - 1]; j--; } csc[j] = v; cand[j] = k + t; }
            else if (v > csc[PRE - 1]) { int j = PRE - 1; while (j > 0 && csc[j - 1] < v) { csc[j] = csc[j - 1]; cand[j] = cand[j - 1]; j--; } csc[j] = v; cand[j] = k + t; }
        }
        (void)thr;
    }
    return nc;
}

/**
 * Suy luận toán học của mô hình (§3.4, §3.5, §3.10, §4.4, Phụ lục A).
 * Mọi ví dụ là tham số giả định để kiểm tra tính nhất quán — không phải số liệu đo của hệ thống.
 */

/** p_guess(X|E) = Σ_e max_x P(X=x, E=e)  — biểu thức (3.4) viết theo phân bố đồng thời. */
export function pGuess(joint: number[][]): number {
  // joint[x][e]
  if (!joint.length) return 1;
  const cols = joint[0].length;
  let s = 0;
  for (let e = 0; e < cols; e++) {
    let m = 0;
    for (let x = 0; x < joint.length; x++) m = Math.max(m, joint[x][e]);
    s += m;
  }
  return s;
}

/** H_min(X|E) = −log2 p_guess(X|E) — (3.5). */
export const hMin = (joint: number[][]) => -Math.log2(pGuess(joint));

/** Min-entropy không điều kiện từ phân bố p(x). */
export const hMinDist = (p: number[]) => -Math.log2(Math.max(...p));

/** Kiểm tra phân bố hợp lệ (tổng 1, không âm). */
export function validJoint(joint: number[][]): { ok: boolean; total: number } {
  let total = 0;
  for (const row of joint) for (const v of row) {
    if (v < 0 || !Number.isFinite(v)) return { ok: false, total: NaN };
    total += v;
  }
  return { ok: Math.abs(total - 1) < 1e-9, total };
}

/** Ví dụ A.1: X=(B,B) với B đều → H_min = 1 bit; nếu E chứa B thì = 0. */
export const EXAMPLE_BB = {
  noSideInfo: [[0.5], [0], [0], [0.5]], // x ∈ {00,01,10,11}, E rỗng
  sideInfoB: [
    [0.5, 0],
    [0, 0],
    [0, 0],
    [0, 0.5],
  ], // E = B
};

/** log2 của cận d_TV ≤ ½ · 2^{(m−k)/2} — (3.9). */
export const log2ExtractorBound = (k: number, m: number) => -1 + (m - k) / 2;

/** m ≤ k − 2·log2(1/ε) — điều kiện đủ (3.10). */
export const maxOutputBits = (k: number, eps: number) => Math.floor(k - 2 * Math.log2(1 / eps));

/** Bảng A.1 */
export const TABLE_A1 = [384, 512, 640].map((k) => ({ k, m: 256, log2d: log2ExtractorBound(k, 256) }));

export interface OutputParams {
  /** Nội dung phân biệt còn có thể lộ mới (cùng đơn vị). */
  Drem: number;
  /** Đầu ra đã cho phép trước t0 còn có thể thoát. */
  Q: number;
  /** Hạn mức cấp mới còn lại sau t0. */
  Lrem: number;
  /** Ngân sách burst. */
  B: number;
  /** Tốc độ cấp hạn mức (đơn vị/giây). */
  r: number;
}

/** A_new(T) ≤ min(L_rem, B + rT) — (3.14) */
export const aNew = (p: OutputParams, T: number) => Math.min(p.Lrem, p.B + p.r * T);

/** E_new(T) ≤ min(D_rem, Q + min(L_rem, B + rT)) — (3.15) */
export const eNew = (p: OutputParams, T: number) => Math.min(p.Drem, p.Q + aNew(p, T));

/** Thời điểm bão hòa do L_rem. */
export const saturationTime = (p: OutputParams) => (p.r > 0 ? Math.max(0, (p.Lrem - p.B) / p.r) : Infinity);

/** Bảng 4.1: D_rem=50, Q=0,5, L_rem=8 MiB, r=0,25 MiB/s; B ∈ {0, 1}. */
export const TABLE_4_1_PARAMS: OutputParams = { Drem: 50, Q: 0.5, Lrem: 8, B: 0, r: 0.25 };
export const TABLE_4_1 = [0, 5, 10, 20, 30, 40].map((T) => ({
  T,
  b0: eNew({ ...TABLE_4_1_PARAMS, B: 0 }, T),
  b1: eNew({ ...TABLE_4_1_PARAMS, B: 1 }, T),
}));

// ---------- Kiểm tra sức khỏe nguồn (SP 800-90B §4.4) ----------

/** RCT: C = 1 + ⌈−log2(α)/H⌉ */
export const rctCutoff = (H: number, alpha = 2 ** -20) => 1 + Math.ceil(-Math.log2(alpha) / H);

const logFact = (() => {
  const t = [0];
  for (let i = 1; i <= 4096; i++) t.push(t[i - 1] + Math.log(i));
  return t;
})();

/** APT: ngưỡng nhỏ nhất c sao cho P(Binom(W, 2^-H) ≥ c) ≤ α. */
export function aptCutoff(H: number, W = 512, alpha = 2 ** -20): number {
  const p = 2 ** -H;
  const lp = Math.log(p);
  const lq = Math.log1p(-p);
  let tail = 0;
  for (let c = W; c >= 1; c--) {
    const logPmf = logFact[W] - logFact[c] - logFact[W - c] + c * lp + (W - c) * lq;
    tail += Math.exp(logPmf);
    if (tail > alpha) return Math.min(W, c + 1);
  }
  return 1;
}

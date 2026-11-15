export function pGuess(joint: number[][]): number {
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

export const hMin = (joint: number[][]) => -Math.log2(pGuess(joint));

export const hMinDist = (p: number[]) => -Math.log2(Math.max(...p));

export function validJoint(joint: number[][]): { ok: boolean; total: number } {
  let total = 0;
  for (const row of joint) for (const v of row) {
    if (v < 0 || !Number.isFinite(v)) return { ok: false, total: NaN };
    total += v;
  }
  return { ok: Math.abs(total - 1) < 1e-9, total };
}

export const EXAMPLE_BB = {
  noSideInfo: [[0.5], [0], [0], [0.5]],
  sideInfoB: [
    [0.5, 0],
    [0, 0],
    [0, 0],
    [0, 0.5],
  ],
};

export const log2ExtractorBound = (k: number, m: number) => -1 + (m - k) / 2;

export const maxOutputBits = (k: number, eps: number) => Math.floor(k - 2 * Math.log2(1 / eps));

export const TABLE_A1 = [384, 512, 640].map((k) => ({ k, m: 256, log2d: log2ExtractorBound(k, 256) }));

export const rctCutoff = (H: number, alpha = 2 ** -20) => 1 + Math.ceil(-Math.log2(alpha) / H);

const logFact = (() => {
  const t = [0];
  for (let i = 1; i <= 4096; i++) t.push(t[i - 1] + Math.log(i));
  return t;
})();

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

export interface OutputParams {
  Drem: number;
  Q: number;
  Lrem: number;
  B: number;
  r: number;
}

export const aNew = (p: OutputParams, T: number) => Math.min(p.Lrem, p.B + p.r * T);

export const eNew = (p: OutputParams, T: number) => Math.min(p.Drem, p.Q + aNew(p, T));

export const saturationTime = (p: OutputParams) => (p.r > 0 ? Math.max(0, (p.Lrem - p.B) / p.r) : Infinity);

export const TABLE_4_1_PARAMS: OutputParams = { Drem: 50, Q: 0.5, Lrem: 8, B: 0, r: 0.25 };
export const TABLE_4_1 = [0, 5, 10, 20, 30, 40].map((T) => ({
  T,
  b0: eNew({ ...TABLE_4_1_PARAMS, B: 0 }, T),
  b1: eNew({ ...TABLE_4_1_PARAMS, B: 1 }, T),
}));

/** Deterministic PRNG utilities (sfc32 + string hashing). Same output in Node and browsers. */

export function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export class RNG {
  private a: number; private b: number; private c: number; private d: number;
  readonly seed: number;

  constructor(seed: number | string) {
    const s = typeof seed === 'string' ? hashString(seed) : seed >>> 0;
    this.seed = s;
    this.a = 0x9e3779b9 ^ s; this.b = 0x243f6a88 ^ (s * 7919); this.c = 0xb7e15162 ^ (s * 104729); this.d = s | 1;
    for (let i = 0; i < 12; i++) this.next();
  }

  /** float in [0,1) */
  next(): number {
    this.a >>>= 0; this.b >>>= 0; this.c >>>= 0; this.d >>>= 0;
    let t = (this.a + this.b) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.d = (this.d + 1) | 0;
    t = (t + this.d) | 0;
    this.c = (this.c + t) | 0;
    return (t >>> 0) / 4294967296;
  }

  range(min: number, max: number): number { return min + (max - min) * this.next(); }
  int(min: number, maxInclusive: number): number { return Math.floor(this.range(min, maxInclusive + 1)); }
  chance(p: number): boolean { return this.next() < p; }
  pick<T>(arr: readonly T[]): T { return arr[Math.floor(this.next() * arr.length)]; }
  /** weighted pick: entries [value, weight] */
  weighted<T>(entries: readonly (readonly [T, number])[]): T {
    let total = 0; for (const e of entries) total += e[1];
    let r = this.next() * total;
    for (const e of entries) { r -= e[1]; if (r <= 0) return e[0]; }
    return entries[entries.length - 1][0];
  }
  gaussian(mean = 0, sd = 1): number {
    const u = 1 - this.next(), v = this.next();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(this.next() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    return arr;
  }
  /** derive an independent stream for a labelled sub-task */
  fork(label: string): RNG { return new RNG((this.seed ^ hashString(label)) >>> 0); }
}

/** cheap stateless 2D hash in [0,1) */
export function hash2(x: number, y: number, seed = 0): number {
  let h = Math.imul(Math.floor(x) | 0, 374761393) + Math.imul(Math.floor(y) | 0, 668265263) + Math.imul(seed | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

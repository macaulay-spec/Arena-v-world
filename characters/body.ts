/**
 * Body system: morphs the MakeHuman base mesh with macro + detail targets and converts it to
 * metres with the feet on the ground.  Also derives per-vertex feature masks (lips, brows, eyelid
 * margins, palms, soles …) from target supports and geometry — used by the skin painter.
 */
import { loadBaseMesh, loadTargets, applyTarget, type MhMesh, type TargetLib, type MhTarget } from './mh/load';

export interface BodyParams {
  gender: number;        // 0 = female … 1 = male
  ageYears: number;      // 5 … 90
  muscle: number;        // 0 … 1 (0.5 average)
  weight: number;        // 0 … 1 (0.5 average)
  height: number;        // 0 … 1 (0.5 average)
  proportions: number;   // 0 … 1 (0.5 average, 1 = "ideal")
  african: number; asian: number; caucasian: number; // sum to 1
  cup?: number; firmness?: number; // female only, 0 … 1
  /** detail sliders: key = target pair base (e.g. 'nose-scale-horiz'), value −1 … 1; single targets 0 … 1 */
  details: Record<string, number>;
}

export const DM = 0.1; // decimetre → metre

let baseCache: MhMesh | null = null; let targetCache: TargetLib | null = null;
export function base(): MhMesh { return (baseCache ??= loadBaseMesh()); }
export function targets(): TargetLib { return (targetCache ??= loadTargets()); }

/** MakeHuman's age slider value from years (baby 1 → 0, child 11 → 0.1875, young 25 → 0.5, old 90 → 1). */
export function ageValue(years: number): number {
  return years < 25 ? (years - 1) / 48 : 0.5 + (years - 25) / 130;
}

/** Macro target weights exactly as MakeHuman blends them (baby folded into child; we never generate babies). */
export function macroWeights(p: BodyParams): Map<string, number> {
  const a = Math.max(0, Math.min(1, ageValue(p.ageYears)));
  let child: number, young: number, old: number;
  if (a < 0.5) { old = 0; young = Math.max(0, (a - 0.1875) * 3.2); child = 1 - young; }
  else { child = 0; old = Math.max(0, a * 2 - 1); young = 1 - old; }
  const female = 1 - p.gender, male = p.gender;
  const tri = (v: number): [number, number, number] => v < 0.5 ? [1 - 2 * v, 2 * v, 0] : [0, 2 - 2 * v, 2 * v - 1];
  const [minm, avgm, maxm] = tri(p.muscle); const [minw, avgw, maxw] = tri(p.weight);
  const ages: [string, number][] = [['child', child], ['young', young], ['old', old]];
  const gens: [string, number][] = [['female', female], ['male', male]];
  const mus: [string, number][] = [['minmuscle', minm], ['averagemuscle', avgm], ['maxmuscle', maxm]];
  const wts: [string, number][] = [['minweight', minw], ['averageweight', avgw], ['maxweight', maxw]];
  const eth: [string, number][] = [['african', p.african], ['asian', p.asian], ['caucasian', p.caucasian]];
  const out = new Map<string, number>();
  const add = (k: string, w: number) => { if (w > 1e-5) out.set(k, (out.get(k) ?? 0) + w); };
  for (const [g, gw] of gens) for (const [ag, aw] of ages) {
    if (gw * aw < 1e-5) continue;
    for (const [e, ew] of eth) add(`macrodetails/${e}-${g}-${ag}`, ew * gw * aw);
    for (const [m, mw] of mus) for (const [w, ww] of wts) add(`macrodetails/universal-${g}-${ag}-${m}-${w}`, gw * aw * mw * ww);
    const h = p.height; if (h < 0.5) add(`macrodetails/height/${g}-${ag}-averagemuscle-averageweight-minheight`, gw * aw * (1 - 2 * h)); else add(`macrodetails/height/${g}-${ag}-averagemuscle-averageweight-maxheight`, gw * aw * (2 * h - 1));
    const pr = p.proportions; if (pr < 0.5) add(`macrodetails/proportions/${g}-${ag}-averagemuscle-averageweight-uncommonproportions`, gw * aw * (1 - 2 * pr)); else add(`macrodetails/proportions/${g}-${ag}-averagemuscle-averageweight-idealproportions`, gw * aw * (2 * pr - 1));
    if (g === 'female') {
      const cup = p.cup ?? 0.5, firm = p.firmness ?? 0.5;
      if (cup < 0.5) add(`breast/female-${ag}-averagemuscle-averageweight-mincup-averagefirmness`, gw * aw * (1 - 2 * cup)); else add(`breast/female-${ag}-averagemuscle-averageweight-maxcup-averagefirmness`, gw * aw * (2 * cup - 1));
      if (firm < 0.5) add(`breast/female-${ag}-averagemuscle-averageweight-averagecup-minfirmness`, gw * aw * (1 - 2 * firm)); else add(`breast/female-${ag}-averagemuscle-averageweight-averagecup-maxfirmness`, gw * aw * (2 * firm - 1));
    }
  }
  return out;
}

const PAIRS: [string, string][] = [['decr', 'incr'], ['in', 'out'], ['down', 'up'], ['backward', 'forward'], ['concave', 'convex'], ['compress', 'uncompress']];
const FOLDERS = ['head', 'nose', 'mouth', 'eyes', 'chin', 'cheek', 'forehead', 'ears', 'neck', 'torso', 'stomach', 'buttocks', 'hip', 'breast', 'armslegs', 'eyebrows'];

/** Resolve a detail slider to concrete targets: returns [targetName, weight][] */
export function detailTargets(lib: TargetLib, key: string, value: number): [string, number][] {
  const out: [string, number][] = [];
  const names = (k: string): string[] => {
    // symmetric sliders expand to l-/r- variants when those exist
    const found: string[] = [];
    for (const f of FOLDERS) {
      for (const pre of ['', 'l-', 'r-']) {
        const n = `${f}/${pre}${k}`;
        if (lib.has(n)) found.push(n);
      }
    }
    return found;
  };
  if (Math.abs(value) < 1e-4) return out;
  for (const [neg, posi] of PAIRS) {
    const nn = names(`${key}-${neg}`), pn = names(`${key}-${posi}`);
    if (nn.length || pn.length) {
      const list = value < 0 ? nn : pn;
      for (const n of list) out.push([n, Math.abs(value)]);
      return out;
    }
  }
  for (const n of names(key)) out.push([n, Math.max(0, value)]);
  return out;
}

export interface MorphResult {
  /** all 19158 vertices in metres, feet on y = 0 */
  pos: Float32Array;
  /** ground offset applied (dm) */
  groundDm: number;
  /** absolute weights used (for debugging) */
  used: Map<string, number>;
}

export function morph(p: BodyParams, fixedGroundDm?: number): MorphResult {
  const b = base(); const lib = targets();
  const out = Float64Array.from(b.pos);
  const used = new Map<string, number>();
  for (const [name, w] of macroWeights(p)) {
    const t = lib.get(name); if (!t) throw new Error(`missing macro target ${name}`);
    applyTarget(out, t, w); used.set(name, w);
  }
  for (const [key, v] of Object.entries(p.details)) {
    for (const [name, w] of detailTargets(lib, key, v)) { applyTarget(out, lib.get(name)!, w); used.set(name, (used.get(name) ?? 0) + w); }
  }
  // ground: lowest body vertex
  const bodyFaces = b.byGroup.get('body')!;
  let minY = Infinity;
  for (const f of bodyFaces) for (const v of f.v) minY = Math.min(minY, out[v * 3 + 1]);
  if (fixedGroundDm !== undefined) minY = fixedGroundDm; // morph variants share the base body's ground
  const pos = new Float32Array(out.length);
  for (let i = 0; i < b.nVerts; i++) { pos[i * 3] = out[i * 3] * DM; pos[i * 3 + 1] = (out[i * 3 + 1] - minY) * DM; pos[i * 3 + 2] = out[i * 3 + 2] * DM; }
  return { pos, groundDm: minY, used };
}

/** Per-vertex 0…1 mask from the support of one or more targets (|delta| normalised, smoothed by `power`). */
export function targetMask(names: string[], power = 0.5): Float32Array {
  const lib = targets(); const n = base().nVerts; const m = new Float32Array(n);
  let max = 0;
  for (const name of names) {
    const t: MhTarget | undefined = lib.get(name); if (!t) continue;
    for (let i = 0; i < t.idx.length; i++) {
      const d = Math.hypot(t.d[i * 3], t.d[i * 3 + 1], t.d[i * 3 + 2]);
      const vi = t.idx[i]; m[vi] = Math.max(m[vi], d); max = Math.max(max, d);
    }
  }
  if (max > 0) for (let i = 0; i < n; i++) m[i] = Math.pow(m[i] / max, power);
  return m;
}

/** Default neutral parameters. */
export function defaultBody(): BodyParams {
  return { gender: 0.5, ageYears: 25, muscle: 0.5, weight: 0.5, height: 0.5, proportions: 0.5, african: 1 / 3, asian: 1 / 3, caucasian: 1 / 3, details: {} };
}

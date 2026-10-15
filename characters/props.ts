/**
 * Hand-held and worn props, built in the bind (T) pose and skinned to one bone so they follow
 * the clips: head loads (trays, basins, sacks), bags, buckets, phones, sticks, baby wraps …
 * Remember: when the arm hangs, "down" is the T-pose's distal (+X left / −X right) direction.
 */
import { BONE_INDEX, type Rig } from './rig';
import type { Part } from './mesh';
import { box, cylinder, emptyPart, sphere, strip } from './prims';
import { FABRICS, FABRIC_PNG, linear } from './fabrics';
import type { GarmentMaterial, GarmentCtx } from './garments';
import { headFrame } from './hair';
import { clip, concavity, fromGroup, offset, rims, toPart } from './softmesh';

export type PropId = 'head_tray_tomatoes' | 'head_tray_oranges' | 'head_tray_bread' | 'head_basin_sachets' | 'head_sack' | 'head_basket_yams' | 'handbag' | 'backpack' | 'briefcase' | 'phone' | 'bucket' | 'jerrycan' | 'walking_stick' | 'ghana_bag' | 'baby_wrap' | 'laptop_bag' | 'school_bag' | 'tool_bag' | 'bowl' | 'newspaper' | 'cane_basket';

export interface PropResult { parts: Part[]; materials: GarmentMaterial[] }

function mat(name: string, fabric: string, colour?: string, roughness?: number): GarmentMaterial {
  const f = FABRICS[fabric]; const tint = f.tintable && colour ? linear(colour) : [1, 1, 1];
  return { name, texture: FABRIC_PNG(f.name), baseColor: [tint[0], tint[1], tint[2], 1], roughness: roughness ?? f.roughness ?? 0.8, doubleSided: false };
}
const R = (seed: number, k: number) => { const x = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };

export function buildProp(rig: Rig, ctx: GarmentCtx, id: PropId, seed = 0, skinHex = '#5A3A28'): PropResult {
  const b = (n: string) => BONE_INDEX.get(n)!;
  const h = (n: string) => { const i = b(n); return [rig.heads[i * 3], rig.heads[i * 3 + 1], rig.heads[i * 3 + 2]]; };
  const hf = headFrame(rig); const head = b('Head'), lhand = b('LeftHand'), rhand = b('RightHand'), spine2 = b('Spine2');
  const LH = h('LeftHand'), RH = h('RightHand'), S2 = h('Spine2');
  const parts: Part[] = []; const mats: GarmentMaterial[] = [];
  const add = (p: Part, m: GarmentMaterial) => { parts.push(p); if (!mats.some(x => x.name === m.name)) mats.push(m); };
  const topY = hf.topY + 0.01, headZ = hf.headZ + 0.01;
  switch (id) {
    case 'head_tray_tomatoes': case 'head_tray_oranges': case 'head_tray_bread': {
      const tray = emptyPart('tray', 'p_tray'); cylinder(tray, [0, topY, headZ], [0, topY + 0.035, headZ], 0.24, head, [0.9, 0.9, 0.9], { rTop: 0.26, capA: true, capB: false });
      cylinder(tray, [0, topY + 0.035, headZ], [0, topY + 0.012, headZ], 0.245, head, [0.7, 0.7, 0.7], { rTop: 0.225, capA: false, capB: true }); // inner wall + floor
      add(tray, mat('p_tray', 'metal', '#C9CDD2', 0.45));
      const goods = emptyPart('goods', 'p_goods');
      const n = 26; const colour = id === 'head_tray_tomatoes' ? [0.75, 0.05, 0.02] : id === 'head_tray_oranges' ? [0.9, 0.35, 0.02] : [0.72, 0.45, 0.18];
      for (let i = 0; i < n; i++) { const a = R(seed, i) * Math.PI * 2, r = Math.sqrt(R(seed, i + 50)) * 0.18; const rad = id === 'head_tray_bread' ? 0.045 : 0.034 + R(seed, i + 100) * 0.006; const layer = i < 16 ? 0 : 1;
        const c = [Math.cos(a) * r, topY + 0.012 + rad + layer * rad * 1.5, headZ + Math.sin(a) * r]; const col = [colour[0] * (0.85 + R(seed, i + 7) * 0.3), colour[1] * (0.85 + R(seed, i + 9) * 0.3), colour[2]];
        sphere(goods, c, rad, head, col, 10, 6, id === 'head_tray_bread' ? [1.5, 0.7, 1] : [1, 0.92, 1]); }
      add(goods, mat('p_goods', 'plastic', undefined, 0.6));
      break;
    }
    case 'head_basin_sachets': {
      const basin = emptyPart('basin', 'p_basin'); cylinder(basin, [0, topY, headZ], [0, topY + 0.16, headZ], 0.17, head, [0.95, 0.95, 0.95], { rTop: 0.22, capA: true, capB: false });
      cylinder(basin, [0, topY + 0.16, headZ], [0, topY + 0.02, headZ], 0.21, head, [0.8, 0.8, 0.8], { rTop: 0.16, capA: false, capB: true });
      add(basin, mat('p_basin', 'plastic', '#2E86AB', 0.5));
      const sach = emptyPart('sachets', 'p_sachet');
      for (let i = 0; i < 14; i++) { const a = R(seed, i) * Math.PI * 2, r = Math.sqrt(R(seed, i + 30)) * 0.14; sphere(sach, [Math.cos(a) * r, topY + 0.13 + R(seed, i + 60) * 0.03, headZ + Math.sin(a) * r], 0.05, head, [0.85, 0.9, 1], 8, 5, [1.3, 0.5, 0.9]); }
      add(sach, mat('p_sachet', 'plastic', '#DDEBFF', 0.3));
      break;
    }
    case 'head_sack': { const s = emptyPart('sack', 'p_sack'); sphere(s, [0, topY + 0.2, headZ], 0.26, head, [1, 1, 1], 14, 10, [1.1, 0.75, 1.5]); add(s, mat('p_sack', 'raffia', '#D9C7A0')); break; }
    case 'head_basket_yams': case 'cane_basket': {
      const onHead = id === 'head_basket_yams'; const bone = onHead ? head : lhand; const c = onHead ? [0, topY, headZ] : [LH[0] + 0.3, LH[1] - 0.02, LH[2]];
      const bk = emptyPart('basket', 'p_basket'); cylinder(bk, c, [c[0], c[1] + 0.18, c[2]], 0.17, bone, [1, 1, 1], { rTop: 0.22, capA: true, capB: false }); cylinder(bk, [c[0], c[1] + 0.18, c[2]], [c[0], c[1] + 0.03, c[2]], 0.21, bone, [0.7, 0.7, 0.7], { rTop: 0.16, capA: false, capB: true });
      if (!onHead) strip(bk, [[c[0] - 0.18, c[1] + 0.18, c[2]], [c[0] - 0.12, c[1] + 0.01, c[2]], [c[0] + 0.12, c[1] + 0.01, c[2]], [c[0] + 0.18, c[1] + 0.18, c[2]]].map(q => [q[0], q[1], q[2]]), 0.02, [0, 0, 1], bone, [0.8, 0.8, 0.8]);
      add(bk, mat('p_basket', 'raffia', '#B8863B'));
      const yams = emptyPart('yams', 'p_yam'); for (let i = 0; i < 7; i++) { const a = R(seed, i) * Math.PI * 2, r = R(seed, i + 20) * 0.1; sphere(yams, [c[0] + Math.cos(a) * r, c[1] + 0.15 + R(seed, i + 40) * 0.04, c[2] + Math.sin(a) * r], 0.065, bone, [0.45, 0.3, 0.18], 10, 6, [1.6, 0.8, 0.9]); }
      add(yams, mat('p_yam', 'leather', '#6B4A2B', 0.9));
      break;
    }
    case 'handbag': { const p = emptyPart('handbag', 'p_bag'); const c = [LH[0] + 0.3, LH[1] - 0.01, LH[2] + 0.02]; box(p, c, [0.22, 0.1, 0.3], lhand, [1, 1, 1]);
      strip(p, [[c[0] - 0.11, c[1], c[2] - 0.08], [c[0] - 0.2, c[1], c[2] - 0.05], [c[0] - 0.24, c[1], c[2]], [c[0] - 0.2, c[1], c[2] + 0.05], [c[0] - 0.11, c[1], c[2] + 0.08]], 0.015, [0, 1, 0], lhand, [0.6, 0.6, 0.6]);
      add(p, mat('p_bag', 'leather', ['#3E2723', '#C62828', '#1B1B1B', '#F2B705', '#5B2A86'][seed % 5], 0.5)); break; }
    case 'briefcase': case 'laptop_bag': case 'tool_bag': { const p = emptyPart(id, 'p_case'); const c = [RH[0] - 0.33, RH[1] - 0.01, RH[2] + 0.02]; box(p, c, [0.32, 0.09, 0.42], rhand, [1, 1, 1]);
      strip(p, [[c[0] + 0.16, c[1], c[2] - 0.06], [c[0] + 0.22, c[1], c[2] - 0.04], [c[0] + 0.24, c[1], c[2]], [c[0] + 0.22, c[1], c[2] + 0.04], [c[0] + 0.16, c[1], c[2] + 0.06]], 0.02, [0, 1, 0], rhand, [0.5, 0.5, 0.5]);
      add(p, mat('p_case', id === 'tool_bag' ? 'cotton' : 'leather', id === 'tool_bag' ? '#6B6B6B' : id === 'laptop_bag' ? '#1B1B1B' : '#3E2723', 0.55)); break; }
    case 'school_bag': case 'backpack': { const p = emptyPart(id, 'p_pack'); const c = [0, S2[1] + 0.02, S2[2] - 0.16]; box(p, c, [0.3, 0.4, 0.14], spine2, [1, 1, 1]);
      for (const sx of [-1, 1]) strip(p, [[sx * 0.08, c[1] + 0.2, c[2] + 0.07], [sx * 0.1, c[1] + 0.22, S2[2] + 0.06], [sx * 0.1, c[1] + 0.02, S2[2] + 0.14], [sx * 0.1, c[1] - 0.12, S2[2] + 0.1]], 0.04, [1, 0, 0], spine2, [0.4, 0.4, 0.4]);
      add(p, mat('p_pack', 'polyester', id === 'school_bag' ? ['#1565C0', '#C62828', '#2E7D32'][seed % 3] : ['#1B1B1B', '#263238', '#4E342E'][seed % 3], 0.8)); break; }
    case 'phone': { const p = emptyPart('phone', 'p_phone'); box(p, [RH[0] - 0.08, RH[1] - 0.018, RH[2] + 0.005], [0.15, 0.009, 0.072], rhand, [0.05, 0.05, 0.06]); add(p, mat('p_phone', 'plastic', '#111111', 0.3)); break; }
    case 'bucket': { const p = emptyPart('bucket', 'p_bucket'); const c = [LH[0] + 0.3, LH[1], LH[2]]; cylinder(p, [c[0] + 0.14, c[1], c[2]], [c[0] - 0.14, c[1], c[2]], 0.13, lhand, [1, 1, 1], { rTop: 0.15, capA: true, capB: false });
      strip(p, [[c[0] - 0.14, c[1], c[2] - 0.15], [c[0] - 0.24, c[1], c[2] - 0.08], [c[0] - 0.28, c[1], c[2]], [c[0] - 0.24, c[1], c[2] + 0.08], [c[0] - 0.14, c[1], c[2] + 0.15]], 0.012, [0, 1, 0], lhand, [0.6, 0.6, 0.6]);
      add(p, mat('p_bucket', 'plastic', ['#1565C0', '#F9A825', '#C62828', '#2E7D32'][seed % 4], 0.45)); break; }
    case 'jerrycan': { const p = emptyPart('jerrycan', 'p_jerry'); const c = [RH[0] - 0.3, RH[1] - 0.02, RH[2] + 0.02]; box(p, c, [0.3, 0.17, 0.26], rhand, [1, 1, 1]); strip(p, [[c[0] + 0.15, c[1], c[2] - 0.05], [c[0] + 0.2, c[1], c[2] - 0.03], [c[0] + 0.2, c[1], c[2] + 0.03], [c[0] + 0.15, c[1], c[2] + 0.05]], 0.03, [0, 1, 0], rhand, [0.9, 0.9, 0.9]); add(p, mat('p_jerry', 'plastic', '#F2B705', 0.5)); break; }
    case 'walking_stick': { const p = emptyPart('stick', 'p_stick'); cylinder(p, [RH[0] - 0.02, RH[1] - 0.02, RH[2]], [RH[0] - 0.86, RH[1] - 0.02, RH[2]], 0.014, rhand, [1, 1, 1], { rTop: 0.01, seg: 8 }); add(p, mat('p_stick', 'leather', '#4E342E', 0.7)); break; }
    case 'ghana_bag': { const p = emptyPart('ghana_bag', 'p_ghana'); const c = [LH[0] + 0.33, LH[1], LH[2]]; box(p, c, [0.4, 0.22, 0.5], lhand, [1, 1, 1], 6); add(p, mat('p_ghana', 'checks', ['#C62828', '#1565C0'][seed % 2], 0.7)); break; }
    case 'bowl': { const p = emptyPart('bowl', 'p_bowl'); const c = [LH[0] + 0.22, LH[1], LH[2]]; cylinder(p, [c[0] + 0.06, c[1], c[2]], [c[0] - 0.06, c[1], c[2]], 0.08, lhand, [1, 1, 1], { rTop: 0.14, capA: true, capB: false }); add(p, mat('p_bowl', 'metal', '#C9CDD2', 0.4)); break; }
    case 'newspaper': { const p = emptyPart('newspaper', 'p_paper'); box(p, [LH[0] + 0.16, LH[1] - 0.02, LH[2]], [0.3, 0.015, 0.2], lhand, [0.95, 0.95, 0.9]); add(p, mat('p_paper', 'plain_paper' in FABRICS ? 'plain_paper' : 'cotton', '#EDE7D9', 0.9)); break; }
    case 'baby_wrap': {
      // wrapper cloth around the torso + the baby bundle on the back, head peeking out
      const look = { fabric: ['ankara_1', 'ankara_4', 'ankara_6', 'adire'][seed % 4] };
      let m = fromGroup(rig, 'helper-tights'); const lo = ctx.hipsY + 0.02, hi = ctx.chestY + 0.09;
      m = clip(m, v => Math.max(lo - v.p[1], v.p[1] - hi, Math.abs(v.p[0]) > ctx.shoulderX - 0.02 ? 1 : -1));
      offset(m, 0.024); rims(m, v => [-v.n[0] * 0.02, -v.n[1] * 0.02, -v.n[2] * 0.02]);
      const conc = concavity(m); const f = FABRICS[look.fabric];
      const sash = toPart(m, 'baby_sash', 'p_wrap_' + look.fabric, v => [v.p[0] / f.tile, -v.p[1] / f.tile], (v, i) => { const k = 1 - 0.4 * conc[i]; return [k, k, k]; });
      add(sash, mat('p_wrap_' + look.fabric, look.fabric));
      const bundle = emptyPart('baby', 'p_wrap_' + look.fabric); sphere(bundle, [0, S2[1] - 0.1, S2[2] - 0.16], 0.17, spine2, [1, 1, 1], 14, 10, [1, 1.25, 0.75]); add(bundle, mat('p_wrap_' + look.fabric, look.fabric));
      const babyHead = emptyPart('baby_head', 'p_baby_skin'); const skin = linear(skinHex); sphere(babyHead, [0.02, S2[1] + 0.13, S2[2] - 0.14], 0.062, spine2, [skin[0], skin[1], skin[2]], 12, 8); add(babyHead, mat('p_baby_skin', 'plain_skin' in FABRICS ? 'plain_skin' : 'cotton', undefined, 0.6));
      break;
    }
  }
  return { parts, materials: mats };
}

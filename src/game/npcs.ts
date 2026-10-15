/**
 * Household NPCs: staff and guests of the mansion placed at named spots, each performing the clips
 * of their function (gateman guarding, housekeeper sweeping, cook working …). They turn to face the
 * player when approached and can be talked to (one-liners by role). Scheduling/walking comes in APK 2.
 */
import * as THREE from 'three';
import { setSkinnedBounds } from '../characters/bounds';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { retargetAll } from '../characters/retarget';
import { loadAnimLibrary } from './player';
import type { Manifest, ManifestEntry } from '../app/crowd';
import type { Interactable } from './player';

export interface CastMember {
  key: string; role: string; title: string;
  /** manifest role ids, in preference order; falls back to tags/sex */
  prefer: string[]; sex?: 'f' | 'm';
  spot: string; clips: [string, number][]; // [clip, seconds] cycle
  lines: string[];
  sitHeight?: number;
}

export const HOUSEHOLD: CastMember[] = [
  { key: 'gateman', role: 'gateman', title: 'Gateman', prefer: ['gateman', 'security_guard'], sex: 'm', spot: 'gate', clips: [['guard', 14], ['idle_talk', 4], ['idle', 5]], lines: ['Oga, good morning! Gate dey open anytime you ready.', 'Nobody passed here since last night, sir.', 'Make I open the gate for you?'] },
  { key: 'security', role: 'security', title: 'Security', prefer: ['security_guard'], sex: 'm', spot: 'porch', clips: [['guard', 20], ['idle', 6]], lines: ['All quiet, boss.', 'I checked the perimeter twice this morning.', 'Your visitors must sign the book, sir.'] },
  { key: 'driver', role: 'driver', title: 'Driver', prefer: ['driver', 'resident'], sex: 'm', spot: 'driver', clips: [['phone', 10], ['idle', 6], ['idle_talk', 4]], lines: ['Cars are washed and fuelled, oga.', 'Where are we going today? Say the word.', 'Traffic on Unity Boulevard is heavy this morning.'] },
  { key: 'housekeeper', role: 'housekeeper', title: 'Housekeeper', prefer: ['housekeeper', 'resident'], sex: 'f', spot: 'living', clips: [['sweep', 16], ['idle', 4]], lines: ['Good morning! Breakfast is in the kitchen.', 'Please don’t walk on the carpet with wet feet.', 'I washed your clothes, they are in the wardrobe.'] },
  { key: 'cook', role: 'cook', title: 'Cook', prefer: ['food_seller', 'housekeeper'], sex: 'f', spot: 'kitchen', clips: [['work', 18], ['idle_talk', 3]], lines: ['Jollof is almost ready!', 'You want tea or coffee this morning?', 'The fridge is full, help yourself.'] },
  { key: 'gardener', role: 'gardener', title: 'Gardener', prefer: ['gardener', 'artisan'], sex: 'm', spot: 'garden', clips: [['work', 20], ['idle', 5]], lines: ['The hedges will be fine before the rain.', 'Those palms are older than you, oga!', 'I need a new hose for the back lawn.'] },
  { key: 'friend', role: 'friend', title: 'Friend', prefer: ['shopper', 'tech_worker', 'elite_woman', 'elite_man'], spot: 'sofa', clips: [['sit', 60]], sitHeight: 0, lines: ['Finally you are awake! Come and sit.', 'This house is too big for one person, you know.', 'Let’s go into town later, I want to see Palm Gardens.'] },
  { key: 'guest', role: 'guest', title: 'Guest', prefer: ['elite_man', 'elite_woman', 'banker'], spot: 'poolside', clips: [['phone', 12], ['idle_talk', 6]], lines: ['Lovely pool. You should host a party.', 'I heard the mayor is visiting North Heights next week.', 'Business is good in Vora, my friend.'] },
  { key: 'steward', role: 'steward', title: 'Steward', prefer: ['resident', 'office_worker'], sex: 'm', spot: 'dining', clips: [['work', 14], ['idle', 6]], lines: ['Dinner is served at seven, sir.', 'Shall I set a second plate?', 'The silverware is polished, sir.'] },
  { key: 'gatehouse', role: 'guard2', title: 'Night guard', prefer: ['security_guard', 'police'], sex: 'm', spot: 'gatehouse', clips: [['sit', 60]], lines: ['I am on night duty, boss. Just resting my legs.', 'The CCTV is working again.', 'Nothing to report.'] },
];

interface Npc {
  cast: CastMember; root: THREE.Object3D; mixer: THREE.AnimationMixer; actions: Map<string, THREE.AnimationAction>;
  cur: THREE.AnimationAction | null; curName: string; clipIdx: number; clipT: number;
  baseYaw: number; yaw: number; pos: THREE.Vector3; lods: THREE.Object3D[]; name: string; talking: number; lineIdx: number;
}

export class Household {
  npcs: Npc[] = [];
  interactables: Interactable[] = [];
  readonly group = new THREE.Group();
  private loader = new GLTFLoader();
  onSay: (who: string, line: string) => void = () => {};
  /** `lodScale` shrinks the LOD / visibility distances (Lite preset < 1) */
  constructor(private base: string, private shadows: boolean, private lodScale = 1) {}

  async load(manifest: Manifest, spots: Record<string, { x: number; y: number; z: number; yaw: number }>, playerSex: 'f' | 'm', progress?: (done: number, total: number) => void): Promise<void> {
    const lib = await loadAnimLibrary(this.base);
    const used = new Set<string>();
    const pick = (c: CastMember): ManifestEntry | null => {
      const wantSex = c.sex ?? (playerSex === 'm' ? 'f' : 'm');
      const pool = manifest.characters.filter(e => !used.has(e.id) && !(e.tags ?? []).includes('child'));
      for (const role of c.prefer) {
        const m = pool.filter(e => e.id.startsWith(`chr_${role}_`) || e.role === role);
        const bySex = m.find(e => (e as any).sex === wantSex) ?? m[0];
        if (bySex) return bySex;
      }
      return pool.find(e => (e as any).sex === wantSex) ?? pool[0] ?? null;
    };
    const jobs = HOUSEHOLD.filter(c => spots[c.spot]);
    let done = 0;
    await Promise.all(jobs.map(async c => {
      const entry = pick(c); if (!entry) return; used.add(entry.id);
      try {
        const gltf = await this.loader.loadAsync(this.base + entry.file);
        const root = cloneSkinned(gltf.scene) as THREE.Object3D;
        const lods: THREE.Object3D[] = [];
        root.traverse(o => { if (/^LOD\d$/.test(o.name)) lods.push(o); const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = this.shadows; m.receiveShadow = false; } });
        setSkinnedBounds(root, entry.height);
        lods.sort((a, b) => a.name < b.name ? -1 : 1); lods.forEach((l, i) => l.visible = i === 0);
        const clips = retargetAll(lib, root, entry.height);
        const mixer = new THREE.AnimationMixer(root); const actions = new Map<string, THREE.AnimationAction>();
        for (const clip of clips) actions.set(clip.name, mixer.clipAction(clip));
        const s = spots[c.spot];
        const npc: Npc = { cast: c, root, mixer, actions, cur: null, curName: '', clipIdx: -1, clipT: 0, baseYaw: s.yaw, yaw: s.yaw, pos: new THREE.Vector3(s.x, s.y, s.z), lods, name: entry.name ?? c.title, talking: 0, lineIdx: Math.floor(Math.random() * c.lines.length) };
        root.position.copy(npc.pos); root.rotation.y = s.yaw;
        this.group.add(root); this.npcs.push(npc);
        this.nextClip(npc, Math.random() * 3);
        this.interactables.push({ prompt: `Talk to ${npc.name.split(' ')[0]} (${c.title})`, pos: npc.pos, radius: 1.9, action: () => this.talk(npc) });
      } catch (e) { console.warn('[household] failed', entry.id, e); }
      progress?.(++done, jobs.length);
    }));
  }

  private nextClip(npc: Npc, offset = 0) {
    npc.clipIdx = (npc.clipIdx + 1) % npc.cast.clips.length;
    const [name, secs] = npc.cast.clips[npc.clipIdx];
    this.play(npc, npc.actions.has(name) ? name : 'idle'); npc.clipT = secs + offset;
  }
  private play(npc: Npc, name: string, once = false) {
    if (npc.curName === name && !once) return;
    const a = npc.actions.get(name); if (!a) return;
    a.reset(); a.enabled = true; a.setEffectiveWeight(1); a.setLoop(THREE.LoopRepeat, Infinity);
    if (npc.cur && npc.cur !== a) a.crossFadeFrom(npc.cur, 0.3, true);
    a.play(); npc.cur = a; npc.curName = name;
  }
  private talk(npc: Npc) {
    const line = npc.cast.lines[npc.lineIdx % npc.cast.lines.length]; npc.lineIdx++;
    npc.talking = 4; if (npc.curName !== 'sit') this.play(npc, 'idle_talk');
    this.onSay(npc.name, line);
  }

  update(dt: number, player: THREE.Vector3, camPos: THREE.Vector3) {
    for (const npc of this.npcs) {
      const d2 = npc.pos.distanceToSquared(camPos) / (this.lodScale * this.lodScale);
      if (d2 > 60 * 60) { npc.root.visible = false; continue; }
      npc.root.visible = true;
      const lod = d2 < 14 * 14 ? 0 : d2 < 30 * 30 ? 1 : 2;
      npc.lods.forEach((l, i) => l.visible = i === Math.min(lod, npc.lods.length - 1));
      if (lod === 2 && (Math.random() < 0.5)) continue; // far: half-rate animation
      // face the player when close (except seated)
      const dp = npc.pos.distanceToSquared(player);
      let target = npc.baseYaw;
      if (dp < 3.2 * 3.2 && npc.curName !== 'sit' && npc.curName !== 'sweep' && npc.curName !== 'work') target = Math.atan2(player.x - npc.pos.x, player.z - npc.pos.z);
      else if (npc.talking > 0) target = Math.atan2(player.x - npc.pos.x, player.z - npc.pos.z);
      let diff = target - npc.yaw; while (diff > Math.PI) diff -= Math.PI * 2; while (diff < -Math.PI) diff += Math.PI * 2;
      npc.yaw += diff * Math.min(1, dt * 4); npc.root.rotation.y = npc.yaw;
      if (npc.talking > 0) { npc.talking -= dt; if (npc.talking <= 0) { npc.clipIdx--; this.nextClip(npc); } }
      else { npc.clipT -= dt; if (npc.clipT <= 0) this.nextClip(npc); }
      npc.mixer.update(lod === 2 ? dt * 2 : dt);
    }
  }
}

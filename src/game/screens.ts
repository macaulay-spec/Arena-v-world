/** Menu/overlay screens: JAG logo, loading, title, character creation, pause, settings. */
import type { Appearance, KitInfo } from './player';
import { type Settings, type QualityId, autoQuality } from './save';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
export type ScreenId = 'logo' | 'loading' | 'title' | 'create' | 'pause' | 'settings';

const FIRST_NAMES_M = ['Tunde', 'Emeka', 'Kunle', 'Musa', 'Dayo', 'Ikenna', 'Seyi', 'Bello', 'Femi', 'Nnamdi', 'Jide', 'Kelechi'];
const FIRST_NAMES_F = ['Amaka', 'Bisi', 'Zainab', 'Ngozi', 'Tola', 'Hauwa', 'Ife', 'Chioma', 'Yemi', 'Adaeze', 'Sade', 'Funmi'];

export class Screens {
  private visible = new Set<ScreenId>();
  show(id: ScreenId, on = true) { $(`screen-${id}`).classList.toggle('hidden', !on); if (on) this.visible.add(id); else this.visible.delete(id); }
  hideAll() { for (const id of [...this.visible]) this.show(id, false); }
  get anyVisible() { return this.visible.size > 0; }

  /** JAG studio logo: letters punch in, hold, fade out (≈3.2 s) */
  async logo(): Promise<void> {
    this.show('logo'); await wait(2500);
    $('screen-logo').classList.add('out'); await wait(500); this.show('logo', false);
  }
  setLoading(label: string, f: number) { $('load-bar').style.width = `${Math.round(f * 100)}%`; $('load-text').textContent = label; }

  /** title: tap to start → menu; resolves with the chosen action. `onSettings` opens the settings overlay. */
  title(hasSave: boolean, quality: string, onSettings: () => Promise<void>, onTap: () => void): Promise<'continue' | 'new'> {
    this.show('title'); $('build-quality').textContent = quality;
    const tap = $('tap-start'), menu = $('title-menu');
    tap.classList.remove('hidden'); menu.classList.add('hidden');
    $<HTMLButtonElement>('btn-continue').disabled = !hasSave; $('btn-continue').classList.toggle('hidden', !hasSave);
    $('btn-new').textContent = hasSave ? 'New game' : 'Start';
    return new Promise(resolve => {
      const start = (e: Event) => { e.preventDefault(); onTap(); tap.classList.add('hidden'); menu.classList.remove('hidden'); $('screen-title').removeEventListener('pointerdown', start); };
      $('screen-title').addEventListener('pointerdown', start);
      const done = (v: 'continue' | 'new') => { cleanup(); this.show('title', false); resolve(v); };
      const onCont = () => done('continue'), onNew = () => { if (hasSave && !confirm('Start a new game? Your current save will be replaced.')) return; done('new'); };
      const onSet = async () => { $('screen-title').classList.add('hidden'); await onSettings(); $('screen-title').classList.remove('hidden'); };
      $('btn-continue').addEventListener('click', onCont); $('btn-new').addEventListener('click', onNew); $('btn-settings').addEventListener('click', onSet);
      const cleanup = () => { $('btn-continue').removeEventListener('click', onCont); $('btn-new').removeEventListener('click', onNew); $('btn-settings').removeEventListener('click', onSet); };
    });
  }

  /** character creation; `onChange` is called with every edit so the 3D preview can follow */
  create(info: KitInfo[], initial: Appearance, onChange: (a: Appearance) => void): Promise<Appearance> {
    this.show('create');
    const a: Appearance = { ...initial };
    const name = $<HTMLInputElement>('c-name'), tone = $<HTMLInputElement>('c-tone'), height = $<HTMLInputElement>('c-height');
    const sexSeg = $('c-sex'); const hairL = $('c-hair'), outfitL = $('c-outfit');
    const kit = () => info.find(k => k.sex === a.sex) ?? info[0];
    const sync = () => {
      const k = kit(); tone.max = String(k.skin.length - 1);
      if (!k.hair.some(h => h.id === a.hair)) a.hair = k.hair[0].id;
      if (!k.outfits.some(o => o.id === a.outfit)) a.outfit = k.outfits[0].id;
      name.value = a.name; tone.value = String(a.tone); height.value = String(a.height);
      hairL.textContent = k.hair.find(h => h.id === a.hair)?.name ?? a.hair; outfitL.textContent = k.outfits.find(o => o.id === a.outfit)?.name ?? a.outfit;
      sexSeg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === a.sex));
      onChange({ ...a });
    };
    const step = (list: { id: string }[], cur: string, d: number) => list[(list.findIndex(x => x.id === cur) + d + list.length) % list.length].id;
    const handlers: [HTMLElement, string, (e: Event) => void][] = [
      [name, 'input', () => { a.name = name.value.slice(0, 14); onChange({ ...a }); }],
      [tone, 'input', () => { a.tone = +tone.value; onChange({ ...a }); }],
      [height, 'input', () => { a.height = +height.value; onChange({ ...a }); }],
      [sexSeg, 'click', e => { const v = (e.target as HTMLElement).dataset.v as 'f' | 'm' | undefined; if (v && v !== a.sex) { a.sex = v; if (!name.value || FIRST_NAMES_M.includes(a.name) || FIRST_NAMES_F.includes(a.name)) a.name = (v === 'm' ? FIRST_NAMES_M : FIRST_NAMES_F)[Math.floor(Math.random() * 12)]; sync(); } }],
      [$('c-hair-prev'), 'click', () => { a.hair = step(kit().hair, a.hair, -1); sync(); }], [$('c-hair-next'), 'click', () => { a.hair = step(kit().hair, a.hair, 1); sync(); }],
      [$('c-outfit-prev'), 'click', () => { a.outfit = step(kit().outfits, a.outfit, -1); sync(); }], [$('c-outfit-next'), 'click', () => { a.outfit = step(kit().outfits, a.outfit, 1); sync(); }],
      [$('c-random'), 'click', () => { const k0 = info[Math.floor(Math.random() * info.length)]; a.sex = k0.sex; a.tone = Math.floor(Math.random() * k0.skin.length); a.hair = k0.hair[Math.floor(Math.random() * k0.hair.length)].id; a.outfit = k0.outfits[Math.floor(Math.random() * k0.outfits.length)].id; a.height = Math.round(Math.random() * 20) / 20; a.name = (a.sex === 'm' ? FIRST_NAMES_M : FIRST_NAMES_F)[Math.floor(Math.random() * 12)]; sync(); }],
    ];
    for (const [el, ev, fn] of handlers) el.addEventListener(ev, fn);
    sync();
    return new Promise(resolve => {
      const done = () => { if (!a.name.trim()) a.name = (a.sex === 'm' ? FIRST_NAMES_M : FIRST_NAMES_F)[0]; for (const [el, ev, fn] of handlers) el.removeEventListener(ev, fn); $('c-done').removeEventListener('click', done); this.show('create', false); resolve({ ...a }); };
      $('c-done').addEventListener('click', done);
    });
  }

  pause(info: string): Promise<'resume' | 'save' | 'settings' | 'quit'> {
    this.show('pause'); $('pause-info').textContent = info;
    return new Promise(resolve => {
      const ids: ['btn-resume' | 'btn-save' | 'btn-pause-settings' | 'btn-quit', 'resume' | 'save' | 'settings' | 'quit'][] = [['btn-resume', 'resume'], ['btn-save', 'save'], ['btn-pause-settings', 'settings'], ['btn-quit', 'quit']];
      const fns = ids.map(([id, v]) => { const f = () => { ids.forEach(([i], k) => $(i).removeEventListener('click', fns[k])); this.show('pause', false); resolve(v); }; $(id).addEventListener('click', f); return f; });
    });
  }

  settings(s: Settings, apply: (s: Settings) => void, onReset: () => void): Promise<void> {
    this.show('settings');
    const seg = $('s-quality'), sens = $<HTMLInputElement>('s-sens'), inv = $<HTMLInputElement>('s-invert'), fps = $<HTMLInputElement>('s-fps');
    const sync = () => { seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === s.quality)); sens.value = String(s.sensitivity); inv.checked = s.invertY; fps.checked = s.showFps; $('s-note').textContent = `Auto picks ${autoQuality()} on this device. Changing graphics restarts the world.`; };
    const onSeg = (e: Event) => { const v = (e.target as HTMLElement).dataset.v as QualityId | 'auto' | undefined; if (v) { s.quality = v; sync(); apply(s); } };
    const onSens = () => { s.sensitivity = +sens.value; apply(s); }, onInv = () => { s.invertY = inv.checked; apply(s); }, onFps = () => { s.showFps = fps.checked; apply(s); };
    seg.addEventListener('click', onSeg); sens.addEventListener('input', onSens); inv.addEventListener('change', onInv); fps.addEventListener('change', onFps);
    const reset = () => { if (confirm('Delete your save game?')) onReset(); };
    $('btn-reset').addEventListener('click', reset);
    sync();
    return new Promise(resolve => {
      const back = () => { seg.removeEventListener('click', onSeg); sens.removeEventListener('input', onSens); inv.removeEventListener('change', onInv); fps.removeEventListener('change', onFps); $('btn-reset').removeEventListener('click', reset); $('btn-settings-back').removeEventListener('click', back); this.show('settings', false); resolve(); };
      $('btn-settings-back').addEventListener('click', back);
    });
  }
}

/** On-screen UI: info panel, time-of-day, quality, mode, landmark jump list, inspector and stats. */
import type { CityData, Landmark } from '../shared/types';

export interface HudCallbacks {
  onHour(h: number): void;
  onMode(mode: 'orbit' | 'walk'): void;
  onQuality(q: 'low' | 'medium' | 'high'): void;
  onLandmark(l: Landmark): void;
  onShadows(on: boolean): void;
}

export class Hud {
  private time!: HTMLInputElement;
  root: HTMLElement;
  private districtEl: HTMLElement; private posEl: HTMLElement; private fpsEl: HTMLElement; private statsEl: HTMLElement; private inspectEl: HTMLElement; private hourLabel: HTMLElement;
  private helpEl: HTMLElement;
  constructor(readonly city: CityData, cb: HudCallbacks, initial: { hour: number; quality: 'low' | 'medium' | 'high'; shadows: boolean; mobile: boolean }) {
    const root = document.getElementById('hud')!; this.root = root;
    root.innerHTML = `
      <div class="panel top-left">
        <div class="title" id="hud-title" title="collapse / expand">V-WORLD · <span>Vora City</span><b class="caret">▾</b></div>
        <div class="row"><span class="k">District</span><span id="hud-district" class="v">—</span></div>
        <div class="row"><span class="k">Position</span><span id="hud-pos" class="v">—</span></div>
        <div class="row"><span class="k">Time</span><span id="hud-hour" class="v">10:00</span></div>
        <input id="hud-time" type="range" min="0" max="24" step="0.1" value="${initial.hour}">
        <div class="row ctrls">
          <select id="hud-mode" title="camera mode"><option value="orbit">Orbit</option><option value="walk">Walk</option></select>
          <select id="hud-quality" title="quality"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select>
          <label class="chk"><input id="hud-shadows" type="checkbox" ${initial.shadows ? 'checked' : ''}> shadows</label>
        </div>
        <div class="row"><select id="hud-landmark"><option value="">Jump to landmark…</option></select></div>
        <div id="hud-stats" class="stats"></div>
        <button id="hud-help-btn" class="link">controls</button>
        <div id="hud-help" class="help hidden">
          <b>Orbit:</b> drag rotate · right-drag/shift-drag pan · wheel zoom · WASD move · Q/E zoom<br>
          <b>Walk:</b> click to look · WASD move · shift run · space/C rise/lower · wheel speed<br>
          <b>Touch:</b> one finger rotate · two fingers pinch/pan<br>
          <b>Click</b> a building or road to inspect it. Click the minimap to travel.
        </div>
      </div>
      <div id="hud-inspect" class="panel inspect hidden"></div>
      <div id="hud-fps" class="fps"></div>`;
    this.districtEl = root.querySelector('#hud-district')!; this.posEl = root.querySelector('#hud-pos')!; this.fpsEl = root.querySelector('#hud-fps')!; this.statsEl = root.querySelector('#hud-stats')!; this.inspectEl = root.querySelector('#hud-inspect')!; this.hourLabel = root.querySelector('#hud-hour')!; this.helpEl = root.querySelector('#hud-help')!;
    const time = root.querySelector<HTMLInputElement>('#hud-time')!; this.time = time;
    time.addEventListener('input', () => { const h = parseFloat(time.value); this.setHourLabel(h); cb.onHour(h); });
    const mode = root.querySelector<HTMLSelectElement>('#hud-mode')!; mode.addEventListener('change', () => cb.onMode(mode.value as 'orbit' | 'walk'));
    const q = root.querySelector<HTMLSelectElement>('#hud-quality')!; q.value = initial.quality; q.addEventListener('change', () => cb.onQuality(q.value as 'low' | 'medium' | 'high'));
    const sh = root.querySelector<HTMLInputElement>('#hud-shadows')!; sh.addEventListener('change', () => cb.onShadows(sh.checked));
    const lm = root.querySelector<HTMLSelectElement>('#hud-landmark')!;
    for (const l of city.landmarks) { const o = document.createElement('option'); o.value = l.id; o.textContent = `${l.name} (${l.role})`; lm.appendChild(o); }
    lm.addEventListener('change', () => { const l = city.landmarks.find(x => x.id === lm.value); if (l) cb.onLandmark(l); lm.value = ''; });
    root.querySelector('#hud-help-btn')!.addEventListener('click', () => this.helpEl.classList.toggle('hidden'));
    this.setHourLabel(initial.hour);
    this.statsEl.textContent = `${city.stats.buildings} buildings · ${city.stats.edges} road segments · ${city.stats.parcels} parcels · ${city.stats.props} props`;
    if (initial.mobile) root.classList.add('mobile');
    const panel = root.querySelector('.top-left')!;
    root.querySelector('#hud-title')!.addEventListener('click', () => panel.classList.toggle('collapsed'));
  }
  setHourLabel(h: number) { const hh = Math.floor(h) % 24, mm = Math.floor((h % 1) * 60); this.hourLabel.textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`; if (Math.abs(parseFloat(this.time.value) - h) > 0.01) this.time.value = String(h); }
  setMode(m: 'orbit' | 'walk') { (this.root.querySelector('#hud-mode') as HTMLSelectElement).value = m; }
  update(district: string, x: number, z: number, fps: number, extra: string) {
    this.districtEl.textContent = district; this.posEl.textContent = `${x.toFixed(0)} E, ${(-z).toFixed(0)} N`;
    this.fpsEl.textContent = `${fps.toFixed(0)} fps · ${extra}`;
  }
  inspect(html: string | null) { if (!html) { this.inspectEl.classList.add('hidden'); return; } this.inspectEl.innerHTML = html + '<button class="close" id="hud-inspect-close">×</button>'; this.inspectEl.classList.remove('hidden'); this.inspectEl.querySelector('#hud-inspect-close')!.addEventListener('click', () => this.inspect(null)); }
}

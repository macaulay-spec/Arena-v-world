/** In-game HUD: radar, clock, cash, health, location card, interaction prompt, speech + toasts. */
import { clockLabel } from './save';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export class Hud {
  root = $('hud');
  radar = $<HTMLCanvasElement>('radar');
  private clock = $('clock'); private cash = $('cash'); private health = $('health-bar'); private day = $('day'); private healthShown = -1;
  private prompt = $('prompt'); private promptText = $('prompt-text');
  private place = $('place'); private placeSub = $('place-sub');
  private toast = $('toast'); private speech = $('speech'); private speechWho = $('speech-who'); private speechText = $('speech-text');
  private fps = $('fps');
  private placeT = 0; private toastT = 0; private speechT = 0; private lastPlace = '';
  private cashShown = NaN; private clockShown = '';

  show(on: boolean) { this.root.classList.toggle('hidden', !on); }
  setFpsVisible(on: boolean) { this.fps.classList.toggle('hidden', !on); }
  setFps(v: number, info = '') { this.fps.textContent = `${v.toFixed(0)} fps${info ? ' · ' + info : ''}`; }

  setStats(minutes: number, day: number, cash: number, health: number) {
    const c = clockLabel(minutes); if (c !== this.clockShown) { this.clock.textContent = c; this.clockShown = c; this.day.textContent = `Day ${day}`; }
    if (cash !== this.cashShown) { this.cash.innerHTML = `<span class="cur">₦</span>${Math.round(cash).toLocaleString('en-NG')}`; this.cashShown = cash; }
    const hw = Math.round(Math.max(0, Math.min(100, health))); if (hw !== this.healthShown) { this.healthShown = hw; this.health.style.width = `${hw}%`; }
  }
  setPrompt(text: string | null) {
    if (!text) { this.prompt.classList.add('hidden'); return; }
    if (this.promptText.textContent !== text) this.promptText.textContent = text;
    this.prompt.classList.remove('hidden');
  }
  /** location card (slides in when the place changes) */
  setPlace(name: string, sub = '') {
    if (name === this.lastPlace) return; this.lastPlace = name;
    this.place.textContent = name; this.placeSub.textContent = sub;
    this.place.parentElement!.classList.remove('hidden'); this.place.parentElement!.classList.add('in'); this.placeT = 4.5;
  }
  notify(text: string, seconds = 3.5) { this.toast.textContent = text; this.toast.classList.remove('hidden'); this.toastT = seconds; }
  say(who: string, text: string, seconds = 4.5) { this.speechWho.textContent = who; this.speechText.textContent = text; this.speech.classList.remove('hidden'); this.speechT = seconds; }

  update(dt: number) {
    if (this.placeT > 0) { this.placeT -= dt; if (this.placeT <= 0) { this.place.parentElement!.classList.remove('in'); setTimeout(() => this.placeT <= 0 && this.place.parentElement!.classList.add('hidden'), 600); } }
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) this.toast.classList.add('hidden'); }
    if (this.speechT > 0) { this.speechT -= dt; if (this.speechT <= 0) this.speech.classList.add('hidden'); }
  }
}

/** fade to black and back (sleeping, teleports, scene changes) */
export function fade(toBlack: boolean, ms = 500): Promise<void> {
  const el = $('fade'); el.style.transitionDuration = `${ms}ms`; el.classList.toggle('black', toBlack);
  return new Promise(r => setTimeout(r, ms));
}

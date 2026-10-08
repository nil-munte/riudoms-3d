// HUD (clock, street name, landmark signs, prompts) and the pause menu
// (controls, time of day, quality, teleport, sources and credits).
import type { Sign } from '../world/landmarks';
import type { Meta } from '../data/types';

const $ = (id: string) => document.getElementById(id)!;

export interface MenuHandlers {
  teleport: (x: number, y: number, name?: string) => void;
  setHour: (h: number) => void;
  setRunning: (on: boolean) => void;
  setShadows: (on: boolean) => void;
  setFarTrees: (on: boolean) => void;
  onOpen: () => void;
  onClose: () => void;
}

export class Hud {
  paused = false;
  private sign: Sign | null = null;
  private signTimer = 0;
  private hintTimer = 9;

  constructor(private h: MenuHandlers, teleports: { name: string; x: number; y: number }[], meta: Meta,
              credits: { title: string; author: string; license: string }[]) {
    $('btn-menu').addEventListener('click', () => this.toggleMenu());
    $('btn-resume').addEventListener('click', () => this.toggleMenu(false));
    $('btn-credits').addEventListener('click', () => $('credits').classList.toggle('hidden'));
    const time = $('time') as HTMLInputElement;
    time.addEventListener('input', () => h.setHour(parseFloat(time.value)));
    ($('time-run') as HTMLInputElement).addEventListener('change', (e) => h.setRunning((e.target as HTMLInputElement).checked));
    ($('q-shadows') as HTMLInputElement).addEventListener('change', (e) => h.setShadows((e.target as HTMLInputElement).checked));
    ($('q-trees') as HTMLInputElement).addEventListener('change', (e) => h.setFarTrees((e.target as HTMLInputElement).checked));
    const tp = $('teleports');
    for (const t of teleports) {
      const b = document.createElement('button');
      b.textContent = t.name;
      b.addEventListener('click', () => { h.teleport(t.x, t.y, t.name); this.toggleMenu(false); });
      tp.appendChild(b);
    }
    // sources & credits
    const src = Object.values(meta.sources).map((s: any) =>
      `<li>${s.name}${s.license ? ` — <i>${s.license}</i>` : ''}${s.url ? ` · <a href="${s.url}" target="_blank" rel="noopener">${new URL(s.url).host}</a>` : ''}</li>`).join('');
    const ph = credits.slice(0, 40).map((c) => `<li>${c.title ?? ''} — ${c.author ?? ''} (${c.license ?? ''})</li>`).join('');
    $('credits').innerHTML = `<b>Fonts de dades</b><ul>${src}</ul>
      <b>Patrimoni</b><ul><li>Inventari del Patrimoni Arquitectònic de Catalunya, Viquipèdia, Wikidata, riudoms.cat,
      riudomsturisme.cat, campaners.com, revista <i>Lo Floc</i> (CERAP)</li></ul>
      <b>Fotografies de referència (Wikimedia Commons)</b><ul>${ph}</ul>
      <p>Dades generades el ${meta.generated}. És una recreació aproximada: molts detalls no coincideixen amb el poble real.
      Què és dada real i què és estimat: <a href="https://github.com/nil-munte/riudoms-3d/blob/main/DADES.md" target="_blank" rel="noopener">DADES.md</a>.</p>`;
  }

  toggleMenu(open = !this.paused) {
    this.paused = open;
    $('menu').classList.toggle('hidden', !open);
    if (open) this.h.onOpen(); else this.h.onClose();
  }

  setTime(hour: number, running: boolean) {
    const hh = Math.floor(hour), mm = Math.floor((hour - hh) * 60);
    $('clock').textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    if (!this.paused) {
      (document.getElementById('time') as HTMLInputElement).value = String(hour);
      (document.getElementById('time-run') as HTMLInputElement).checked = running;
    }
  }

  setPlace(name: string | null) { $('place-name').textContent = name ?? ''; }

  setPrompt(html: string | null) {
    const p = $('prompt');
    if (!html) { p.classList.add('hidden'); return; }
    p.innerHTML = html;
    p.classList.remove('hidden');
  }

  update(dt: number, sign: Sign | null) {
    this.hintTimer -= dt;
    if (this.hintTimer < 0) $('hint').style.opacity = '0';
    if (sign !== this.sign) {
      if (sign) {
        this.signTimer += dt;
        if (this.signTimer < 0.6 && this.sign === null) return; // small delay when arriving
        const el = $('sign');
        el.querySelector('.sign-title')!.textContent = sign.name;
        el.querySelector('.sign-text')!.textContent = sign.text;
        el.querySelector('.sign-src')!.textContent = sign.src ? `Font: ${sign.src}` : '';
        el.classList.remove('hidden');
        // restart the entry animation
        el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
      } else {
        $('sign').classList.add('hidden');
      }
      this.sign = sign;
      this.signTimer = 0;
    }
  }
}

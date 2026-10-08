// Anonymous usage statistics with GoatCounter (https://riudoms-3d.goatcounter.com):
// no cookies, no personal data, only counts. The hits go straight to the
// counting endpoint (no third-party script): the page view, plus a few game
// events, each one at most once per visit. Nothing is sent from localhost.

const ENDPOINT = 'https://riudoms-3d.goatcounter.com/count';
const LOCAL = /^(localhost|127\.|\[::1\]|0\.0\.0\.0)/.test(location.hostname) || location.protocol === 'file:';
const sent = new Set<string>();

/** One hit to GoatCounter's counting endpoint (no script, no cookies): a tiny image request. */
function hit(params: Record<string, string>) {
  if (LOCAL) return;
  const q = new URLSearchParams({ ...params, rnd: Math.random().toString(36).slice(2, 8) });
  try { new Image().src = `${ENDPOINT}?${q}`; } catch { /* never break the game */ }
}

/** The page view, with where the visitor comes from (referrer, or ?ref= in the link). */
export function countVisit() {
  hit({
    p: location.pathname,
    t: document.title,
    r: document.referrer,
    q: location.search,
    s: `${screen.width},${screen.height},${window.devicePixelRatio || 1}`,
  });
}

/** Count an event once per visit, e.g. track('place/esglesia', 'Església'). */
export function track(path: string, title = path) {
  if (sent.has(path)) return;
  sent.add(path);
  hit({ p: path, t: title, e: 'true' });
}

const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

export const bucket = (v: number, edges: number[], labels: string[]) => {
  for (let i = 0; i < edges.length; i++) if (v < edges[i]) return labels[i];
  return labels[labels.length - 1];
};

/** Per-frame bookkeeping for the events that depend on time or state. */
export class GameStats {
  private played = 0; // seconds with the page visible
  private frames = 0;
  private frameTime = 0;
  private perfSent = false;

  loaded(seconds: number) {
    track('load/ok', 'Càrrega completada');
    track('load/' + bucket(seconds, [5, 10, 20, 40], ['0-5s', '5-10s', '10-20s', '20-40s', '40s+']),
      'Temps de càrrega');
  }

  place(id: string, name: string) { track('place/' + slug(id), name); }
  teleport(name: string) { track('teleport/' + slug(name), 'Teletransport: ' + name); }
  action(what: string, title: string) { track('action/' + what, title); }

  frame(dt: number) {
    if (document.hidden) return;
    this.played += dt;
    for (const [s, label] of [[60, '1min'], [300, '5min'], [900, '15min']] as const)
      if (this.played >= s) track('time/' + label, 'Temps de joc: ' + label);
    // average frame rate over the first 30 s of play, after a 5 s warm-up
    if (!this.perfSent && this.played > 5) {
      this.frames++; this.frameTime += dt;
      if (this.frameTime >= 30) {
        const fps = this.frames / this.frameTime;
        track('perf/' + bucket(fps, [20, 30, 45], ['<20fps', '20-30fps', '30-45fps', '45fps+']), 'Rendiment');
        this.perfSent = true;
      }
    }
  }
}

// Звук конструктора из файлов звукорежиссёра: три синхронные петли (чай / лаунж / танцпол) одной длины, темпа и тональности,
// по ползунку — равномощный кроссфейд. Переход между зонами — «подъём» (riser), заканчивающийся в начале следующего такта, и «удар» (hit).
// Если файлов нет или они не загрузились — работает синтезатор из sound.ts.
import { EveningSound } from './sound';

export type StemUrls = { tea: string; teadj: string; dj: string; riser?: string; hit?: string; bpm?: number };
const clamp = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (a: number, b: number, x: number) => { const k = clamp((x - a) / (b - a)); return k * k * (3 - 2 * k); };

export class StemSound {
  mix = 0.5;
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private g: GainNode[] = [];
  private src: AudioBufferSourceNode[] = [];
  private buf: Record<string, AudioBuffer> = {};
  private t0 = 0; private zone = -1; private lastFx = -10; private loading: Promise<void> | null = null;
  private fallback: EveningSound | null = null;
  constructor(private u: StemUrls) {}

  private async load() {
    const ctx = this.ctx!;
    const get = async (k: keyof StemUrls) => {
      const href = this.u[k] as string | undefined; if (!href) return;
      const r = await fetch(href); if (!r.ok) throw new Error(href);
      this.buf[k] = await ctx.decodeAudioData(await r.arrayBuffer());
    };
    await Promise.all([get('tea'), get('teadj'), get('dj')]);
    get('riser').catch(() => {}); get('hit').catch(() => {}); // необязательные — догружаются в фоне
  }

  async start() {
    if (this.fallback) return this.fallback.start();
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const comp = this.ctx.createDynamicsCompressor(); comp.threshold.value = -10; comp.ratio.value = 2.5;
      this.master = this.ctx.createGain(); this.master.gain.value = 0;
      this.master.connect(comp).connect(this.ctx.destination);
      this.g = [0, 1, 2].map(() => { const n = this.ctx!.createGain(); n.gain.value = 0; n.connect(this.master); return n; });
      this.loading = this.load().catch(() => { this.fallback = new EveningSound(); this.fallback.mix = this.mix; });
    }
    const ctx = this.ctx; await ctx.resume();
    await this.loading;
    if (this.fallback) return this.fallback.start();
    if (!this.src.length) {
      // все три петли стартуют в одну и ту же миллисекунду — так они всегда в такт
      this.t0 = ctx.currentTime + 0.08;
      this.src = (['tea', 'teadj', 'dj'] as const).map((k, i) => {
        const s = ctx.createBufferSource(); s.buffer = this.buf[k]; s.loop = true; s.connect(this.g[i]); s.start(this.t0); return s;
      });
    }
    this.zone = this.zoneOf(this.mix);
    this.setMix(this.mix);
    this.master.gain.cancelScheduledValues(ctx.currentTime);
    this.master.gain.setTargetAtTime(0.9, ctx.currentTime, 0.3);
  }

  stop() {
    if (this.fallback) return this.fallback.stop();
    if (!this.ctx) return;
    const ctx = this.ctx;
    this.master.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
    setTimeout(() => { this.src.forEach((s) => { try { s.stop(); } catch {} }); this.src = []; ctx.suspend(); }, 900);
  }

  setMix(p: number) {
    this.mix = p;
    if (this.fallback) return this.fallback.setMix(p);
    if (!this.ctx || !this.g.length) return;
    // те же кривые, что у синтезатора: чай слева, лаунж в центре, танцпол справа; равномощно — без провала громкости
    const w = [1 - smooth(0.15, 0.5, p), smooth(0.1, 0.45, p) * (1 - smooth(0.55, 0.9, p)), smooth(0.5, 0.85, p)];
    const sum = Math.hypot(...w) || 1;
    const t = this.ctx.currentTime;
    w.forEach((x, i) => this.g[i].gain.setTargetAtTime(x / sum, t, 0.12));
    const z = this.zoneOf(p);
    if (this.src.length && this.zone !== -1 && z !== this.zone && t - this.lastFx > 1.2) { this.transition(z > this.zone); this.lastFx = t; }
    this.zone = z;
  }

  private zoneOf(p: number) { return p < 0.25 ? 0 : p < 0.75 ? 1 : 2; }

  private transition(up: boolean) {
    const ctx = this.ctx!; const now = ctx.currentTime;
    const bar = (60 / (this.u.bpm || 120)) * 4;
    let at = this.t0 + Math.ceil((now - this.t0) / bar) * bar; // начало следующего такта
    if (at - now < 0.35) at += bar;
    const play = (b: AudioBuffer | undefined, when: number, offset = 0, gain = 0.8) => {
      if (!b) return;
      const s = ctx.createBufferSource(); s.buffer = b; const g = ctx.createGain(); g.gain.value = gain;
      s.connect(g).connect(this.master); s.start(Math.max(now, when), offset);
    };
    const r = this.buf.riser;
    if (r && up) { const start = at - r.duration; play(r, start, Math.max(0, now - start)); }
    play(this.buf.hit, at, 0, 0.9);
  }
}

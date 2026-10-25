// Звук вечера без файлов — одна композиция в ля-миноре, 120 BPM, три слоя по ползунку mix = 0…1:
//   чай (0)      — щипковая пентатоника «гучжэн», мягкие аккорды, деревянная коробочка, чаша;
//   чай + DJ (½) — лаунж: мягкая бочка с ломаным ритмом, римшот, шейкер, саб-бас; мелодия продолжается;
//   DJ (1)       — хаус: прямая бочка, офбит-хэты, хлопок, басовая линия, аккордовые стэбы, DJ-фильтр открывается.
// Переход между зонами: короткий «подъём» (шум с фильтром) и удар на ближайшую долю. Ни постоянного гула, ни шума на фоне.
// Движок работает и в OfflineAudioContext — так рендерятся демо-файлы для проверки на слух (scripts/render-sound.mjs).

const clamp = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (a: number, b: number, x: number) => { const k = clamp((x - a) / (b - a)); return k * k * (3 - 2 * k); };

const BPM = 120;
const S16 = 60 / BPM / 4;

// Гармония: Am9 – Fmaj7 – Cadd9 – G6 (по такту)
const BASS = [110, 87.31, 130.81, 98];
const PAD = [
  [220, 261.63, 329.63, 392, 493.88],
  [174.61, 220, 261.63, 329.63],
  [261.63, 329.63, 392, 587.33],
  [196, 246.94, 293.66, 329.63],
];
// Мелодия (ля-минорная пентатоника): шаг → частота, 4 такта
const N = { G4: 392, A4: 440, C5: 523.25, D5: 587.33, E5: 659.26, G5: 783.99, A5: 880 };
const MELODY: Record<number, number>[] = [
  { 0: N.E5, 3: N.D5, 6: N.C5, 8: N.A4, 12: N.C5, 14: N.D5 },
  { 0: N.C5, 4: N.A4, 7: N.G4, 10: N.A4, 12: N.C5 },
  { 0: N.E5, 3: N.G5, 6: N.E5, 8: N.D5, 11: N.C5, 14: N.D5 },
  { 0: N.D5, 4: N.G4, 6: N.A4, 8: N.D5, 12: N.E5 },
];

export class EveningSound {
  ctx: BaseAudioContext | null = null;
  mix = 0.5;
  private master!: GainNode; private verb!: ConvolverNode; private verbIn!: GainNode;
  private mel!: GainNode; private pad!: GainNode; private tea!: GainNode; private lounge!: GainNode; private house!: GainNode;
  private djFilter!: BiquadFilterNode; private fx!: GainNode;
  private noise!: AudioBuffer; private timer = 0; private step = 0; private next = 0;
  private zone = -1; private lastFx = -10;

  /** Живое воспроизведение */
  start() {
    if (!this.ctx) this.attach(new (window.AudioContext || (window as any).webkitAudioContext)());
    const ctx = this.ctx as AudioContext;
    ctx.resume();
    this.master.gain.cancelScheduledValues(ctx.currentTime);
    this.master.gain.setTargetAtTime(0.72, ctx.currentTime, 0.35);
    // начинаем с ближайшего такта, чтобы фраза звучала с начала
    this.step = 0; this.next = ctx.currentTime + 0.06;
    this.zone = this.zoneOf(this.mix);
    clearInterval(this.timer);
    this.timer = window.setInterval(() => this.pump(ctx.currentTime + 0.15), 25);
    this.setMix(this.mix);
  }

  stop() {
    if (!this.ctx) return;
    const ctx = this.ctx as AudioContext;
    this.master.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
    clearInterval(this.timer);
    setTimeout(() => ctx.suspend(), 900);
  }

  setMix(p: number, at?: number) {
    this.mix = p;
    if (!this.ctx) return;
    const t = at ?? this.ctx.currentTime;
    const wTea = 1 - smooth(0.15, 0.45, p);
    const wMid = smooth(0.1, 0.4, p) * (1 - smooth(0.6, 0.9, p));
    const wDj = smooth(0.55, 0.85, p);
    const tc = 0.12;
    this.tea.gain.setTargetAtTime(wTea, t, tc);
    this.lounge.gain.setTargetAtTime(wMid, t, tc);
    this.house.gain.setTargetAtTime(wDj, t, tc);
    this.mel.gain.setTargetAtTime(1 - 0.6 * smooth(0.55, 0.95, p), t, tc);
    this.pad.gain.setTargetAtTime(1 - 0.45 * smooth(0.5, 1, p), t, tc);
    // DJ-фильтр: от глухого к открытому — классический заход сета
    this.djFilter.frequency.setTargetAtTime(260 * Math.pow(70, smooth(0.5, 0.95, p)), t, tc);
    this.verbIn.gain.setTargetAtTime(0.9 - 0.5 * smooth(0.4, 1, p), t, tc);
    const z = this.zoneOf(p);
    if (this.zone !== -1 && z !== this.zone && t - this.lastFx > 1.2) { this.transition(t, z > this.zone); this.lastFx = t; }
    this.zone = z;
  }

  /** Подключить к любому контексту (в т. ч. OfflineAudioContext) */
  attach(ctx: BaseAudioContext) {
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 8; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.2;
    this.master = ctx.createGain(); this.master.gain.value = 0;
    this.master.connect(comp).connect(ctx.destination);

    // Реверб из сгенерированного импульса (2,4 с, стерео)
    this.verb = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * 2.4);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    this.verb.buffer = ir;
    this.verbIn = ctx.createGain(); this.verbIn.gain.value = 0.8;
    const verbOut = ctx.createGain(); verbOut.gain.value = 0.32;
    const verbLp = ctx.createBiquadFilter(); verbLp.type = 'lowpass'; verbLp.frequency.value = 5200;
    this.verbIn.connect(this.verb).connect(verbLp).connect(verbOut).connect(this.master);

    const bus = (g = 0) => { const n = ctx.createGain(); n.gain.value = g; n.connect(this.master); return n; };
    this.mel = bus(1); this.pad = bus(1); this.tea = bus(0); this.lounge = bus(0); this.fx = bus(1);
    this.djFilter = ctx.createBiquadFilter(); this.djFilter.type = 'lowpass'; this.djFilter.Q.value = 0.9; this.djFilter.frequency.value = 400;
    this.house = ctx.createGain(); this.house.gain.value = 0;
    this.house.connect(this.djFilter).connect(this.master);

    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const ch = this.noise.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    this.master.gain.value = 0.72;
  }

  /** Запланировать всё до момента until (живой режим — по таймеру, офлайн — сразу целиком) */
  pump(until: number, mixAt?: (t: number) => number) {
    while (this.next < until) {
      if (mixAt) this.setMix(mixAt(this.next), this.next);
      this.hit(this.step % 16, Math.floor(this.step / 16) % 4, Math.floor(this.step / 16), this.next);
      this.next += S16; this.step++;
    }
  }

  private zoneOf(p: number) { return p < 0.25 ? 0 : p < 0.75 ? 1 : 2; }

  private hit(s: number, bar: number, barAbs: number, t: number) {
    const p = this.mix;
    const swing = s % 2 ? S16 * 0.08 : 0; // лёгкий свинг на шестнадцатых — живее
    const tt = t + swing;

    // Мелодия и аккорды — общие для всех зон (меняется подача)
    const note = MELODY[bar][s];
    if (note) this.pluck(tt, note, p > 0.7 ? 0.55 : 1, s);
    if (s === 0) this.chord(t, bar, p);

    const wTea = 1 - smooth(0.15, 0.45, p), wMid = smooth(0.1, 0.4, p) * (1 - smooth(0.6, 0.9, p)), wDj = smooth(0.55, 0.85, p);
    // Чай: деревянная коробочка, чаша раз в две фразы
    if (wTea > 0.01) {
    if (s === 4 || s === 10 || (s === 14 && bar % 2)) this.wood(tt, s === 4 ? 880 : 660, s === 4 ? 0.35 : 0.22);
    if (s === 0 && barAbs % 8 === 0) this.bowl(t);
    }
    if (wMid > 0.01) {

    // Лаунж: ломаная бочка, римшот, шейкер, саб
    if (s === 0 || s === 7 || s === 10) this.kickSoft(t, s === 0 ? 1 : 0.7);
    if (s === 4 || s === 12) this.rim(tt);
    this.shaker(tt, s % 2 ? 0.55 : 0.3);
    if (s === 0 || s === 10) this.sub(t, BASS[bar], s === 0 ? 0.9 : 0.6, s === 0 ? S16 * 6 : S16 * 4);
    }
    if (wDj > 0.01) {

    // Хаус: прямая бочка, офбит-хэт, хлопок, бас, стэбы
    if (s % 4 === 0) this.kick(t);
    if (s % 4 === 2) this.hat(t, 0.9, 0.14);
    if (s % 2 === 1) this.hat(tt, 0.3, 0.035);
    if (s === 4 || s === 12) this.clap(t);
    if ([2, 6, 10, 14].includes(s)) this.bass(t, BASS[bar] * (s === 14 ? 2 : 1));
    if (s === 3 || s === 11) this.stab(tt, bar);
    }
  }

  // ——— инструменты ———
  private env(dest: AudioNode, t: number, peak: number, attack: number, decay: number) {
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    g.connect(dest); return g;
  }
  private osc(type: OscillatorType, f: number, t: number, dur: number, out: AudioNode) {
    const o = this.ctx!.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
    o.connect(out); o.start(t); o.stop(t + dur + 0.05); return o;
  }
  private noiseSrc(t: number, dur: number, out: AudioNode) {
    const n = this.ctx!.createBufferSource(); n.buffer = this.noise;
    n.connect(out); n.start(t, Math.random() * 1.5); n.stop(t + dur + 0.02); return n;
  }

  /** Щипок «гучжэн»: треугольник + октава, подтяжка высоты, фильтр закрывается */
  private pluck(t: number, f: number, v: number, s: number) {
    const ctx = this.ctx!;
    const pan = ctx.createStereoPanner(); pan.pan.value = s % 3 === 0 ? -0.25 : 0.25;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 1.5;
    lp.frequency.setValueAtTime(f * 6, t); lp.frequency.exponentialRampToValueAtTime(f * 1.6, t + 0.4);
    const g = this.env(lp, t, 0.28 * v, 0.004, 1.4);
    g.disconnect(); g.connect(pan); lp.connect(this.mel); lp.connect(this.verbIn);
    pan.connect(lp);
    const a = this.osc('triangle', f, t, 1.5, g); a.frequency.setValueAtTime(f * 1.012, t); a.frequency.exponentialRampToValueAtTime(f, t + 0.06);
    const b = this.osc('sine', f * 2, t, 0.6, this.env(g, t, 0.35, 0.003, 0.35));
    b.detune.value = 4;
  }

  /** Мягкий аккорд на такт: медленная атака, затухание к следующему такту — без постоянного гула */
  private chord(t: number, bar: number, p: number) {
    const ctx = this.ctx!;
    const bar16 = S16 * 16;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900 + p * 1400; lp.Q.value = 0.5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.016, t + 0.8); g.gain.setTargetAtTime(0.0001, t + bar16 * 0.75, 0.35);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 180;
    lp.connect(hp).connect(g); g.connect(this.pad); g.connect(this.verbIn);
    PAD[bar].forEach((f, i) => { const o = this.osc(i % 2 ? 'triangle' : 'sine', f, t, bar16 + 1.2, lp); o.detune.value = (i - 2) * 3; });
  }

  private wood(t: number, f: number, v: number) {
    const g = this.env(this.tea, t, 0.12 * v * 2, 0.002, 0.07);
    this.osc('sine', f, t, 0.1, g);
    const g2 = this.env(this.verbIn, t, 0.04 * v, 0.002, 0.05); this.osc('sine', f * 2.4, t, 0.08, g2);
  }
  private bowl(t: number) {
    const g = this.ctx!.createGain(); g.gain.value = 1; g.connect(this.tea); g.connect(this.verbIn);
    [[440, 0.05], [440 * 2.71, 0.025], [440 * 5.2, 0.01]].forEach(([f, a], i) => this.osc('sine', f + i * 0.7, t, 4.2, this.env(g, t, a, 0.02, 4)));
  }

  private kickSoft(t: number, v: number) {
    const o = this.osc('sine', 110, t, 0.3, this.env(this.lounge, t, 0.4 * v, 0.003, 0.24));
    o.frequency.exponentialRampToValueAtTime(48, t + 0.1);
  }
  private rim(t: number) {
    const bp = this.ctx!.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1900; bp.Q.value = 3;
    bp.connect(this.env(this.lounge, t, 0.22, 0.001, 0.05));
    this.noiseSrc(t, 0.06, bp); this.osc('triangle', 480, t, 0.04, this.env(this.lounge, t, 0.08, 0.001, 0.03));
    const g = this.env(this.verbIn, t, 0.05, 0.001, 0.05); this.noiseSrc(t, 0.05, g);
  }
  private shaker(t: number, v: number) {
    const hp = this.ctx!.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 6500;
    hp.connect(this.env(this.lounge, t, 0.05 * v, 0.008, 0.045));
    this.noiseSrc(t, 0.06, hp);
  }
  private sub(t: number, f: number, v: number, dur: number) {
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.11 * v, t + 0.02); g.gain.setTargetAtTime(0.0001, t + dur * 0.7, 0.08);
    g.connect(this.lounge); this.osc('sine', f, t, dur + 0.3, g);
  }

  private kick(t: number) {
    const o = this.osc('sine', 150, t, 0.4, this.env(this.house, t, 0.95, 0.002, 0.34));
    o.frequency.exponentialRampToValueAtTime(46, t + 0.11);
    const hp = this.ctx!.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3000;
    hp.connect(this.env(this.house, t, 0.08, 0.001, 0.012)); this.noiseSrc(t, 0.02, hp);
  }
  private hat(t: number, v: number, decay: number) {
    const hp = this.ctx!.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 8000;
    const pan = this.ctx!.createStereoPanner(); pan.pan.value = 0.2;
    hp.connect(pan).connect(this.env(this.house, t, 0.14 * v, 0.001, decay));
    this.noiseSrc(t, decay + 0.03, hp);
  }
  private clap(t: number) {
    const bp = this.ctx!.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 0.9;
    const out = this.ctx!.createGain(); out.gain.value = 1; out.connect(this.house); out.connect(this.verbIn);
    bp.connect(out);
    [0, 0.011, 0.022].forEach((d, i) => { const g = this.env(bp, t + d, i === 2 ? 0.32 : 0.18, 0.001, i === 2 ? 0.16 : 0.012); this.noiseSrc(t + d, 0.18, g); });
  }
  private bass(t: number, f: number) {
    const lp = this.ctx!.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 4;
    lp.frequency.setValueAtTime(900, t); lp.frequency.exponentialRampToValueAtTime(220, t + 0.16);
    lp.connect(this.env(this.house, t, 0.3, 0.004, 0.2));
    this.osc('sawtooth', f, t, 0.24, lp); this.osc('sine', f / 2, t, 0.24, this.env(this.house, t, 0.25, 0.004, 0.2));
  }
  private stab(t: number, bar: number) {
    const lp = this.ctx!.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400; lp.Q.value = 2;
    const g = this.env(lp, t, 0.05, 0.003, 0.16);
    g.disconnect();
    const out = this.ctx!.createGain(); out.gain.value = 1; out.connect(this.house); out.connect(this.verbIn);
    lp.connect(out);
    const pre = this.ctx!.createGain(); pre.gain.value = 1;
    pre.connect(g).connect(lp);
    PAD[bar].slice(1).forEach((f, i) => { const o = this.osc('sawtooth', f, t, 0.2, pre); o.detune.value = i % 2 ? 7 : -7; });
  }

  /** Переход между зонами: подъём шума и удар на ближайшую долю */
  private transition(t: number, up: boolean) {
    const ctx = this.ctx!;
    const beat = S16 * 4;
    const hitAt = this.next > t ? this.next + ((4 - (this.step % 4)) % 4) * S16 : t + beat; // ближайшая сильная доля
    const at = Math.max(hitAt, t + 0.35);
    const rise = at - t;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 2.5;
    bp.frequency.setValueAtTime(up ? 500 : 6000, t); bp.frequency.exponentialRampToValueAtTime(up ? 7000 : 400, at);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.09, at - 0.02); g.gain.linearRampToValueAtTime(0.0001, at);
    bp.connect(g); g.connect(this.fx); g.connect(this.verbIn);
    this.noiseSrc(t, rise, bp);
    // удар: низ + «тарелка»
    const o = this.osc('sine', 90, at, 0.6, this.env(this.fx, at, 0.2, 0.002, 0.5)); o.frequency.exponentialRampToValueAtTime(40, at + 0.3);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 5000;
    const cg = this.env(hp, at, 0.07, 0.002, 1.3); cg.disconnect(); cg.connect(this.fx); cg.connect(this.verbIn);
    hp.connect(cg); this.noiseSrc(at, 1.4, hp);
  }
}

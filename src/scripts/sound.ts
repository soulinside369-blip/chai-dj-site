// Звук вечера без файлов: тихий аккорд и «шум чайника» → бочка, хэт, бас, хлопок. mix = 0…1 (тишина → танцпол).
const smooth = (a: number, b: number, x: number) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };

export class EveningSound {
  ctx: AudioContext | null = null;
  private master!: GainNode; private pad!: GainNode; private air!: GainNode; private padFilter!: BiquadFilterNode;
  private noise!: AudioBuffer; private timer = 0; private step = 0; private next = 0; mix = 0.5;
  private readonly bpm = 118;

  start() {
    if (!this.ctx) this.build();
    this.ctx!.resume();
    this.master.gain.cancelScheduledValues(this.ctx!.currentTime);
    this.master.gain.setTargetAtTime(0.75, this.ctx!.currentTime, 0.4);
    this.next = this.ctx!.currentTime + 0.05;
    clearInterval(this.timer);
    this.timer = window.setInterval(() => this.schedule(), 25);
    this.setMix(this.mix);
  }

  stop() {
    if (!this.ctx) return;
    this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.25);
    clearInterval(this.timer);
    setTimeout(() => this.ctx?.suspend(), 900);
  }

  setMix(p: number) {
    this.mix = p;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.pad.gain.setTargetAtTime(0.012 + (1 - smooth(0.2, 0.9, p)) * 0.07, t, 0.3);
    this.air.gain.setTargetAtTime((1 - smooth(0.1, 0.6, p)) * 0.018, t, 0.3);
    this.padFilter.frequency.setTargetAtTime(500 + p * 2200, t, 0.3);
  }

  private build() {
    const ctx = (this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)());
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 4;
    this.master = ctx.createGain(); this.master.gain.value = 0;
    this.master.connect(comp).connect(ctx.destination);

    // Аккорд: A, C#, E, мягко дышит фильтром
    this.padFilter = ctx.createBiquadFilter(); this.padFilter.type = 'lowpass'; this.padFilter.Q.value = 0.7;
    this.pad = ctx.createGain(); this.pad.gain.value = 0;
    this.padFilter.connect(this.pad).connect(this.master);
    for (const [f, d] of [[110, 0], [220, 3], [277.18, -4], [329.63, 5]]) {
      const o = ctx.createOscillator(); o.type = f === 110 ? 'sine' : 'triangle'; o.frequency.value = f; o.detune.value = d;
      const g = ctx.createGain(); g.gain.value = f === 110 ? 0.6 : 0.3;
      o.connect(g).connect(this.padFilter); o.start();
    }
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.08;
    const lfoGain = ctx.createGain(); lfoGain.gain.value = 260;
    lfo.connect(lfoGain).connect(this.padFilter.frequency); lfo.start();

    // Шум: «пар и чайник»
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const ch = this.noise.getChannelData(0);
    let last = 0;
    for (let i = 0; i < ch.length; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; ch[i] = last * 3.5; }
    const air = ctx.createBufferSource(); air.buffer = this.noise; air.loop = true;
    const airF = ctx.createBiquadFilter(); airF.type = 'bandpass'; airF.frequency.value = 900; airF.Q.value = 0.6;
    this.air = ctx.createGain(); this.air.gain.value = 0;
    air.connect(airF).connect(this.air).connect(this.master); air.start();
  }

  private schedule() {
    const ctx = this.ctx!;
    const sixteenth = 60 / this.bpm / 4;
    while (this.next < ctx.currentTime + 0.12) {
      this.hit(this.step % 16, this.next);
      this.next += sixteenth; this.step++;
    }
  }

  private hit(s: number, t: number) {
    const p = this.mix;
    const kick = smooth(0.32, 0.75, p), hat = smooth(0.5, 0.85, p), bass = smooth(0.55, 0.9, p), clap = smooth(0.78, 1, p);
    if (kick > 0.01 && s % 4 === 0) this.kick(t, kick);
    if (hat > 0.01 && s % 4 === 2) this.hat(t, hat);
    if (bass > 0.01 && [0, 3, 6, 10, 14].includes(s)) this.bass(t, bass, s === 10 ? 41.2 : 55);
    if (clap > 0.01 && (s === 4 || s === 12)) this.clap(t, clap);
    // В тишине — редкая «капля» над гайванью
    if (p < 0.4 && s === 0 && Math.random() < 0.5) this.drop(t, 1 - p / 0.4);
  }

  private env(t: number, peak: number, decay: number) {
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    g.connect(this.master); return g;
  }
  private kick(t: number, v: number) {
    const o = this.ctx!.createOscillator(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    o.connect(this.env(t, 0.9 * v, 0.35)); o.start(t); o.stop(t + 0.4);
  }
  private hat(t: number, v: number) {
    const n = this.ctx!.createBufferSource(); n.buffer = this.noise;
    const f = this.ctx!.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
    n.connect(f).connect(this.env(t, 0.25 * v, 0.06)); n.start(t, Math.random()); n.stop(t + 0.08);
  }
  private clap(t: number, v: number) {
    const n = this.ctx!.createBufferSource(); n.buffer = this.noise;
    const f = this.ctx!.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1500; f.Q.value = 0.8;
    n.connect(f).connect(this.env(t, 0.4 * v, 0.18)); n.start(t, Math.random()); n.stop(t + 0.2);
  }
  private bass(t: number, v: number, freq: number) {
    const o = this.ctx!.createOscillator(); o.type = 'sawtooth'; o.frequency.value = freq;
    const f = this.ctx!.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 380;
    o.connect(f).connect(this.env(t, 0.22 * v, 0.22)); o.start(t); o.stop(t + 0.25);
  }
  private drop(t: number, v: number) {
    const o = this.ctx!.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(1300 + Math.random() * 500, t); o.frequency.exponentialRampToValueAtTime(700, t + 0.08);
    o.connect(this.env(t, 0.05 * v, 0.25)); o.start(t); o.stop(t + 0.3);
  }
}

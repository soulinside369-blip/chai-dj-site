// Сцена «Как проходит вечер»: прокрутка ведёт от пара к звуку.
// p = 0…1 — прогресс секции. Фон бумага → уголь (CSS), на холсте: струйки пара → волна → эквалайзер.
const sec = document.querySelector<HTMLElement>('[data-evening]');
if (sec) {
  const stage = sec.querySelector<HTMLElement>('.stage')!;
  const canvas = sec.querySelector('canvas')!;
  const ctx = canvas.getContext('2d')!;
  const clock = sec.querySelector<HTMLElement>('[data-clock]')!;
  const acts = [...sec.querySelectorAll<HTMLElement>('[data-act]')];
  const marks = [...sec.querySelectorAll<HTMLElement>('.ev-progress span')];
  const times = acts.map((a) => a.dataset.time!);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  let W = 0, H = 0, p = 0, shown = 0, t = 0, visible = false, raf = 0;

  const toMin = (s: string) => { const [h, m] = s.split(':').map(Number); return h * 60 + (m || 0); };
  const tMin = times.map(toMin);
  const fmt = (m: number) => { const r = Math.floor(m / 5) * 5; return `${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}`; };
  const smooth = (a: number, b: number, x: number) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
  const mix = (a: number[], b: number[], k: number) => a.map((v, i) => Math.round(v + (b[i] - v) * k));
  const COAL = [28, 27, 24], BRASS = [200, 161, 101], EMBER = [232, 116, 59];

  function size() {
    const r = canvas.getBoundingClientRect();
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function progress() {
    const r = sec!.getBoundingClientRect();
    const total = r.height - innerHeight;
    return Math.min(1, Math.max(0, -r.top / (total || 1)));
  }

  function updateCopy() {
    sec!.style.setProperty('--p', p.toFixed(4));
    stage.dataset.htone = p > 0.33 ? 'coal' : 'rice';
    const idx = p < 0.34 ? 0 : p < 0.67 ? 1 : 2;
    if (idx !== shown) {
      acts.forEach((a, i) => a.classList.toggle('on', i === idx));
      marks.forEach((m, i) => m.classList.toggle('on', i <= idx));
      shown = idx;
    }
    // Часы плавно идут от первого акта к последнему
    // Часы идут к времени следующего акта и встают на него в момент смены
    const edges = [0, 0.34, 0.67];
    let m = tMin[tMin.length - 1];
    for (let i = 0; i < edges.length - 1; i++) if (p < edges[i + 1]) { m = tMin[i] + (tMin[i + 1] - tMin[i]) * ((p - edges[i]) / (edges[i + 1] - edges[i])); break; }
    clock.textContent = fmt(m);
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    const mid = H * (W < 760 ? 0.5 : 0.8);
    // 1) Струйки пара — уходят к середине прокрутки
    const steamA = 1 - smooth(0.12, 0.42, p);
    if (steamA > 0.01) {
      ctx.lineWidth = 1.2;
      for (let s = 0; s < 7; s++) {
        const x0 = W * (0.2 + s * 0.1);
        ctx.strokeStyle = `rgba(${COAL.join(',')},${0.18 * steamA})`;
        ctx.beginPath();
        for (let y = H; y > H * 0.15; y -= 8) {
          const k = 1 - y / H;
          const x = x0 + Math.sin(y * 0.012 + t * 0.02 + s) * (18 + k * 60) + Math.sin(t * 0.01 + s * 2) * 10;
          y === H ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }
    // 2) Волна — из горизонтальной нити в звук
    const waveK = smooth(0.18, 0.62, p);
    const amp = (6 + waveK * H * 0.16) * (0.6 + 0.4 * Math.sin(t * 0.05));
    const col = p < 0.6 ? mix(COAL, BRASS, smooth(0.25, 0.55, p)) : mix(BRASS, EMBER, smooth(0.6, 1, p) * 0.6);
    for (let layer = 0; layer < 3; layer++) {
      ctx.strokeStyle = `rgba(${col.join(',')},${(0.25 + waveK * 0.6) / (layer + 1)})`;
      ctx.lineWidth = 1.5 + layer * 0.5;
      ctx.beginPath();
      for (let x = 0; x <= W; x += 4) {
        const env = Math.sin((x / W) * Math.PI);
        const y = mid + env * amp * (Math.sin(x * 0.018 + t * 0.06 + layer) * 0.6 + Math.sin(x * 0.047 - t * 0.09 + layer * 2) * 0.4) * (1 - layer * 0.25);
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // 3) Эквалайзер — танцпол
    const eqK = smooth(0.62, 0.92, p);
    if (eqK > 0.01) {
      const n = W < 760 ? 28 : 56, gap = 3, bw = W / n - gap;
      const beat = Math.pow(Math.max(0, Math.sin(t * 0.12)), 6);
      for (let i = 0; i < n; i++) {
        const h = (0.15 + 0.5 * Math.abs(Math.sin(i * 0.7 + t * 0.07)) * Math.abs(Math.sin(i * 0.23 - t * 0.031)) + beat * 0.3 * Math.sin((i / n) * Math.PI)) * H * 0.32 * eqK;
        const gr = ctx.createLinearGradient(0, H, 0, H - h);
        gr.addColorStop(0, `rgba(${EMBER.join(',')},${0.75 * eqK})`);
        gr.addColorStop(1, `rgba(${BRASS.join(',')},${0.15 * eqK})`);
        ctx.fillStyle = gr;
        ctx.fillRect(i * (bw + gap), H - h, bw, h);
      }
    }
  }

  function loop() { t++; draw(); raf = requestAnimationFrame(loop); }
  function onScroll() { p = progress(); updateCopy(); }

  size();
  addEventListener('resize', () => { size(); onScroll(); });
  if (reduce) {
    p = 1; size(); draw();
  } else {
    addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    new IntersectionObserver(([en]) => {
      visible = en.isIntersecting;
      cancelAnimationFrame(raf);
      if (visible) loop();
    }).observe(sec);
  }
}

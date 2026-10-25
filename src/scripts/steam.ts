// Пар над гайванью: мягкие «чернильные» клубы на рисовой бумаге, отталкиваются от курсора/пальца.
const root = document.querySelector<HTMLElement>('[data-steam]');
if (root) {
  const canvas = root.querySelector('canvas')!;
  const gaiwan = root.querySelector('svg')!;
  const ctx = canvas.getContext('2d')!;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dpr = Math.min(devicePixelRatio || 1, 2);

  // Спрайт одного клуба пара
  const sprite = document.createElement('canvas');
  sprite.width = sprite.height = 128;
  const sc = sprite.getContext('2d')!;
  const g = sc.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(70,63,54,0.42)');
  g.addColorStop(0.5, 'rgba(70,63,54,0.12)');
  g.addColorStop(1, 'rgba(60,54,46,0)');
  sc.fillStyle = g; sc.fillRect(0, 0, 128, 128);

  type P = { x: number; y: number; vx: number; vy: number; r: number; life: number; max: number; seed: number };
  const ps: P[] = [];
  let W = 0, H = 0, ox = 0, oy = 0, scale = 1;
  const mouse = { x: -1e4, y: -1e4 };

  function size() {
    const r = canvas.getBoundingClientRect();
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const gr = gaiwan.getBoundingClientRect();
    ox = gr.left - r.left + gr.width * 0.5;
    oy = gr.top - r.top + gr.height * 0.36;
    scale = gr.width / 400;
  }

  function spawn() {
    const max = 220 + Math.random() * 160;
    ps.push({
      x: ox + (Math.random() - 0.5) * 70 * scale,
      y: oy + (Math.random() - 0.5) * 10 * scale,
      vx: (Math.random() - 0.5) * 0.25,
      vy: -(0.7 + Math.random() * 0.7) * Math.max(scale, 0.6),
      r: (5 + Math.random() * 8) * scale,
      life: 0, max, seed: Math.random() * 1000,
    });
  }

  let t = 0;
  function step() {
    t += 1;
    if (ps.length < 140 && t % 2) spawn();
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.life++;
      const k = p.life / p.max;
      // завиток: боковой дрейф по синусу, ускоряется вверху
      p.vx += Math.sin((p.life + p.seed) * 0.025) * 0.02 * (0.4 + k * 1.6);
      const dx = p.x - mouse.x, dy = p.y - mouse.y, d2 = dx * dx + dy * dy;
      if (d2 < 140 * 140) { const f = (1 - Math.sqrt(d2) / 140) * 0.6; p.vx += (dx / 140) * f; p.vy += (dy / 140) * f * 0.5; }
      p.vx *= 0.985;
      p.x += p.vx; p.y += p.vy;
      p.r += 0.14 * scale + k * 0.2;
      if (p.life > p.max || p.y < -p.r) ps.splice(i, 1);
    }
  }
  function draw() {
    ctx.clearRect(0, 0, W, H);
    for (const p of ps) {
      const k = p.life / p.max;
      const a = Math.min(1, k * 3) * Math.pow(1 - k, 1.2) * 0.75;
      if (a <= 0.003) continue;
      ctx.globalAlpha = a;
      ctx.drawImage(sprite, p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
    }
    ctx.globalAlpha = 1;
  }

  let running = false, raf = 0;
  function loop() { step(); draw(); raf = requestAnimationFrame(loop); }
  function start() { if (!running && !reduce) { running = true; loop(); } }
  function stop() { running = false; cancelAnimationFrame(raf); }

  size();
  addEventListener('resize', size);
  // Ждём, пока гайвань дорисуется, и запускаем пар
  setTimeout(() => {
    size();
    if (reduce) { for (let i = 0; i < 260; i++) step(); draw(); return; }
    new IntersectionObserver(([en]) => (en.isIntersecting ? start() : stop())).observe(root);
  }, reduce ? 0 : 900);
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));

  const hero = root.closest('section') || document.body;
  hero.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top;
  });
  hero.addEventListener('pointerleave', () => { mouse.x = mouse.y = -1e4; });
}

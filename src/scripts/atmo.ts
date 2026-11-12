// Атмосфера первого экрана: пар (тишина) → тёплые искры (чай и ритм) → лучи прожекторов в такт (танцпол).
// Один canvas за контентом; рисуем только когда он на экране; на телефоне меньше частиц; при «уменьшить движение» — выключено.
export function startAtmo(host: HTMLElement, getP: () => number, bpm: (p: number) => number) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const cv = document.createElement('canvas');
  cv.className = 'hero-atmo'; cv.setAttribute('aria-hidden', 'true');
  host.prepend(cv);
  const ctx = cv.getContext('2d')!;
  // мягкое облачко пара: радиальный градиент без края
  const puff = document.createElement('canvas'); puff.width = puff.height = 64;
  { const c = puff.getContext('2d')!, g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(122,90,43,0.55)'); g.addColorStop(0.55, 'rgba(122,90,43,0.16)'); g.addColorStop(1, 'rgba(122,90,43,0)');
    c.fillStyle = g; c.fillRect(0, 0, 64, 64); }
  let W = 0, H = 0, dpr = 1, raf = 0, on = false, shown = getP(), t0 = performance.now();
  type Q = { x: number; y: number; s: number; ph: number };
  let qs: Q[] = [];
  const size = () => {
    dpr = Math.min(1.5, devicePixelRatio || 1);
    W = host.clientWidth; H = host.clientHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = W < 700 ? 36 : 70;
    qs = Array.from({ length: n }, () => ({ x: Math.random() * W, y: Math.random() * H, s: Math.random(), ph: Math.random() * 6.28 }));
  };
  const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
  // на телефонах — 30 кадров в секунду: глазу не заметно, процессору и батарее легче
  const step = matchMedia('(pointer: coarse)').matches ? 33 : 0; let last = 0;
  function frame(now: number) {
    raf = requestAnimationFrame(frame);
    if (step && now - last < step) return; last = now;
    shown += (getP() - shown) * 0.07;
    const m = shown, t = (now - t0) / 1000;
    const beat = Math.pow(Math.max(0, Math.sin(t * Math.PI * bpm(m) / 60)), 10) * Math.max(0, (m - 0.6) / 0.4);
    ctx.clearRect(0, 0, W, H);
    // лучи — только ближе к танцполу
    if (m > 0.55) {
      const a = (m - 0.55) / 0.45;
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 4; i++) {
        const ox = W * (0.12 + i * 0.25), ang = Math.sin(t * (0.3 + i * 0.06) + i * 1.9) * 0.5;
        const ex = ox + Math.sin(ang) * H * 1.3;
        const g = ctx.createLinearGradient(ox, 0, ex, H);
        const col = i % 2 ? '232,116,59' : '226,170,104';
        g.addColorStop(0, `rgba(${col},${0.16 * a + beat * 0.14})`); g.addColorStop(1, `rgba(${col},0)`);
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(ox - 5, -8); ctx.lineTo(ex - H * 0.16, H * 1.25); ctx.lineTo(ex + H * 0.16, H * 1.25); ctx.lineTo(ox + 5, -8); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    const steam = 1 - Math.min(1, m * 2.6);       // пар на светлом фоне — тёплый, едва заметный
    const spark = Math.max(0, (m - 0.3) / 0.7);    // искры на тёмном
    for (const q of qs) {
      q.y -= lerp(0.18, 1.1, m) * (0.4 + q.s);
      q.x += Math.sin(t * 0.5 + q.ph) * lerp(0.3, 0.8, m);
      if (q.y < -30) { q.y = H + 30; q.x = Math.random() * W; }
      if (steam > 0.03) { const r = 30 + q.s * 50; ctx.globalAlpha = 0.09 * steam * (0.4 + q.s); ctx.drawImage(puff, q.x - r, q.y - r, r * 2, r * 2); ctx.globalAlpha = 1; }
      if (spark > 0.03) { ctx.fillStyle = `rgba(255,${Math.round(lerp(205, 150, m))},110,${(0.22 + beat * 0.5) * spark * q.s})`; ctx.beginPath(); ctx.arc(q.x, q.y, 0.8 + q.s * 1.7 + beat * 1.2, 0, 6.283); ctx.fill(); }
    }
  }
  size();
  new ResizeObserver(size).observe(host);
  new IntersectionObserver(([e]) => {
    on = e.isIntersecting && !document.hidden;
    cancelAnimationFrame(raf); if (on) raf = requestAnimationFrame(frame);
  }).observe(host);
  document.addEventListener('visibilitychange', () => { cancelAnimationFrame(raf); if (!document.hidden && on) raf = requestAnimationFrame(frame); });
}

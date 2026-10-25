// Конструктор вечера: ползунок → формат, время, сцена, звук; гости → вилка; заявка с первого экрана.
import { price, rub } from '../lib/price.js';
import { goal } from './fx';
import { maskPhone, validateContact, contactData, send } from './forms';
import { EveningSound } from './sound';
import { feel } from './feel';

const root = document.querySelector<HTMLElement>('[data-cfg]');
if (root) {
  const D = JSON.parse(root.querySelector('[data-cfg-json]')!.textContent!);
  const $ = <T extends Element = HTMLElement>(s: string) => root.querySelector<T>(s)!;
  const mood = $<HTMLInputElement>('#cfg-mood');
  const guests = $<HTMLInputElement>('#cfg-guests');
  const stage = $('[data-stage]');
  const canvas = stage.querySelector('canvas')!;
  const ctx = canvas.getContext('2d')!;
  const gaiwan = stage.querySelector<SVGElement>('.stage-gaiwan')!;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fmtBy = (k: string) => D.formats.find((f: any) => f.key === k);
  const smooth = (a: number, b: number, x: number) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
  const S = { p: 0.5, shown: 0.5, fmt: 'teadj', seg: D.defaultSegment as string, last: null as any, touched: false, pStr: '', lastStop: '' as string, lastG: undefined as number | undefined };
  const sound = new EveningSound();

  /* ---------- Сегмент: компании / для себя ---------- */
  function setSeg(k: string, save = true) {
    const s = D.segments[k]; if (!s) return;
    S.seg = k;
    document.body.dataset.seg = k;
    root!.querySelectorAll<HTMLElement>('[data-seg]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.seg === k)));
    root!.querySelectorAll<HTMLElement>('[data-seg-text]').forEach((el) => { el.textContent = s[el.dataset.segText!]; });
    $('[data-seg-usp]').innerHTML = s.usp.map((u: string) => { const [b, ...r] = u.split(' — '); return `<li><b>${b}</b>${r.join(' — ')}</li>`; }).join('');
    if (save) { try { localStorage.setItem('cdj_seg', k); } catch {} goal('segment_' + k); }
  }
  root.querySelectorAll<HTMLButtonElement>('[data-seg]').forEach((b) => b.addEventListener('click', () => setSeg(b.dataset.seg!)));
  try { const saved = localStorage.getItem('cdj_seg'); if (saved && saved !== S.seg) setSeg(saved, false); } catch {}

  /* ---------- Ползунок: формат, время, подпись ---------- */
  const stops = D.stops as { at: number; fmt: string; time: string; label: string; text: string }[];
  const toMin = (s: string) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
  function timeAt(v: number) {
    for (let i = 0; i < stops.length - 1; i++) if (v <= stops[i + 1].at) {
      const k = (v - stops[i].at) / (stops[i + 1].at - stops[i].at);
      const m = Math.round((toMin(stops[i].time) + (toMin(stops[i + 1].time) - toMin(stops[i].time)) * k) / 5) * 5;
      return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
    }
    return stops[stops.length - 1].time;
  }
  const nearest = (v: number) => stops.reduce((a, b) => (Math.abs(b.at - v) < Math.abs(a.at - v) ? b : a));

  function update() {
    const v = +mood.value;
    S.p = v / 100;
    mood.style.setProperty('--fill', `${v}%`);
    guests.style.setProperty('--fill', `${((+guests.value - +guests.min) / (+guests.max - +guests.min)) * 100}%`);
    const st = nearest(v);
    if (S.lastStop && S.lastStop !== st.label) feel('step');
    S.lastStop = st.label;
    const g10 = Math.floor(+guests.value / 10);
    if (S.lastG !== undefined && S.lastG !== g10) feel('tick');
    S.lastG = g10;
    $('[data-time]').textContent = timeAt(v);
    $('[data-stop-label]').textContent = st.label;
    $('[data-stop-text]').textContent = st.text;
    mood.setAttribute('aria-valuetext', `${st.label}: ${st.text}`);
    S.fmt = st.fmt;
    const f = fmtBy(S.fmt);
    const g = +guests.value;
    $('[data-guests-out]').textContent = String(g);
    $('[data-fmt-name]').textContent = f.name;
    $('[data-fmt-dur]').textContent = f.duration;
    const r = price(f, D.calc, { guests: g, hours: f.H, km: 0, generator: false });
    S.last = r;
    if (r.individual) {
      $('[data-price]').textContent = 'Индивидуальный расчёт';
      $('[data-per]').textContent = `Больше ${D.calc.individualOver} гостей — второй мастер и больше звука, посчитаем вручную`;
    } else {
      $('[data-price]').textContent = `${rub(r.low).replace(/\s₽$/, '')} – ${rub(r.high)}`;
      $('[data-per]').textContent = `≈ ${rub(Math.round(r.total / g / 50) * 50)} на гостя · Екатеринбург, ${f.duration}`;
    }
    sound.setMix(S.p);
    if (reduce) draw(0);
  }
  mood.addEventListener('input', () => { update(); if (!S.touched) { S.touched = true; goal('hero_slider'); } });
  guests.addEventListener('input', update);

  /* ---------- Сцена: пар → волна → эквалайзер ---------- */
  const dpr = Math.min(devicePixelRatio || 1, 2);
  let W = 0, H = 0, t = 0, raf = 0;
  type P = { x: number; y: number; vx: number; vy: number; r: number; life: number; max: number; seed: number };
  const ps: P[] = [];
  const sprite = document.createElement('canvas'); sprite.width = sprite.height = 64;
  { const s = sprite.getContext('2d')!; const g = s.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(237,230,218,0.5)'); g.addColorStop(0.5, 'rgba(237,230,218,0.14)'); g.addColorStop(1, 'rgba(237,230,218,0)');
    s.fillStyle = g; s.fillRect(0, 0, 64, 64); }
  const hasPhoto = stage.classList.contains('has-photo');
  const geo = { ox: 0, oy: 0, sc: 1 };
  function size() {
    const r = canvas.getBoundingClientRect(); W = r.width; H = r.height;
    if (!hasPhoto) { const gr = gaiwan.getBoundingClientRect(); geo.ox = gr.left - r.left + gr.width * 0.5; geo.oy = gr.top - r.top + gr.height * 0.3; geo.sc = gr.width / 400; }
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function draw(_ts: number) {
    t++;
    S.shown += (S.p - S.shown) * (reduce ? 1 : 0.08);
    const p = S.shown;
    // Стили трогаем, только когда значение заметно изменилось (иначе браузер пересчитывает раскладку каждый кадр)
    const pStr = p.toFixed(3);
    if (pStr !== S.pStr) { S.pStr = pStr; stage.style.setProperty('--p', pStr); if (!hasPhoto) gaiwan.style.opacity = String(1 - smooth(0.35, 0.7, p)); }
    ctx.clearRect(0, 0, W, H);
    // пар над гайванью — только в варианте без фото; геометрия кешируется в size()
    const steam = hasPhoto ? 0 : 1 - smooth(0.3, 0.7, p);
    const { ox, oy, sc } = geo;
    if (steam > 0.02 && ps.length < 90 && t % 2) ps.push({ x: ox + (Math.random() - 0.5) * 60 * sc, y: oy, vx: (Math.random() - 0.5) * 0.2, vy: -(0.5 + Math.random() * 0.6), r: (4 + Math.random() * 6) * sc + 2, life: 0, max: 160 + Math.random() * 120, seed: Math.random() * 999 });
    for (let i = ps.length - 1; i >= 0; i--) {
      const q = ps[i]; q.life++; const k = q.life / q.max;
      q.vx += Math.sin((q.life + q.seed) * 0.03) * 0.015; q.vx *= 0.985; q.x += q.vx; q.y += q.vy; q.r += 0.12 + k * 0.12;
      if (q.life > q.max) { ps.splice(i, 1); continue; }
      ctx.globalAlpha = Math.min(1, k * 3) * Math.pow(1 - k, 1.3) * 0.8 * steam;
      ctx.drawImage(sprite, q.x - q.r, q.y - q.r, q.r * 2, q.r * 2);
    }
    ctx.globalAlpha = 1;
    // волна
    const waveK = smooth(0.25, 0.65, p), mid = H * 0.62;
    if (waveK > 0.01) for (let l = 0; l < 3; l++) {
      ctx.strokeStyle = `rgba(200,161,101,${(0.2 + waveK * 0.6) / (l + 1)})`; ctx.lineWidth = 1.4 + l * 0.4; ctx.beginPath();
      for (let x = 0; x <= W; x += 4) {
        const env = Math.sin((x / W) * Math.PI);
        const y = mid + env * waveK * H * 0.14 * (Math.sin(x * 0.03 + t * 0.07 + l) * 0.6 + Math.sin(x * 0.07 - t * 0.1 + l * 2) * 0.4);
        x ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
    // эквалайзер
    const eqK = smooth(0.6, 0.95, p);
    if (eqK > 0.01) {
      const n = Math.round(W / 14), bw = W / n - 3, beat = Math.pow(Math.max(0, Math.sin(t * 0.13)), 6);
      for (let i = 0; i < n; i++) {
        const h = (0.12 + 0.5 * Math.abs(Math.sin(i * 0.7 + t * 0.08)) * Math.abs(Math.sin(i * 0.23 - t * 0.03)) + beat * 0.35 * Math.sin((i / n) * Math.PI)) * H * 0.42 * eqK;
        const g = ctx.createLinearGradient(0, H, 0, H - h); g.addColorStop(0, `rgba(232,116,59,${0.85 * eqK})`); g.addColorStop(1, `rgba(200,161,101,${0.12 * eqK})`);
        ctx.fillStyle = g; ctx.fillRect(i * (bw + 3), H - h, bw, h);
      }
    }
    if (!reduce) raf = requestAnimationFrame(draw);
  }
  size(); addEventListener('resize', size);
  if (reduce) { update(); draw(0); }
  else {
    const startLoop = () => new IntersectionObserver(([en]) => { cancelAnimationFrame(raf); if (en.isIntersecting) raf = requestAnimationFrame(draw); }).observe(stage);
    if (document.readyState === 'complete') setTimeout(startLoop, 300); else addEventListener('load', () => setTimeout(startLoop, 300), { once: true });
  }
  // Кадр «танцпол» грузим лениво: после загрузки страницы или при первом движении ползунка
  const party = stage.querySelector<HTMLImageElement>('img.party[data-src]');
  const loadParty = () => { if (party && !party.src) { if (party.dataset.srcset) party.srcset = party.dataset.srcset; party.src = party.dataset.src!; } };
  mood.addEventListener('input', loadParty, { once: true });
  addEventListener('load', () => setTimeout(loadParty, 1200), { once: true });
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancelAnimationFrame(raf); });

  /* ---------- Звук ---------- */
  const sBtn = $<HTMLButtonElement>('[data-sound]');
  sBtn.addEventListener('click', () => {
    const on = sBtn.getAttribute('aria-pressed') !== 'true';
    sBtn.setAttribute('aria-pressed', String(on));
    sBtn.querySelector('span')!.textContent = on ? 'Выключить звук' : 'Включить звук';
    on ? sound.start() : sound.stop();
    if (on) goal('hero_sound');
  });

  /* ---------- Заявка с первого экрана ---------- */
  const book = $<HTMLFormElement>('[data-book]');
  const openBtn = $<HTMLButtonElement>('[data-book-open]');
  const dateIn = $<HTMLInputElement>('#cfg-date');
  const min = new Date(); min.setDate(min.getDate() + D.calc.minDaysAhead);
  dateIn.min = `${min.getFullYear()}-${String(min.getMonth() + 1).padStart(2, '0')}-${String(min.getDate()).padStart(2, '0')}`;
  maskPhone($<HTMLInputElement>('#cfg-contact'));
  openBtn.addEventListener('click', () => {
    book.hidden = false; openBtn.hidden = true;
    if (!matchMedia('(pointer: coarse)').matches) dateIn.focus();
  });
  book.addEventListener('submit', (e) => {
    e.preventDefault();
    const okDate = !!dateIn.value && dateIn.value >= dateIn.min;
    book.querySelector('[data-f="date"]')!.classList.toggle('err', !okDate);
    const okC = validateContact(book);
    if (!okDate || !okC) return;
    const f = fmtBy(S.fmt), r = S.last;
    send({
      kind: 'calc', source: 'hero', segment: S.seg, fmt: S.fmt, date: dateIn.value, town: 'Екатеринбург', km: 0,
      guests: +guests.value, hours: f.H, place: 'in', power: 'yes',
      estimate: r && !r.individual ? { low: r.low, high: r.high, total: r.total } : 'индивидуальный расчёт',
      ...contactData(book),
    }, book.querySelector('.form-status'), D.work, book.querySelector('button[type="submit"]'));
  });

  /* ---------- Подробный расчёт — передаём выбор в большой калькулятор ---------- */
  $('[data-cfg-more]').addEventListener('click', (e) => {
    e.preventDefault();
    (window as any).__openCalc?.({ fmt: S.fmt, guests: +guests.value });
  });
  // Карточка формата ниже перестраивает конструктор
  root.addEventListener('cfg:set', ((e: CustomEvent) => {
    const st = stops.find((x) => x.fmt === e.detail); if (!st) return;
    mood.value = String(st.at); update();
  }) as EventListener);

  update();
}

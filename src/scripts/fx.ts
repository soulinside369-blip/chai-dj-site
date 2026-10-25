// Общие эффекты: шапка, меню, появление, магнитные кнопки, наклон карточек, панель на телефоне, цели Метрики.
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine = matchMedia('(pointer: fine)').matches;
const header = document.getElementById('siteHeader')!;
const menu = document.getElementById('menu')!;
const burger = document.querySelector<HTMLButtonElement>('.burger')!;

/* ---- Цели Метрики ---- */
export function goal(name: string) {
  const id = (window as any).__ym;
  if (id && (window as any).ym) (window as any).ym(id, 'reachGoal', name);
}
(window as any).__goal = goal;
document.addEventListener('click', (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>('[data-goal]');
  if (el) goal(el.dataset.goal!);
});

/* ---- Ссылки «Рассчитать»: если калькулятор на этой странице — едем к нему ---- */
document.addEventListener('click', (e) => {
  const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('[data-calc-link]');
  if (!a) return;
  const calc = document.getElementById('calc');
  if (!calc) return;
  e.preventDefault();
  closeMenu();
  const fmt = a.dataset.fmt;
  if (fmt) calc.dispatchEvent(new CustomEvent('calc:format', { detail: fmt }));
  calc.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
});

/* ---- Шапка: тон по секции под ней, прячется при прокрутке вниз ---- */
let lastY = scrollY;
function headerTick() {
  const y = scrollY;
  header.classList.toggle('scrolled', y > 8);
  header.classList.toggle('hide', y > 400 && y > lastY + 4 && !menu.classList.contains('open'));
  if (y < lastY - 4) header.classList.remove('hide');
  lastY = y;
  const probe = header.offsetHeight / 2;
  for (const s of document.querySelectorAll<HTMLElement>('[data-htone]')) {
    const r = s.getBoundingClientRect();
    if (r.top <= probe && r.bottom > probe) { header.dataset.tone = s.dataset.htone; break; }
  }
}
let ticking = false;
addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(() => { headerTick(); ticking = false; }); } }, { passive: true });
headerTick();

/* ---- Меню на телефоне ---- */
function closeMenu() {
  menu.classList.remove('open'); menu.setAttribute('aria-hidden', 'true');
  burger.setAttribute('aria-expanded', 'false'); burger.setAttribute('aria-label', 'Открыть меню');
  header.dataset.tone = header.dataset.prevTone || header.dataset.tone; document.body.style.overflow = '';
}
burger.addEventListener('click', () => {
  const open = !menu.classList.contains('open');
  if (!open) return closeMenu();
  menu.classList.add('open'); menu.setAttribute('aria-hidden', 'false');
  burger.setAttribute('aria-expanded', 'true'); burger.setAttribute('aria-label', 'Закрыть меню');
  header.dataset.prevTone = header.dataset.tone; header.dataset.tone = 'coal'; document.body.style.overflow = 'hidden';
});
menu.addEventListener('click', (e) => { if ((e.target as HTMLElement).closest('a')) closeMenu(); });
addEventListener('keydown', (e) => { if (e.key === 'Escape' && menu.classList.contains('open')) { closeMenu(); burger.focus(); } });

/* ---- Появление по словам и блоками ---- */
document.querySelectorAll<HTMLElement>('[data-split]').forEach((el) => {
  const words = el.textContent!.trim().split(/\s+/);
  el.innerHTML = words.map((w, i) => `<span class="w" style="--i:${i}">${w}</span>`).join(' ');
  el.classList.add('split-words');
});
const io = new IntersectionObserver((entries) => {
  for (const en of entries) if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
}, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
document.querySelectorAll('.rv, .split-words').forEach((el) => io.observe(el));
// Страховка: что видно сразу — показываем без ожидания
requestAnimationFrame(() => document.querySelectorAll('.rv, .split-words').forEach((el) => {
  if (el.getBoundingClientRect().top < innerHeight) el.classList.add('in');
}));

/* ---- Магнитные кнопки и наклон карточек (только мышь) ---- */
if (fine && !reduce) {
  document.querySelectorAll<HTMLElement>('.btn').forEach((b) => {
    b.addEventListener('pointermove', (e) => {
      const r = b.getBoundingClientRect();
      b.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * 0.18}px, ${(e.clientY - r.top - r.height / 2) * 0.3}px)`;
    });
    b.addEventListener('pointerleave', () => { b.style.transform = ''; });
  });
  document.querySelectorAll<HTMLElement>('[data-tilt]').forEach((c) => {
    c.addEventListener('pointermove', (e) => {
      const r = c.getBoundingClientRect();
      c.style.setProperty('--ry', `${((e.clientX - r.left) / r.width - 0.5) * 6}deg`);
      c.style.setProperty('--rx', `${-((e.clientY - r.top) / r.height - 0.5) * 6}deg`);
    });
    c.addEventListener('pointerleave', () => { c.style.setProperty('--rx', '0deg'); c.style.setProperty('--ry', '0deg'); });
  });
}

/* ---- Линия прогресса у шагов ---- */
document.querySelectorAll<HTMLElement>('.steps[data-progress]').forEach((ol) => {
  const upd = () => {
    const r = ol.getBoundingClientRect();
    const p = Math.min(1, Math.max(0, (innerHeight * 0.85 - r.top) / (innerHeight * 0.6)));
    ol.style.setProperty('--sp', String(reduce ? 1 : p));
  };
  addEventListener('scroll', upd, { passive: true }); upd();
});

/* ---- Панель «Рассчитать · Telegram» — после первого экрана ---- */
const dock = document.getElementById('dock');
const first = document.querySelector('.hero, .page-hero');
if (dock && first) {
  new IntersectionObserver(([en]) => dock.classList.toggle('up', !en.isIntersecting), { rootMargin: '-100px 0px 0px 0px' }).observe(first);
}

/* ---- Фильтр кейсов ---- */
document.querySelectorAll<HTMLElement>('[data-filter]').forEach((group) => {
  const grid = document.querySelector<HTMLElement>(group.dataset.filter!)!;
  group.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.chip'); if (!b) return;
    group.querySelectorAll('.chip').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    grid.querySelectorAll<HTMLElement>('[data-type]').forEach((c) => { c.hidden = !(b.dataset.f === 'all' || c.dataset.type === b.dataset.f); });
  });
});

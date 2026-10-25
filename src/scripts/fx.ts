// Общие эффекты: шапка, меню, появление, магнитные кнопки, наклон карточек, панель на телефоне, цели Метрики.
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine = matchMedia('(pointer: fine)').matches;
const header = document.getElementById('siteHeader')!;
const menu = document.getElementById('menu')!;
const scrim = document.querySelector<HTMLElement>('.sheet-scrim')!;
const toggles = document.querySelectorAll<HTMLButtonElement>('[data-menu-toggle]');
import { feel } from './feel';

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

/* ---- Расчёт: на главной — конструктор, иначе — шторка с калькулятором ---- */
const drawer = document.getElementById('calcDrawer') as HTMLDialogElement | null;
const calcForm = document.getElementById('calc');
let lastFocus: HTMLElement | null = null;
export function openCalc(detail?: { fmt?: string; guests?: number; cert?: string }) {
  if (!drawer || !calcForm) return;
  lastFocus = document.activeElement as HTMLElement;
  if (detail?.guests) calcForm.dispatchEvent(new CustomEvent('calc:prefill', { detail }));
  else if (detail?.fmt) calcForm.dispatchEvent(new CustomEvent('calc:format', { detail: detail.fmt }));
  if (detail?.cert) { const sel = calcForm.querySelector<HTMLSelectElement>('#c-cert'); if (sel) { sel.value = detail.cert; sel.dispatchEvent(new Event('change', { bubbles: true })); } }
  drawer.showModal();
  document.documentElement.classList.add('drawer-open');
  goal('calc_open');
}
(window as any).__openCalc = openCalc;
drawer?.addEventListener('close', () => { document.documentElement.classList.remove('drawer-open'); lastFocus?.focus?.(); });
drawer?.addEventListener('click', (e) => { if (e.target === drawer || (e.target as HTMLElement).closest('[data-drawer-close]')) drawer.close(); });

document.addEventListener('click', (e) => {
  const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('[data-calc-link]');
  if (!a) return;
  e.preventDefault();
  closeMenu();
  const fmt = a.dataset.fmt;
  const cfg = document.querySelector<HTMLElement>('[data-cfg]');
  if (cfg && (!fmt || ['tea', 'teadj', 'dj'].includes(fmt))) {
    if (fmt) cfg.dispatchEvent(new CustomEvent('cfg:set', { detail: fmt }));
    cfg.querySelector('.cfg-panel')!.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
    return;
  }
  openCalc({ fmt, cert: a.dataset.cert });
});

/* ---- Шапка: тон по секции под ней, прячется при прокрутке вниз ---- */
let lastY = scrollY;
function headerTick() {
  const y = scrollY;
  header.classList.toggle('scrolled', y > 8);
  header.classList.toggle('hide', y > 400 && y > lastY + 4);
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

/* ---- Меню: шторка снизу, под большой палец ---- */
let menuReturn: HTMLElement | null = null;
function closeMenu() {
  if (!menu.classList.contains('open')) return;
  menu.classList.remove('open'); menu.setAttribute('aria-hidden', 'true'); menu.setAttribute('inert', '');
  menu.style.transform = '';
  scrim.classList.remove('on'); setTimeout(() => { if (!menu.classList.contains('open')) scrim.hidden = true; }, 350);
  toggles.forEach((t) => t.setAttribute('aria-expanded', 'false'));
  document.documentElement.classList.remove('sheet-open');
  menuReturn?.focus?.();
}
function openMenu() {
  menuReturn = document.activeElement as HTMLElement;
  scrim.hidden = false; requestAnimationFrame(() => scrim.classList.add('on'));
  menu.removeAttribute('inert'); menu.classList.add('open'); menu.setAttribute('aria-hidden', 'false');
  toggles.forEach((t) => t.setAttribute('aria-expanded', 'true'));
  document.documentElement.classList.add('sheet-open');
  feel('step');
  menu.querySelector<HTMLElement>('.sheet-tiles a')?.focus({ preventScroll: true });
}
toggles.forEach((t) => t.addEventListener('click', () => (menu.classList.contains('open') ? closeMenu() : openMenu())));
document.querySelectorAll('[data-menu-close]').forEach((el) => el.addEventListener('click', closeMenu));
menu.addEventListener('click', (e) => { if ((e.target as HTMLElement).closest('a')) closeMenu(); });
addEventListener('keydown', (e) => { if (e.key === 'Escape' && menu.classList.contains('open')) closeMenu(); });
// свайп вниз закрывает шторку
{
  let y0 = 0, dy = 0, drag = false;
  menu.addEventListener('touchstart', (e) => { const body = menu.querySelector('.sheet-body')!; if (body.scrollTop > 0) return; y0 = e.touches[0].clientY; dy = 0; drag = true; menu.style.transition = 'none'; }, { passive: true });
  menu.addEventListener('touchmove', (e) => { if (!drag) return; dy = Math.max(0, e.touches[0].clientY - y0); menu.style.transform = `translateY(${dy}px)`; }, { passive: true });
  menu.addEventListener('touchend', () => { if (!drag) return; drag = false; menu.style.transition = ''; if (dy > 90) { feel('tick'); closeMenu(); } else menu.style.transform = ''; });
}

/* ---- Навигация на компьютере: подсветка-капсула едет за курсором ---- */
document.querySelectorAll<HTMLElement>('[data-pillnav]').forEach((nav) => {
  const pill = nav.querySelector<HTMLElement>('.nav-pill')!;
  const place = (a: HTMLElement | null) => {
    if (!a) { pill.style.opacity = '0'; return; }
    pill.style.opacity = '1';
    pill.style.setProperty('--x', `${a.offsetLeft}px`); pill.style.setProperty('--w', `${a.offsetWidth}px`);
  };
  const cur = () => nav.querySelector<HTMLElement>('a[aria-current="page"]');
  nav.addEventListener('pointerover', (e) => { const a = (e.target as HTMLElement).closest<HTMLElement>('a'); if (a) place(a); });
  nav.addEventListener('pointerleave', () => place(cur()));
  nav.addEventListener('focusin', (e) => place(e.target as HTMLElement));
  requestAnimationFrame(() => place(cur()));
});

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

/* ---- Нижняя панель: прячется при прокрутке вниз по тексту, возвращается при движении вверх ---- */
const dock = document.getElementById('dock');
if (dock) {
  let ly = scrollY;
  addEventListener('scroll', () => {
    const y = scrollY;
    if (Math.abs(y - ly) < 6) return;
    dock.classList.toggle('low', y > ly && y > 300 && !menu.classList.contains('open'));
    ly = y;
  }, { passive: true });
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

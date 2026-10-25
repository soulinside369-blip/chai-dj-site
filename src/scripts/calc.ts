// Калькулятор: шаги, формула, вилка, отправка.
import { price, rub, num } from '../lib/price.js';
import { goal } from './fx';
import { maskPhone, validateContact, contactData, send } from './forms';

const form = document.querySelector<HTMLFormElement>('[data-calc]');
if (form) {
  const D = JSON.parse(form.querySelector('[data-calc-json]')!.textContent!);
  const $ = <T extends Element = HTMLElement>(s: string) => form.querySelector<T>(s)!;
  const $$ = (s: string) => [...form.querySelectorAll<HTMLElement>(s)];
  const steps = $$('.cstep');
  const prog = $$('.prog li');
  const back = $<HTMLButtonElement>('[data-back]');
  const next = $<HTMLButtonElement>('[data-next]');
  const dateIn = $<HTMLInputElement>('#c-date');
  const town = $<HTMLSelectElement>('#c-town');
  const kmIn = $<HTMLInputElement>('#c-km');
  const guestsIn = $<HTMLInputElement>('#c-guests');
  const hoursIn = $<HTMLSelectElement>('#c-hours');
  const certIn = $<HTMLSelectElement>('#c-cert');
  const contact = $('[data-contact]');
  const totalEl = $('[data-total]');
  const S = { fmt: '', place: 'in', power: 'yes', step: 1, shown: 0 };

  maskPhone(contact.querySelector('[name="contact"]')!);

  const min = new Date(); min.setDate(min.getDate() + D.calc.minDaysAhead);
  dateIn.min = `${min.getFullYear()}-${String(min.getMonth() + 1).padStart(2, '0')}-${String(min.getDate()).padStart(2, '0')}`;

  const fmt = () => D.formats.find((f: any) => f.key === S.fmt);
  const km = () => {
    const other = town.value === 'other';
    $('[data-f="km"]').hidden = !other;
    return other ? Math.max(0, Math.round(+kmIn.value || 0)) : D.calc.towns[+town.value].km;
  };

  function setFmt(k: string) {
    S.fmt = k;
    const r = form!.querySelector<HTMLInputElement>(`input[name="fmt"][value="${k}"]`); if (r) r.checked = true;
    $('[data-err="fmt"]').style.display = 'none';
    const f = fmt();
    if (f) {
      hoursIn.innerHTML = '';
      const max = f.b ? f.maxH : f.H;
      for (let h = f.H; h <= max; h += 1) hoursIn.insertAdjacentHTML('beforeend', `<option value="${h}">${num(h)} ч${h === f.H ? ' — в пакете' : ` (+${rub((h - f.H) * f.b)})`}</option>`);
      hoursIn.disabled = !f.b;
      guestsIn.max = String(f.maxGuests || 500);
      guestsIn.value = String(f.G);
      $('[data-guests-hint]').textContent = `В пакете до ${f.G}${f.maxGuests ? `, максимум ${f.maxGuests}` : ''}; больше ${D.calc.individualOver} — индивидуальный расчёт`;
    }
    render();
  }

  // Плавный счётчик суммы
  let shownLo = 0, shownHi = 0, anim = 0;
  function countTo(lo: number, hi: number) {
    cancelAnimationFrame(anim);
    const fromLo = shownLo, fromHi = shownHi, t0 = performance.now();
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const tick = (now: number) => {
      const k = reduce ? 1 : Math.min(1, (now - t0) / 500), e = 1 - Math.pow(1 - k, 3);
      shownLo = fromLo + (lo - fromLo) * e; shownHi = fromHi + (hi - fromHi) * e;
      totalEl.textContent = lo === hi ? rub(shownHi) : `${rub(shownLo).replace(/\s₽$/, '')} – ${rub(shownHi)}`;
      if (k < 1) anim = requestAnimationFrame(tick);
    };
    anim = requestAnimationFrame(tick);
  }

  let last: any = null;
  function render() {
    const f = fmt();
    const note = $('[data-note]'), lines = $('[data-lines]'), warn = $('[data-warn]');
    warn.hidden = true; totalEl.classList.remove('ind');
    if (S.fmt === 'cert') {
      const v = +certIn.value; countTo(v, v);
      note.textContent = 'Подарочный сертификат на 6 месяцев. Пришлём ссылку на оплату.';
      lines.innerHTML = '<li><span>Формат</span><span>PDF или печатный</span></li>';
      last = { cert: v }; return;
    }
    if (!f) { totalEl.textContent = '—'; note.textContent = 'Выберите формат — покажем вилку'; lines.innerHTML = ''; return; }
    const guests = Math.max(0, +guestsIn.value || 0);
    const r = price(f, D.calc, { guests, hours: +hoursIn.value || f.H, km: km(), generator: S.power === 'no' });
    last = r;
    if (r.individual) {
      cancelAnimationFrame(anim); totalEl.textContent = 'Индивидуальный расчёт'; totalEl.classList.add('ind');
      note.textContent = `Больше ${D.calc.individualOver} гостей — нужен второй мастер и больше звука. Посчитаем вручную.`;
    } else {
      countTo(r.low, r.high);
      note.textContent = `Вилка ±${D.calc.spreadPercent} %. Точную смету пришлёт менеджер.`;
    }
    lines.innerHTML = r.lines.map((l: any) => `<li><span>${l.label}</span><span>${l.base ? '' : '+'}${rub(l.sum)}</span></li>`).join('')
      + `<li><span>Входит</span><span>${f.what.length} пункта</span></li>`;
    if (f.maxGuests && guests > f.maxGuests) { warn.hidden = false; warn.textContent = `Мастер-класс — максимум для ${f.maxGuests} человек. Для большой группы подойдёт «Чайная церемония» или «Чай + DJ».`; }
    else if (S.power === 'unknown') { warn.hidden = false; warn.textContent = `Уточним у площадки. Если розетки нет — генератор +${rub(D.calc.generator)}.`; }
    else if (S.place === 'out') { warn.hidden = false; warn.textContent = 'На улице нужен шатёр или навес над техникой и ровная поверхность.'; }
  }

  function show(n: number) {
    const silent = !S.shown;
    S.step = n; S.shown = 1;
    steps.forEach((s) => (s.hidden = +s.dataset.step! !== n));
    prog.forEach((li, i) => (li.className = i + 1 === n ? 'on' : i + 1 < n ? 'done' : ''));
    back.hidden = n === 1;
    next.hidden = n === 4;
    $('[data-f="cert"]').hidden = S.fmt !== 'cert';
    $('[data-l4]').textContent = S.fmt === 'cert' ? 'Кому прислать ссылку на оплату?' : 'Куда прислать точный расчёт?';
    $('[data-sum-label]').textContent = n === 4 && S.fmt !== 'cert' ? 'Итог до звонка' : 'Примерная стоимость';
    if (!silent) goal('calc_step_' + n);
    render();
  }

  function valid(n: number) {
    if (n === 1) { const ok = !!S.fmt; $('[data-err="fmt"]').style.display = ok ? 'none' : 'block'; return ok; }
    if (n === 2) {
      const okD = !!dateIn.value && dateIn.value >= dateIn.min; $('[data-f="date"]').classList.toggle('err', !okD);
      const okK = town.value !== 'other' || (+kmIn.value >= 1 && +kmIn.value <= 500); $('[data-f="km"]').classList.toggle('err', !okK);
      return okD && okK;
    }
    if (n === 3) { const ok = +guestsIn.value >= 1; $('[data-f="guests"]').classList.toggle('err', !ok); return ok; }
    return true;
  }

  const go = (n: number) => { show(n); form!.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' }); };
  next.addEventListener('click', () => { if (valid(S.step)) go(S.step === 1 && S.fmt === 'cert' ? 4 : S.step + 1); });
  back.addEventListener('click', () => go(S.step === 4 && S.fmt === 'cert' ? 1 : S.step - 1));

  form.addEventListener('change', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.name === 'fmt') { setFmt(t.value); goal('calc_format'); return; }
    render();
  });
  form.addEventListener('input', (e) => { if ((e.target as HTMLElement).closest('.cstep[data-step="2"], .cstep[data-step="3"]')) render(); });
  $$('[data-place]').forEach((b) => b.addEventListener('click', () => { S.place = b.dataset.place!; $$('[data-place]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); render(); }));
  $$('[data-power]').forEach((b) => b.addEventListener('click', () => { S.power = b.dataset.power!; $$('[data-power]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); render(); }));
  form.addEventListener('calc:format', ((e: CustomEvent) => { setFmt(e.detail); show(e.detail === 'cert' ? 4 : 2); }) as EventListener);
  form.addEventListener('calc:prefill', ((e: CustomEvent) => { setFmt(e.detail.fmt); guestsIn.value = String(e.detail.guests); show(2); }) as EventListener);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (S.step !== 4) { next.click(); return; }
    if (!validateContact(contact)) return;
    const f = fmt();
    const townName = town.value === 'other' ? 'Другой пункт' : D.calc.towns[+town.value].name;
    const payload: Record<string, unknown> = { kind: 'calc', fmt: S.fmt, ...contactData(contact) };
    if (S.fmt === 'cert') payload.cert = +certIn.value;
    else Object.assign(payload, {
      date: dateIn.value, town: townName, km: km(), guests: +guestsIn.value, hours: +hoursIn.value || f.H,
      place: S.place, power: S.power, estimate: last && !last.individual ? { low: last.low, high: last.high, total: last.total } : 'индивидуальный расчёт',
    });
    send(payload, contact.querySelector('.form-status'), D.work, contact.querySelector('button[type="submit"]'));
  });

  // Старт: формат из пресета страницы или из ссылки (#calc с data-fmt на другой странице)
  if (D.preset) { setFmt(D.preset); show(1); } else show(1);
  S.shown = 1;
}

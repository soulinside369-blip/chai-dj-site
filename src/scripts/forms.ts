// Формы: маска телефона, проверка на русском, отправка в api/send.php, экран «Спасибо».
import { goal } from './fx';

const BASE = (document.querySelector<HTMLAnchorElement>('.logo')?.getAttribute('href') || '/').replace(/\/?$/, '/');
const touch = matchMedia('(pointer: coarse)').matches;

/* UTM — запоминаем с первой страницы визита */
try {
  const q = new URLSearchParams(location.search);
  const utm: Record<string, string> = {};
  for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'yclid']) if (q.get(k)) utm[k] = q.get(k)!;
  if (Object.keys(utm).length) sessionStorage.setItem('cdj_utm', JSON.stringify(utm));
  if (!sessionStorage.getItem('cdj_ref')) sessionStorage.setItem('cdj_ref', document.referrer || 'прямой заход');
} catch {}

export function maskPhone(input: HTMLInputElement) {
  input.addEventListener('input', () => {
    const v = input.value;
    if (v.trim().startsWith('@') || /[a-z_]/i.test(v)) return;
    let d = v.replace(/\D/g, '');
    if (!d) { input.value = ''; return; }
    if (d[0] === '8') d = '7' + d.slice(1);
    if (d[0] !== '7') d = '7' + d;
    d = d.slice(0, 11);
    const p = [d.slice(1, 4), d.slice(4, 7), d.slice(7, 9), d.slice(9, 11)];
    input.value = '+7' + (p[0] ? ' (' + p[0] : '') + (p[0].length === 3 ? ')' : '') + (p[1] ? ' ' + p[1] : '') + (p[2] ? '-' + p[2] : '') + (p[3] ? '-' + p[3] : '');
  });
}

export function validateContact(node: HTMLElement) {
  const get = (n: string) => node.querySelector<HTMLInputElement>(`[name="${n}"]`);
  const set = (f: string, ok: boolean) => { node.querySelector(`[data-f="${f}"]`)?.classList.toggle('err', !ok); return ok; };
  const c = get('contact')!.value.trim();
  const em = get('email');
  const ok = [
    set('name', get('name')!.value.trim().length >= 2),
    set('contact', /^@[a-z0-9_]{4,32}$/i.test(c) || c.replace(/\D/g, '').length === 11),
    em ? set('email', !em.value.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em.value.trim())) : true,
    set('consent', get('consent')!.checked),
  ].every(Boolean);
  if (!ok && !touch) node.querySelector<HTMLElement>('.err input, .err textarea')?.focus();
  return ok;
}

export function contactData(node: HTMLElement) {
  const v = (n: string) => (node.querySelector<HTMLInputElement>(`[name="${n}"]`)?.value || '').trim();
  return { name: v('name'), contact: v('contact'), email: v('email'), comment: v('comment'), consent: true, website: v('website') };
}

/** Срок ответа по рабочему времени (дубль серверной логики — для демо без PHP) */
export function replyBy(work: { from: number; to: number; tz: number; replyMinutes: number; nightReplyBy: number; tzLabel: string }) {
  const now = new Date();
  const local = new Date(now.getTime() + (work.tz * 60 + now.getTimezoneOffset()) * 60000);
  const h = local.getHours() + local.getMinutes() / 60;
  if (h >= work.from && h < work.to) {
    const t = new Date(local.getTime() + work.replyMinutes * 60000);
    return `Ответим сегодня до ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')} ${work.tzLabel}`;
  }
  return `Ответим ${h < work.from ? 'сегодня' : 'завтра'} до ${work.nightReplyBy}:00 ${work.tzLabel}`;
}

function localId() {
  const d = new Date();
  return 'ЧД-' + String(d.getFullYear()).slice(2) + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + '-' + String(Math.floor(Math.random() * 900) + 100);
}

export async function send(payload: Record<string, unknown>, statusEl: HTMLElement | null, work: any, button?: HTMLButtonElement | null) {
  if (payload.website) return; // ловушка для ботов
  let utm = {}; let ref = '';
  try { utm = JSON.parse(sessionStorage.getItem('cdj_utm') || '{}'); ref = sessionStorage.getItem('cdj_ref') || ''; } catch {}
  const body = { ...payload, utm, ref, page: location.pathname };
  if (statusEl) statusEl.textContent = 'Отправляем…';
  if (button) button.disabled = true;
  let result: { id: string; replyBy: string; demo?: boolean };
  try {
    const r = await fetch(BASE + 'api/send.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json();
    if (j && j.error === 'rate') { if (statusEl) statusEl.textContent = 'Заявка уже отправлена. Если нужно отправить ещё одну — подождите 20 секунд.'; if (button) button.disabled = false; return; }
    if (!r.ok || !j.ok) throw new Error(j.error || 'server');
    result = { id: j.id, replyBy: j.replyBy };
  } catch (e) {
    // Сервера с PHP нет (например, превью на GitHub Pages) — показываем демо-экран, заявка не уходит
    if (location.hostname.endsWith('github.io') || location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
      result = { id: localId(), replyBy: replyBy(work), demo: true };
    } else {
      if (statusEl) statusEl.textContent = 'Не получилось отправить. Проверьте интернет и попробуйте ещё раз — или напишите нам в Telegram.';
      if (button) button.disabled = false;
      return;
    }
  }
  goal(payload.kind === 'calc' ? 'form_calc_submit' : 'form_quick_submit');
  try { sessionStorage.setItem('cdj_lead', JSON.stringify({ ...result, date: payload.date || '', fmt: payload.fmt || '', guests: payload.guests || '', town: payload.town || '' })); } catch {}
  location.href = BASE + 'spasibo/';
}

/* Ошибка у поля исчезает, как только его поправили */
document.addEventListener('input', (e) => { (e.target as HTMLElement).closest('.err')?.classList.remove('err'); });
document.addEventListener('change', (e) => { (e.target as HTMLElement).closest('.err')?.classList.remove('err'); });

/* Быстрые формы на странице */
document.querySelectorAll<HTMLFormElement>('form[data-quick]').forEach((form) => {
  const node = form.querySelector<HTMLElement>('[data-contact]')!;
  maskPhone(node.querySelector('[name="contact"]')!);
  const work = JSON.parse(form.dataset.work || '{}');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!validateContact(node)) return;
    const fmt = (form.querySelector<HTMLSelectElement>('[name="fmt"]')?.value) || '';
    send({ kind: 'quick', fmt, ...contactData(node) }, node.querySelector('.form-status'), work, form.querySelector('button[type="submit"]'));
  });
});

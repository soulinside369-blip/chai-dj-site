// Тактильный отклик (по образцу feel.ts КЛЮЧа): Android — Vibration API, iOS 18+ — переключатель <input switch>.
let iosLabel: HTMLLabelElement | null = null;
const coarse = matchMedia('(pointer: coarse)').matches;
function ios() {
  if (iosLabel) return iosLabel;
  const l = document.createElement('label');
  l.setAttribute('aria-hidden', 'true');
  l.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden';
  const i = document.createElement('input');
  i.type = 'checkbox'; i.setAttribute('switch', ''); i.tabIndex = -1;
  l.appendChild(i); document.body.appendChild(l);
  return (iosLabel = l);
}
export function feel(kind: 'tick' | 'step' | 'press' = 'tick') {
  if (!coarse) return;
  const ms = kind === 'step' ? 14 : kind === 'press' ? 10 : 6;
  if (navigator.vibrate) { navigator.vibrate(ms); return; }
  try { ios().click(); } catch {}
}

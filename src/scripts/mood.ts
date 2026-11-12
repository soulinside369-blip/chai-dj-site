// Настроение вечера — одна переменная на весь сайт (0 — тишина, 1 — танцпол).
// Ставит на <html> --mood, data-mood (quiet | rhythm | dance) и --beat (длительность доли по темпу),
// запоминает выбор: внутренние страницы и заявка открываются в той же атмосфере.
export type Zone = 'quiet' | 'rhythm' | 'dance';
export const zoneOf = (p: number): Zone => (p < 0.34 ? 'quiet' : p < 0.67 ? 'rhythm' : 'dance');
export const fmtOf = (z: Zone) => (z === 'quiet' ? 'tea' : z === 'rhythm' ? 'teadj' : 'dj');
export const bpmOf = (p: number) => Math.round(p < 0.5 ? 60 + p * 2 * 30 : 90 + (p - 0.5) * 2 * 38);

const html = document.documentElement;
let saveT = 0;

export function applyMood(p: number, save = true) {
  const z = zoneOf(p);
  html.style.setProperty('--mood', p.toFixed(3));
  html.style.setProperty('--beat', (60 / bpmOf(p)).toFixed(3) + 's');
  if (html.dataset.mood !== z) html.dataset.mood = z;
  if (save) { clearTimeout(saveT); saveT = window.setTimeout(() => { try { localStorage.setItem('cdj_mood', p.toFixed(2)); } catch {} }, 250); }
  return z;
}

export function storedMood(): number | null {
  try { const v = localStorage.getItem('cdj_mood'); return v === null ? null : Math.min(1, Math.max(0, +v)); } catch { return null; }
}

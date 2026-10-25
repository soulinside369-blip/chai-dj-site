// Формула из раздела 6 ТЗ. Одна функция на сайт, сервер (send.php повторяет её) и проверку.
// Цена = База + гости сверх G × a + часы сверх H × b + км × 2 × ставка + генератор (если нет 220 В)

/** @param {number} n */
export const rub = (n) => Math.round(n).toLocaleString('ru-RU').replace(/\u00a0/g, '\u202f') + '\u00a0₽';
/** @param {number} n */
export const num = (n) => String(n).replace('.', ',');

/**
 * @param {any} f формат из formats.json
 * @param {any} c настройки из calc.json
 * @param {{guests:number, hours:number, km:number, generator:boolean}} o
 */
export function price(f, c, o) {
  const lines = [{ label: `База: ${f.name}, ${num(f.H)} ч, до ${f.G} гостей`, sum: f.base, base: true }];
  const xg = Math.max(0, (o.guests || 0) - f.G);
  if (xg) lines.push({ label: `${xg} гост. сверх × ${rub(f.a)}`, sum: xg * f.a });
  const xh = f.b ? Math.max(0, (o.hours || f.H) - f.H) : 0;
  if (xh) lines.push({ label: `${num(xh)} ч сверх × ${rub(f.b)}`, sum: xh * f.b });
  if (o.km > 0) lines.push({ label: `Выезд: ${o.km} км × 2 × ${c.perKm} ₽`, sum: o.km * 2 * c.perKm });
  if (o.generator) lines.push({ label: 'Генератор — нет 220 В', sum: c.generator });
  const total = lines.reduce((s, l) => s + l.sum, 0);
  const k = (c.spreadPercent || 0) / 100;
  const round = (v) => Math.round(v / 100) * 100;
  return {
    total,
    lines,
    low: round(total * (1 - k)),
    high: round(total * (1 + k)),
    individual: (o.guests || 0) > c.individualOver,
  };
}

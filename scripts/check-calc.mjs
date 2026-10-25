// Критерий приёмки 13 ТЗ: «Чай + DJ, 50 гостей, 5 ч, 25 км» = 73 000 ₽.
import { readFileSync } from 'node:fs';
import { price } from '../src/lib/price.js';

const formats = JSON.parse(readFileSync(new URL('../src/data/formats.json', import.meta.url))).items;
const calc = JSON.parse(readFileSync(new URL('../src/data/calc.json', import.meta.url)));
const f = formats.find((x) => x.key === 'teadj');
const r = price(f, calc, { guests: 50, hours: 5, km: 25, generator: false });
console.log(r.lines.map((l) => `  ${l.label}: ${l.sum}`).join('\n'));
console.log(`Итого ${r.total}, вилка ${r.low}–${r.high}`);
if (r.total !== 73000) {
  console.error('ОШИБКА: ожидалось 73 000 ₽ (коэффициенты изменены — обновите пример в ТЗ)');
  process.exit(1);
}
console.log('OK: пример из ТЗ сходится');

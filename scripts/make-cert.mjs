// Подарочный сертификат с номером → certs/<номер>.pdf и строка в certs/registry.csv (папка не попадает в git).
//
//   npm run cert -- --value 10000 --to "Анне"                 сертификат на сумму
//   npm run cert -- --format teadj --to "Команде отдела продаж" сертификат на формат (tea | teadj | dj | mk)
//   необязательно: --from "от коллег"  --months 6  --number CDJ-2611-0001
//
// Номер проверяйте по registry.csv при звонке получателя: там сумма, формат, срок и статус.
import { mkdirSync, existsSync, readFileSync, appendFileSync } from 'node:fs';
import { render, fontsCss, img, esc } from './_render.mjs';

const root = new URL('../', import.meta.url).pathname;
const site = JSON.parse(readFileSync(root + 'src/data/site.json', 'utf8'));
const formats = JSON.parse(readFileSync(root + 'src/data/formats.json', 'utf8')).items;

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const k = process.argv[i].replace(/^--/, '');
  args[k] = process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : true;
}
const fmt = args.format && formats.find((f) => f.key === args.format);
if (args.format && !fmt) { console.error('Нет формата', args.format, '— есть:', formats.map((f) => f.key).join(', ')); process.exit(1); }
const value = fmt ? fmt.base : Number(String(args.value || '').replace(/\D/g, ''));
if (!fmt && !value) { console.error('Укажите --value 10000 или --format teadj'); process.exit(1); }

const months = Number(args.months || parseInt(site.certificates.validity) || 6);
const now = new Date();
const until = new Date(now); until.setMonth(until.getMonth() + months);
const date = (d) => d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
const rub = (n) => n.toLocaleString('ru-RU').replace(/\s/g, ' ') + ' ₽';

const dir = root + 'certs/';
mkdirSync(dir, { recursive: true });
const registry = dir + 'registry.csv';
if (!existsSync(registry)) appendFileSync(registry, '﻿номер;выдан;действует до;формат;сумма;кому;от кого;статус\n');
const prefix = `CDJ-${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}-`;
const seq = readFileSync(registry, 'utf8').split('\n').filter((l) => l.replace(/^"/, '').startsWith(prefix)).length + 1;
const number = args.number || prefix + String(seq).padStart(4, '0');

const headline = fmt ? fmt.name : rub(value);
const sub = fmt ? `${fmt.duration} · ${fmt.guestsLabel}` : 'на любой формат: чайная церемония, DJ-сет, «Чай + DJ», мастер-класс';
const contacts = [site.contacts.phoneDisplay, site.contacts.telegram && `Telegram ${site.contacts.telegram}`, site.contacts.site].filter((x) => x && !/^\[/.test(x)).join(' · ');

const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><style>${fontsCss}
@page{size:210mm 148mm;margin:0}
*{box-sizing:border-box;margin:0}
body{width:210mm;height:148mm;background:#1C1B18;color:#EDE6DA;font:400 10pt/1.45 Manrope,sans-serif;display:grid;grid-template-columns:88mm 1fr;overflow:hidden}
.art{background:url(${img(site.certificates.image.replace(/-1280\.webp$/, '-1280.webp'))}) center/cover;position:relative}
.art:after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,transparent 60%,#1C1B18)}
.c{padding:14mm 14mm 12mm 8mm;display:flex;flex-direction:column;gap:5mm}
.k{font:600 7.5pt Manrope;letter-spacing:.18em;text-transform:uppercase;color:#C8A165}
h1{font:500 30pt/1 Cormorant,serif}
.v{font:600 26pt/1 Cormorant,serif;color:#C8A165}
.sub{color:#B9B0A2}
.to{font:500 15pt/1.2 Cormorant,serif;border-top:1px solid #3a3731;padding-top:4mm}
.meta{margin-top:auto;display:grid;grid-template-columns:1fr 1fr;gap:3mm 6mm;font-size:8.5pt;color:#B9B0A2}
.meta b{display:block;color:#EDE6DA;font-weight:600;font-size:10pt}
.foot{font-size:7.5pt;color:#8d857a;border-top:1px solid #3a3731;padding-top:3mm}
</style></head><body>
<div class="art"></div>
<div class="c">
  <p class="k">${esc(site.brand.name)} · подарочный сертификат</p>
  <h1>Вечер с чаем и&nbsp;музыкой</h1>
  <div><p class="v">${esc(headline)}</p><p class="sub">${esc(sub)}</p></div>
  ${args.to ? `<p class="to">${esc(args.to)}${args.from ? `<br><span class="sub" style="font:400 9pt Manrope">${esc(args.from)}</span>` : ''}</p>` : ''}
  <div class="meta">
    <p>Номер<b>${esc(number)}</b></p>
    <p>Действует до<b>${date(until)}</b></p>
  </div>
  <p class="foot">Чтобы выбрать дату, назовите номер сертификата. Выезд за пределы Екатеринбурга и расширение программы оплачиваются отдельно по калькулятору на сайте.${contacts ? '<br>' + esc(contacts) : ''}</p>
</div></body></html>`;

const out = `${dir}${number}.pdf`;
await render(html, (page) => page.pdf({ path: out, width: '210mm', height: '148mm', printBackground: true }));
const csv = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
appendFileSync(registry, [number, now.toISOString().slice(0, 10), until.toISOString().slice(0, 10), fmt ? fmt.name : 'на сумму', value, args.to || '', args.from || '', 'выдан'].map(csv).join(';') + '\n');
console.log('Сертификат готов:', out);

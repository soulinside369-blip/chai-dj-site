// Типограф после сборки: неразрывные пробелы, чтобы строки не обрывались на предлогах, тире и единицах.
//  • короткие слова (в, и, с, на, до, для, без…) приклеиваются к следующему слову;
//  • тире — к предыдущему слову;  • число — к единице (45 000 ₽, 4 ч, 3 × 3 м, 30 гостей).
// Работает только с текстом между тегами; <script>, <style>, <pre>, <code>, <textarea> не трогает.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const NB = ' ';
const SHORT = '(?:[А-Яа-яЁё]{1,2}|без|для|над|под|при|про|про|как|или|что|все|это|так|его|над|изо|обо|ото|через|между)';
const reShort = new RegExp(`(^|[\\s(«„"\\u00a0—–-])(${SHORT})[ \\t\\n]+(?=[^\\s])`, 'gi');
const reDash = /[ \t\n]+([—–])(?=[ \t\n])/g;
const reUnit = /(\d)[ \t\n]+(?=(?:₽|%|×|км|мин[а-яё]*|кВт|В|гост[а-яё]*|человек[а-яё]*|час[а-яё]*|сорт[а-яё]*|мес[а-яё]*|ч|м|л|г|лет|года?|дн[а-яё]*)(?![а-яёa-z]))/gi;
const reTimes = /[ \t\n\u00a0]+×[ \t\n\u00a0]+/g;

export function typo(text) {
  if (!/[А-Яа-яЁё]/.test(text)) return text;
  let t = text;
  for (let i = 0; i < 2; i++) t = t.replace(reShort, (m, pre, w) => `${pre}${w}${NB}`); // дважды: «и в доме»
  t = t.replace(reDash, `${NB}$1`).replace(reUnit, `$1${NB}`).replace(reTimes, `${NB}×${NB}`);
  return t;
}

// Блоки, в которых последнее слово не должно оставаться на строке одно (висячая строка)
const BLOCK = /^(h1|h2|h3|h4|p|li|summary|dd|dt|figcaption|blockquote|b|button|a)$/i;

/** Склеить последнее слово с предыдущим, только если получается короткий кусок (≤ 14 знаков), чтобы не вылезало на узких экранах */
function glueLast(t) {
  return t.replace(/([^\s\u00a0]+)[ \t\n]+([^\s\u00a0]+\s*)$/, (m, a, b) => (a.length + b.trim().length <= 13 && b.trim().length <= 7 ? `${a}\u00a0${b}` : m));
}

/** Для строк, которые подставляет скрипт: типограф + склейка последних слов */
export function typoLine(text) {
  return glueLast(typo(text));
}

export function processHtml(html) {
  const parts = html.split(/(<[^>]+>)/);
  let skip = null;
  const stack = []; // [тег, индекс последнего текстового куска]
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (p.startsWith('<')) {
      const m = /^<(\/)?(script|style|pre|code|textarea)\b/i.exec(p);
      if (m) { skip = m[1] ? null : m[2].toLowerCase(); continue; }
      const t = /^<(\/)?([a-z0-9]+)/i.exec(p);
      if (t && BLOCK.test(t[2])) {
        if (!t[1]) stack.push([t[2].toLowerCase(), -1]);
        else {
          const top = stack.pop();
          if (top && top[1] >= 0) {
            // склеиваем два последних слова, если последнее короткое
            parts[top[1]] = glueLast(parts[top[1]]);
          }
        }
      }
      continue;
    }
    if (!skip && p.trim()) {
      parts[i] = typo(p);
      if (stack.length) stack[stack.length - 1][1] = i;
    }
  }
  return parts.join('');
}

async function walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const f = join(dir, e.name);
    if (e.isDirectory()) { if (!['admin', '_astro', 'api', 'img', 'uploads'].includes(e.name)) await walk(f); }
    else if (e.name.endsWith('.html')) await writeFile(f, processHtml(await readFile(f, 'utf8')));
  }
}

export default function typograf() {
  return { name: 'typograf', hooks: { 'astro:build:done': async ({ dir }) => { await walk(dir.pathname); } } };
}

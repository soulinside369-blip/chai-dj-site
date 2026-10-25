// Собирает PDF техтребований из готовой страницы dist/trebovaniya-ploshchadki/ → dist/docs/trebovaniya-ploshchadki.pdf
// Запуск после `npm run build`: `npm run pdf`. В CI браузер ставится шагом `npx playwright install chromium`.
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright';

const dist = new URL('../dist/', import.meta.url).pathname;
const base = (process.env.BASE_PATH || '/').replace(/\/?$/, '/');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.woff2': 'font/woff2', '.woff': 'font/woff', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png' };

const server = createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.startsWith(base)) p = '/' + p.slice(base.length);
  let file = normalize(join(dist, p));
  if (!file.startsWith(dist)) { res.writeHead(403).end(); return; }
  if (p.endsWith('/')) file = join(file, 'index.html');
  let body;
  try { body = await readFile(file); } catch { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' }).end(body);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const executablePath = process.env.PW_CHROMIUM_PATH && existsSync(process.env.PW_CHROMIUM_PATH) ? process.env.PW_CHROMIUM_PATH : undefined;
const browser = await chromium.launch({ executablePath });
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:${port}${base}trebovaniya-ploshchadki/`, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await mkdir(join(dist, 'docs'), { recursive: true });
const out = join(dist, 'docs', 'trebovaniya-ploshchadki.pdf');
await page.pdf({ path: out, format: 'A4', printBackground: true, preferCSSPageSize: true });
await browser.close();
server.close();
console.log('PDF готов:', out);

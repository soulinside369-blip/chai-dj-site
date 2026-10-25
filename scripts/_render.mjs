// Общий помощник: HTML-страница со шрифтами и картинками сайта (через data:URI) → PDF/JPG в Chromium.
import { readFileSync, existsSync } from 'node:fs';
import { chromium } from 'playwright';

const root = new URL('../', import.meta.url).pathname;
const b64 = (p) => readFileSync(root + p).toString('base64');
export const font = (pkg, file) => `data:font/woff2;base64,${b64(`node_modules/@fontsource/${pkg}/files/${file}`)}`;
export const img = (p) => `data:image/${p.endsWith('.png') ? 'png' : 'webp'};base64,${b64('public' + p)}`;
export const fontsCss = `
@font-face{font-family:Cormorant;font-weight:500;src:url(${font('cormorant-garamond', 'cormorant-garamond-cyrillic-500-normal.woff2')})}
@font-face{font-family:Cormorant;font-weight:600;src:url(${font('cormorant-garamond', 'cormorant-garamond-cyrillic-600-normal.woff2')})}
@font-face{font-family:Manrope;font-weight:400;src:url(${font('manrope', 'manrope-cyrillic-400-normal.woff2')})}
@font-face{font-family:Manrope;font-weight:600;src:url(${font('manrope', 'manrope-cyrillic-600-normal.woff2')})}`;
export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export async function render(html, fn) {
  const executablePath = process.env.PW_CHROMIUM_PATH && existsSync(process.env.PW_CHROMIUM_PATH) ? process.env.PW_CHROMIUM_PATH : undefined;
  const browser = await chromium.launch({ executablePath });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    return await fn(page);
  } finally { await browser.close(); }
}

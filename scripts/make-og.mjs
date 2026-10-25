// Картинка для соцсетей и мессенджеров 1200×630 → public/og.jpg (из кадра сцены и названия)
import { readFileSync } from 'node:fs';
import { render, fontsCss, img, esc } from './_render.mjs';
const root = new URL('../', import.meta.url).pathname;
const site = JSON.parse(readFileSync(root + 'src/data/site.json', 'utf8'));
const html = `<!doctype html><html><head><meta charset="utf-8"><style>${fontsCss}
*{margin:0;box-sizing:border-box}
body{width:1200px;height:630px;background:#1C1B18;color:#EDE6DA;font-family:Manrope;display:grid;grid-template-columns:1fr 560px;overflow:hidden}
.t{padding:72px 0 64px 72px;display:flex;flex-direction:column;gap:22px}
.k{font:600 16px Manrope;letter-spacing:.2em;text-transform:uppercase;color:#C8A165}
h1{font:500 78px/0.98 Cormorant;letter-spacing:-.01em}
p.l{font-size:24px;line-height:1.35;color:#B9B0A2;max-width:520px}
.city{margin-top:auto;font:600 18px Manrope;color:#EDE6DA}
.a{position:relative;background:url(${img('/img/scene-tea-1280.webp')}) center/cover}
.a:before{content:"";position:absolute;inset:0;background:linear-gradient(90deg,#1C1B18 0,transparent 35%)}
.a:after{content:"";position:absolute;left:0;right:0;bottom:0;height:50%;background:url(${img('/img/scene-dance-1280.webp')}) center bottom/cover;-webkit-mask:linear-gradient(transparent,#000 70%);mask:linear-gradient(transparent,#000 70%);opacity:.9}
</style></head><body>
<div class="t"><p class="k">${esc(site.brand.name)}</p><h1>Чайная церемония<br>и DJ-сет<br>на ваш вечер</h1>
<p class="l">Сначала чай и разговоры, потом танцы. Свой звук, свет и посуда, цена — до звонка.</p>
<p class="city">${esc(site.brand.region)}</p></div><div class="a"></div></body></html>`;
await render(html, async (page) => {
  await page.setViewportSize({ width: 1200, height: 630 });
  await page.screenshot({ path: root + 'public/og.jpg', type: 'jpeg', quality: 86 });
});
console.log('OG готов: public/og.jpg');

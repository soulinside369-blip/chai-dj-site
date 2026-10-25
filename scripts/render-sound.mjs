// Рендер звука конструктора в WAV/MP3 для проверки на слух (без браузера у слушателя):
//   node scripts/render-sound.mjs [папка]   → tea.mp3, teadj.mp3, dj.mp3, sweep.mp3 + громкость по зонам
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const out = (process.argv[2] || 'sound-demo').replace(/\/$/, '') + '/';
mkdirSync(out, { recursive: true });
const root = new URL('../', import.meta.url).pathname;
const js = (await build({ entryPoints: [root + 'src/scripts/sound.ts'], bundle: true, format: 'iife', globalName: 'SND', write: false, target: 'es2020' })).outputFiles[0].text;

const executablePath = process.env.PW_CHROMIUM_PATH && existsSync(process.env.PW_CHROMIUM_PATH) ? process.env.PW_CHROMIUM_PATH : undefined;
const browser = await chromium.launch({ executablePath });
const page = await browser.newPage();
await page.setContent('<html><body></body></html>');
await page.addScriptTag({ content: js });

const SR = 44100;
const jobs = {
  tea: { dur: 9, mix: '() => 0' },
  teadj: { dur: 9, mix: '() => 0.5' },
  dj: { dur: 9, mix: '() => 1' },
  // ползунок: 0 → середина → вправо → середина → влево, как двигает посетитель
  sweep: { dur: 26, mix: '(t) => t < 5 ? 0 : t < 10 ? 0.5 : t < 16 ? 1 : t < 21 ? 0.5 : 0' },
};
const report = [];
for (const [name, j] of Object.entries(jobs)) {
  const data = await page.evaluate(async ({ dur, mix, SR }) => {
    const ctx = new OfflineAudioContext(2, SR * dur, SR);
    const e = new SND.EveningSound();
    const mixAt = eval(mix);
    e.mix = mixAt(0);
    e.attach(ctx);
    e.setMix(e.mix, 0);
    e.pump(dur - 0.5, mixAt);
    const buf = await ctx.startRendering();
    return [Array.from(buf.getChannelData(0)), Array.from(buf.getChannelData(1))];
  }, { dur: j.dur, mix: j.mix, SR });
  const [L, R] = data;
  const n = L.length;
  const wav = Buffer.alloc(44 + n * 4);
  wav.write('RIFF', 0); wav.writeUInt32LE(36 + n * 4, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20); wav.writeUInt16LE(2, 22); wav.writeUInt32LE(SR, 24); wav.writeUInt32LE(SR * 4, 28); wav.writeUInt16LE(4, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(n * 4, 40);
  let peak = 0;
  for (let i = 0; i < n; i++) {
    peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
    wav.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(L[i] * 32767))), 44 + i * 4);
    wav.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(R[i] * 32767))), 46 + i * 4);
  }
  // громкость по секундам (RMS, дБ)
  const sec = [];
  for (let s = 0; s < Math.floor(n / SR); s++) { let a = 0; for (let i = s * SR; i < (s + 1) * SR; i++) a += L[i] * L[i]; sec.push(Math.round(10 * Math.log10(a / SR + 1e-12))); }
  report.push(`${name}: пик ${peak.toFixed(2)}, RMS по секундам ${sec.join(' ')}`);
  writeFileSync(out + name + '.wav', wav);
  try { execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', out + name + '.wav', '-b:a', '192k', out + name + '.mp3']); } catch {}
}
await browser.close();
console.log(report.join('\n'));

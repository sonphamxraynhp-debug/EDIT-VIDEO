// Thumbnails for the Studio "Hiệu ứng" library: renders every PACKS item (make(2), still at 2.7 s) over real
// footage into studio/thumbs/<packid>__<index>.jpg (180×320, q70) + studio/thumbs/index.json.
// usage: node scripts/thumbs.mjs <project>/timeline.json [--only packid[,packid]] [--t 2.7] [--landscape]
//   (any project with work/frames + captions works; re-run after adding or changing packs)
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { findChrome } from './platform.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const SKILL = path.resolve(here, '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const tlp = args[0] && !args[0].startsWith('--') ? path.resolve(args[0]) : null;
if (!tlp || !fs.existsSync(tlp)) { console.error('usage: node scripts/thumbs.mjs <project>/timeline.json [--only packid] [--t 2.7]'); process.exit(1); }
const only = opt('--only') ? new Set(opt('--only').split(',')) : null;
const at = +opt('--t', 2.7), land = args.includes('--landscape');
const OUT = path.join(SKILL, 'studio/thumbs');
fs.mkdirSync(OUT, { recursive: true });

const dir = path.dirname(tlp);
const tl = JSON.parse(fs.readFileSync(tlp, 'utf8'));
tl.base = pathToFileURL(dir).href + '/';
if (typeof tl.captions === 'string') tl.captions = JSON.parse(fs.readFileSync(path.resolve(dir, tl.captions), 'utf8'));
if (tl.aroll?.frames && !tl.aroll.count) tl.aroll.count = fs.readdirSync(path.resolve(dir, path.dirname(tl.aroll.frames))).filter(f => /\.(jpe?g|png)$/.test(f)).length;
const [W, H] = land ? [1280, 720] : [720, 1280];
Object.assign(tl, { width: W, height: H, scenes: [], caption_style: 'none', fx: [] });

const CHROME = findChrome();
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--allow-file-access-from-files', '--disable-web-security', '--force-color-profile=srgb', '--hide-scrollbars', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
await page.setViewport({ width: W, height: H, deviceScaleFactor: land ? 320 / 1280 : 180 / 720 });
const errs = [];
page.on('pageerror', e => errs.push(e.message));
await page.goto(pathToFileURL(path.join(SKILL, 'engine/index.html')).href, { waitUntil: 'networkidle0' });
await page.evaluate(t => window.init(t), tl);
const list = await page.evaluate(() => PACKS.map(p => ({ id: p.id, name: p.name, items: p.items.map(i => ({ type: i.type, label: i.label })) })));

const prev = fs.existsSync(path.join(OUT, 'index.json')) ? JSON.parse(fs.readFileSync(path.join(OUT, 'index.json'), 'utf8')).items || [] : [];
const items = only ? prev.filter(x => !only.has(x.pack)) : [];
let n = 0, bad = [];
for (const p of list) {
  if (only && !only.has(p.id)) continue;
  for (let j = 0; j < p.items.length; j++) {
    const key = `${p.id}__${j}`;
    try {
      const ok = await page.evaluate(async (pid, j, t) => {
        const it = PACKS.find(x => x.id === pid).items[j];
        const s = JSON.parse(JSON.stringify(it.make(2)));
        TL.scenes = [s]; TL.caption_style = 'none';
        // HyperFrames blocks build up over their whole length: show them at 60 %
        const at = s.type === 'hf' ? s.t0 + (s.t1 - s.t0) * .6 : Math.min(t, (s.t0 ?? 2) + Math.max(.05, ((s.t1 ?? 4) - (s.t0 ?? 2)) * .6));
        await Promise.race([window.renderFrame(at), new Promise(r => setTimeout(r, s.type === 'hf' ? 15000 : 4000))]);
        return true;
      }, p.id, j, at);
      await new Promise(r => setTimeout(r, 60));
      fs.writeFileSync(path.join(OUT, key + '.jpg'), await page.screenshot({ type: 'jpeg', quality: 70 }));
      if (ok) { items.push({ key, pack: p.id, j, type: p.items[j].type, label: p.items[j].label }); n++; }
    } catch (e) { bad.push(`${key}: ${e.message}`); }
  }
  process.stdout.write(`\r${n} thumbs`);
}
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({ generated: new Date().toISOString(), size: land ? [320, 180] : [180, 320], items }, null, 1));
await browser.close();
console.log(`\n${n} thumbnails → ${OUT}${bad.length ? `\nfailed:\n${bad.join('\n')}` : ''}${errs.length ? `\npage errors:\n${[...new Set(errs)].slice(0, 20).join('\n')}` : ''}`);

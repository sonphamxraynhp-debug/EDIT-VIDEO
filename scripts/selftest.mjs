// Self-test: every pack item renders, every recipe runs, every caption style draws, no page errors.
// usage: node scripts/selftest.mjs engine/index.html <project>/timeline.json   (needs captions + frames)
import puppeteer from 'puppeteer-core'; import fs from 'node:fs'; import path from 'node:path'; import { pathToFileURL } from 'node:url';
import { findChrome } from './platform.mjs';
const [eng, tlp] = process.argv.slice(2);
const tl = JSON.parse(fs.readFileSync(tlp, 'utf8')); tl.base = pathToFileURL(path.dirname(tlp)).href + '/';
tl.captions = JSON.parse(fs.readFileSync(path.join(path.dirname(tlp), tl.captions), 'utf8')); tl.aroll.count = 600; tl.width = 720; tl.height = 1280;
const b = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ['--allow-file-access-from-files'] });
const p = await b.newPage(); const errs = [];
p.on('pageerror', e => errs.push('PAGEERR ' + e.message));
await p.goto(pathToFileURL(eng).href, { waitUntil: 'networkidle0' });
await p.evaluate(t => window.init(t), tl);
const res = await p.evaluate(async (base) => {
  const out = []; const caps = Object.keys(CAPTION_STYLES);
  for (const pk of PACKS) for (const it of pk.items) {
    try { const s = it.make(5); TL.scenes = [s]; if (!MODULES[s.type]) throw new Error('no module ' + s.type); MODULES[s.type](s, 5.7, .7); await window.renderFrame(5.7); out.push('ok'); }
    catch (e) { out.push(pk.id + '/' + it.type + ': ' + e.message); }
  }
  for (const pk of PACKS) if (pk.recipe) { try { const r = pk.recipe({ dur: 20, captions: TL.captions, brand: BR(), vertical: true, title: 'Thử' }); TL.scenes = r.scenes; for (const tt of [1, 6, 12, 18]) await window.renderFrame(tt); out.push('ok'); } catch (e) { out.push('recipe ' + pk.id + ': ' + e.message); } }
  for (const c of caps) { try { TL.caption_style = c; await window.renderFrame(7.5); out.push('ok'); } catch (e) { out.push('cap ' + c + ': ' + e.message); } }
  return { n: out.length, bad: out.filter(x => x !== 'ok'), packs: PACKS.map(p => p.id + ':' + p.items.length), caps, mods: Object.keys(MODULES).length };
});
console.log(JSON.stringify({ ...res, errs: [...new Set(errs)] }, null, 1)); await b.close();

// Import HeyGen HyperFrames blocks (Apache-2.0) into engine/hf/ so the engine can play them as 'hf' scenes (engine/hf.js).
// For every entry of scripts/hf_curate.json: copy the block, mark its static texts (data-hft) and inject the variables /
// text-override shim, then open it in headless Chrome, seek it at 15/50/85 % and measure what it draws (blank → dropped,
// full-frame vs transparent overlay, content bbox). Writes engine/hf/catalog.js (window.HF_CATALOG).
// usage: node scripts/hf_import.mjs <hyperframes clone> [--only a,b] [--jobs 4]
// then:  node scripts/thumbs.mjs <project>/timeline.json --only hf_sp,hf_so,…   (library thumbnails)
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { findChrome } from './platform.mjs';
import { localize } from './hf_localize.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const SKILL = path.resolve(here, '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const SRC = args[0] && !args[0].startsWith('--') ? path.resolve(args[0]) : null;
if (!SRC || !fs.existsSync(path.join(SRC, 'registry'))) { console.error('usage: node scripts/hf_import.mjs <hyperframes clone> [--only a,b] [--jobs 4]'); process.exit(1); }
const only = opt('--only') ? new Set(opt('--only').split(',')) : null;
const JOBS = +opt('--jobs', 4);
const CUR = JSON.parse(fs.readFileSync(path.join(here, 'hf_curate.json'), 'utf8'));
const OUT = path.join(SKILL, 'engine/hf');
fs.mkdirSync(OUT, { recursive: true });
const SEEK = fs.readFileSync(path.join(SKILL, 'engine/hf_seek.js'), 'utf8');

// Runs first in <head>: window.__hyperframes.getVariables() = declared defaults + parent.HF_VARS[window.name];
// __hfApply() (called right before the block's own scripts) applies parent.HF_TEXTS[window.name] and the variables as CSS vars.
const SHIM = `<style>[data-hf-demo]{visibility:hidden!important}[data-hf-anc]{background:transparent!important;box-shadow:none!important;border-color:transparent!important}</style><script>(function(){
function own(o){try{return (parent!==window&&o&&o[window.name])||null}catch(e){return null}}
function vars(){var d={};document.querySelectorAll('[data-composition-variables]').forEach(function(el){try{JSON.parse(el.getAttribute('data-composition-variables')).forEach(function(v){if(v&&v.id!=null&&'default' in v)d[v.id]=v.default})}catch(e){}});document.querySelectorAll('[data-variable-values]').forEach(function(el){try{var o=JSON.parse(el.getAttribute('data-variable-values'));for(var k in o)d[k]=o[k]}catch(e){}});var o=own(parent.HF_VARS)||{};for(var k in o)if(o[k]!==''&&o[k]!=null)d[k]=o[k];return d}
window.__hyperframes={getVariables:vars};
window.__hfApply=function(){var tx=own(parent.HF_TEXTS)||{};for(var i in tx){if(tx[i]==null)continue;document.querySelectorAll('[data-hft="'+i+'"]').forEach(function(el){el.textContent=tx[i]})}
var v=vars(),r=document.querySelector('[data-composition-id]')||document.documentElement;for(var k in v){if(typeof v[k]==='string'||typeof v[k]==='number'){r.style.setProperty('--'+k,v[k]);r.style.setProperty('--'+k.replace(/[A-Z]/g,function(c){return '-'+c.toLowerCase()}),v[k])}}};
})();</script>`;

const CHROME = findChrome();
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, protocolTimeout: 60000,
  args: ['--allow-file-access-from-files', '--disable-web-security', '--force-color-profile=srgb', '--hide-scrollbars', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });

function copyDir(a, b) {
  fs.mkdirSync(b, { recursive: true });
  for (const f of fs.readdirSync(a, { withFileTypes: true })) {
    if (f.name === 'registry-item.json' || f.name.endsWith('.md') || f.name.startsWith('.')) continue;
    const s = path.join(a, f.name), d = path.join(b, f.name);
    if (f.isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d);
  }
}

async function analyse(page, png) {
  return page.evaluate(async b64 => {
    const im = new Image(); im.src = 'data:image/png;base64,' + b64; await im.decode();
    const W = 240, H = Math.round(im.height * W / im.width), c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d'); x.drawImage(im, 0, 0, W, H);
    const d = x.getImageData(0, 0, W, H).data;
    let n = 0, x0 = W, y0 = H, x1 = -1, y1 = -1, sum = 0, sum2 = 0;
    for (let y = 0; y < H; y++) for (let i = 0; i < W; i++) {
      const k = (y * W + i) * 4;
      if (d[k + 3] > 24) { n++; if (i < x0) x0 = i; if (i > x1) x1 = i; if (y < y0) y0 = y; if (y > y1) y1 = y; const l = d[k] + d[k + 1] + d[k + 2]; sum += l; sum2 += l * l; }
    }
    const v = n ? sum2 / n - (sum / n) ** 2 : 0;
    return { cov: n / (W * H), bbox: n ? [x0 / W, y0 / H, (x1 + 1) / W, (y1 + 1) / H] : null, flat: v < 30 };
  }, Buffer.from(png).toString('base64'));
}

// Inline every <… data-composition-src="x.html"> host (what the HyperFrames runtime does at load): the sub-composition's
// <template> (or its <head> styles + <body>) goes inside the host, which also takes over its declared variables.
function mount(html, dir) {
  return html.replace(/<(\w+)\b([^>]*?)\sdata-composition-src="([^"]+)"([^>]*)>(\s*)<\/\1>/g, (m, tag, a1, src, a2) => {
    const f = path.join(dir, src);
    if (!fs.existsSync(f)) return m;
    const sub = mount(fs.readFileSync(f, 'utf8').replace(/<!--[\s\S]*?-->/g, ''), path.dirname(f));
    const tpl = sub.match(/<template[^>]*>([\s\S]*)<\/template>/i);
    const head = (sub.match(/<head[^>]*>([\s\S]*?)<\/head>/i)?.[1] || '').match(/<(style|link|script)\b[\s\S]*?(<\/\1>|\/?>)/gi) || [];
    const body = tpl ? tpl[1] : head.join('\n') + (sub.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] || sub);
    const decl = sub.match(/<html\b[^>]*\sdata-composition-variables=('([^']*)'|"([^"]*)")/i);
    const attrs = a1 + a2 + (decl && !/data-composition-variables=/.test(a1 + a2) ? ` data-composition-variables='${(decl[2] ?? decl[3].replace(/&quot;/g, '"')).replace(/'/g, '&#39;')}'` : '');
    return `<${tag}${attrs} data-hf-host>${body}</${tag}>`;
  });
}
// Registry assets hosted on HeyGen's CDN: photos are replaced by our own sample images (no third-party faces/brands shipped),
// anything else (fonts, models, data) is downloaded.
const POOL = ['living.jpg', 'kitchen.jpg', 'facade.jpg', 'bedroom.jpg', 'top_halong.jpg', 'top_hoian.jpg', 'top_dalat.jpg', 'top_sapa.jpg', 'top_phuquoc.jpg', 'tf_after.jpg', 'gs_bg_city.jpg', 'gs_site.jpg']
  .map(f => path.join(SKILL, 'examples/media', f)).filter(f => fs.existsSync(f));
let poolI = 0;
async function remoteAssets(meta, dst) {
  for (const f of meta.files || []) {
    const out = path.join(dst, f.path);
    if (!f.url || fs.existsSync(out)) continue;
    fs.mkdirSync(path.dirname(out), { recursive: true });
    if (/\.(jpe?g|png|webp)$/i.test(f.path) && POOL.length) { fs.copyFileSync(POOL[poolI++ % POOL.length], out); continue; }
    const r = await fetch(f.url).catch(() => null);
    if (r?.ok) fs.writeFileSync(out, Buffer.from(await r.arrayBuffer()));
  }
}

async function importOne([name, group, label], tools) {
  const kind = fs.existsSync(path.join(SRC, 'registry/blocks', name)) ? 'blocks' : 'components';
  const dir = path.join(SRC, 'registry', kind, name);
  const meta = JSON.parse(fs.readFileSync(path.join(dir, 'registry-item.json'), 'utf8'));
  const htmlName = fs.existsSync(path.join(dir, 'demo.html')) ? 'demo.html' : (meta.files || []).map(f => f.path).find(p => p.endsWith('.html'));
  const dst = path.join(OUT, name);
  fs.rmSync(dst, { recursive: true, force: true });
  copyDir(dir, dst);
  await remoteAssets(meta, dst);

  // 1) mark static texts with scripts disabled, serialise, inject the shim
  // scripts neutralised by type (evaluate() hangs on a JS-disabled page), restored after serialising
  const OFF = ' type="text/x-hfoff"', tmp = path.join(dst, '__mark.html');
  fs.writeFileSync(tmp, mount(fs.readFileSync(path.join(dir, htmlName), 'utf8'), dir).replace(/<script\b([^>]*)>/gi, (m, a) => /\stype\s*=/i.test(a) ? `<script${a.replace(/(\stype\s*=\s*["']?)/i, '$1x-hfoff-')}>` : `<script${OFF}${a}>`));
  const p0 = tools.raw;
  await p0.goto(pathToFileURL(tmp).href, { waitUntil: 'domcontentloaded', timeout: 30000 });
  fs.rmSync(tmp);
  const marked = await p0.evaluate(() => {
    const root = document.querySelector('[data-composition-id]') || document.body, idx = new Map(), texts = [];
    // demo scaffolding around a mounted sub-composition: static siblings hidden, ancestors see-through (script-made nodes untouched)
    if (document.querySelector('[data-hf-host]')) for (const el of document.body.querySelectorAll('*')) {
      if (el.closest('[data-hf-host]') || el.matches('script,style,link')) continue;
      el.setAttribute(el.querySelector('[data-hf-host]') ? 'data-hf-anc' : 'data-hf-demo', '');
    }
    for (const el of root.querySelectorAll('*')) {
      if (el.children.length || el.closest('script,style,template,defs,noscript,title')) continue;
      const own = el.textContent.replace(/\s+/g, ' ').trim();
      if (own.length < 2 || own.length > 140 || !/[\p{L}\p{N}]/u.test(own)) continue;
      if (!idx.has(own)) { if (texts.length >= 16) continue; idx.set(own, texts.length); texts.push({ i: texts.length, def: own }); }
      el.setAttribute('data-hft', idx.get(own));
    }
    const rc = document.querySelector('[data-composition-id]');
    return { html: '<!doctype html>\n' + document.documentElement.outerHTML, texts, root: rc?.getAttribute('data-composition-id'),
      w: +rc?.getAttribute('data-width') || 0, h: +rc?.getAttribute('data-height') || 0, dur: +rc?.getAttribute('data-duration') || 0 };
  });
  let html = marked.html.split(OFF).join('').replace(/x-hfoff-/g, '').replace(/<head>/i, m => m + SHIM);
  const b = html.search(/<body[\s>]/i), s = html.indexOf('<script', b);
  html = s > 0 ? html.slice(0, s) + '<script>window.__hfApply&&window.__hfApply()</script>' + html.slice(s) : html;
  fs.writeFileSync(path.join(dst, 'index.html'), html);
  localize(path.join(dst, 'index.html')); // CDN libraries → engine/hf/_lib
  if (htmlName !== 'index.html') fs.rmSync(path.join(dst, htmlName), { force: true });

  const W = meta.dimensions?.width || marked.w || 1920, H = meta.dimensions?.height || marked.h || 1080, dur = meta.duration || marked.dur || 5;
  // 2) play it: must have a GSAP timeline and draw something
  const pg = tools.live, errs = [];
  const onErr = e => errs.push(String(e.message || e).slice(0, 160));
  pg.on('pageerror', onErr);
  try {
    await pg.setViewport({ width: W, height: H });
    await pg.goto(pathToFileURL(path.join(dst, 'index.html')).href, { waitUntil: 'networkidle0', timeout: 45000 });
    await pg.evaluate(async () => { await document.fonts.ready; const r = window.__hf?.buildReady; if (r?.then) await Promise.race([r, new Promise(z => setTimeout(z, 8000))]); await new Promise(z => setTimeout(z, 100)); });
    await pg.addScriptTag({ content: SEEK });
    const tlOk = await pg.evaluate(id => !!(window.__timelines && (window.__timelines[id] || Object.keys(window.__timelines).length)), marked.root);
    if (!tlOk) return { name, fail: 'không có timeline' };
    await pg.addStyleTag({ content: 'html,body{background:transparent!important}' });
    const shots = [];
    for (const k of [.15, .5, .85]) {
      await pg.evaluate(t => { hfSeek(window, t); return new Promise(r => setTimeout(r, 30)); }, dur * k);
      shots.push(await analyse(tools.ana, await pg.screenshot({ type: 'png', omitBackground: true })));
    }
    const max = Math.max(...shots.map(x => x.cov));
    if (max < .003 || shots.every(x => x.flat && x.cov > .98)) return { name, fail: max < .003 ? 'trống' : 'một màu', errs };
    const bb = shots.filter(x => x.bbox).reduce((a, x) => [Math.min(a[0], x.bbox[0]), Math.min(a[1], x.bbox[1]), Math.max(a[2], x.bbox[2]), Math.max(a[3], x.bbox[3])], [1, 1, 0, 0]);
    const pad = .02, full = shots[1].cov > .985 || shots.filter(x => x.cov > .985).length >= 2;
    const bbox = full ? [0, 0, W, H] : [Math.max(0, bb[0] - pad) * W, Math.max(0, bb[1] - pad) * H, Math.min(1, bb[2] + pad) * W, Math.min(1, bb[3] + pad) * H].map(Math.round);
    const vars = (meta.variables || []).filter(v => ['string', 'color', 'number', 'boolean', 'enum', 'image'].includes(v.type) || v.options)
      .map(v => ({ id: v.id, type: v.type, label: v.label || v.id, desc: v.description || '', def: v.default, options: v.options, min: v.min, max: v.max }));
    return { name, ok: { group, label, file: `hf/${name}/index.html`, w: W, h: H, dur: +(+dur).toFixed(3), root: marked.root, layer: full ? 'full' : 'over',
      box: full ? [0, 0, W, H] : [bbox[0], bbox[1], bbox[2] - bbox[0], bbox[3] - bbox[1]], vars, texts: vars.length ? marked.texts.slice(0, 8) : marked.texts,
      title: meta.title || name, tags: meta.tags || [], errs: errs.length ? errs.slice(0, 2) : undefined } };
  } catch (e) {
    return { name, fail: String(e.message || e).slice(0, 160), errs };
  } finally { pg.off('pageerror', onErr); }
}

const list = CUR.items.filter(([n]) => !only || only.has(n));
const prev = fs.existsSync(path.join(OUT, 'catalog.json')) ? JSON.parse(fs.readFileSync(path.join(OUT, 'catalog.json'), 'utf8')) : {};
const cat = only ? prev : {}, fails = [];
const queue = [...list];
await Promise.all(Array.from({ length: Math.min(JOBS, queue.length) }, async () => {
  const raw = await browser.newPage();
  const tools = { raw, live: await browser.newPage(), ana: await browser.newPage() };
  for (let it; (it = queue.shift());) {
    const r = await importOne(it, tools).catch(e => ({ name: it[0], fail: String(e.message || e).slice(0, 160) }));
    if (r.ok) { cat[r.name] = r.ok; console.log(`ok   ${r.name} ${r.ok.layer} ${r.ok.w}x${r.ok.h} ${r.ok.dur}s vars:${r.ok.vars.length} texts:${r.ok.texts.length}${r.ok.errs ? ' ⚠ ' + r.ok.errs[0] : ''}`); }
    else { fails.push(r); delete cat[r.name]; fs.rmSync(path.join(OUT, r.name), { recursive: true, force: true }); console.log(`FAIL ${r.name}: ${r.fail}${r.errs?.length ? ' · ' + r.errs[0] : ''}`); }
  }
}));
await browser.close();

const order = new Map(CUR.items.map(([n], i) => [n, i]));
const sorted = Object.fromEntries(Object.entries(cat).sort((a, b) => (order.get(a[0]) ?? 1e9) - (order.get(b[0]) ?? 1e9)));
fs.writeFileSync(path.join(OUT, 'catalog.json'), JSON.stringify(sorted, null, 1));
fs.writeFileSync(path.join(OUT, 'catalog.js'), `// Generated by scripts/hf_import.mjs — HyperFrames blocks (Apache-2.0, github.com/heygen-com/hyperframes)\nwindow.HF_GROUPS = ${JSON.stringify(CUR.groups)};\nwindow.HF_CATALOG = ${JSON.stringify(sorted)};\n`);
for (const f of ['LICENSE']) if (fs.existsSync(path.join(SRC, f))) fs.copyFileSync(path.join(SRC, f), path.join(OUT, 'LICENSE-HyperFrames.txt'));
console.log(`\n${Object.keys(sorted).length} khối OK, ${fails.length} bỏ: ${fails.map(f => f.name).join(', ')}`);

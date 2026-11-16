// Point HyperFrames blocks at the libraries shipped in engine/hf/_lib instead of cdn.jsdelivr.net, so every block loads
// instantly and works offline (279 blocks used to fetch GSAP from the CDN, one iframe at a time).
// usage: node scripts/hf_localize.mjs [block …]      (no args = every block; also run by hf_import.mjs)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HF = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../engine/hf');
const LIB = path.join(HF, '_lib');
// CDN path (after cdn.jsdelivr.net/) → file under _lib. Unpinned/"latest" versions resolve to the copy that was vendored.
const ALIAS = [
  [/^npm\/d3@7\//, 'd3@7.9.0/'],
  [/^npm\/world-atlas@2\//, 'world-atlas@2.0.2/'],
  [/^fontsource\/fonts\/inter@latest\/latin-(\d+)-normal\.woff2$/, '@fontsource/inter@5.2.8/files/inter-latin-$1-normal.woff2'],
  [/^npm\//, ''],
];
const local = rel => { for (const [re, to] of ALIAS) if (re.test(rel)) return rel.replace(re, to); return null; };

export function localize(file) {
  const src = fs.readFileSync(file, 'utf8'), missing = new Set();
  const out = src.replace(/https:\/\/cdn\.jsdelivr\.net\/([^"'\s)]+)/g, (url, rel) => {
    const f = local(rel);
    if (!f || !fs.existsSync(path.join(LIB, f))) { missing.add(url); return url; }
    return '../_lib/' + f;
  });
  if (out !== src) fs.writeFileSync(file, out);
  return { changed: out !== src, missing: [...missing] };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const names = process.argv.slice(2).length ? process.argv.slice(2) : fs.readdirSync(HF).filter(d => !d.startsWith('_') && fs.existsSync(path.join(HF, d, 'index.html')));
  let n = 0; const miss = new Set();
  for (const d of names) { const r = localize(path.join(HF, d, 'index.html')); n += r.changed; r.missing.forEach(m => miss.add(m)); }
  console.log(`${n} khối đã chuyển sang thư viện cục bộ`);
  if (miss.size) console.log('Chưa có trong engine/hf/_lib (tải về rồi chạy lại):\n  ' + [...miss].join('\n  '));
}

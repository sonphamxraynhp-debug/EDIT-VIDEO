// Disk cache for the few things the engine pulls from the internet: Fluent 3D emoji and brand icons (jsDelivr) and
// Google font files. Studio serves them at /cdn/… and render.mjs answers its Chromes from here, so every emoji/font is
// downloaded once per machine instead of once per preview and once per render worker. Cache: ~/.ai-video-studio/cache/net
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const DIR = path.join(process.env.AVS_HOME || path.join(os.homedir(), '.ai-video-studio'), 'cache', 'net');
// Only immutable-enough files: jsDelivr packages/repos and Google's font binaries (never the CSS, which varies by browser).
export const cacheable = url => /^https:\/\/(cdn\.jsdelivr\.net\/(gh|npm)\/|fonts\.gstatic\.com\/)/.test(url);
const TYPES = { png: 'image/png', svg: 'image/svg+xml', webp: 'image/webp', jpg: 'image/jpeg', woff2: 'font/woff2', woff: 'font/woff', ttf: 'font/ttf', js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8', json: 'application/json' };
const pending = new Map();

// → { body: Buffer, type } or null when the file can't be had (offline and not cached, 404…).
export async function cached(url) {
  if (!cacheable(url)) return null;
  const key = crypto.createHash('sha1').update(url).digest('hex'), f = path.join(DIR, key);
  try { return { body: fs.readFileSync(f), type: fs.readFileSync(f + '.type', 'utf8') }; } catch { /* not cached yet */ }
  if (pending.has(key)) return pending.get(key);
  const job = (async () => {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (!r.ok) return null;
      const body = Buffer.from(await r.arrayBuffer());
      const ext = (/\.(\w+)(?:\?|$)/.exec(new URL(url).pathname) || [])[1]?.toLowerCase();
      const type = TYPES[ext] || r.headers.get('content-type') || 'application/octet-stream';
      fs.mkdirSync(DIR, { recursive: true });
      fs.writeFileSync(f + '.tmp', body); fs.renameSync(f + '.tmp', f); fs.writeFileSync(f + '.type', type);
      return { body, type };
    } catch { return null; } finally { pending.delete(key); }
  })();
  pending.set(key, job);
  return job;
}

// Puppeteer: answer cacheable requests from disk, let everything else through.
export async function interceptCdn(page) {
  await page.setRequestInterception(true);
  page.on('request', async req => {
    if (req.isInterceptResolutionHandled()) return;
    const url = req.url();
    if (req.method() !== 'GET' || !cacheable(url)) return req.continue();
    const hit = await cached(url);
    if (req.isInterceptResolutionHandled()) return;
    if (hit) return req.respond({ status: 200, contentType: hit.type, body: hit.body, headers: { 'Access-Control-Allow-Origin': '*' } });
    req.continue();
  });
}

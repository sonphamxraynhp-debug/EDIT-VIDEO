// Render the app icon (purple/teal brand mark from studio.css .logo .mark) to a 1024px transparent PNG.
// usage: node scripts/app/make_icon.mjs icon_1024.png
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { findChrome } from '../platform.mjs';

const out = process.argv[2] || 'icon_1024.png';
const CHROME = findChrome();
// Same geometry as the 24px mark (bars at x 6/10.5/15, w 3), scaled to an 824px macOS icon tile on a 1024 canvas.
const k = 824 / 24, bar = (x, y, h) => `<i style="left:${x * k}px;top:${y * k}px;width:${3 * k}px;height:${h * k}px"></i>`;
const html = `<html><body style="margin:0;background:transparent">
<div style="position:absolute;left:100px;top:92px;width:824px;height:824px;border-radius:185px;overflow:hidden;
  background:conic-gradient(from 210deg,#8B7BFF,#2DD4BF,#8B7BFF);box-shadow:0 18px 40px rgba(60,40,160,.35),inset 0 0 0 1px rgba(255,255,255,.18)">
  <div style="position:absolute;inset:0;background:radial-gradient(circle at 30% 20%,rgba(255,255,255,.28),transparent 60%)"></div>
  <style>i{position:absolute;background:#0B0C0F;border-radius:${2 * k}px}</style>
  ${bar(6, 6, 12)}${bar(10.5, 9, 9)}${bar(15, 7, 11)}
</div></body></html>`;
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
const page = (await browser.pages())[0];
await page.setViewport({ width: 1024, height: 1024 });
await page.setContent(html);
fs.writeFileSync(out, await page.screenshot({ type: 'png', omitBackground: true }));
await browser.close();
console.log(out);

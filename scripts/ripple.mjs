// Ripple cut on TL.clips outside the browser (used by scripts/autopilot.mjs for "Cắt lỗi nói").
// Runs the Studio's OWN studio/clips.js (splitClipAt, clipLayout, remapAll, fRemove, fixDuration, migrateClips) inside a
// node:vm context, plus cutRanges/cutOne mirrored line-for-line from studio/features/20_ai.js (minus toasts/undo), so the
// math is identical to cutting in the editor (references/ai-edit.md "Cắt ripple").
//   import { rippleCut } from './ripple.mjs'; const { tl, caps, removed } = rippleCut(tl, caps, [[a, b], …], frameCount)
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CUT_SRC = `
function cutRanges(ranges) {
  if (!TL.clips?.length) migrateClips();
  if (!TL.clips?.length) throw new Error('Dự án chưa có video trên track chính');
  const R = ranges.map(([a, b]) => [Math.max(0, +a), Math.min(clipsTotal(), +b)]).filter(([a, b]) => b - a >= 1 / 30).sort((x, y) => x[0] - y[0]);
  const merged = [];
  for (const r of R) { const m = merged[merged.length - 1]; if (m && r[0] <= m[1] + .1) m[1] = Math.max(m[1], r[1]); else merged.push([...r]); }
  let removed = 0;
  for (const [a, b] of merged.reverse()) removed += cutOne(a, b);
  return { removed, n: merged.length };
}
function cutOne(a, b) {
  const tol = 2 / 30 + 1e-6;
  splitClipAt(b); splitClipAt(a);
  const L = clipLayout().filter(k => k.t1 > k.t0);
  const kill = L.filter(k => k.t0 >= a - tol && k.t1 <= b + tol);
  if (!kill.length || kill.length === L.length) return 0;
  const A = Math.min(...kill.map(k => k.t0)), B = Math.max(...kill.map(k => k.t1));
  const dead = new Set(kill.map(k => k.c));
  TL.clips = TL.clips.filter(c => !dead.has(c));
  if (TL.clips[0]) delete TL.clips[0].transition;
  remapAll(fRemove(A, B), [A, B]);
  fixDuration();
  return B - A;
}
`;

export function rippleCut(tl, caps, ranges, frames) {
  const src = fs.readFileSync(path.join(SKILL, 'studio/clips.js'), 'utf8');
  const c = vm.createContext({ TL: JSON.parse(JSON.stringify(tl)), CAP: JSON.parse(JSON.stringify(caps)), META: { frames }, console });
  vm.runInContext(src + '\n' + CUT_SRC, c, { filename: 'clips.js' });
  c.__R = JSON.parse(JSON.stringify(ranges));
  const r = vm.runInContext('cutRanges(__R)', c);
  return { tl: JSON.parse(JSON.stringify(c.TL)), caps: JSON.parse(JSON.stringify(c.CAP)), removed: +r.removed.toFixed(3), n: r.n };
}

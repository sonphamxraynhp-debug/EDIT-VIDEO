// Mac app helpers (references/app-render.md).
//   GET  /api/app/info    -> { dir, job: {kind, state} } — the app launcher remembers the last project dir from this
//   POST /api/app/reveal  -> open the project folder in Finder
import { spawn } from 'node:child_process';
import { openPath } from '../../scripts/platform.mjs';

export default ctx => async (req, res, p) => {
  if (p === '/api/app/info') return ctx.json(res, { dir: ctx.project?.dir || null, job: ctx.job ? { kind: ctx.job.kind, state: ctx.job.state } : null }), true;
  if (p === '/api/app/reveal' && req.method === 'POST') {
    if (!ctx.project) return ctx.json(res, { ok: false }), true;
    openPath(ctx.project.dir);
    return ctx.json(res, { ok: true }), true;
  }
  return false;
};

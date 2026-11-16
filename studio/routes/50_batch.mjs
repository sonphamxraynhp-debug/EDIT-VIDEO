// Làm hàng loạt: template / dự án hiện tại × bảng tính (CSV, XLSX) → mỗi dòng một dự án + MP4. Engine: scripts/batch.mjs.
// Batches live in <project>/batch/<name>_<stamp>/ (job.json, status.json, 01_<row>/…); sheets uploaded to <project>/batch/_sheets/.
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { parseSheet, targetsOf, autoMap, loadSource } from '../../scripts/batch.mjs';

export default ctx => {
  const BATCH = path.join(ctx.SKILL, 'scripts/batch.mjs');
  const root = () => ctx.P('batch');
  const rel = f => path.relative(ctx.project.dir, f).split(path.sep).join('/');
  const EX = path.join(ctx.SKILL, 'examples/batch');
  const sources = () => {
    const list = [];
    for (const f of fs.existsSync(EX) ? fs.readdirSync(EX).filter(f => f.endsWith('.template.json')) : []) {
      const t = JSON.parse(fs.readFileSync(path.join(EX, f), 'utf8'));
      list.push({ key: 'file:' + f, id: t.id, name: t.name, aspect: t.aspect, pack: t.pack, group: 'Mẫu hàng loạt', needs: t.needs || [] });
    }
    for (const [dir, group] of [[path.join(ctx.SKILL, 'templates'), 'Template'], [path.join(ctx.SKILL, 'templates/user'), 'Template của bạn']]) {
      if (!fs.existsSync(dir)) continue;
      for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.json') && f !== 'index.json').sort()) {
        try { const t = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); list.push({ key: 'tpl:' + (t.id || f.replace(/\.json$/, '')), id: t.id, name: t.name, aspect: t.aspect, pack: t.pack, group, needs: t.needs || [] }); } catch {}
      }
    }
    return list;
  };
  const srcOf = key => key === 'project' ? { kind: 'project', dir: ctx.project.dir }
    : key.startsWith('file:') ? { kind: 'template', file: path.join(EX, path.basename(key.slice(5))) } : { kind: 'template', id: key.slice(4) };
  const sheetInfo = f => { const s = parseSheet(f); return { file: f, name: path.basename(f), columns: s.columns, rows: s.rows }; };
  const status = dir => { try { return JSON.parse(fs.readFileSync(path.join(dir, 'status.json'), 'utf8')); } catch { return null; } };
  const withUrls = st => st && { ...st, rows: st.rows.map(r => ({ ...r, url: r.out && r.state === 'done' ? '/project/' + rel(r.out) : null, rdir: r.dir ? rel(r.dir) : null, rout: r.out ? rel(r.out) : null })) };
  const writeJob = (dir, b) => {
    const job = { source: srcOf(b.source), sheet: b.sheet, mapping: b.mapping || {}, brand: b.brand || null, voice: b.voice || 'auto', quality: b.quality || '1080',
      dur: +b.dur || null, rows: b.rows || null, name: b.name || null, out: dir, created: new Date().toISOString() };
    if (!job.sheet || !fs.existsSync(job.sheet)) throw new Error('chưa có bảng tính');
    fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'job.json'), JSON.stringify(job, null, 1));
    return path.join(dir, 'job.json');
  };
  const raw = req => new Promise((ok, bad) => { const c = []; req.on('data', d => c.push(d)); req.on('end', () => ok(Buffer.concat(c))); req.on('error', bad); });

  return async (req, res, p, u) => {
    if (!p.startsWith('/api/batch')) return false;
    if (!ctx.project) return ctx.json(res, { error: 'Chưa mở dự án' }, 400), true;
    const B = () => req.method === 'POST' ? ctx.body(req) : {};
    if (p === '/api/batch/sources') return ctx.json(res, { sources: sources(), project: path.basename(ctx.project.dir) }), true;
    if (p === '/api/batch/targets') {
      const b = await B(), src = loadSource(srcOf(b.source || 'project'));
      const targets = targetsOf(src.doc);
      return ctx.json(res, { targets, mapping: b.columns ? autoMap(targets, b.columns) : {}, needs: src.doc.needs || [], aspect: src.doc.aspect }), true;
    }
    if (p === '/api/batch/sheet' && req.method === 'POST') {
      const name = path.basename(u.searchParams.get('name') || 'bang.csv').replace(/[^\w.\-À-ỹ ]+/g, '_');
      if (!/\.(csv|xlsx|tsv|txt)$/i.test(name)) return ctx.json(res, { error: 'Chỉ nhận .csv hoặc .xlsx' }, 400), true;
      const dir = path.join(root(), '_sheets'); fs.mkdirSync(dir, { recursive: true });
      const f = path.join(dir, `${ctx.stamp()}_${name}`); fs.writeFileSync(f, await raw(req));
      try { return ctx.json(res, sheetInfo(f)), true; } catch (e) { return ctx.json(res, { error: 'Không đọc được bảng tính: ' + e.message }, 400), true; }
    }
    if (p === '/api/batch/example') {
      const f = path.join(EX, 'bds-can-ho-vi-du.csv');
      return ctx.json(res, { ...sheetInfo(f), source: 'file:bds-can-ho.template.json' }), true;
    }
    if (p === '/api/batch/preview' && req.method === 'POST') {
      const b = await B(), dir = path.join(root(), '_preview');
      try {
        const jf = writeJob(dir, b), out = path.join(dir, `still_${Date.now()}.jpg`);
        for (const f of fs.readdirSync(dir).filter(f => /^still_.*\.jpg$/.test(f))) fs.rmSync(path.join(dir, f), { force: true });
        execFile('node', [BATCH, '--job', jf, '--preview', String(b.row || 0), '--t', String(b.t ?? 2.5), '--out', out], { maxBuffer: 1 << 24, timeout: 180000 }, (e, so, se) => {
          if (e) return ctx.json(res, { error: ((se || '') + (so || '')).split('\n').filter(l => l && !l.startsWith('@@')).slice(-3).join(' ') || e.message }, 500);
          let r; try { r = JSON.parse(so.trim().split('\n').pop()); } catch { return ctx.json(res, { error: 'Bản xem trước không trả kết quả: ' + so.slice(-200) }, 500); }
          ctx.json(res, { img: '/project/' + rel(out), t: r.t, duration: r.duration });
        });
      } catch (e) { ctx.json(res, { error: e.message }, 400); }
      return true;
    }
    if (p === '/api/batch/start' && req.method === 'POST') {
      const b = await B();
      const dir = b.resume ? ctx.under(ctx.project.dir, b.resume) : path.join(root(), `${String(b.name || 'hang-loat').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'hang-loat'}_${ctx.stamp()}`);
      if (!dir) return ctx.json(res, { error: 'thư mục không hợp lệ' }, 400), true;
      let jf;
      try { jf = b.resume ? path.join(dir, 'job.json') : writeJob(dir, b); } catch (e) { return ctx.json(res, { error: e.message }, 400), true; }
      if (!fs.existsSync(jf)) return ctx.json(res, { error: 'không thấy job.json' }, 404), true;
      const ok = ctx.startJob('batch', async () => {
        ctx.job.out = rel(dir); ctx.job.batch = rel(dir);
        await ctx.run('node', [BATCH, '--job', jf], l => {
          if (!l.startsWith('@@ ')) return;
          try { const m = JSON.parse(l.slice(3)); if (m.progress != null) ctx.job.progress = m.progress; if (m.step) ctx.job.step = m.step; } catch {}
        }).catch(e => { const st = status(dir); if (st?.rows.some(r => r.state === 'cancelled')) throw new Error('Đã dừng — bấm “Chạy tiếp” để làm nốt'); if (!st || !st.rows.some(r => r.state === 'done')) throw e; });
        const st = status(dir), bad = st ? st.rows.filter(r => r.state !== 'done').length : 0;
        ctx.job.step = bad ? `Xong, ${bad} dòng lỗi` : `Xong ${st?.total || 0} video`;
      });
      return ctx.json(res, ok ? { ok: true, dir: rel(dir) } : { error: 'Đang có tác vụ khác chạy' }, ok ? 200 : 409), true;
    }
    if (p === '/api/batch/status') {
      const d = ctx.under(ctx.project.dir, u.searchParams.get('dir') || '');
      return ctx.json(res, withUrls(d && status(d))), true;
    }
    if (p === '/api/batch/list') {
      const r = root(); if (!fs.existsSync(r)) return ctx.json(res, []), true;
      return ctx.json(res, fs.readdirSync(r).filter(f => !f.startsWith('_') && fs.existsSync(path.join(r, f, 'job.json'))).sort().reverse().map(f => {
        const st = status(path.join(r, f));
        return { dir: rel(path.join(r, f)), name: f, total: st?.total || 0, done: st ? st.rows.filter(x => x.state === 'done').length : 0, updated: st?.updated };
      })), true;
    }
    return false;
  };
};

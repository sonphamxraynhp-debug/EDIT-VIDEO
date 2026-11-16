// Brand kit nhiều thương hiệu: ~/.ai-video-studio/brands.json + logo trong ~/.ai-video-studio/brands/<id>/ (AVS_HOME đổi được thư mục).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { AVS_HOME, brandFields } from '../../scripts/batch.mjs';

const FILE = path.join(AVS_HOME, 'brands.json'), DIR = path.join(AVS_HOME, 'brands');
const KEYS = ['title', 'name', 'primary', 'accent', 'dark', 'light', 'font', 'disp', 'logo', 'handle', 'phone', 'website', 'pack', 'outro'];
const load = () => { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')).brands || []; } catch { return []; } };
const store = list => { fs.mkdirSync(AVS_HOME, { recursive: true }); fs.writeFileSync(FILE, JSON.stringify({ version: 1, brands: list }, null, 1)); };
const newId = name => (String(name || 'brand').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'brand') + '-' + crypto.randomBytes(2).toString('hex');
const pub = b => ({ ...b, logoUrl: b.logo && fs.existsSync(path.join(DIR, b.id, b.logo)) ? `/api/brands/logo/${b.id}?v=${Math.round(fs.statSync(path.join(DIR, b.id, b.logo)).mtimeMs)}` : null });

export default ctx => async (req, res, p, u) => {
  if (!p.startsWith('/api/brands')) return false;
  const J = (o, c) => (ctx.json(res, o, c), true);
  if (p === '/api/brands' && req.method === 'GET') return J(load().map(pub));
  if (p.startsWith('/api/brands/logo/') && req.method === 'GET') {
    const b = load().find(x => x.id === p.slice(17));
    return b?.logo ? (ctx.sendFile(req, res, path.join(DIR, b.id, b.logo)), true) : J({ error: 'không có logo' }, 404);
  }
  if (req.method !== 'POST') return false;
  if (p === '/api/brands/logo') {
    const list = load(), b = list.find(x => x.id === u.searchParams.get('id'));
    if (!b) return J({ error: 'không thấy brand' }, 404);
    const ext = (path.extname(u.searchParams.get('name') || '.png').toLowerCase().match(/^\.(png|jpe?g|webp|svg|gif)$/) || ['.png'])[0];
    const d = path.join(DIR, b.id); fs.mkdirSync(d, { recursive: true });
    for (const f of fs.readdirSync(d).filter(f => f.startsWith('logo.'))) fs.rmSync(path.join(d, f));
    await new Promise((ok, bad) => { const w = fs.createWriteStream(path.join(d, 'logo' + ext)); req.pipe(w); w.on('finish', ok); w.on('error', bad); });
    b.logo = 'logo' + ext; b.updated = new Date().toISOString(); store(list);
    return J(pub(b));
  }
  const body = await ctx.body(req);
  if (p === '/api/brands/save') {
    const list = load(), src = body.brand || {};
    let b = src.id && list.find(x => x.id === src.id);
    if (!b) { b = { id: newId(src.title || src.name), created: new Date().toISOString() }; list.push(b); }
    for (const k of KEYS) if (k in src && k !== 'logo') { if (src[k] === '' || src[k] == null) delete b[k]; else b[k] = String(src[k]).slice(0, 300); }
    if (!b.title) b.title = b.name || 'Thương hiệu';
    b.updated = new Date().toISOString(); store(list);
    return J(pub(b));
  }
  if (p === '/api/brands/delete') {
    const list = load(), i = list.findIndex(x => x.id === body.id);
    if (i < 0) return J({ error: 'không thấy brand' }, 404);
    list.splice(i, 1); store(list); fs.rmSync(path.join(DIR, body.id), { recursive: true, force: true });
    return J({ ok: true });
  }
  if (p === '/api/brands/duplicate') {
    const list = load(), b = list.find(x => x.id === body.id);
    if (!b) return J({ error: 'không thấy brand' }, 404);
    const c = { ...b, id: newId(b.title || b.name), title: (b.title || b.name) + ' (bản sao)', created: new Date().toISOString(), updated: new Date().toISOString() };
    if (b.logo && fs.existsSync(path.join(DIR, b.id, b.logo))) { fs.mkdirSync(path.join(DIR, c.id), { recursive: true }); fs.copyFileSync(path.join(DIR, b.id, b.logo), path.join(DIR, c.id, b.logo)); }
    list.push(c); store(list);
    return J(pub(c));
  }
  if (p === '/api/brands/apply') {
    // TL.brand fields for the open project; the logo is copied to <project>/media/brand_<id>.<ext>. The client sets TL.brand (undoable).
    if (!ctx.project) return J({ error: 'Chưa mở dự án' }, 400);
    const b = load().find(x => x.id === body.id);
    if (!b) return J({ error: 'không thấy brand' }, 404);
    return J({ brand: { ...brandFields(b, ctx.project.dir), kit: b.id }, pack: b.pack || null, title: b.title });
  }
  return false;
};

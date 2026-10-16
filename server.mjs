import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listBrands, createBrand, validSlug, LIB } from './brands.mjs';
import { listPosts, getPost, createPost, updatePost, deletePost, claimDue, recoverStuck, listMetrics } from './db.mjs';
import { refreshBrand, refreshAll } from './stats.mjs';
import { publishPost, dryRun } from './publish.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4310);
const MEDIA = /\.(jpe?g|png|mp4|mov)$/i;
const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(DIR, 'public')));

const safeName = (n) => path.basename(String(n || '')).replace(/[^\w.\- ]/g, '_');
const brandOf = (req) => {
  const b = req.query.brand || req.body?.brand;
  if (!validSlug(b)) throw Object.assign(new Error('brand required'), { status: 400 });
  return b;
};
const wrap = (fn) => async (req, res) => {
  try { res.json(await fn(req, res)); } catch (e) { res.status(e.status || 400).json({ error: e.message }); }
};

app.get('/api/status', wrap(() => ({ dryRun: dryRun() })));
app.get('/api/brands', wrap(() => listBrands()));
app.post('/api/brands', wrap((req) => { createBrand(req.body.slug, req.body.name || req.body.slug); return listBrands(); }));

app.get('/api/library', wrap((req) => {
  const dir = path.join(LIB, brandOf(req));
  fs.mkdirSync(dir, { recursive: true });
  return fs.readdirSync(dir).filter((f) => MEDIA.test(f))
    .map((f) => ({ name: f, size: fs.statSync(path.join(dir, f)).size, mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
}));
app.post('/api/library', express.raw({ type: '*/*', limit: '1gb' }), wrap((req) => {
  const name = safeName(req.query.name);
  if (!MEDIA.test(name)) throw new Error('Only jpg, png, mp4, mov');
  const dir = path.join(LIB, brandOf(req));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), req.body);
  return { name };
}));
app.get('/files/:brand/:name', (req, res) => {
  if (!validSlug(req.params.brand)) return res.status(400).end();
  res.sendFile(path.join(LIB, req.params.brand, safeName(req.params.name)));
});

app.get('/api/posts', wrap((req) => listPosts(brandOf(req))));
app.post('/api/posts', wrap((req) => {
  const { caption, media, targets, scheduled_at } = req.body;
  if (!Array.isArray(media)) throw new Error('Pick at least one file');
  // Threads is the only network that takes text-only posts.
  const textOnly = targets && Object.keys(targets).every((k) => !targets[k] || ['threads', 'ai', 'title'].includes(k));
  if (!media.length && !textOnly) throw new Error('Pick at least one file');
  return createPost({ brand: brandOf(req), caption, media: media.map(safeName), targets, scheduled_at: scheduled_at || null });
}));
app.patch('/api/posts/:id', wrap((req) => {
  const p = getPost(Number(req.params.id));
  if (!p) throw new Error('Not found');
  if (['publishing', 'done'].includes(p.status)) throw new Error('Already published');
  const allowed = {};
  for (const k of ['caption', 'media', 'targets', 'scheduled_at']) if (k in req.body) allowed[k] = req.body[k];
  return updatePost(p.id, allowed);
}));
app.delete('/api/posts/:id', wrap((req) => { deletePost(Number(req.params.id)); return { ok: true }; }));
app.post('/api/posts/:id/publish-now', wrap((req) => {
  const p = getPost(Number(req.params.id));
  if (!p || ['publishing', 'done'].includes(p.status)) throw new Error('Cannot publish this post');
  return updatePost(p.id, { scheduled_at: new Date().toISOString() });
}));

app.get('/api/stats', wrap((req) => listMetrics(brandOf(req))));
let lastRefresh = {};
app.post('/api/stats/refresh', wrap(async (req) => { const b = brandOf(req); lastRefresh[b] = await refreshBrand(b); return lastRefresh[b]; }));
app.get('/api/stats/status', wrap((req) => lastRefresh[brandOf(req)] || {}));

// Metrics refresh: shortly after start, then every 3 hours.
setTimeout(() => refreshAll().catch(() => {}), 15_000);
setInterval(() => refreshAll().catch(() => {}), 3 * 60 * 60 * 1000);

// Scheduler: every 30 s, publish posts whose time has come.
let busy = false;
async function tick() {
  if (busy) return;
  busy = true;
  try {
    for (const post of claimDue(new Date().toISOString())) {
      const { status, results } = await publishPost(post);
      updatePost(post.id, { status, results });
    }
  } catch (e) {
    console.error('scheduler:', e.message);
  } finally {
    busy = false;
  }
}

recoverStuck();
setInterval(tick, 30_000);
app.listen(PORT, '127.0.0.1', () => {
  console.log(`SocialHub → http://127.0.0.1:${PORT}  (${dryRun() ? 'DRY RUN: nothing will be posted' : 'LIVE'})`);
  tick();
});

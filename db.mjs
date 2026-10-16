import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
fs.mkdirSync(path.join(DIR, 'data'), { recursive: true });
const db = new DatabaseSync(path.join(DIR, 'data', 'social.db'));

db.exec(`
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  brand TEXT NOT NULL,
  caption TEXT NOT NULL DEFAULT '',
  media TEXT NOT NULL DEFAULT '[]',      -- JSON array of file names inside library/<brand>/
  targets TEXT NOT NULL DEFAULT '{}',    -- JSON {instagram, facebook, tiktok, youtube: bool, ai: bool, title?: string}
  scheduled_at TEXT,                     -- ISO 8601 UTC; null = draft
  status TEXT NOT NULL DEFAULT 'draft',  -- draft | scheduled | publishing | done | partial | failed
  results TEXT NOT NULL DEFAULT '{}',    -- JSON per network: {ok, id?, url?, error?, dryRun?}
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

const parse = (row) => row && {
  ...row,
  media: JSON.parse(row.media),
  targets: JSON.parse(row.targets),
  results: JSON.parse(row.results),
};

export const listPosts = (brand) => db.prepare('SELECT * FROM posts WHERE brand = ? ORDER BY COALESCE(scheduled_at, created_at) DESC').all(brand).map(parse);
export const getPost = (id) => parse(db.prepare('SELECT * FROM posts WHERE id = ?').get(id));

export function createPost({ brand, caption = '', media = [], targets = {}, scheduled_at = null }) {
  const status = scheduled_at ? 'scheduled' : 'draft';
  const r = db.prepare('INSERT INTO posts (brand, caption, media, targets, scheduled_at, status) VALUES (?, ?, ?, ?, ?, ?)')
    .run(brand, caption, JSON.stringify(media), JSON.stringify(targets), scheduled_at, status);
  return getPost(Number(r.lastInsertRowid));
}

export function updatePost(id, fields) {
  const cur = getPost(id);
  if (!cur) return null;
  const next = { ...cur, ...fields };
  if ('scheduled_at' in fields && !['publishing', 'done'].includes(cur.status)) {
    next.status = fields.scheduled_at ? 'scheduled' : 'draft';
  }
  db.prepare(`UPDATE posts SET caption=?, media=?, targets=?, scheduled_at=?, status=?, results=?, updated_at=datetime('now') WHERE id=?`)
    .run(next.caption, JSON.stringify(next.media), JSON.stringify(next.targets), next.scheduled_at, next.status,
      JSON.stringify(next.results), id);
  return getPost(id);
}

export const deletePost = (id) => db.prepare('DELETE FROM posts WHERE id = ?').run(id);

// Atomically claim due posts so a post is never published twice.
export function claimDue(nowIso) {
  const due = db.prepare(`SELECT id FROM posts WHERE status = 'scheduled' AND scheduled_at <= ?`).all(nowIso);
  const claimed = [];
  for (const { id } of due) {
    const r = db.prepare(`UPDATE posts SET status='publishing', updated_at=datetime('now') WHERE id=? AND status='scheduled'`).run(id);
    if (r.changes) claimed.push(getPost(id));
  }
  return claimed;
}

// A crash mid-publish leaves posts stuck in 'publishing'; surface them instead of retrying blindly
// (retrying could double-post).
export function recoverStuck() {
  db.prepare(`UPDATE posts SET status='failed', results=json_set(results, '$.system', json('{"ok":false,"error":"Publishing was interrupted (app closed). Check the accounts before retrying."}')) WHERE status='publishing'`).run();
}

// Latest metrics per published item (from any source: SocialHub or posted by hand).
db.exec(`
CREATE TABLE IF NOT EXISTS metrics (
  brand TEXT NOT NULL,
  network TEXT NOT NULL,
  media_id TEXT NOT NULL,
  caption TEXT,
  url TEXT,
  thumb TEXT,
  kind TEXT,
  published_at TEXT,
  data TEXT NOT NULL DEFAULT '{}',   -- JSON {views, likes, comments, shares, saves, reach}
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (brand, network, media_id)
);
`);

export function upsertMetric(m) {
  db.prepare(`INSERT INTO metrics (brand, network, media_id, caption, url, thumb, kind, published_at, data, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(brand, network, media_id) DO UPDATE SET caption=excluded.caption, url=excluded.url, thumb=excluded.thumb,
      kind=excluded.kind, published_at=excluded.published_at, data=excluded.data, updated_at=excluded.updated_at`)
    .run(m.brand, m.network, m.media_id, m.caption || '', m.url || '', m.thumb || '', m.kind || '', m.published_at || '', JSON.stringify(m.data || {}));
}

export const listMetrics = (brand) => db.prepare('SELECT * FROM metrics WHERE brand = ? ORDER BY published_at DESC').all(brand)
  .map((r) => ({ ...r, data: JSON.parse(r.data) }));

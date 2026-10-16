// Pulls recent posts and their public metrics from each connected network into the metrics table.
// Each network fails independently: a missing permission only hides that network's numbers.
import { loadBrand, networks, listBrands } from './brands.mjs';
import { upsertMetric } from './db.mjs';
import { tiktokAccessToken } from './tiktok-auth.mjs';

const G = () => `https://graph.facebook.com/${process.env.GRAPH_VERSION || 'v26.0'}`;
const num = (v) => (typeof v === 'number' ? v : undefined);

async function graph(cfg, path, params) {
  const r = await fetch(`${G()}${path}?${new URLSearchParams({ ...params, access_token: cfg.META_PAGE_TOKEN })}`);
  const j = await r.json();
  if (j.error) throw new Error(j.error.message);
  return j;
}

async function instagram(cfg) {
  const { data = [] } = await graph(cfg, `/${cfg.IG_USER_ID}/media`, {
    fields: 'id,caption,media_product_type,media_type,permalink,thumbnail_url,media_url,timestamp,like_count,comments_count',
    limit: '30',
  });
  let insightsError = null;
  for (const m of data) {
    const d = { likes: num(m.like_count), comments: num(m.comments_count) };
    try {
      const ins = await graph(cfg, `/${m.id}/insights`, { metric: 'views,reach,saved,shares' });
      for (const x of ins.data || []) d[{ views: 'views', reach: 'reach', saved: 'saves', shares: 'shares' }[x.name]] = x.values?.[0]?.value;
    } catch (e) { insightsError = e.message; }
    upsertMetric({ brand: cfg.slug, network: 'instagram', media_id: m.id, caption: m.caption, url: m.permalink,
      thumb: m.thumbnail_url || m.media_url, kind: m.media_product_type, published_at: m.timestamp, data: d });
  }
  return { count: data.length, warning: insightsError && `Views/reach unavailable: ${insightsError}` };
}

async function facebook(cfg) {
  // Reading the likes/comments edges needs pages_read_user_content; post insights (read_insights)
  // give reactions and views without it. Comment counts stay empty until that permission is added.
  const { data = [] } = await graph(cfg, `/${cfg.META_PAGE_ID}/published_posts`, {
    fields: 'id,message,created_time,permalink_url,full_picture,shares',
    limit: '30',
  });
  for (const p of data) {
    const d = { shares: p.shares?.count || 0 };
    try {
      const ins = await graph(cfg, `/${p.id}/insights`, { metric: 'post_reactions_by_type_total,post_media_view,post_total_media_view_unique' });
      for (const x of ins.data || []) {
        const v = x.values?.[0]?.value;
        if (x.name === 'post_reactions_by_type_total') d.likes = Object.values(v || {}).reduce((a, b) => a + b, 0);
        if (x.name === 'post_media_view') d.views = v;
        if (x.name === 'post_total_media_view_unique') d.reach = v;
      }
    } catch { /* insights can lag for brand-new posts */ }
    upsertMetric({ brand: cfg.slug, network: 'facebook', media_id: p.id, caption: p.message, url: p.permalink_url,
      thumb: p.full_picture, kind: 'POST', published_at: p.created_time, data: d });
  }
  return { count: data.length };
}

async function tiktok(cfg) {
  const token = await tiktokAccessToken(cfg);
  const r = await fetch('https://open.tiktokapis.com/v2/video/list/?fields=id,title,video_description,create_time,cover_image_url,share_url,view_count,like_count,comment_count,share_count', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ max_count: 20 }),
  });
  const j = await r.json();
  if (j.error && j.error.code !== 'ok') throw new Error(j.error.message || j.error.code);
  const videos = j.data?.videos || [];
  for (const v of videos) {
    upsertMetric({ brand: cfg.slug, network: 'tiktok', media_id: v.id, caption: v.video_description || v.title, url: v.share_url,
      thumb: v.cover_image_url, kind: 'VIDEO', published_at: new Date(v.create_time * 1000).toISOString(),
      data: { views: v.view_count, likes: v.like_count, comments: v.comment_count, shares: v.share_count } });
  }
  return { count: videos.length };
}

const FETCH = { instagram, facebook, tiktok };

export async function refreshBrand(slug) {
  const cfg = loadBrand(slug);
  const ready = networks(cfg);
  const out = {};
  for (const [net, fn] of Object.entries(FETCH)) {
    if (!ready[net]) continue;
    try { out[net] = { ok: true, ...(await fn(cfg)) }; } catch (e) { out[net] = { ok: false, error: e.message }; }
  }
  return out;
}

export async function refreshAll() {
  for (const b of listBrands()) await refreshBrand(b.slug).catch(() => {});
}

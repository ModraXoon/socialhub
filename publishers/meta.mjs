// Instagram (professional account) and Facebook Page publishing via the Meta Graph API.
// Docs: Instagram Content Publishing API, Pages API (photos/videos/feed).
import { isVideo } from '../media.mjs';

const G = () => `https://graph.facebook.com/${process.env.GRAPH_VERSION || 'v26.0'}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(cfg, method, path, params = {}) {
  const body = new URLSearchParams({ ...params, access_token: cfg.META_PAGE_TOKEN });
  const url = method === 'GET' ? `${G()}${path}?${body}` : `${G()}${path}`;
  const res = await fetch(url, method === 'GET' ? {} : { method, body });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) throw new Error(json.error?.message || `Graph ${res.status}`);
  return json;
}

async function waitReady(cfg, containerId) {
  // Video containers are processed asynchronously; publishing too early fails.
  for (let i = 0; i < 60; i++) {
    const { status_code } = await call(cfg, 'GET', `/${containerId}`, { fields: 'status_code' });
    if (status_code === 'FINISHED') return;
    if (status_code === 'ERROR' || status_code === 'EXPIRED') throw new Error(`Instagram processing ${status_code}`);
    await sleep(5000);
  }
  throw new Error('Instagram video processing timed out');
}

/** staged: [{file, url}] in display order. Videos always publish as Reels (Instagram no longer has feed videos). */
export async function publishInstagram(cfg, { caption, staged }) {
  const ig = cfg.IG_USER_ID;
  let creationId;
  if (staged.length === 1) {
    const s = staged[0];
    const params = isVideo(s.file)
      ? { media_type: 'REELS', video_url: s.url, caption, share_to_feed: 'true' }
      : { image_url: s.url, caption };
    creationId = (await call(cfg, 'POST', `/${ig}/media`, params)).id;
    if (isVideo(s.file)) await waitReady(cfg, creationId);
  } else {
    if (staged.length > 10) throw new Error('Instagram carousels allow at most 10 items');
    const children = [];
    for (const s of staged) {
      const p = isVideo(s.file)
        ? { media_type: 'VIDEO', video_url: s.url, is_carousel_item: 'true' }
        : { image_url: s.url, is_carousel_item: 'true' };
      const id = (await call(cfg, 'POST', `/${ig}/media`, p)).id;
      if (isVideo(s.file)) await waitReady(cfg, id);
      children.push(id);
    }
    creationId = (await call(cfg, 'POST', `/${ig}/media`, { media_type: 'CAROUSEL', children: children.join(','), caption })).id;
    await waitReady(cfg, creationId).catch(() => {}); // carousels usually finish instantly
  }
  const { id } = await call(cfg, 'POST', `/${ig}/media_publish`, { creation_id: creationId });
  const { permalink } = await call(cfg, 'GET', `/${id}`, { fields: 'permalink' }).catch(() => ({}));
  return { id, url: permalink };
}

export async function publishFacebook(cfg, { caption, staged }) {
  const page = cfg.META_PAGE_ID;
  const videos = staged.filter((s) => isVideo(s.file));
  if (videos.length) {
    if (staged.length > 1) throw new Error('Facebook: post one video at a time');
    const { id } = await call(cfg, 'POST', `/${page}/videos`, { file_url: videos[0].url, description: caption });
    return { id, url: `https://www.facebook.com/${id}` };
  }
  if (staged.length === 1) {
    const r = await call(cfg, 'POST', `/${page}/photos`, { url: staged[0].url, caption });
    return { id: r.post_id || r.id, url: `https://www.facebook.com/${r.post_id || r.id}` };
  }
  const ids = [];
  for (const s of staged) ids.push((await call(cfg, 'POST', `/${page}/photos`, { url: s.url, published: 'false' })).id);
  const params = { message: caption };
  ids.forEach((id, i) => { params[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id }); });
  const { id } = await call(cfg, 'POST', `/${page}/feed`, params);
  return { id, url: `https://www.facebook.com/${id}` };
}

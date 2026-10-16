// Threads publishing via the Threads API (graph.threads.net).
// Docs: https://developers.facebook.com/docs/threads/posts
import { isVideo } from '../media.mjs';
import { setBrandKey } from '../brands.mjs';

const G = 'https://graph.threads.net/v1.0';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LIMIT = 500; // Threads text limit (characters)

async function call(token, method, path, params = {}) {
  const body = new URLSearchParams({ ...params, access_token: token });
  const url = method === 'GET' ? `${G}${path}?${body}` : `${G}${path}`;
  const res = await fetch(url, method === 'GET' ? {} : { method, body });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) throw new Error(json.error?.message || `Threads ${res.status}`);
  return json;
}

/** Long-lived tokens last 60 days; refresh once they are older than 30 so scheduled posts never hit an expired one. */
async function token(cfg) {
  const age = Date.now() - Number(cfg.THREADS_TOKEN_AT || 0);
  if (age < 30 * 864e5) return cfg.THREADS_TOKEN;
  try {
    const r = await call(cfg.THREADS_TOKEN, 'GET', '/refresh_access_token', { grant_type: 'th_refresh_token' });
    setBrandKey(cfg.slug, 'THREADS_TOKEN', r.access_token);
    setBrandKey(cfg.slug, 'THREADS_TOKEN_AT', String(Date.now()));
    return r.access_token;
  } catch {
    return cfg.THREADS_TOKEN; // still valid until day 60; the publish call reports a real expiry
  }
}

/**
 * Threads shows one topic tag per post and allows clickable links, so the
 * Instagram-style caption is adapted: hashtag-only lines go, "link profilde"
 * becomes the real download link, and the text is kept under the limit.
 */
export function threadsText(caption, link, brandName = '') {
  let t = (caption || '').split('\n').filter((l) => !/^\s*(#\S+\s*)+$/.test(l)).join('\n');
  if (link) t = t.replace(/link profilde|link bio'da/gi, `indir: ${link}`).replace(/link in bio/gi, `get it: ${link}`);
  t = t.replace(/\n{3,}/g, '\n\n').trim();
  // Plain conversation posts stay link-free; anything about the app gets the link.
  const aboutApp = t.includes('📲') || (brandName && t.toLowerCase().includes(brandName.toLowerCase()));
  if (link && !t.includes(link) && aboutApp) t += `\n\n👉 ${link}`;
  return t.length > LIMIT ? `${t.slice(0, LIMIT - 1)}…` : t;
}

async function waitReady(tok, id) {
  for (let i = 0; i < 60; i++) {
    const { status, error_message } = await call(tok, 'GET', `/${id}`, { fields: 'status,error_message' });
    if (status === 'FINISHED') return;
    if (status === 'ERROR' || status === 'EXPIRED') throw new Error(`Threads processing ${status}${error_message ? `: ${error_message}` : ''}`);
    await sleep(5000);
  }
  throw new Error('Threads media processing timed out');
}

/** staged: [{file, url}] in display order. No media → text post. */
export async function publishThreads(cfg, { caption, staged }) {
  const tok = await token(cfg);
  const uid = cfg.THREADS_USER_ID || 'me';
  const text = threadsText(caption, cfg.THREADS_LINK, cfg.NAME);
  const item = (s, extra = {}) => (isVideo(s.file)
    ? { media_type: 'VIDEO', video_url: s.url, ...extra }
    : { media_type: 'IMAGE', image_url: s.url, ...extra });

  let creationId;
  if (!staged.length) {
    creationId = (await call(tok, 'POST', `/${uid}/threads`, { media_type: 'TEXT', text })).id;
  } else if (staged.length === 1) {
    creationId = (await call(tok, 'POST', `/${uid}/threads`, item(staged[0], { text }))).id;
    await waitReady(tok, creationId);
  } else {
    if (staged.length > 20) throw new Error('Threads carousels allow at most 20 items');
    const children = [];
    for (const s of staged) {
      const id = (await call(tok, 'POST', `/${uid}/threads`, item(s, { is_carousel_item: 'true' }))).id;
      await waitReady(tok, id);
      children.push(id);
    }
    creationId = (await call(tok, 'POST', `/${uid}/threads`, { media_type: 'CAROUSEL', children: children.join(','), text })).id;
    await waitReady(tok, creationId);
  }
  const { id } = await call(tok, 'POST', `/${uid}/threads_publish`, { creation_id: creationId });
  const { permalink } = await call(tok, 'GET', `/${id}`, { fields: 'permalink' }).catch(() => ({}));
  return { id, url: permalink };
}

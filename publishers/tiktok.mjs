// TikTok Content Posting API, "upload to inbox" flow: the video lands in the creator's TikTok
// inbox as a draft and they finish posting in the app. Unaudited apps cannot post publicly
// (direct post is limited to private visibility until TikTok approves the app).
// FILE_UPLOAD sends bytes directly, so no public URL / domain verification is needed.
import fs from 'node:fs';
import { isVideo } from '../media.mjs';
import { tiktokAccessToken } from '../tiktok-auth.mjs';

const API = 'https://open.tiktokapis.com/v2';
const MB = 1024 * 1024;

async function api(cfg, path, body) {
  const token = await tiktokAccessToken(cfg);
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || (json.error && json.error.code !== 'ok')) throw new Error(json.error?.message || `TikTok ${res.status}`);
  return json.data;
}

export async function publishTikTok(cfg, { files }) {
  const videos = files.filter(isVideo);
  if (videos.length !== 1 || files.length !== 1) throw new Error('TikTok: attach exactly one video');
  const buf = fs.readFileSync(videos[0]);
  const size = buf.length;
  // Chunks must be 5-64 MB; a file under 64 MB goes up as one chunk.
  const chunk = size <= 64 * MB ? size : 10 * MB;
  const count = size <= 64 * MB ? 1 : Math.floor(size / chunk);
  const { publish_id, upload_url } = await api(cfg, '/post/publish/inbox/video/init/', {
    source_info: { source: 'FILE_UPLOAD', video_size: size, chunk_size: chunk, total_chunk_count: count },
  });
  for (let i = 0; i < count; i++) {
    const start = i * chunk;
    const end = i === count - 1 ? size : start + chunk; // last chunk takes the remainder
    const res = await fetch(upload_url, {
      method: 'PUT',
      headers: { 'Content-Type': 'video/mp4', 'Content-Range': `bytes ${start}-${end - 1}/${size}`, 'Content-Length': String(end - start) },
      body: buf.subarray(start, end),
    });
    if (!res.ok) throw new Error(`TikTok upload chunk ${i + 1}/${count} failed (${res.status})`);
  }
  return { id: publish_id, note: 'Sent to your TikTok inbox as a draft: open TikTok to post it.' };
}

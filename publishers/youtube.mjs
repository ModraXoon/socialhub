// YouTube Data API v3 upload (resumable). Vertical videos up to 3 minutes are treated as Shorts by
// YouTube automatically; we also add #Shorts to the description to help classification.
// Note: videos uploaded from an unverified Google Cloud project are locked to private until the
// project passes YouTube's API audit.
import fs from 'node:fs';
import { isVideo } from '../media.mjs';

async function accessToken(cfg) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: new URLSearchParams({
      client_id: cfg.YOUTUBE_CLIENT_ID,
      client_secret: cfg.YOUTUBE_CLIENT_SECRET,
      refresh_token: cfg.YOUTUBE_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  const json = await res.json();
  if (!json.access_token) throw new Error(`YouTube auth: ${json.error_description || json.error || res.status}`);
  return json.access_token;
}

const hashtags = (text) => [...new Set((text.match(/#[\p{L}\p{N}_]+/gu) || []).map((t) => t.slice(1)))].slice(0, 15);

export async function publishYouTube(cfg, { files, caption, title, ai }) {
  if (files.length !== 1 || !isVideo(files[0])) throw new Error('YouTube: attach exactly one video');
  const token = await accessToken(cfg);
  const firstLine = caption.split('\n').find((l) => l.trim()) || cfg.NAME;
  const meta = {
    snippet: {
      title: (title || firstLine).replace(/[<>]/g, '').slice(0, 100),
      description: /#shorts/i.test(caption) ? caption : `${caption}\n\n#Shorts`,
      tags: hashtags(caption),
      categoryId: '26', // Howto & Style
    },
    status: { privacyStatus: 'public', selfDeclaredMadeForKids: false, containsSyntheticMedia: Boolean(ai) },
  };
  const buf = fs.readFileSync(files[0]);
  const init = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Length': String(buf.length),
      'X-Upload-Content-Type': 'video/*',
    },
    body: JSON.stringify(meta),
  });
  if (!init.ok) throw new Error(`YouTube init: ${(await init.json().catch(() => ({}))).error?.message || init.status}`);
  const upload = await fetch(init.headers.get('location'), { method: 'PUT', headers: { 'Content-Type': 'video/*' }, body: buf });
  const json = await upload.json().catch(() => ({}));
  if (!upload.ok || !json.id) throw new Error(`YouTube upload: ${json.error?.message || upload.status}`);
  return { id: json.id, url: `https://youtube.com/shorts/${json.id}`, privacy: json.status?.privacyStatus };
}

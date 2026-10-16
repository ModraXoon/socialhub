// Meta fetches media by public URL. We upload to a private Supabase bucket, hand Meta a short-lived
// signed URL, and delete the file once publishing finishes.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.mp4': 'video/mp4', '.mov': 'video/quicktime' };
export const isVideo = (f) => ['.mp4', '.mov'].includes(path.extname(f).toLowerCase());
export const mimeOf = (f) => MIME[path.extname(f).toLowerCase()] || 'application/octet-stream';

let client;
function sb() {
  if (!client) {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Supabase is not configured (.env)');
    client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  }
  return client;
}

const bucket = () => process.env.MEDIA_BUCKET || 'social-temp';

async function ensureBucket() {
  const { data } = await sb().storage.getBucket(bucket());
  if (!data) {
    const { error } = await sb().storage.createBucket(bucket(), { public: false });
    if (error && !/already exists/i.test(error.message)) throw error;
  }
}

/** Upload local files, return [{file, url, key}] with signed URLs valid for `ttl` seconds. */
export async function stage(files, ttl = 3600) {
  await ensureBucket();
  const out = [];
  for (const file of files) {
    const key = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${path.extname(file).toLowerCase()}`;
    const { error } = await sb().storage.from(bucket()).upload(key, fs.readFileSync(file), { contentType: mimeOf(file) });
    if (error) throw error;
    const { data, error: e2 } = await sb().storage.from(bucket()).createSignedUrl(key, ttl);
    if (e2) throw e2;
    out.push({ file, key, url: data.signedUrl });
  }
  return out;
}

export async function unstage(staged) {
  if (!staged?.length) return;
  await sb().storage.from(bucket()).remove(staged.map((s) => s.key)).catch(() => {});
}

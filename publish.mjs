// Publishes one post to every selected network for its brand and records per-network results.
import path from 'node:path';
import { loadBrand, networks, LIB } from './brands.mjs';
import { stage, unstage } from './media.mjs';
import { publishInstagram, publishFacebook } from './publishers/meta.mjs';
import { publishTikTok } from './publishers/tiktok.mjs';
import { publishYouTube } from './publishers/youtube.mjs';
import { publishThreads } from './publishers/threads.mjs';

const NETS = ['instagram', 'facebook', 'threads', 'tiktok', 'youtube'];
export const dryRun = () => process.env.DRY_RUN !== '0';

export async function publishPost(post, log = console.log) {
  const cfg = loadBrand(post.brand);
  const ready = networks(cfg);
  const files = post.media.map((f) => path.join(LIB, post.brand, f));
  const chosen = NETS.filter((n) => post.targets[n]);
  const results = {};
  let staged = [];
  try {
    const pending = chosen.filter((n) => !(post.results?.[n]?.ok && !post.results[n].dryRun));
    const needsUrl = !dryRun() && pending.some((n) => ['instagram', 'facebook', 'threads'].includes(n) && ready[n]);
    if (needsUrl) staged = await stage(files);
    const args = { caption: post.caption, files, staged, title: post.targets.title, ai: post.targets.ai };
    for (const net of chosen) {
      // Retrying a partially failed post must not post again where it already went out.
      const prev = post.results?.[net];
      if (prev?.ok && !prev.dryRun) { results[net] = prev; continue; }
      if (!ready[net]) { results[net] = { ok: false, error: `${net} is not configured for ${cfg.NAME}` }; continue; }
      if (dryRun()) {
        results[net] = { ok: true, dryRun: true, note: `Dry run: would publish ${files.length} file(s)` };
        log(`[dry-run] ${cfg.NAME} → ${net}: ${post.media.join(', ')}`);
        continue;
      }
      try {
        const fn = { instagram: publishInstagram, facebook: publishFacebook, threads: publishThreads, tiktok: publishTikTok, youtube: publishYouTube }[net];
        results[net] = { ok: true, ...(await fn(cfg, args)) };
        log(`[ok] ${cfg.NAME} → ${net}`);
      } catch (e) {
        results[net] = { ok: false, error: e.message };
        log(`[fail] ${cfg.NAME} → ${net}: ${e.message}`);
      }
    }
  } catch (e) {
    for (const n of chosen) results[n] ??= { ok: false, error: e.message };
  } finally {
    await unstage(staged);
  }
  const oks = chosen.filter((n) => results[n]?.ok).length;
  const status = oks === chosen.length ? 'done' : oks ? 'partial' : 'failed';
  return { status, results };
}

// Brands are plain env files in brands/<slug>.env so each brand's accounts stay separate.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'brands');
export const LIB = path.join(path.dirname(fileURLToPath(import.meta.url)), 'library');
const SLUG = /^[a-z0-9][a-z0-9-]{0,40}$/;

export const validSlug = (s) => SLUG.test(s || '');

export function loadBrand(slug) {
  if (!validSlug(slug)) throw new Error('Invalid brand');
  const file = path.join(DIR, `${slug}.env`);
  if (!fs.existsSync(file)) throw new Error(`Brand not found: ${slug}`);
  const cfg = dotenv.parse(fs.readFileSync(file));
  return { slug, ...cfg, NAME: cfg.NAME || slug };
}

export function networks(cfg) {
  return {
    instagram: Boolean(cfg.META_PAGE_TOKEN && cfg.IG_USER_ID),
    facebook: Boolean(cfg.META_PAGE_TOKEN && cfg.META_PAGE_ID),
    threads: Boolean(cfg.THREADS_TOKEN),
    tiktok: Boolean(cfg.TIKTOK_CLIENT_KEY && cfg.TIKTOK_CLIENT_SECRET && cfg.TIKTOK_REFRESH_TOKEN),
    youtube: Boolean(cfg.YOUTUBE_CLIENT_ID && cfg.YOUTUBE_CLIENT_SECRET && cfg.YOUTUBE_REFRESH_TOKEN),
  };
}

export function listBrands() {
  if (!fs.existsSync(DIR)) return [];
  return fs.readdirSync(DIR)
    .filter((f) => f.endsWith('.env') && !f.startsWith('_'))
    .map((f) => {
      const cfg = loadBrand(f.replace(/\.env$/, ''));
      return { slug: cfg.slug, name: cfg.NAME, networks: networks(cfg) };
    });
}

export function createBrand(slug, name) {
  if (!validSlug(slug)) throw new Error('Slug: lowercase letters, numbers and dashes only');
  const file = path.join(DIR, `${slug}.env`);
  if (fs.existsSync(file)) throw new Error('Brand already exists');
  const tpl = fs.readFileSync(path.join(DIR, '_template.env'), 'utf8').replace(/^NAME=.*$/m, `NAME=${name.replace(/\n/g, ' ')}`);
  fs.writeFileSync(file, tpl, { mode: 0o600 });
  fs.mkdirSync(path.join(LIB, slug), { recursive: true });
}

/** Persist one key in a brand file (used by the YouTube OAuth helper). */
export function setBrandKey(slug, key, value) {
  const file = path.join(DIR, `${slug}.env`);
  let txt = fs.readFileSync(file, 'utf8');
  const line = `${key}=${value}`;
  txt = new RegExp(`^${key}=.*$`, 'm').test(txt) ? txt.replace(new RegExp(`^${key}=.*$`, 'm'), line) : `${txt.trimEnd()}\n${line}\n`;
  fs.writeFileSync(file, txt, { mode: 0o600 });
}

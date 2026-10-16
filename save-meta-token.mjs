// Reads a Meta system-user token from stdin (pbpaste | node save-meta-token.mjs mybrand),
// derives the Page token + Instagram id and stores them in brands/<slug>.env.
// The token itself is never printed.
import fs from 'node:fs';
import { setBrandKey } from './brands.mjs';

const slug = process.argv[2];
if (!slug) { console.log('Usage: pbpaste | node save-meta-token.mjs <brand> [page name]'); process.exit(1); }
const wantPage = process.argv[3]; // optional Page name when you manage several Pages
const tok = fs.readFileSync(0, 'utf8').trim();
if (!/^EA[A-Za-z0-9]{50,}$/.test(tok)) { console.log(`Panodaki metin bir Meta kodu gibi görünmüyor (uzunluk ${tok.length}).`); process.exit(1); }
const G = 'https://graph.facebook.com/v26.0';
const get = async (p, q) => { const j = await (await fetch(`${G}${p}?${new URLSearchParams(q)}`)).json(); if (j.error) throw new Error(j.error.message); return j; };
try {
  const pages = (await get('/me/accounts', { access_token: tok, fields: 'id,name,access_token,instagram_business_account{id,username}' })).data || [];
  if (!pages.length) { console.log('Sayfa bulunamadı.'); process.exit(1); }
  const page = wantPage ? pages.find((p) => p.name === wantPage) : pages[0];
  if (!page) { console.log('Sayfa bulunamadı. Mevcut sayfalar: ' + pages.map((p) => p.name).join(', ')); process.exit(1); }
  const ig = page.instagram_business_account;
  setBrandKey(slug, 'META_PAGE_ID', page.id);
  setBrandKey(slug, 'META_PAGE_TOKEN', page.access_token);
  setBrandKey(slug, 'IG_USER_ID', ig?.id || '');
  setBrandKey(slug, 'META_USER_TOKEN', '');
  const dbg = await get('/debug_token', { input_token: page.access_token, access_token: page.access_token }).catch(() => null);
  console.log(`Sayfa: ${page.name} | Instagram: @${ig?.username || 'yok'} | süre: ${dbg?.data?.expires_at === 0 ? 'süresiz' : dbg?.data?.expires_at} | izin sayısı: ${(dbg?.data?.scopes || []).length}`);
} catch (e) { console.log('HATA:', e.message); process.exit(1); }

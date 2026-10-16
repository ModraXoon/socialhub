// One-time TikTok sign-in for a brand. Opens TikTok's consent page, receives the code on
// http://127.0.0.1:3455/callback/ and stores the tokens in brands/<slug>.env.
//   npm run auth:tiktok -- mybrand
import http from 'node:http';
import crypto from 'node:crypto';
import { exec } from 'node:child_process';
import { loadBrand } from './brands.mjs';
import { pkce, exchangeCode, saveTokens, TIKTOK_REDIRECT, TIKTOK_SCOPES } from './tiktok-auth.mjs';

const slug = process.argv[2];
const cfg = loadBrand(slug);
if (!cfg.TIKTOK_CLIENT_KEY || !cfg.TIKTOK_CLIENT_SECRET) {
  console.error(`Fill TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET in brands/${slug}.env first.`);
  process.exit(1);
}
const { verifier, challenge } = pkce();
const state = crypto.randomBytes(16).toString('hex');
const url = 'https://www.tiktok.com/v2/auth/authorize/?' + new URLSearchParams({
  client_key: cfg.TIKTOK_CLIENT_KEY,
  response_type: 'code',
  scope: TIKTOK_SCOPES,
  redirect_uri: TIKTOK_REDIRECT,
  state,
  code_challenge: challenge,
  code_challenge_method: 'S256',
});

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, TIKTOK_REDIRECT);
  if (!u.pathname.startsWith('/callback')) { res.end(); return; }
  const finish = (msg) => { res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end(msg); server.close(); };
  if (u.searchParams.get('state') !== state) { finish('State mismatch, try again.'); return; }
  const code = u.searchParams.get('code');
  if (!code) { finish(`TikTok returned: ${u.searchParams.get('error_description') || u.searchParams.get('error') || 'no code'}`); return; }
  try {
    saveTokens(slug, await exchangeCode(cfg, code, verifier));
    finish('TikTok connected. You can close this tab.');
    console.log(`Saved TikTok tokens for "${slug}".`);
  } catch (e) {
    finish('Sign-in failed, check the terminal.');
    console.error(e.message);
  }
});
server.listen(3455, '127.0.0.1', () => {
  console.log('Opening TikTok sign-in in your browser...');
  exec(`open "${url}"`);
});

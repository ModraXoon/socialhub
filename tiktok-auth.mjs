// TikTok token handling: one-time sign-in (desktop Login Kit, PKCE with hex SHA-256 as TikTok requires)
// and automatic refresh. Access tokens last 24 h, refresh tokens 365 days and may rotate on refresh.
import crypto from 'node:crypto';
import { setBrandKey } from './brands.mjs';

export const TIKTOK_REDIRECT = 'http://127.0.0.1:3455/callback/';
export const TIKTOK_SCOPES = 'user.info.basic,video.upload,video.list';
const TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/';

export function pkce() {
  const verifier = crypto.randomBytes(48).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('hex');
  return { verifier, challenge };
}

async function tokenRequest(params) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  const json = await res.json().catch(() => ({}));
  if (!json.access_token) throw new Error(`TikTok auth: ${json.error_description || json.error || res.status}`);
  return json;
}

export function saveTokens(slug, t) {
  setBrandKey(slug, 'TIKTOK_ACCESS_TOKEN', t.access_token);
  setBrandKey(slug, 'TIKTOK_REFRESH_TOKEN', t.refresh_token);
  setBrandKey(slug, 'TIKTOK_TOKEN_EXPIRES', String(Date.now() + (t.expires_in - 300) * 1000));
  if (t.open_id) setBrandKey(slug, 'TIKTOK_OPEN_ID', t.open_id);
}

export const exchangeCode = (cfg, code, verifier) => tokenRequest({
  client_key: cfg.TIKTOK_CLIENT_KEY,
  client_secret: cfg.TIKTOK_CLIENT_SECRET,
  code,
  grant_type: 'authorization_code',
  redirect_uri: TIKTOK_REDIRECT,
  code_verifier: verifier,
});

/** Returns a valid access token, refreshing (and persisting rotated tokens) when needed. */
export async function tiktokAccessToken(cfg) {
  if (cfg.TIKTOK_ACCESS_TOKEN && Number(cfg.TIKTOK_TOKEN_EXPIRES || 0) > Date.now()) return cfg.TIKTOK_ACCESS_TOKEN;
  const t = await tokenRequest({
    client_key: cfg.TIKTOK_CLIENT_KEY,
    client_secret: cfg.TIKTOK_CLIENT_SECRET,
    grant_type: 'refresh_token',
    refresh_token: cfg.TIKTOK_REFRESH_TOKEN,
  });
  saveTokens(cfg.slug, t);
  return t.access_token;
}

// One-time YouTube sign-in for a brand: opens Google's consent page in your browser, receives the code
// on a local loopback address and stores the refresh token in brands/<slug>.env.
//   npm run auth:youtube -- mybrand
import http from 'node:http';
import { exec } from 'node:child_process';
import { loadBrand, setBrandKey } from './brands.mjs';

const slug = process.argv[2];
const cfg = loadBrand(slug);
if (!cfg.YOUTUBE_CLIENT_ID || !cfg.YOUTUBE_CLIENT_SECRET) {
  console.error(`Fill YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET in brands/${slug}.env first.`);
  process.exit(1);
}
const PORT = 53682;
const redirect = `http://127.0.0.1:${PORT}`;
const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
  client_id: cfg.YOUTUBE_CLIENT_ID,
  redirect_uri: redirect,
  response_type: 'code',
  scope: 'https://www.googleapis.com/auth/youtube.upload',
  access_type: 'offline',
  prompt: 'consent',
});

const server = http.createServer(async (req, res) => {
  const code = new URL(req.url, redirect).searchParams.get('code');
  if (!code) { res.end('No code'); return; }
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: new URLSearchParams({ code, client_id: cfg.YOUTUBE_CLIENT_ID, client_secret: cfg.YOUTUBE_CLIENT_SECRET, redirect_uri: redirect, grant_type: 'authorization_code' }),
  });
  const json = await r.json();
  if (json.refresh_token) {
    setBrandKey(slug, 'YOUTUBE_REFRESH_TOKEN', json.refresh_token);
    res.end('YouTube connected. You can close this tab.');
    console.log(`Saved YouTube refresh token for "${slug}".`);
  } else {
    res.end('Sign-in failed, check the terminal.');
    console.error(json);
  }
  server.close();
});
server.listen(PORT, '127.0.0.1', () => {
  console.log('Opening Google sign-in in your browser...');
  exec(`open "${url}"`);
});

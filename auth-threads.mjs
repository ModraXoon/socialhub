// Saves a Threads token for a brand. Usage: THREADS_NEW_TOKEN=<token> npm run auth:threads -- <slug> [download-link]
// The token comes from the Meta app's Threads use case → Settings → User Token Generator (long-lived, 60 days).
// It is read from the environment so it never lands in shell history.
import { loadBrand, setBrandKey } from './brands.mjs';

const [slug, link] = process.argv.slice(2);
const token = process.env.THREADS_NEW_TOKEN;
if (!slug || !token) {
  console.error('Usage: THREADS_NEW_TOKEN=<token> npm run auth:threads -- <slug> [download-link]');
  process.exit(1);
}
loadBrand(slug);
const res = await fetch(`https://graph.threads.net/v1.0/me?${new URLSearchParams({ fields: 'id,username', access_token: token })}`);
const me = await res.json();
if (!res.ok || me.error) {
  console.error('Token rejected:', me.error?.message || res.status);
  process.exit(1);
}
setBrandKey(slug, 'THREADS_TOKEN', token);
setBrandKey(slug, 'THREADS_TOKEN_AT', String(Date.now()));
setBrandKey(slug, 'THREADS_USER_ID', me.id);
if (link) setBrandKey(slug, 'THREADS_LINK', link);
console.log(`Threads connected for ${slug}: @${me.username}`);

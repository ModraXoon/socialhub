// One-time Meta setup for a brand. Reads META_APP_ID, META_APP_SECRET and a short-lived
// META_USER_TOKEN (from Graph API Explorer) in brands/<slug>.env, then:
//   1. exchanges the user token for a long-lived one,
//   2. finds the Facebook Page and its linked Instagram professional account,
//   3. stores META_PAGE_ID, META_PAGE_TOKEN (non-expiring), IG_USER_ID and removes the user token.
// Tokens never leave this machine except to graph.facebook.com.
//   npm run setup:meta -- mybrand            (picks the only page, or lists them)
//   npm run setup:meta -- mybrand <page-id>  (when you manage several pages)
import { loadBrand, setBrandKey } from './brands.mjs';

const [slug, wantedPage] = process.argv.slice(2);
const cfg = loadBrand(slug);
const G = `https://graph.facebook.com/${process.env.GRAPH_VERSION || 'v26.0'}`;
// META_APP_SECRET is optional: without it, paste a token already extended with the
// Access Token Debugger's "Extend Access Token" button (long-lived user token).
for (const k of ['META_USER_TOKEN']) {
  if (!cfg[k]) { console.error(`Missing ${k} in brands/${slug}.env`); process.exit(1); }
}
const get = async (path, params) => {
  const r = await fetch(`${G}${path}?${new URLSearchParams(params)}`);
  const j = await r.json();
  if (j.error) throw new Error(j.error.message);
  return j;
};

const long = cfg.META_APP_SECRET && cfg.META_APP_ID
  ? await get('/oauth/access_token', {
    grant_type: 'fb_exchange_token',
    client_id: cfg.META_APP_ID,
    client_secret: cfg.META_APP_SECRET,
    fb_exchange_token: cfg.META_USER_TOKEN,
  })
  : { access_token: cfg.META_USER_TOKEN };
const pages = (await get('/me/accounts', { access_token: long.access_token, fields: 'id,name,access_token,instagram_business_account{id,username}' })).data || [];
if (!pages.length) { console.error('No Facebook Pages found. Did you select the Page when generating the token?'); process.exit(1); }
const page = wantedPage ? pages.find((p) => p.id === wantedPage) : pages.length === 1 ? pages[0] : null;
if (!page) {
  console.log('Several Pages found, run again with the Page id:');
  for (const p of pages) console.log(`  ${p.id}  ${p.name}  (Instagram: ${p.instagram_business_account?.username || 'none'})`);
  process.exit(1);
}
const ig = page.instagram_business_account;
setBrandKey(slug, 'META_PAGE_ID', page.id);
setBrandKey(slug, 'META_PAGE_TOKEN', page.access_token);
setBrandKey(slug, 'IG_USER_ID', ig?.id || '');
setBrandKey(slug, 'META_USER_TOKEN', '');
console.log(`Connected Facebook Page "${page.name}" (${page.id}).`);
// Page tokens derived from a long-lived user token never expire; from a short-lived one they last ~1 hour.
const dbg = await get('/debug_token', { input_token: page.access_token, access_token: page.access_token }).catch(() => null);
const exp = dbg?.data?.expires_at;
console.log(exp === 0 ? 'Page token does not expire.' : `WARNING: page token expires ${exp ? new Date(exp * 1000).toLocaleString() : 'soon'}. Extend the user token in the Access Token Debugger and run this again.`);
console.log(ig ? `Connected Instagram @${ig.username} (${ig.id}).` : 'No Instagram professional account is linked to this Page.');

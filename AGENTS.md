# Setting up SocialHub for a user (instructions for AI agents)

SocialHub is a local, single-user social media scheduler (Node + Express + SQLite) that publishes to Instagram, Facebook Pages, Threads, TikTok and YouTube. Your job: install it on the user's Mac, connect the accounts they want, and confirm one test post works. Talk to the user in their language, explain each step plainly, and keep them in control.

## Ground rules

- **Never type the user's passwords** and never sign in for them. Every login, consent screen and "Allow" button is theirs to click. You may open the right page and tell them what to click.
- **Never print, paste into chat, or commit tokens.** Move tokens from the clipboard straight into files with the helper commands below (`$(pbpaste)`), then clear the clipboard (`printf '' | pbcopy`).
- Keep `DRY_RUN=1` until the user has seen a dry-run work and says to go live.
- Ask before publishing anything for real; posts are public.

## 1. Install

Requires macOS, Node 20+ and git.

```bash
npm install
cp .env.example .env
mkdir -p data library
```

## 2. Media hosting (Supabase, required for Instagram/Facebook/Threads)

Those networks fetch media by URL. Ask the user to create a free project at https://supabase.com (they sign in themselves), then from Project Settings → API copy the Project URL and the `service_role` key into `.env` as `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. The private bucket (`MEDIA_BUCKET`, default `social-temp`) is created automatically on first use. TikTok and YouTube upload directly and don't need this.

## 3. Start it and create a brand

```bash
npm start            # http://127.0.0.1:4310
```

Open the panel and use **Yeni marka** (new brand): a display name and a short slug (lowercase, e.g. `ayse`). This creates `brands/<slug>.env` from `brands/_template.env` and `library/<slug>/` for media. One brand = one set of accounts.

## 4. Connect accounts

Ask which networks the user wants; skip the rest (empty values disable a network). Follow the matching section of README.md (Turkish) — summary:

| Network | User does | You run |
|---|---|---|
| Instagram + Facebook | Professional IG linked to a FB Page; create a Meta app (developers.facebook.com) with the Instagram and Page use cases; get a user token in Graph API Explorer with the permissions listed in README | put `META_APP_ID`, `META_APP_SECRET`, `META_USER_TOKEN` in the brand file, then `npm run setup:meta -- <slug>` |
| Threads | Add "Access the Threads API" use case + `threads_content_publish` to the same Meta app; add their Threads account as **Threads Tester** and accept the invite in the Threads app; click Generate Access Token → Copy | `THREADS_NEW_TOKEN="$(pbpaste)" npm run auth:threads -- <slug> [link]` |
| TikTok | Create an app at developers.tiktok.com with Login Kit + Content Posting API, redirect `http://127.0.0.1:3455/callback/`; approve the consent page | put `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` in the brand file, then `npm run auth:tiktok -- <slug>` |
| YouTube | Google Cloud project with YouTube Data API v3, OAuth consent (add self as test user), Desktop OAuth client; approve the consent page | put `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET` in the brand file, then `npm run auth:youtube -- <slug>` |

After changing `.env` or a brand file, restart the server. Check what's connected: `curl -s http://127.0.0.1:4310/api/brands` (each network shows true/false).

## 5. Test, then go live

1. With `DRY_RUN=1`, create a post in the panel and press publish now: it should show "deneme modu" for each network.
2. Ask the user for permission, set `DRY_RUN=0` in `.env`, restart, and publish one real post they approved. Open the result link to confirm.

## 6. Start at login

```bash
zsh scripts/autostart.sh           # installs a launchd agent (com.socialhub.app)
zsh scripts/autostart.sh remove    # uninstall
```

Logs: `data/socialhub.log`. Restart after config changes: `launchctl kickstart -k gui/$(id -u)/com.socialhub.app`. Scheduled posts only go out while the Mac is on; missed ones publish when it wakes.

## Things to tell the user

- TikTok posts land as **drafts in the TikTok inbox** until their TikTok app passes audit; they tap Post. Too many pending drafts and TikTok rejects new ones.
- Threads/Meta tokens last ~60 days; Threads refreshes itself, Meta page tokens from `setup:meta` don't expire.
- Everything stays on this Mac; `.gitignore` keeps `.env`, `brands/*.env`, `data/` and `library/` out of git. Never commit them.

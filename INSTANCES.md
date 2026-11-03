# Running the web app as another instance (e.g. "Friday")

The long checklist (LINE channels, Supabase, Cloudflare account, secrets, going live, updating every instance at once) is in the **bot repo's
`INSTANCES.md`** — the two repos use the same instance names (`jarvis`, `friday`). This file is the web app's part of it.

## Files

| File | What it is |
|---|---|
| `wrangler.jsonc` | Jarvis's web app (unchanged — what Cloudflare deploys today) |
| `wrangler.friday.jsonc` | Friday's web app: own Worker name (`friday-webapp`), service binding to **its own** bot Worker (`friday-line-bot`), its own Supabase / LINE / LIFF values. Replace every `REPLACE…`. |
| `.dev.vars.example` | every variable and secret the app reads, with where it comes from |
| `tools/check-instance.mjs` | refuses to continue while a `REPLACE…` is left (`npm run check:friday`) |

## Commands

```
npm run check:friday     # what is still to fill in?
npm run deploy:friday    # check → build as "Friday" (NEXT_PUBLIC_BRAND_NAME=Friday) → wrangler deploy --config wrangler.friday.jsonc
```

## Secrets (per instance; never in a file) — `npx wrangler secret put NAME --config wrangler.friday.jsonc`

`SUPABASE_SERVICE_ROLE_KEY` · `SESSION_SECRET` (new, long, random) · `INTERNAL_API_SECRET` (**the same value** as on this instance's bot Worker) ·
`ADMIN_SECRET` · `LINE_LOGIN_CHANNEL_SECRET` · `LINE_ACCESS_TOKEN` (Friday's Messaging API token) · `GOOGLE_LOGIN_CLIENT_SECRET`.
Plain variables besides the config file: `VAPID_PUBLIC_KEY` (the public half of the bot's VAPID pair), `GOOGLE_LOGIN_CLIENT_ID`,
`GOOGLE_LOGIN_REDIRECT_URI` (`<web app URL>/api/auth/google/callback`).

## Build-time values

`NEXT_PUBLIC_BRAND_NAME` (the name — `deploy:friday` sets it) and `NEXT_PUBLIC_LINE_OA_URL` (the OA's "Add friend" link; set it in the environment of
the build, or as a *Build variable* when Cloudflare Workers Builds does the building) are inlined while building — changing them needs a new deploy.

## Name, voice, logo, icons — the brand folder

`brands/friday/brand.json` ({ "name": "Friday", "gender": "female" }) and `brands/friday/public/*` (the logo and app icons). `npm run deploy:friday`
(`tools/deploy-instance.mjs`) reads them: the name and the voice go into the build as `NEXT_PUBLIC_BRAND_NAME` / `NEXT_PUBLIC_BRAND_GENDER`, the pictures are laid
over `public/` for the build and put back afterwards (so Jarvis's own deploy is never affected). `npm run deploy:friday -- --dry` shows the plan without building.
A new instance = a `brands/<name>/` folder + a `wrangler.<name>.jsonc`. See README §2g for what "voice" changes.

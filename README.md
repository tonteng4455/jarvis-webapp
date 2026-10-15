# jarvis-webapp — Phase 1 (Core Architecture, Auth, Quota, Manual Premium)

Scope of this phase, per what we agreed on:
- Supabase schema for tiers/quota (`users` table + trigger, reusing the
  existing `user_files` table — NOT a separate `files` table)
- LINE Login OAuth flow (separate channel from the Messaging API bot)
- (R2 presigned upload was removed — file storage is the user's own Google Drive, handled by the bot Worker)
- A manual admin console to grant Premium after a PromptPay QR payment
  (no payment gateway integration yet — that's a later phase, once a
  GB Prime Pay/Omise merchant account actually exists)
- The existing Cloudflare Worker (LINE bot) updated to read the SAME
  quota/usage numbers from `users`, so limits agree across bot + web

Explicitly OUT of scope for Phase 1 (per your message): the Notes/Files/
Calendar/Expense web UIs. This phase only makes premium tiers real; the
dashboard modules come in a later phase.

---

## 1) Run the SQL migration

Supabase → SQL Editor → paste `phase1_schema.sql` → Run.

This creates `users`, the `effective_quota_bytes()` / `is_user_premium()`
functions, and a trigger that keeps `users.used_storage_bytes` in sync
automatically every time a row is added to or removed from `user_files`
— from EITHER the LINE bot or the web app.

## 2) Create a LINE Login channel (separate from the Messaging API one)

1. developers.line.biz → your provider → **Create a new channel** →
   **LINE Login**
2. Note the **Channel ID** and **Channel secret** — these are different
   from the Messaging API channel's credentials, don't mix them up.
3. Under **LINE Login settings**, add a Callback URL:
   `https://<your-pages-domain>/api/auth/callback`
4. Scopes needed: `profile`, `openid` (defaults are fine)

## 3) File storage

The web app no longer uses R2. Photos/files live in each user's own Google
Drive, written by the bot Worker. If a user hasn't connected Google, the
web app shows a "connect Google Drive" link (the Worker returns it as
`connectUrl`).

## 4) Configure environment variables

Copy `.env.example` to `.env.local` for local dev, and set the same
values in **Cloudflare Pages → your project → Settings → Environment
variables** for production. Generate `SESSION_SECRET` with:

```
openssl rand -hex 32
```

## 5) Install and deploy

```
npm install
npm run pages:build
npm run pages:deploy
```

(Or connect the repo to Cloudflare Pages directly for git-push deploys —
either works, `next-on-pages` handles the edge-runtime build either way.)

## 6) Add the "get my LINE userId" bot command

Already added to the Worker's `matchExplicitCommand` in this drop —
users can send "รหัสผู้ใช้" to the bot to get their own LINE userId,
which they send to you after paying via the PromptPay QR you show them
manually. You then paste it into `/admin` on the web app.

## 7) The manual Premium flow, end to end

1. You show the customer a PromptPay QR (personal QR from your banking
   app — no gateway integration exists yet, this is intentionally manual)
2. Customer pays, sends you a screenshot + their LINE userId (via the
   "รหัสผู้ใช้" command above)
3. You check the payment landed in your bank app
4. Go to `https://<your-pages-domain>/admin`, enter the admin password
   (`ADMIN_SECRET`), paste their LINE userId, submit
5. Their `users` row flips to `is_premium = true`, `premium_until` = now
   + 30 days, quota = 5GB — takes effect immediately on both the bot
   and any future web app upload, no redeploy needed

## Known gaps / decisions deferred to a later phase

- **No automatic renewal reminder** — premium_until just lapses silently
  right now; a scheduled check + LINE push reminder near expiry would be
  a good Phase 1.5 addition if you want it before real payment automation.
- **Quota check is check-then-act**, not atomic — fine at expected scale,
  flagged here so it isn't forgotten if usage grows a lot.
- **ADMIN_SECRET is a single shared password**, not tied to your own LINE
  account — acceptable since you're the only admin; revisit if that changes.
- Real gateway integration (GB Prime Pay/Omise webhook) is intentionally
  NOT built yet — swap the admin form's manual submit for a webhook
  handler once a merchant account exists; the `users` table/RPCs don't
  need to change for that, only how `is_premium`/`premium_until` get set.

## Phase 2 additions (this drop): Admin console + user dashboard

- **`/admin`** — password-gated user table: search by name/userId/phone,
  see tier + quota at a glance, Grant/Extend or Revoke Premium per row
  (replaces the old single-form version). Backed by
  `app/api/admin/users` (list) and `app/api/admin/revoke-premium`.
- **`/dashboard`** — the actual Premium/Free user-facing page:
  profile (from LINE Login), quota progress bar, a one-time phone
  number field, and a file list (view/delete) mirroring the bot's
  "📁 ไฟล์" menu — same `user_files` table, so a file from LINE shows
  up here and vice versa.
- **`/login`** — simple LINE Login entry point that `/dashboard`
  redirects to if there's no session.
- **Phone numbers**: LINE does NOT expose phone numbers through normal
  LINE Login — that requires a separate "LINE Profile+" corporate
  contract with LINE, not viable here. The dashboard instead asks the
  user to type it in ONCE (`/api/me/phone`); the admin console then has
  it on hand for every future Premium request without asking again.

Run `webapp_phone_number.sql` in Supabase before deploying this drop
(adds `users.phone_number`).

## User cap + waitlist (this drop)

- Total registered users is hard-capped (default 200, `USER_CAP`), enforced
  at the LINE "follow" event (someone adding the bot) in the Worker —
  existing users are never retroactively blocked.
- Each active Premium subscriber raises the cap by `PREMIUM_CAP_BONUS_SLOTS`
  (default 5). Granting Premium via `/admin` automatically checks the
  waitlist and promotes/notifies people, oldest-first, up to however
  much room just opened.
- **Set `USER_CAP` and `PREMIUM_CAP_BONUS_SLOTS` to the SAME values on
  both the Worker and this web app** — they're duplicated because each
  runtime does its own math (Worker enforces on follow, web app
  recomputes when granting Premium). Mismatched values won't break
  anything but will make the two sides disagree about how much room
  exists until you fix it.
- Requires `LINE_ACCESS_TOKEN` here too (same value as the Worker's) so
  this app can push the "you're in!" notification directly — this is
  the one thing the web app does that needs LINE Messaging API access
  outside of the bot itself.
- Run `waitlist.sql` in Supabase before deploying this drop.

## Local testing without LINE / Supabase / Drive

```
MOCK_MODE=1 NEXT_PUBLIC_MOCK_MODE=1 SESSION_SECRET=<32+ chars> npm run dev
```

Then open `/login` and use the "[test]" links (`/api/auth/dev-login?user=demo`
or `?user=nodrive` for a user without Google Drive). Data is in memory
(`dev/mockSupabase.js`, seeded by `dev/mockSeed.js`; Drive by
`dev/mockBot.js`). These paths are disabled when `NODE_ENV=production`, so
they cannot be reached on the deployed site.

## App features worth knowing (mobile-first)

- Bottom tab bar on phones (วันนี้ / โน้ต / งาน / นัดหมาย / เงิน / ไฟล์), top tabs on desktop
- `/dashboard/today` landing page: next appointments, open tasks, today's spending, recent notes, quick add and one search across everything
- Calendar: month grid + list; add / edit / cancel (syncs to Google Calendar via the bot Worker)
- Ledger: cards grouped by day, add / edit / delete
- Deletes can be undone for 6 seconds (the real DELETE only fires afterwards)
- PWA: `public/manifest.webmanifest` + `public/sw.js` (installable, notes list readable offline)
- Settings (avatar menu): theme (auto follows the phone), text size
- Optional env `NEXT_PUBLIC_LINE_OA_URL` adds an "open Dee in LINE" button on the Today page
- `POST /api/calendar` and `POST /api/expenses` insert rows directly — they assume the
  columns used in those routes exist (user_id, title, start_time, end_time, location,
  description, reminder_minutes, status / type, amount, category, memo).

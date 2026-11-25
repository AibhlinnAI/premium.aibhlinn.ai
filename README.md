# premium.aibhlinn.ai, where AibhlínnAI Premium is bought

One page: confirm your email, then subscribe to AibhlínnAI Premium through
Paddle. Every AibhlínnAI app sends people here; none sells in-app.

**Why a separate subdomain (Mal, 25 Nov 2026).** Paddle reviews each domain
on its own. It refused `aibhlinn.ai` because that site also describes
consulting and event support, which Paddle cannot sell. This site carries
software only, so keep it that way: **no consulting, advisory or event
services here, and no link to the `aibhlinn.ai` home page.** Adding either
could cost the Paddle approval.

Published by GitHub Pages from `.github/workflows/deploy.yml`, with the
same guard job as `AibhlinnAI/aibhlinn.ai` (secrets, trackers, ABN wrapping).

## Files

| File | What it is |
| --- | --- |
| `index.html` | The page. Live and indexed since 25 Nov 2026, after two test purchases Mal watched (one in-trial, one paid today, both cancelled and refunded) |
| `premium.js` | Confirm email, read the account's entitlement, open checkout |
| `identity/identity.js`, `identity/email-typos.js` | Copied **unmodified** from `pie-timers-app/identity/`. Copy again if those change; never edit here |
| `site.css` | Copied from the `aibhlinn.ai` repo, plus the Premium rules at the end. Keep the two in step |
| `404.html` | Root-absolute links, because it can be served at any depth |
| `fonts/`, icons, mark images | Copied from the `aibhlinn.ai` repo |
| `CNAME`, `.nojekyll` | The custom domain, and no Jekyll processing |

## How the sale works

1. The buyer confirms their email with an emailed code (the Pie Timers
   `signin` function, behind Cloudflare Turnstile). That is a real sign-in to
   the shared AibhlínnAI account. A typed email alone is never enough.
   A new address becomes a new account with the 14-day free trial.
2. The page reads the account fresh from Supabase, then its `my_entitlement`
   row.
3. Which checkout opens:
   - **Free trial running** → `create-checkout` makes a transaction carrying
     the right free days; first payment from 1 January 2027 while the launch
     offer is open.
   - **Trial finished** → the plain price, paid today, tied to the account by
     `custom_data.user_id`.
   - **Already subscribed** → no checkout.
   - **Entitlement lookup fails** → stop and say so. Never fall back to the
     plain price.

What the page uses beyond its own files: Cloudflare Turnstile
(`challenges.cloudflare.com`) while confirming an email, Paddle.js
(`cdn.paddle.com`) when subscribing, and Supabase
(`tgapmpbcqqnpsldehuqa.supabase.co`). The sign-in is kept in `localStorage`
(`aibhlinn/session/v1`). Browsers keep storage per site, so someone signed in
to Pie Timers confirms their email again here.

## Dates on this page

`index.html` and `premium.js` (`OFFER_CLOSES`, 2027-01-01T12:00:00Z) carry the
launch-offer dates. This site belongs on the "launch dates live in several
places" list in `pie-timers-app/CLAUDE.md`: if a date moves there, move it
here too.

## Needed outside this repo

1. Cloudflare DNS: `CNAME premium` → `aibhlinnai.github.io`, **DNS only
   (grey cloud)**.
2. This repo → Settings → Pages: Source **GitHub Actions**; Custom domain
   `premium.aibhlinn.ai`; then **Enforce HTTPS**.
3. Paddle: `premium.aibhlinn.ai` approved as a checkout domain.
4. Cloudflare Turnstile: `premium.aibhlinn.ai` added to the site key's
   hostnames.
5. Pie Timers' `signin` and `create-checkout` functions accepting the
   `https://premium.aibhlinn.ai` origin as well as
   `https://pietimers.aibhlinn.ai`.
6. Only for "Continue with Google": `https://premium.aibhlinn.ai/` in
   Supabase's redirect allow list, then `GOOGLE_ENABLED = true` in
   `premium.js`.

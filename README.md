# Matur

Persónulegur uppskriftavefur — [matur.kristinn.eu](https://matur.kristinn.eu)

Icelandic recipe PWA. Recipes are structured JSON validated at build time, rendered
as a static, offline-capable site with live serving scaling, a kitchen cook mode,
an aisle-ordered shopping list, and phone photo uploads that commit straight to
this repo.

## How it runs

Astro 7 static output served by a small **Cloudflare Worker** (`worker/index.ts`):
static assets flow through the assets binding, `POST /api/photo` accepts
photo uploads from signed-in family members and commits them via the GitHub API — which
triggers a rebuild, so uploaded photos ride the same image pipeline as everything
else. Photos attach to recipes purely by filename: `src/content/recipes/photos/<slug>.jpg`.

Every push to `main` deploys via Cloudflare's Git build, **gated** by
`npm run verify` — typecheck, unit tests and the recipe lint all must pass or the
deploy is blocked. Note that the site itself commits to `main` (photo uploads), so
always `git pull --rebase` before pushing.

## Development

```bash
npm install
npm run dev        # http://localhost:4321
npm test           # unit tests (units engine, lint, shopping, parsers)
npm run check      # recipe lint over src/content/recipes/
npm run verify     # the full deploy gate: astro check + tests + lint + build
npx wrangler dev   # site + worker together (secrets from .dev.vars)
```

Bringing in a new recipe:

```bash
npm run import -- <source-url> [slug]   # fetch → drafts/<slug>.draft.json
npm run translate                        # drafts → Icelandic recipe JSON via claude -p
```

`translate` needs a logged-in `claude` CLI (or `--backend=api` with
`ANTHROPIC_API_KEY`) and is glossary-driven — see `glossary/`.

## Accounts

Signing in with Google gives each family member their own favourites, their own
private notes, and the right to upload photos. It is live.

**Who can sign in** is the `ALLOWED_EMAILS` Worker secret — a comma-separated
list of addresses. It **fails closed**: an empty list admits nobody. This is the
only gate that matters, because with basic sign-in scopes Google itself does not
restrict who may authenticate. Adding someone means rewriting the whole secret,
which is not additive:

```bash
printf 'a@gmail.com,b@gmail.com' | npx wrangler secret put ALLOWED_EMAILS
```

**Configuration** (already in place): `GOOGLE_CLIENT_ID` is a var in
`wrangler.jsonc` — client ids are public by design — while `SESSION_SECRET`
(signs the session cookies) and `ALLOWED_EMAILS` are Worker secrets. The D1
database `matur` is bound as `DB`; its schema is `worker/schema.sql`.

Sessions are signed cookies (`HttpOnly; Secure; SameSite=Lax`), so there is no
session table and a stolen cookie expires on its own. Google's ID token is
verified properly — RS256 against Google's published keys, then issuer,
audience, expiry and a confirmed address.

Notes live only in D1. They must never follow the photo path, which commits to
this public repo — a private remark would become permanently world-readable.

## Structure

| Path | Purpose |
|---|---|
| `src/lib/units.ts` | Icelandic unit engine — canonical storage, display idiom, scaling |
| `src/lib/shopping.ts` | Shopping-list aggregation and store-section mapping |
| `src/lib/lint.ts` + `scripts/check.ts` | Recipe rules the schema cannot express |
| `src/lib/steps.ts` | `{{ingredient}}` refs inlined into step text, scaled live |
| `src/content/recipes/` | One JSON file per recipe (+ `photos/<slug>.jpg`) |
| `worker/index.ts` | API router: photo upload, accounts, asset passthrough |
| `worker/account.ts` + `google.ts` | Sign-in, favourites, private notes; Google token verification |
| `src/lib/session.ts` | Signed session cookies and the sign-in allowlist |
| `scripts/import.ts` / `translate.ts` | Source-to-Icelandic recipe pipeline |
| `glossary/` | House rules: units idiom, product names, tone |
| `docs/superpowers/` | Design spec and implementation plans |

## Units, the short version

Amounts are stored canonically (grams / millilitres / counts) and rendered in
Icelandic units only at display time — `5 dl`, never `500 ml`; fractions, never
decimals. Scaling rounds to measurable steps and never rounds a required
ingredient to zero. Ingredients marked `"scalable": false` (seasoning-to-taste,
raising agents) ignore serving changes. The shopping list rounds **up**.

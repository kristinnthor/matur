# Admin Role — Editing Recipe Text From the Site

**Date:** 2026-09-01
**Repo:** `github.com/kristinnthor/matur`
**Status:** Approved design

## 1. Purpose

Give a named admin the ability to fix a recipe's **wording** from the site itself — a typo in a
title, a clumsy sentence in a step, a description that reads badly — without opening an editor,
finding the JSON and pushing a commit by hand.

The first (and initially only) admin is `kristinns72@gmail.com`.

## 2. Revises an earlier non-goal

The original design (`2026-08-28-matur-recipe-pwa-design.md` §4) lists as a non-goal:

> No admin/CMS UI — recipes are files, edited in git

This spec deliberately revises that, and it is worth being precise about *how far*. Recipes remain
files edited in git — that does not change. What changes is that **the site becomes one of the
clients that can write those files**, exactly as photo upload already is. There is no database of
recipe content, no CMS, no second source of truth. An edit made on the site is a commit in this
repo, indistinguishable afterwards from one made in an editor.

The original non-goal was protecting against a *parallel content store*. That protection is intact.

## 3. Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Editable scope | Free text only | Amounts, units and taxonomy feed the units engine, the shopping list and the lint rules; leaving them alone keeps scaling provably safe |
| Where edits land | Commit to GitHub, triggering a rebuild | Same path as photo upload; repo stays the single source of truth, git history is the audit trail |
| Role storage | `ADMIN_EMAILS` Worker secret | Mirrors `ALLOWED_EMAILS` exactly, reuses its parser and its fail-closed rule, keeps addresses out of a public repo |
| Role evaluation | Per request, never in the session cookie | Sessions last 30 days; a baked-in role would take a month to revoke |
| Editor surface | A pre-rendered page per recipe | Same pattern as `/elda`; shows raw source, so what you edit is what gets stored |
| Conflict policy | Refuse (409), do not retry | Unlike a photo, silently clobbering someone's paragraph loses work |

## 4. Non-goals

- No editing of amounts, units, servings, times, categories, tags or `source`
- No creating or deleting recipes — this edits text in recipes that already exist
- No draft state, no preview, no revision UI — git history already is the revision history
- No second role beyond `admin`; no per-recipe permissions

## 5. The role

`ADMIN_EMAILS` is a new Worker secret: a comma-separated list of addresses, parsed by the existing
`parseAllowlist` in `src/lib/session.ts` and tested with the existing `isAllowed`. It inherits the
fail-closed rule that matters most — **an unset or empty secret means nobody is an admin**, so a
half-configured deploy grants nothing.

```bash
printf 'kristinns72@gmail.com' | npx wrangler secret put ADMIN_EMAILS
```

Two properties, both deliberate:

**Checked per request.** The session cookie continues to carry only `{sub, email, name}`. Admin
status is recomputed from the secret on every admin request. Removing someone from `ADMIN_EMAILS`
takes effect on their next request rather than whenever their 30-day cookie happens to expire.

**Independent of sign-in.** `ALLOWED_EMAILS` grants sign-in; `ADMIN_EMAILS` grants editing. An
admin must be in **both** — being an admin does not let you through the door. Both lists fail
closed, so the failure mode of configuring one and forgetting the other is "no access", never
"unintended access". This is a footgun worth documenting rather than designing away, and the README
will say so next to the existing allowlist instructions.

`GET /api/me` gains `admin: boolean`, so the UI knows whether to offer an edit affordance. It
reports the same per-request computation, not a cached claim.

## 6. What "free text" means

The server holds the whitelist. The form does not get to decide what is editable — a patch carrying
an `amount` is ignored, not rejected, because the patch is *applied field by field* onto the
canonical recipe rather than replacing it.

| Editable | Left alone |
|---|---|
| `title`, `subtitle`, `description` | `ingredients[].amount`, `.unit`, `.scalable`, `.id` |
| `ingredients[].item`, `.note`, `.group` | `servings`, `time.prep`, `time.cook` |
| `steps[].text` | `categories`, `tags` |
| `notes.improvements`, `.storage`, `.variants` | `source.url`, `source.site` |

Five rules govern how the patch applies:

**An omitted field is unchanged; a present-but-blank field is an edit.** The patch is sparse. Not
sending `subtitle` leaves the existing subtitle alone; sending `subtitle: ""` deletes it. These are
different intentions and the encoding must keep them distinguishable, so the form always sends every
field it rendered.

**Ingredients match by `id`, not array position.** The patch says "the ingredient whose id is
`kartoflur` now reads X". An ingredient id in the patch that no longer exists in the recipe is
skipped silently; positions can never scramble text onto the wrong row.

**Steps match by index, because steps have no ids** — and index matching is only safe while the
recipe's shape is unchanged. So the patch carries the step count it was built from, and a mismatch
against the fetched recipe is a conflict (`409`), not a best-effort merge. In practice this fires
when a step was added or removed in git while the form sat open.

**`steps[].refs` is re-derived, never sent by the client.** Step text stores raw `{{ingredient_id}}`
tokens which the renderer resolves to live, scaled amounts. `refs` is a parallel array the lint
validates. After a step's text is edited, `refs` is recomputed from the `{{...}}` tokens actually
present. Typing `{{vorlaukur}}` into a step adds it; deleting one drops it. Leaving this to the
client is the single most likely way to silently break scaling.

**Empty optional fields delete their key** rather than storing `""`. `subtitle`, `ingredients[].note`
and each key of `notes` are removed when blank; `ingredients[].group` has its key **deleted**, not set to `null`. 468 of the corpus's 746
ingredients omit `group` entirely and not one stores an explicit `null`, so writing `null` on
blank would add a key to hundreds of lines on every save. An absent `group` and a `null` one are
identical to the schema, which defaults it to `null`. This mirrors how `/api/note` already deletes on an empty body, and keeps the JSON
free of empty strings that were never authored.

Required fields — `title`, `description`, every `steps[].text` — are rejected when blank after
trimming. This is the only schema-shaped risk a text-only patch can introduce into an
already-valid recipe.

## 7. The write path

`PUT /api/recipe`, admin only. `401` when signed out, `403` when signed in without the role, `503`
when `GITHUB_TOKEN` is unset — the same disabled-until-configured behaviour the photo endpoint
shipped with.

1. **Fetch the canonical JSON from GitHub**, with its blob SHA. The client's copy was baked at
   deploy time and may be stale, and trusting it would mean trusting a whole recipe body from the
   browser. The patch is applied to what the repo actually holds right now.
2. **Apply the whitelisted patch** (§6) to that fetched object.
3. **Re-derive refs**, then run `lintRecipe` on the result.
   - Lint **errors** → `422` with the messages, nothing committed.
   - Lint **warnings** → committed, but returned so the editor can show them.
4. **Commit** via the contents API, message `edit: <slug> (breytt af <first name>)`. First name
   only — this lands in a public repo's permanent history, the same rule the photo path follows for
   the same reason.

Serialised as `JSON.stringify(recipe, null, 2) + '\n'`, byte-identical to how the existing files are
formatted, so a one-word fix produces a one-line diff. Key order survives the parse/stringify round
trip because the patch mutates an existing object rather than rebuilding one.

This holds only because every recipe file is written in exactly that form. Seven were originally
hand-authored with compact arrays and were normalised in a separate content-only commit before
this feature shipped; `scripts/translate.ts` has always emitted the canonical form for new ones.

**On SHA conflict, refuse.** The photo endpoint refetches and retries, so the second photo wins.
This endpoint returns `409` and asks the editor to reload. Losing a paragraph someone just wrote is
worse than making them repeat a click — a deliberate divergence from the photo path, not an
oversight.

### Why lint runs before the commit

`npm run verify` gates every deploy, and the recipe lint is part of it. A text edit *can* produce a
lint error: `src/lib/lint.ts` rejects English unit words in step prose (`cups`, `tbsp`, `oz`) and
rejects a `{{ref}}` naming an ingredient that does not exist. Committing such an edit would not
merely publish a bad recipe — it would **block the site from deploying at all** until someone fixed
it by hand.

Running the same `lintRecipe` server-side before committing is what makes the deploy gate
unreachable from the editor. It is the reason the endpoint refuses rather than warns.

## 8. Components

| File | Purpose |
|---|---|
| `src/lib/recipe-edit.ts` | **new** — pure: apply a whitelisted patch, re-derive refs, report rejections. No I/O |
| `src/lib/recipe-edit.test.ts` | **new** — unit tests |
| `worker/github.ts` | **new** — fetch-SHA / PUT / conflict handling, extracted from the photo handler that already does this |
| `worker/recipe.ts` | **new** — the `/api/recipe` endpoint |
| `src/pages/uppskrift/[slug]/breyta.astro` | **new** — the form, pre-rendered per recipe |
| `src/scripts/recipe-edit.ts` | **new** — client behaviour for that form |
| `src/lib/session.ts` | `isAdmin` — a named wrapper over `isAllowed`, for call-site clarity |
| `worker/account.ts` | `admin` on `/api/me`; an `adminUser()` helper returning the user only when they hold the role |
| `worker/index.ts` | Route `/api/recipe`; photo handler switches to the extracted GitHub helper |
| `src/scripts/account-ui.ts` | Set `data-admin` on `<html>`, mirroring the existing `data-signed-in` |
| `src/components/RecipeView.astro` | Edit link, hidden by CSS except under `[data-admin]` |
| `README.md` | `ADMIN_EMAILS` documented beside `ALLOWED_EMAILS` |
| `docs/superpowers/specs/2026-08-28-matur-recipe-pwa-design.md` | Note that §4's CMS non-goal is revised by this spec |

`worker/github.ts` is a targeted extraction, not speculative refactoring: two endpoints now perform
the same SHA-fetch-and-commit dance against the same repo, and they differ in exactly one policy
decision (retry vs refuse) that belongs at the call site.

## 9. The editor

`/uppskrift/<slug>/breyta/`, generated per recipe by the same `getStaticPaths` pattern as `/elda`.

The form shows **raw authored values**. A step displays `Skolið {{kartoflur}} vel og skerið í fernt`
— not the rendered `Skolið 800 g litlar rauðar kartöflur vel …` that the recipe page shows. What you
edit is what gets stored. Each ingredient's amount and unit sit beside its name, read-only, so it is
clear what you are renaming.

The page is static and therefore public, but it exposes nothing that is not already on the recipe
page. Enforcement is entirely server-side. A non-admin loading it sees a short "þú hefur ekki
aðgang" message instead of a form.

On success the editor reports *"fer í loftið eftir um 2 mínútur"*, matching the photo flow, and
keeps showing the edited text. The recipe page itself will show the old wording until the rebuild
lands — stating that plainly is better than a stale page that looks broken.

Lint warnings returned by a successful save are shown as advice, not failure. Lint errors keep the
form open with the messages attached.

## 10. Testing

`src/lib/recipe-edit.ts` is pure, so the substance is unit-testable without a Worker:

- A patch carrying `amount`, `unit`, `servings`, `categories` or `source` leaves them untouched
- Step refs re-derive: adding a `{{token}}` extends `refs`, removing one shrinks it
- Ingredient text matches by `id`; an unknown id in the patch is skipped
- Blank `subtitle` / `note` / `notes.*` delete their key; blank `group` becomes `null`
- Blank `title`, `description` or step text is rejected
- A patch whose step count differs from the fetched recipe is rejected as a conflict
- Round-tripping an unmodified recipe through the patch is a no-op, byte for byte

`src/lib/session.test.ts` gains admin cases, chiefly that an empty or unset `ADMIN_EMAILS` grants
nobody the role.

## 11. Handoff

One step for the user, after the code ships:

```bash
printf 'kristinns72@gmail.com' | npx wrangler secret put ADMIN_EMAILS
```

Until that secret exists the feature is inert: no edit affordance appears, and `/api/recipe`
refuses every request. That is the intended shipping state, matching how photo upload shipped
disabled behind a missing secret.

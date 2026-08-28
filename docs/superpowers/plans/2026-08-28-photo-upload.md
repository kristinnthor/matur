# Photos: Auto-Attach, Upload Feature, Stock Sweep

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Checkbox steps.

**Goal:** Every recipe can get a photo by dropping a file named `<slug>.jpg` — from git, from GitHub's web UI, or from a phone via a passphrase-protected upload page that commits through the GitHub API.

**Architecture:** (A) Components resolve photos by convention via `import.meta.glob` keyed on slug — the JSON `image` field disappears. (B) The existing Cloudflare Worker gains `main`: non-asset routes hit a tiny handler; `POST /api/photo` validates a passphrase and commits the JPEG to the repo via GitHub's contents API, which triggers the normal build — uploads flow through the same astro:assets optimization as everything else. Secrets (`GITHUB_TOKEN`, `UPLOAD_PASS`) are Worker secrets the user sets; the code never contains them. `/myndir/` is a phone-first page that resizes client-side (~1600 px JPEG) before upload. (C) Interim Pexels sweep for the 14 photo-less recipes plus replacing the two weak shots.

## Tasks

### A: auto-attach by slug
- [ ] `src/lib/photos.ts`: `photoFor(slug): ImageMetadata | undefined` over `import.meta.glob('/src/content/recipes/photos/*.{jpg,jpeg,png,webp}', { eager: true, import: 'default' })`.
- [ ] RecipeCard/RecipeView use `photoFor(recipe.id)`; drop the `crop-low` special case. Remove `image` from the schema and from the four recipe JSONs.
- [ ] Build: the four photos still render; fallbacks intact. Commit.

### B: upload feature
- [ ] `worker/index.ts`: fetch handler → `/api/photo` else `env.ASSETS.fetch`. POST only; 503 when secrets unset; constant-time passphrase check (`x-upload-pass` header) → 401; body `{slug, data}` (base64 JPEG); slug `^[a-z0-9-]{3,80}$`; decoded ≤ 4.5 MB; JPEG magic bytes; GitHub GET for existing SHA → PUT contents `src/content/recipes/photos/<slug>.jpg`, commit message `photo: <slug> (upload)`. JSON responses, Icelandic error strings.
- [ ] `wrangler.jsonc`: add `main`, `assets.binding: "ASSETS"`, var `GITHUB_REPO`.
- [ ] `src/pages/myndir.astro` + `src/scripts/myndir.ts`: build-time manifest `{slug, title, hasPhoto}`; recipe picker (vantar mynd first), file input with camera capture, client resize via `createImageBitmap` (`imageOrientation: 'from-image'`) → canvas ≤ 1600 px → JPEG 0.82 → base64; passphrase field remembered in localStorage; status messages, including "live in ~2 minutes" on success. Link in site header. SW → v4.
- [ ] Verify locally with `wrangler dev` + `.dev.vars` (dummy token): wrong pass → 401, right pass → GitHub auth error mapped cleanly. Full e2e only possible after user sets real secrets. Commit, push (endpoint ships disabled-by-503 until secrets exist).

### C: stock sweep
- [ ] Pexels hunt for: stroganoff, kjötbollur, hvítlauksbrauð (focaccia), kjúklingur+sætar, rósakál, nautasteik (prime rib), humar (langoustine), carbonara, fylltar sætar (hasselback), hvítvínsrjómasósa, paprikusósa, ítalskur pönnukjúklingur, pestó-kjúklingur, kramdar (smashed potatoes) — plus better reykt-rauð-chimichurri and kartöflusalat. Inspect every candidate by eye; keep only dish-accurate, bright shots. Fallback card is better than a wrong photo.
- [ ] Save keepers as `src/content/recipes/photos/<slug>.jpg` (w=1600) — no JSON edits needed after Task A. Update docs/photo-credits.md. Commit, push, verify live.

### Handoff (user, ~5 min)
- [ ] GitHub fine-grained token: github.com/settings/personal-access-tokens → this repo only → Contents: Read and write.
- [ ] Cloudflare dashboard → Workers → matur → Settings → Variables and Secrets: add secret `GITHUB_TOKEN` (the token), secret `UPLOAD_PASS` (chosen passphrase). Redeploy not needed — secrets apply immediately.

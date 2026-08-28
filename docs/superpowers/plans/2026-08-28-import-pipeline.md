# Import & Translation Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the 13 remaining source recipes into validated Icelandic recipe JSON via a repeatable pipeline, and deploy them.

**Architecture:** Three node scripts around small, unit-tested pure modules. `import.ts` fetches a URL and produces a *draft* (structured, from JSON-LD, or raw page text when there is none). `translate.ts` builds a glossary-anchored prompt from the draft and shells out to `claude -p` (default backend; `--backend=api` optional), then writes the recipe JSON. `check.ts` lints every recipe against project rules the Zod schema cannot express (unit idiom, ref integrity, scalable flags). The Astro build remains the final schema gate.

**Tech Stack:** Node 22+ native TypeScript type-stripping (`node scripts/x.ts`, no build step), Vitest for the pure modules, `claude -p` headless CLI.

## Global Constraints

- All UI/content text Icelandic; units per glossary/units.md (`dl` at ≥100 ml, fractions not decimals, `tsk`/`msk` stay authored).
- Recipes are JSON in `src/content/recipes/`, validated by the collection schema at build time.
- Translation backend default `claude -p` (Max plan); `--backend=api` requires `ANTHROPIC_API_KEY`; `--limit` + resume so runs can split across sittings.
- Improvements to recipes must be real and documented under `notes.improvements`; nothing invented to fill the field.
- Source URL recorded on every recipe; no copying of source photos.
- The cumin trap: English *cumin* → `kúmín`; Icelandic `kúmen` is caraway.

---

### Task 1: Taxonomy as a pure module

`CATEGORIES`/`TAGS` currently live in `src/content.config.ts`, which imports `astro:content` and therefore cannot be imported by node scripts.

**Files:**
- Create: `src/lib/taxonomy.ts`
- Modify: `src/content.config.ts` (re-export from taxonomy)
- Modify: `src/pages/index.astro`, `src/pages/flokkur/[flokkur].astro` (import from `../lib/taxonomy` / `../../lib/taxonomy`)

**Interfaces:**
- Produces: `CATEGORIES: Record<string, string>`, `TAGS: Record<string, string>`, `UNIT_VALUES: readonly string[]` (moved alongside), all importable from plain node.

- [ ] Move the three constants verbatim into `src/lib/taxonomy.ts`; import them in `content.config.ts`; update the two page imports.
- [ ] Run: `npx vitest run && npx astro build` — both green, 22 pages.
- [ ] Commit: `refactor: extract taxonomy to a pure module for script use`

### Task 2: Slug helper (TDD)

**Files:**
- Create: `src/lib/slug.ts`
- Test: `src/lib/slug.test.ts`

**Interfaces:**
- Produces: `slugify(title: string): string` — lowercase ASCII, Icelandic transliteration (þ→th ð→d æ→ae ö→o á→a é→e í→i ó→o ú→u ý→y), non-alphanumerics collapse to single `-`.

- [ ] Test cases: `slugify('Kjúklinga-stroganoff með sveppum') === 'kjuklinga-stroganoff-med-sveppum'`; `slugify('Þessar fylltu sætu kartöflur!') === 'thessar-fylltu-saetu-kartoflur'`; `slugify('Boeuf  Bourguignon') === 'boeuf-bourguignon'`.
- [ ] Verify fail → implement → verify pass → commit `feat: icelandic-aware slugify`.

### Task 3: JSON-LD recipe extractor (TDD)

**Files:**
- Create: `src/lib/jsonld.ts`
- Test: `src/lib/jsonld.test.ts`

**Interfaces:**
- Produces: `extractRecipe(html: string): JsonLdRecipe | null` where `JsonLdRecipe = { name: string; yield?: string; prepTime?: string; cookTime?: string; totalTime?: string; ingredients: string[]; instructions: string[] }`.
- Handles: multiple `<script type="application/ld+json">` blocks, `@graph` nesting, `@type` as string or array, `HowToSection`/`HowToStep` instruction nesting, HTML tags and entities in instruction text.

- [ ] Tests: plain Recipe block; `@graph`-nested with `@type: ["Recipe","NewsArticle"]`; sectioned instructions flatten in order; `<b>`/`&nbsp;` stripped; no-recipe HTML returns null; malformed JSON in one block does not prevent the next from parsing.
- [ ] Verify fail → implement → verify pass → commit `feat: json-ld recipe extractor`.

### Task 4: import script

**Files:**
- Create: `scripts/import.ts`
- Modify: `package.json` (add `"import": "node scripts/import.ts"`)

**Interfaces:**
- Consumes: `extractRecipe`, `slugify`.
- CLI: `npm run import -- <url> [slug]`. Writes `drafts/<slug>.draft.json`:
  `{ source: { url, site }, fetched: <iso>, kind: 'jsonld', recipe: JsonLdRecipe }` or
  `{ source, fetched, kind: 'text', text: string }` (main-content text, tags stripped, ≤ 12000 chars).
- Exit 2 with a clear message when fetch fails (so recovery cases are explicit, never guessed).

- [ ] Implement with `fetch` (browser UA header), fallback text extraction = strip `<script>/<style>/<nav>/<header>/<footer>`, tags → text, collapse whitespace.
- [ ] Verify against a live URL: `npm run import -- https://www.kalynskitchen.com/2010/09/easy-recipe-for-baked-pesto-chicken.html` → draft with `kind: 'jsonld'`.
- [ ] Commit: `feat: recipe import script producing drafts`

### Task 5: translate script with claude-cli backend

**Files:**
- Create: `scripts/translate.ts`, `scripts/prompt.ts`
- Modify: `package.json` (add `"translate": "node scripts/translate.ts"`)

**Interfaces:**
- Consumes: draft files, `glossary/*.md`, `src/lib/taxonomy.ts`, one gold example (`src/content/recipes/kartoflusalat-med-beikoni-og-piparosti.json`).
- CLI: `npm run translate -- [--backend=claude-cli|api] [--limit=N] [--model=<m>] [drafts...]`. No draft args → all drafts lacking a corresponding recipe (resume semantics). Writes `src/content/recipes/<slug>.json`.
- `buildPrompt(draft, gold, glossaries, taxonomy): string` in `scripts/prompt.ts` — instructions + schema description + glossary texts + gold example + source material; demands raw JSON output only.
- claude-cli backend: prompt via **stdin** (Windows arg-length safety): `claude -p "Fylgdu fyrirmælunum í skjalinu á stdin. Skilaðu eingöngu hráu JSON." --model <model>` with the document piped; default model `sonnet`.
- api backend: POST `/v1/messages` with `ANTHROPIC_API_KEY`; refuse to run without the key.
- Output handling: strip accidental code fences, `JSON.parse`, write pretty. Parse failure saves the raw reply to `drafts/<slug>.reply.txt` and continues with the next draft.

- [ ] Implement; verify `--limit=1` end-to-end on the kalynskitchen draft; inspect the JSON by hand.
- [ ] Commit: `feat: glossary-driven translate script (claude -p default)`

### Task 6: recipe lint (TDD on rules)

**Files:**
- Create: `src/lib/lint.ts`, `scripts/check.ts`
- Test: `src/lib/lint.test.ts`
- Modify: `package.json` (add `"check": "node scripts/check.ts"`)

**Interfaces:**
- Produces: `lintRecipe(r: unknown): { errors: string[]; warnings: string[] }`.
- Errors: missing required fields; unit not in `UNIT_VALUES`; category/tag outside taxonomy; `{{ref}}` in a step with no matching ingredient id; English unit tokens (`cup|cups|tsp|tbsp|teaspoon|tablespoon|ounce|oz|pound|lb|grams|milliliters`) as the `unit` value or standing alone in step text.
- Warnings: `ml` amount ≥ 100 (should be dl); seasoning items (`/salt|pipar|chili|cayenne|lárviðar|múskat/i`) without `scalable: false`; item containing `kúmen` (caraway vs kúmín); step text containing digits directly adjacent to a unit word (quantities belong in `{{refs}}`).
- `scripts/check.ts` runs lintRecipe over every file in `src/content/recipes/`, prints a table, exit 1 on any error.

- [ ] Tests per rule (one passing fixture, one violating fixture each) → fail → implement → pass.
- [ ] Run `npm run check` on the 5 existing recipes — expect zero errors (fix anything it finds; the linter is right or the rule is wrong, decide explicitly).
- [ ] Commit: `feat: recipe lint enforcing unit idiom and ref integrity`

### Task 7: import the 10 fetchable sources + 3 recoveries

**Files:** `drafts/*.draft.json` (13 files)

- [ ] Run `npm run import --` for each of: whatsinthepan chicken-and-spinach, themediterraneandish italian-skillet-chicken, kalynskitchen baked-pesto-chicken, lindaben kjötbollur, ljufmeti hvítlauksbrauð (2012), ljufmeti kjúklingur-sætar-kartöflur (2013), vinotek rósakál, vinotek heilsteikt-nautasteik, eldhussogur humar, hun.is carbonara. Expected: 3 × `kind: 'jsonld'`, 7 × `kind: 'text'`.
- [ ] mbl.is (403 to curl): fetch via the in-app browser, save text draft by hand with the same shape.
- [ ] pjatt.is (dead): recover via Wayback Machine (`web.archive.org/web/2015*/pjatt.is/...`); if genuinely gone, record in docs/recipe-links.md and drop.
- [ ] gottimatinn `kju/230` (404, truncated): attempt site search / Wayback; if unresolvable, record and drop — the user may supply the full URL later.
- [ ] Commit drafts: `chore: import drafts for remaining source recipes`

### Task 8: translate all, review each, deploy

- [ ] `npm run translate -- --limit=5` × 3 sittings (resume skips done ones). After each batch: `npm run check` and read each new JSON — reviewer duties: units idiom, kúmín trap, scalable flags, refs coverage in steps, categories sensible, `improvements` honest (or absent), grilling alternatives where the source assumes outdoor grills.
- [ ] Fix what review finds (edit JSON directly; the pipeline is the draft author, not the editor of record).
- [ ] `npx vitest run && npx astro build` green; update `docs/recipe-links.md` statuses; commit recipes; push; verify live site lists ~18 recipes and spot-check two on matur.kristinn.eu.

# Matur — Icelandic Recipe PWA

**Date:** 2026-08-28
**Repo:** `github.com/kristinnthor/matur`
**Domain:** `matur.kristinn.eu`
**Status:** Approved design

## 1. Purpose

A personal Icelandic recipe site. Source recipes — mostly English-language pages collected as
links — are converted into Icelandic: translated, re-expressed in Icelandic units, adapted to
products actually available in Icelandic shops, and improved where the original is weak. The
result is published as a fast, offline-capable PWA used primarily in the kitchen, on a phone.

A later phase adds shopping-list generation: select several recipes, set servings per recipe,
get one consolidated list ordered by supermarket section.

## 2. Motivating defect

An earlier conversion of Boeuf Bourguignon produced Icelandic prose with **English units in the
structured data**:

    1 kilograms nautagúllas · 1 teaspoons salt · 0.5 teaspoons pipar · 500 milliliters rauðvín

The free-text notes in the same output were correct (`1 msk af balsamikediki`), so the failure was
specifically in the structured ingredient representation, not the translation. Correct output is:

    1 kg nautagúllas · 1 tsk salt · ½ tsk pipar · 5 dl rauðvín

Note `5 dl`, not `500 ml` — Icelandic recipes use decilitres for liquid volume.

This defect is the reason units are designed as a **tested subsystem with a canonical internal
representation**, rather than as display formatting. Everything in §5 follows from it.

## 3. Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Framework | Astro 5, static output, TypeScript | Content-heavy site; ships ~no JS by default; islands for the few interactive parts |
| Hosting | Cloudflare Pages, git integration | DNS for `kristinn.eu` already on Cloudflare |
| Adaptation policy | Improve the recipe, document what changed | Matches the approved Boeuf Bourguignon precedent |
| Translation workflow | Hybrid: 5 hand-translated first, then automated | Hand-built glossary anchors the automated pass on real examples |
| Translation backend | `claude -p` (default), API key (optional flag) | `claude -p` draws on the existing Max subscription; no API billing |
| Content storage | JSON files in git, validated by Zod | No CMS, no database, no admin UI |

## 4. Non-goals

- No user accounts, comments, ratings, or social features
- No admin/CMS UI — recipes are files, edited in git
  (**revised 2026-09-01:** an admin may edit recipe *text* from the site, but it
  commits to this repo — the files stay the only source of truth. See
  `specs/2026-09-01-admin-recipe-editing-design.md`.)
- No languages other than Icelandic
- Not a public community site; it is a personal/household site that happens to be publicly readable
- No recipe discovery or search across the internet; recipes enter only via explicitly supplied links

## 5. Units subsystem

The core of the project. Lives in `src/lib/units.ts` with unit tests.

**Supported units**

- Mass: `g`, `kg`
- Volume: `ml`, `dl`, `l`, `tsk` (5 ml), `msk` (15 ml)
- Count/informal: `stk`, `rif`, `búnt`, `dós`, `pakki`, `sneið`, `klípa`

**Rules**

1. **Canonical internal representation.** Mass normalises to grams, volume to millilitres, counts
   stay counts. All arithmetic happens in canonical units; Icelandic display units are produced
   only at render time.
2. **Display preference.** Prefer `dl` over `ml` at 100 ml and above. Prefer `kg` over `g` at
   1000 g and above. Never render `500 ml` where `5 dl` is idiomatic.
3. **Fractions.** Render `½ ¼ ¾ ⅓ ⅔` rather than decimals. Never `0.5 tsk`.
4. **Class-aware rounding on scale.** Scaling must not produce absurd precision:
   - counts snap to halves, and render as a range where sensible (`1–2 laukar`, never `1,33 laukar`)
   - mass rounds to 5 g below 100 g, 10 g above
   - spices and seasonings round generously
5. **Non-linear ingredients.** Ingredients flagged `scalable: false` do not scale. Salt, raising
   agents, and `olía til steikingar` are the common cases. Doubling a recipe must not double the
   cayenne.

## 6. Recipe data model

One JSON file per recipe under `src/content/recipes/`, validated by an Astro Content Collection
Zod schema so malformed recipes fail the build rather than render broken.

```ts
{
  slug: "boeuf-bourguignon",
  title: "Boeuf Bourguignon",
  subtitle: "franskur nautapottréttur",
  description: "Meyrt nautakjöt hægeldað í rauðvíni…",
  categories: ["kjot", "pottrettir"],
  tags: ["haegeldad", "veislumatur"],
  servings: 8,
  time: { prep: 30, cook: 180 },
  ingredients: [
    {
      id: "beikon",
      amount: 150,
      unit: "g",
      item: "beikon",
      note: "skorið í bita",
      group: null,          // or "sósa" / "deig" / "fylling"
      scalable: true
    }
  ],
  steps: [
    { text: "Steikið {{beikon}} þar til stökkt, um 5 mínútur.", refs: ["beikon"] }
  ],
  notes: {
    improvements: "Endurbætur frá upprunalegu uppskriftinni: …",
    storage: "Geymist í 3 daga í kæli, 3 mánuði í frysti.",
    variants: "Áfengislaus útgáfa: …"
  },
  source: { url: "https://…", site: "thatovenfeelin.com" },
  image: "…"
}
```

**Three load-bearing details**

- `scalable` — see §5.5. Trivial to add now, impractical to retrofit across 30+ recipes later.
- `refs` plus `{{id}}` placeholders in step text — produces the inlined quantities
  (`Steikið 150 g beikon…`) while keeping those quantities **correct under scaling**. Baking the
  numbers into step prose would silently desynchronise them from the serving scaler.
- `group` — keeps multi-component recipes (sauce / dough / filling) organised.

## 7. Categories and tags

**Categories** (one or more per recipe, primary navigation):
`Kjöt` · `Kjúklingur` · `Fiskur og sjávarréttir` · `Grænmetisréttir` · `Pasta og núðlur` ·
`Súpur og pottréttir` · `Bakstur` · `Eftirréttir` · `Morgunmatur` · `Meðlæti` · `Sósur og dressingar`

**Tags** (cross-cutting, filter only):
`fljótlegt` (under 30 min) · `hægeldað` · `veislumatur` · `barnvænt` · `frystivænt`

## 8. Shopping list

Data model built from the start; UI ships in phase 5.

- Select recipes; set servings independently per recipe
- Aggregate by normalised item name within a compatible unit class
- Group output by **supermarket section** — `Grænmeti og ávextir`, `Kjöt og fiskur`,
  `Mjólkurvörur`, `Þurrvara`, `Krydd`, `Frystivara`, `Annað` — because a list ordered by shop
  layout beats one ordered by recipe
- Items that cannot be safely merged are listed separately rather than wrongly combined
- Persisted in `localStorage`; printable; works offline

## 9. Import and translation pipeline

```
scripts/
  import.ts      # URL → fetch → schema.org/Recipe JSON-LD → structured English draft
  translate.ts   # draft → Icelandic recipe JSON, glossary-driven
glossary/
  units.md       # unit conversion rules and idiom
  products.md    # Icelandic product substitutions and availability notes
  tone.md        # register, voice, structure of notes
```

`import.ts` always records the source URL. Pages without JSON-LD are flagged for manual handling
rather than guessed at.

`translate.ts` takes a pluggable backend:

```
npm run translate -- --backend=claude-cli   # default; shells out to claude -p, uses Max plan
npm run translate -- --backend=api          # requires ANTHROPIC_API_KEY
```

Rationale: `claude -p` currently draws on the existing Claude subscription rather than API billing.
Anthropic announced a change to this for 2026-06-15 and then paused it, stating that Agent SDK and
`claude -p` usage still draw on subscription limits and that future changes will be announced. The
backend flag makes a future billing change a flag flip rather than a rewrite.

Because subscription usage limits roll on a 5-hour window, `translate.ts` supports `--limit` and
resumes rather than redoing completed work, so a 30+ recipe run can be split across sittings.

## 10. Attribution

Ingredient lists and functional instructions are not copyrightable; source prose is. Every recipe
is rewritten in Icelandic and adapted rather than copied, and every recipe page carries a visible
credit link to its original source.

## 11. Design direction

The test of a recipe site is whether it can be cooked from — on a phone, at arm's length, with wet
hands.

- **Cook mode** — full-screen, one step at a time, large type, tappable ingredient checkoff, and a
  **screen wake-lock** so the phone does not sleep mid-recipe
- **Serving scaler** pinned at the top of every recipe; the most-used control on the page
- Warm editorial tone; photography-forward index, text-forward recipe pages
- Dark mode for evening cooking
- Serif face with **verified `þ ð æ ö á í ó ú ý é` coverage** — several otherwise-suitable
  typefaces omit `þ` and `ð`, so glyph coverage is checked rather than assumed

## 12. Build order

1. **Foundation** — Astro scaffold, content schema, units module with tests, Cloudflare Pages deploy
2. **Content seed** — 5 hand-translated recipes; extract `glossary/` from them
3. **Site** — index, category pages, recipe page, cook mode, PWA/offline
4. **Pipeline** — `import.ts`, `translate.ts`, bulk conversion of the remaining recipes
5. **Shopping list** — selection UI, aggregation, store-section grouping, print

## 13. Risks

| Risk | Mitigation |
|---|---|
| Automated translation reads as generic or subtly wrong | Phase 2 glossary built from hand-done recipes anchors the prompt |
| Source pages lack JSON-LD | `import.ts` flags them for manual entry instead of guessing |
| Unit errors recur | Units are a tested module with canonical internal representation (§5) |
| Subscription usage limits interrupt a bulk run | `--limit` plus resume support |
| Ingredient aggregation merges things it should not | Merge only within a compatible unit class; list unmergeable items separately |

---

## Revision 2026-08-28: visual direction

Section 11's "warm editorial serif" direction was replaced at the user's request
("brighter and professional") with a Nordic-light system: cool off-white ground,
near-black ink, rhubarb (rabarbari) accent, Bricolage Grotesque display over
Atkinson Hyperlegible body (chosen for arm's-length kitchen legibility), and
recipe photography (Pexels-licensed, see docs/photo-credits.md). The signature
element is the living quantities: every amount, including those inlined in step
text, renders in accent type and pulses when servings change. Dark mode retained.

---

## Revision 2026-08-29: reality sync (review issue #32)

- **Hosting** is a Cloudflare **Worker with Git builds**, not classic Pages:
  `wrangler.jsonc` has `main: worker/index.ts`; static output is served via the
  assets binding and `/api/*` is handled by the worker (`run_worker_first`).
- **The "no admin UI" non-goal has one deliberate exception**: `/myndir/` and the
  per-recipe photo editor upload JPEGs through `POST /api/photo`, which commits to
  the repo via the GitHub API (passphrase-gated, secrets held as Worker secrets).
  Recipes themselves remain files edited in git; only photos have a UI path.
- **Data model drift**: recipes have no `slug` field (the filename is the id via
  the content-collection loader) and no `image` field (photos attach by filename
  convention, `photos/<slug>.jpg`).
- **Deploys are gated**: wrangler's custom build runs `npm run verify`
  (astro check + vitest + recipe lint + build); a red check blocks the deploy.

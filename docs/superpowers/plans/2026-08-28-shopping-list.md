# Shopping List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Spec §8 — pick recipes with per-recipe servings, get one aggregated shopping list grouped by supermarket section, checkable in-store, printable, offline.

**Architecture:** Selection lives in `localStorage` (`matur:list` = `{slug: servings}`; `matur:checked` = `{itemKey: true}`). Recipe pages add themselves at the scaler's current servings. A static `/innkaupalisti/` page embeds all recipes' ingredient data at build time (no fetches — offline by construction) and renders the list client-side through a pure, tested aggregation module.

**Tech Stack:** existing units module, one new pure module `src/lib/shopping.ts` (Vitest), two small client scripts.

## Global Constraints

- Merge only what is safe: same normalised item AND same unit — or same unit *class* for mass (g/kg) and pourable volume (ml/dl/l, or mixed tsk/msk with them). `rif` vs `stk` never merge (2 garlic cloves + 2 whole heads is not 4 of anything).
- Shopping quantities round **up** (you buy at least what you need): counts to whole, mass to 5 g/10 g, volume to quarter of the display unit.
- `scalable: false` amounts do not scale with servings but do sum across recipes.
- Store sections, in aisle order: Grænmeti og ávextir · Kjöt og fiskur · Mjólkurvörur og egg · Þurrvara · Krydd · Frystivara · Vínbúðin · Annað. (Vínbúðin is an addition to spec §8: wine is not sold in Icelandic supermarkets, so it is genuinely a separate shop.)
- Section rules are ordered — `hvítlauksduft` must hit Krydd before `hvítlauk` hits Grænmeti.
- All UI text Icelandic; every quantity renders through the units module.

---

### Task 1: aggregation module (TDD)

**Files:** `src/lib/shopping.ts`, test `src/lib/shopping.test.ts`

**Interfaces:**
- `SECTIONS: readonly string[]` — aisle order above.
- `sectionFor(item: string): string`
- `aggregate(selections: Record<string, number>, recipes: Record<string, RecipeData>): Section[]` where `RecipeData = { title: string; servings: number; ingredients: Ingredient[] }` and `Section = { name: string; items: { key: string; label: string; amount: string; recipes: string[] }[] }`.
- Merge key: `normalise(item) + '|' + unitGroup` where unitGroup is the exact unit for counts, `'mass'` for g/kg, `'vol'` for ml/dl/l/tsk/msk.
- Same-unit contributions keep their unit (salt tsk+tsk → tsk); mixed vol/mass go canonical and re-display; totals ceil per Global Constraints.

Key tests (fixtures shaped like real recipes): beikon 250 g + 150 g → `400 g`; ólífuolía 2 msk + 1.25 dl → `1¾ dl` (155 ml ceil to quarter-dl); hvítlaukur 2 rif and 2 stk stay two lines; egg 1 stk ×1.5 factor → `2 stk`; salt tsk unscaled by factor but summed; hvítlauksduft→Krydd, hvítlaukur→Grænmeti og ávextir, rauðvín→Vínbúðin, spaghetti→Þurrvara, unknown→Annað; item present in two recipes lists both titles.

### Task 2: list page + client script

**Files:** `src/pages/innkaupalisti.astro`, `src/scripts/list.ts`, styles in `global.css`

- Page embeds `{slug: {title, servings, ingredients}}` via `<script type="application/json" id="recipe-data">` (build-time `getCollection`), plus an empty shell.
- `list.ts`: read storage (all access try/catch), render selected recipes with − N + steppers and remove; render sections with checkboxes (`matur:checked` persists so the list survives reload in the shop); Hreinsa lista (confirm) and Prenta (window.print) buttons; Icelandic empty state pointing at the recipe pages.
- Print CSS: hide chrome/steppers/buttons; checkbox squares remain.

### Task 3: add-to-list on recipe pages + header entry

**Files:** `src/scripts/add-to-list.ts`, modify `src/components/RecipeView.astro`, `src/layouts/Base.astro`, bump `public/sw.js` to `matur-v3`

- RecipeView: secondary button beside the cook link — `Setja á innkaupalista`; reads the scaler's current `#servings` value at click time; toggles to `Á listanum — fjarlægja` when present.
- Base header: `Innkaupalisti` link with a count badge fed from localStorage (inline script, storage-event aware). Header shows everywhere except cook mode; index keeps its hero and now also shows the header.

### Task 4: verify end-to-end and ship

- Vitest green; `npm run check` clean; build.
- Browser: add carbonara (4 servings) + rósakál scaled to 6 → list shows beikon merged with both recipe names, garlic lines unmerged, wine under Vínbúðin when present; stepper changes recount; checkbox persists across reload; clear works.
- Commit, push, verify live at matur.kristinn.eu/innkaupalisti/.

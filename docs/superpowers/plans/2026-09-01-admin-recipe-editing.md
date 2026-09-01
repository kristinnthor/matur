# Admin Recipe Text Editing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An admin, signed in on the site, can rewrite any recipe's free text and have that edit land as a commit in this repo.

**Architecture:** A pure patch module (`src/lib/recipe-edit.ts`) applies a whitelisted text-only patch onto a recipe and re-derives step refs. A Worker endpoint (`worker/recipe.ts`) fetches the canonical recipe from GitHub, applies that patch, lints the result, and commits it — using a GitHub helper (`worker/github.ts`) extracted from the photo handler that already does the same dance. The role is an `ADMIN_EMAILS` Worker secret checked per request. The editor is a pre-rendered form per recipe.

**Tech Stack:** Astro 7 (static), Cloudflare Workers, TypeScript strict, Vitest, D1 (untouched by this feature).

## Global Constraints

- **Free text only.** Editable: `title`, `subtitle`, `description`, `ingredients[].item/.note/.group`, `steps[].text`, `notes.improvements/.storage/.variants`. Everything else is carried over untouched.
- **Enforcement is server-side**, by applying a field-by-field patch onto the fetched recipe — never by replacing it with a client-supplied body.
- **Recipe JSON serialises as `JSON.stringify(recipe, null, 2) + '\n'`** — matches `scripts/translate.ts:96`, which is the canonical writer.
- **All user-facing strings are Icelandic.** Error text follows the existing house voice (see `worker/account.ts`).
- **Base64 must be UTF-8-safe.** Recipe text contains þ/ð/ö/é; bare `btoa()` on a JS string throws on any code point above U+00FF.
- **Both allowlists fail closed.** An unset or empty `ADMIN_EMAILS` grants the role to nobody, exactly as `ALLOWED_EMAILS` does.
- **`npm run verify` must pass** before any commit that touches code (`astro check && vitest run && node scripts/check.ts && astro build`).
- Node 22 (`.nvmrc`). Tests live at `src/**/*.test.ts` (`vitest.config.ts`), and import `{ describe, it, expect }` from `vitest` explicitly despite `globals: true`.

---

### Task 1: Normalise recipe JSON so edits produce minimal diffs

The spec assumes every recipe file is already `JSON.stringify(r, null, 2) + '\n'`. Seven are not — they were hand-authored with compact arrays (`"categories": ["medlaeti", "graenmeti"]`, `"time": { "prep": 10, "cook": 20 }`). Editing one word in any of those would rewrite the entire file, turning a one-word fix into a ~500-line diff.

One recipe (`stracotto.json`) also stores a step's `refs` in a different order than the text produces, so re-derivation would reorder it. Nothing reads `refs` today — `RecipeView.astro:122` names it in a type annotation and uses only `s.text` — but leaving the mismatch means an unmodified round-trip is not a no-op, and Task 2's test asserts that it is.

Normalising both up front, in a commit that changes no content, keeps every later diff honest.

**Files:**
- Modify: 7 recipe JSONs under `src/content/recipes/` (formatting only)
- Modify: `src/content/recipes/stracotto.json` (one `refs` array reordered)
- Modify: `docs/superpowers/specs/2026-09-01-admin-recipe-editing-design.md`

**Interfaces:**
- Consumes: nothing
- Produces: the invariant every later task relies on — every file in `src/content/recipes/*.json` equals `JSON.stringify(JSON.parse(raw), null, 2) + '\n'`, and every `steps[].refs` equals its text's `{{\w+}}` tokens deduped in order of appearance

- [ ] **Step 1: Confirm the current state, so the change is measurable**

Run:

```bash
node --input-type=module -e '
import { readFileSync, readdirSync } from "node:fs";
const REF = /\{\{(\w+)\}\}/g;
let fmt = 0, refs = 0;
for (const f of readdirSync("src/content/recipes").filter(f => f.endsWith(".json"))) {
  const raw = readFileSync(`src/content/recipes/${f}`, "utf8");
  const r = JSON.parse(raw);
  if (raw !== JSON.stringify(r, null, 2) + "\n") { fmt++; console.log("FORMAT", f); }
  r.steps.forEach((s, i) => {
    const seen = [];
    for (const m of s.text.matchAll(REF)) if (!seen.includes(m[1])) seen.push(m[1]);
    if (JSON.stringify(seen) !== JSON.stringify(s.refs ?? [])) { refs++; console.log("REFS", f, "step", i + 1); }
  });
}
console.log(`format: ${fmt}, refs: ${refs}`);
'
```

Expected: a list of files, ending in `format: 30, refs: 1`. The count is 30 rather than 7 because 30 files are checked out with CRLF line endings; git stores all of them with LF, so only 7 differ in the repo itself. Rewriting them with LF fixes both at once.

- [ ] **Step 2: Rewrite every recipe in canonical form**

Run:

```bash
node --input-type=module -e '
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
const REF = /\{\{(\w+)\}\}/g;
for (const f of readdirSync("src/content/recipes").filter(f => f.endsWith(".json"))) {
  const p = `src/content/recipes/${f}`;
  const r = JSON.parse(readFileSync(p, "utf8"));
  for (const s of r.steps) {
    const seen = [];
    for (const m of s.text.matchAll(REF)) if (!seen.includes(m[1])) seen.push(m[1]);
    s.refs = seen;
  }
  writeFileSync(p, JSON.stringify(r, null, 2) + "\n");
}
console.log("normalised");
'
```

- [ ] **Step 3: Re-run the check — it must now be clean**

Run the Step 1 command again.
Expected: no `FORMAT` or `REFS` lines, ending in `format: 0, refs: 0`.

- [ ] **Step 4: Prove no content changed**

Run:

```bash
git diff --stat -- src/content/recipes/
```

Expected: 8 files changed (7 reformatted + `stracotto.json`). Then confirm the parsed content is identical to what git holds:

```bash
node --input-type=module -e '
import { execSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
let bad = 0;
for (const f of readdirSync("src/content/recipes").filter(f => f.endsWith(".json"))) {
  const before = JSON.parse(execSync(`git show HEAD:src/content/recipes/${f}`, { encoding: "utf8", maxBuffer: 1e8 }));
  const after = JSON.parse(readFileSync(`src/content/recipes/${f}`, "utf8"));
  // refs is the one field this task intentionally rewrites.
  before.steps.forEach((s, i) => { s.refs = after.steps[i].refs; });
  if (JSON.stringify(before) !== JSON.stringify(after)) { bad++; console.log("CONTENT CHANGED", f); }
}
console.log(bad ? `${bad} files changed content` : "content identical");
'
```

Expected: `content identical`.

- [ ] **Step 5: Run the full gate**

Run: `npm run verify`
Expected: passes — `astro check` clean, all tests pass, `All recipes clean (errors: 0)`, build succeeds.

- [ ] **Step 6: Correct the two factual errors in the spec**

In `docs/superpowers/specs/2026-09-01-admin-recipe-editing-design.md`, in §6, replace this sentence:

```
`ingredients[].group` becomes `null`, matching its schema default.
```

with:

```
`ingredients[].group` has its key **deleted**, not set to `null`. 468 of the corpus's 746
ingredients omit `group` entirely and not one stores an explicit `null`, so writing `null` on
blank would add a key to hundreds of lines on every save. An absent `group` and a `null` one are
identical to the schema, which defaults it to `null`.
```

Then in §7, after the paragraph ending "because the patch mutates an existing object rather than rebuilding one.", add:

```
This holds only because every recipe file is written in exactly that form. Seven were originally
hand-authored with compact arrays and were normalised in a separate content-only commit before
this feature shipped; `scripts/translate.ts` has always emitted the canonical form for new ones.
```

- [ ] **Step 7: Commit**

```bash
git add src/content/recipes/ docs/superpowers/specs/2026-09-01-admin-recipe-editing-design.md
git commit -m "chore(recipes): normalise JSON formatting and step refs

Seven recipes were hand-authored with compact arrays rather than the
JSON.stringify(r, null, 2) form scripts/translate.ts emits. Editing one
word in any of them from the coming admin editor would have rewritten
the whole file. One stracotto step also stored its refs in a different
order than its text produces.

No content changes: only whitespace, plus one refs array reordered to
match its own step text. Nothing reads refs today.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: The pure patch module

The heart of the feature, and the only place "free text only" is actually enforced. No I/O, no Worker globals, no GitHub — so it is fully unit-testable.

**Files:**
- Create: `src/lib/recipe-edit.ts`
- Test: `src/lib/recipe-edit.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `interface IngredientPatch { item?: string; note?: string; group?: string }`
  - `interface RecipePatch { title?: string; subtitle?: string; description?: string; ingredients?: Record<string, IngredientPatch>; steps?: string[]; notes?: { improvements?: string; storage?: string; variants?: string } }`
  - `interface Recipe` — structural, with index signatures so unknown fields survive
  - `type PatchOutcome = { ok: true; recipe: Recipe } | { ok: false; reason: 'conflict' | 'blank'; message: string }`
  - `function applyPatch(recipe: Recipe, patch: RecipePatch): PatchOutcome`
  - `function deriveRefs(text: string): string[]`
  - `function serialiseRecipe(recipe: Recipe): string`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/recipe-edit.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { applyPatch, deriveRefs, serialiseRecipe, type Recipe, type RecipePatch } from './recipe-edit';

/** A recipe shaped like the real ones, small enough to assert against whole. */
function base(): Recipe {
  return {
    title: 'Kartöflustappa með hýði',
    subtitle: 'gróf stappa með smjöri',
    description: 'Stappa þar sem hýðið fylgir með.',
    categories: ['medlaeti'],
    tags: ['fljotlegt'],
    servings: 4,
    time: { prep: 10, cook: 20 },
    ingredients: [
      { id: 'kartoflur', amount: 800, unit: 'g', item: 'litlar rauðar kartöflur', note: 'óafhýddar' },
      { id: 'smjor', amount: 57, unit: 'g', item: 'ósaltað smjör' },
      { id: 'salt', amount: 1, unit: 'tsk', item: 'salt', scalable: false },
    ],
    steps: [
      { text: 'Skolið {{kartoflur}} vel.', refs: ['kartoflur'] },
      { text: 'Bræðið {{smjor}} og saltið með {{salt}}.', refs: ['smjor', 'salt'] },
    ],
    notes: { improvements: 'Meira af kartöflum.', storage: 'Geymist í 2–3 daga.' },
    source: { url: 'https://example.com/mash', site: 'example.com' },
  } as unknown as Recipe;
}

describe('deriveRefs', () => {
  it('collects refs in order of appearance', () => {
    expect(deriveRefs('Hitið {{rjomi}} og {{smjor}}.')).toEqual(['rjomi', 'smjor']);
  });

  it('deduplicates a ref used twice', () => {
    expect(deriveRefs('{{salt}} fyrst, svo meira {{salt}}.')).toEqual(['salt']);
  });

  it('finds nothing in plain prose', () => {
    expect(deriveRefs('Sjóðið í 20 mínútur.')).toEqual([]);
  });

  it('ignores a malformed token the renderer would not resolve', () => {
    // steps.ts REF_PATTERN is /\{\{(\w+)\}\}/g — a hyphen is not \w.
    expect(deriveRefs('{{ekki-gilt}} og {{gilt}}')).toEqual(['gilt']);
  });
});

describe('applyPatch — what it changes', () => {
  it('rewrites the free text fields', () => {
    const out = applyPatch(base(), { title: 'Ný stappa', description: 'Ný lýsing.' });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.recipe.title).toBe('Ný stappa');
    expect(out.recipe.description).toBe('Ný lýsing.');
  });

  it('trims surrounding whitespace', () => {
    const out = applyPatch(base(), { title: '  Ný stappa  ' });
    expect(out.ok && out.recipe.title).toBe('Ný stappa');
  });

  it('matches ingredients by id, not by position', () => {
    const out = applyPatch(base(), { ingredients: { smjor: { item: 'saltað smjör' } } });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const ings = out.recipe.ingredients as { id: string; item: string }[];
    expect(ings.find((i) => i.id === 'smjor')!.item).toBe('saltað smjör');
    expect(ings.find((i) => i.id === 'kartoflur')!.item).toBe('litlar rauðar kartöflur');
  });

  it('skips an ingredient id the recipe no longer has', () => {
    const out = applyPatch(base(), { ingredients: { horfid: { item: 'eitthvað' } } });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.recipe.ingredients).toHaveLength(3);
  });

  it('re-derives refs when a step gains a reference', () => {
    const out = applyPatch(base(), {
      steps: ['Skolið {{kartoflur}} og {{salt}} vel.', 'Bræðið {{smjor}} og saltið með {{salt}}.'],
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const steps = out.recipe.steps as { refs: string[] }[];
    expect(steps[0]!.refs).toEqual(['kartoflur', 'salt']);
  });

  it('re-derives refs when a step loses a reference', () => {
    const out = applyPatch(base(), { steps: ['Skolið kartöflur vel.', 'Bræðið {{smjor}}.'] });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const steps = out.recipe.steps as { refs: string[] }[];
    expect(steps[0]!.refs).toEqual([]);
    expect(steps[1]!.refs).toEqual(['smjor']);
  });
});

describe('applyPatch — what it refuses to change', () => {
  it('ignores amounts, units, servings, taxonomy and source', () => {
    const patch = {
      title: 'Ný stappa',
      ingredients: { kartoflur: { item: 'nýjar kartöflur', amount: 5, unit: 'kg', scalable: false } },
      servings: 99,
      categories: ['bakstur'],
      tags: [],
      time: { prep: 0, cook: 0 },
      source: { url: 'https://evil.example', site: 'evil.example' },
    } as unknown as RecipePatch;
    const out = applyPatch(base(), patch);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const r = out.recipe as Record<string, unknown>;
    const kart = (r.ingredients as { id: string; item: string; amount: number; unit: string }[])[0]!;
    expect(kart.item).toBe('nýjar kartöflur');
    expect(kart.amount).toBe(800);
    expect(kart.unit).toBe('g');
    expect(r.servings).toBe(4);
    expect(r.categories).toEqual(['medlaeti']);
    expect(r.time).toEqual({ prep: 10, cook: 20 });
    expect(r.source).toEqual({ url: 'https://example.com/mash', site: 'example.com' });
  });

  it('never mutates the recipe it was given', () => {
    const original = base();
    const snapshot = JSON.stringify(original);
    applyPatch(original, { title: 'Annað' });
    expect(JSON.stringify(original)).toBe(snapshot);
  });
});

describe('applyPatch — blank handling', () => {
  it('deletes a blank subtitle rather than storing an empty string', () => {
    const out = applyPatch(base(), { subtitle: '   ' });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect('subtitle' in out.recipe).toBe(false);
  });

  it('deletes a blank ingredient note', () => {
    const out = applyPatch(base(), { ingredients: { kartoflur: { note: '' } } });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect('note' in (out.recipe.ingredients as object[])[0]!).toBe(false);
  });

  it('deletes a blank group key instead of writing null', () => {
    // 468 of 746 ingredients omit group entirely; writing null would add a
    // key to hundreds of lines on every save.
    const out = applyPatch(base(), { ingredients: { kartoflur: { group: '' } } });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect('group' in (out.recipe.ingredients as object[])[0]!).toBe(false);
  });

  it('sets a non-blank group', () => {
    const out = applyPatch(base(), { ingredients: { kartoflur: { group: 'Fyrir stöppuna' } } });
    expect(out.ok && (out.recipe.ingredients as { group: string }[])[0]!.group).toBe('Fyrir stöppuna');
  });

  it('deletes a blank note key from the notes block', () => {
    const out = applyPatch(base(), { notes: { storage: '' } });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect('storage' in (out.recipe.notes as object)).toBe(false);
    expect('improvements' in (out.recipe.notes as object)).toBe(true);
  });

  it('rejects a blank title', () => {
    const out = applyPatch(base(), { title: '  ' });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toBe('blank');
    expect(out.message).toContain('titill');
  });

  it('rejects a blank description', () => {
    const out = applyPatch(base(), { description: '' });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toBe('blank');
  });

  it('rejects a blank step', () => {
    const out = applyPatch(base(), { steps: ['Skolið {{kartoflur}} vel.', '   '] });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toBe('blank');
    expect(out.message).toContain('skref 2');
  });

  it('reports every blank field at once', () => {
    const out = applyPatch(base(), { title: '', description: '' });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.message).toContain('titill');
    expect(out.message).toContain('lýsing');
  });
});

describe('applyPatch — omitted versus blank', () => {
  it('leaves an omitted field untouched', () => {
    const out = applyPatch(base(), { title: 'Ný stappa' });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.recipe.subtitle).toBe('gróf stappa með smjöri');
    expect(out.recipe.description).toBe('Stappa þar sem hýðið fylgir með.');
  });

  it('leaves steps alone when the patch omits them', () => {
    const out = applyPatch(base(), { title: 'Ný stappa' });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect((out.recipe.steps as { text: string }[])[0]!.text).toBe('Skolið {{kartoflur}} vel.');
  });
});

describe('applyPatch — conflict', () => {
  it('rejects a patch built from a different number of steps', () => {
    const out = applyPatch(base(), { steps: ['Bara eitt skref.'] });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toBe('conflict');
  });
});

describe('applyPatch — hostile input', () => {
  // The patch comes off a request body, so nothing about its shape is given.
  it('ignores a steps field that is not an array', () => {
    const out = applyPatch(base(), { steps: 'ekki fylki' } as unknown as RecipePatch);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect((out.recipe.steps as { text: string }[])[0]!.text).toBe('Skolið {{kartoflur}} vel.');
  });

  it('ignores non-string field values', () => {
    const out = applyPatch(base(), { title: 42, description: null } as unknown as RecipePatch);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.recipe.title).toBe('Kartöflustappa með hýði');
    expect(out.recipe.description).toBe('Stappa þar sem hýðið fylgir með.');
  });

  it('cannot add an ingredient through an unknown id', () => {
    const out = applyPatch(base(), { ingredients: { nytt: { item: 'laumufarþegi' } } });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const ings = out.recipe.ingredients as { id: string }[];
    expect(ings.map((i) => i.id)).toEqual(['kartoflur', 'smjor', 'salt']);
  });
});

describe('serialiseRecipe', () => {
  it('round-trips an unmodified recipe byte for byte', () => {
    const recipe = base();
    const before = serialiseRecipe(recipe);
    const out = applyPatch(recipe, {
      title: recipe.title as string,
      subtitle: recipe.subtitle as string,
      description: recipe.description as string,
      steps: (recipe.steps as { text: string }[]).map((s) => s.text),
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(serialiseRecipe(out.recipe)).toBe(before);
  });

  it('emits two-space indentation and a trailing newline', () => {
    const text = serialiseRecipe(base());
    expect(text.startsWith('{\n  "title"')).toBe(true);
    expect(text.endsWith('}\n')).toBe(true);
  });

  it('preserves key order', () => {
    const out = applyPatch(base(), { title: 'Ný stappa' });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(Object.keys(out.recipe).slice(0, 4)).toEqual(['title', 'subtitle', 'description', 'categories']);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/recipe-edit.test.ts`
Expected: FAIL — `Failed to resolve import "./recipe-edit"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/recipe-edit.ts`:

```ts
/**
 * Applying an admin's text edit to a recipe.
 *
 * Pure: no I/O, no GitHub, no Worker globals. The endpoint fetches the
 * canonical recipe, hands it here with the patch and commits whatever comes
 * back — so this module is the only place "free text only" is enforced. It is
 * enforced by construction: the patch is applied field by field onto the
 * recipe, never used to replace it, so a field absent from RecipePatch cannot
 * be reached from the browser at all.
 */

/**
 * The renderer's ref grammar, copied from steps.ts REF_PATTERN. Refs must
 * describe what actually resolves at render time, so this has to stay in step
 * with the renderer rather than with the looser pattern lint uses to catch
 * malformed tokens.
 */
const REF_PATTERN = /\{\{(\w+)\}\}/g;

/** Keys of the notes block an admin may rewrite. */
const NOTE_KEYS = ['improvements', 'storage', 'variants'] as const;

export interface IngredientPatch {
  item?: string;
  note?: string;
  group?: string;
}

/**
 * A sparse patch. An absent field means "leave it alone"; a present but blank
 * field means "clear it". The two are different intentions, so the form always
 * sends every field it rendered.
 */
export interface RecipePatch {
  title?: string;
  subtitle?: string;
  description?: string;
  /** Keyed by ingredient id — never by position. */
  ingredients?: Record<string, IngredientPatch>;
  /** Every step, in order. Its length must match the recipe's. */
  steps?: string[];
  notes?: Partial<Record<(typeof NOTE_KEYS)[number], string>>;
}

interface Ingredient {
  id: string;
  item: string;
  note?: string;
  group?: string | null;
  [key: string]: unknown;
}

interface Step {
  text: string;
  refs: string[];
  [key: string]: unknown;
}

/**
 * Structural, not exhaustive. The index signature is load-bearing: it is what
 * carries amounts, units, servings, taxonomy and source through untouched.
 */
export interface Recipe {
  title: string;
  subtitle?: string;
  description: string;
  ingredients: Ingredient[];
  steps: Step[];
  notes?: Record<string, string>;
  [key: string]: unknown;
}

export type PatchOutcome =
  | { ok: true; recipe: Recipe }
  | { ok: false; reason: 'conflict' | 'blank'; message: string };

/**
 * The ingredient ids a step's text references, deduplicated and in order of
 * appearance. Derived rather than accepted from the client: a step whose text
 * and refs disagree is how live scaling silently breaks.
 */
export function deriveRefs(text: string): string[] {
  const refs: string[] = [];
  for (const match of text.matchAll(REF_PATTERN)) {
    const id = match[1]!;
    if (!refs.includes(id)) refs.push(id);
  }
  return refs;
}

/** Trimmed text, or undefined when the patch did not carry this field at all. */
function field(value: unknown): string | undefined {
  return typeof value === 'string' ? value.trim() : undefined;
}

export function applyPatch(recipe: Recipe, patch: RecipePatch): PatchOutcome {
  // Steps are matched by position because they have no ids, which is only safe
  // while the recipe's shape is unchanged. A mismatch means the recipe moved
  // under the open form — a conflict, not something to merge best-effort.
  // Array.isArray rather than a truthiness check: patch fields arrive from a
  // request body, and a `steps` that is a string would otherwise have a length
  // to compare and no forEach to call.
  const steps = Array.isArray(patch.steps) ? patch.steps : undefined;
  if (steps && steps.length !== recipe.steps.length) {
    return {
      ok: false,
      reason: 'conflict',
      message: 'Uppskriftin hefur breyst síðan síðan var opnuð. Endurhlaðið og reynið aftur.',
    };
  }

  const next = structuredClone(recipe);
  /** Required fields the patch tried to blank; collected so one save reports them all. */
  const blank: string[] = [];

  const title = field(patch.title);
  if (title !== undefined) {
    if (title) next.title = title;
    else blank.push('titill');
  }

  const description = field(patch.description);
  if (description !== undefined) {
    if (description) next.description = description;
    else blank.push('lýsing');
  }

  const subtitle = field(patch.subtitle);
  if (subtitle !== undefined) {
    if (subtitle) next.subtitle = subtitle;
    else delete next.subtitle;
  }

  if (patch.ingredients) {
    // Iterating the recipe rather than the patch is what makes an unknown id a
    // no-op instead of a way to add ingredients.
    for (const ingredient of next.ingredients) {
      const edit = patch.ingredients[ingredient.id];
      if (!edit) continue;

      const item = field(edit.item);
      if (item !== undefined) {
        if (item) ingredient.item = item;
        else blank.push(`hráefni „${ingredient.id}“`);
      }

      const note = field(edit.note);
      if (note !== undefined) {
        if (note) ingredient.note = note;
        else delete ingredient.note;
      }

      // Deleted rather than set to null: most ingredients have no group key at
      // all, and an absent group is identical to a null one to the schema.
      const group = field(edit.group);
      if (group !== undefined) {
        if (group) ingredient.group = group;
        else delete ingredient.group;
      }
    }
  }

  if (steps) {
    steps.forEach((raw, index) => {
      const text = field(raw);
      if (text === undefined) return;
      if (!text) {
        blank.push(`skref ${index + 1}`);
        return;
      }
      const step = next.steps[index]!;
      step.text = text;
      step.refs = deriveRefs(text);
    });
  }

  if (patch.notes) {
    const notes = (next.notes ??= {});
    for (const key of NOTE_KEYS) {
      const value = field(patch.notes[key]);
      if (value === undefined) continue;
      if (value) notes[key] = value;
      else delete notes[key];
    }
  }

  if (blank.length) {
    return {
      ok: false,
      reason: 'blank',
      message: `Þessir reitir mega ekki vera auðir: ${blank.join(', ')}.`,
    };
  }

  return { ok: true, recipe: next };
}

/**
 * Exactly the form scripts/translate.ts writes, so an edited file stays
 * byte-comparable with a generated one and a one-word fix is a one-line diff.
 */
export function serialiseRecipe(recipe: Recipe): string {
  return `${JSON.stringify(recipe, null, 2)}\n`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/recipe-edit.test.ts`
Expected: PASS — all tests green.

- [ ] **Step 5: Run the full gate**

Run: `npm run verify`
Expected: passes.

- [ ] **Step 6: Commit**

```bash
git add src/lib/recipe-edit.ts src/lib/recipe-edit.test.ts
git commit -m "feat(recipes): pure text-only patch module for recipe edits

Applies a whitelisted free-text patch onto a recipe and re-derives each
step's refs from its {{tokens}}. Enforcement is by construction: the
patch is applied field by field, so amounts, units, servings, taxonomy
and source cannot be reached from a request body at all.

Blank optional fields delete their key rather than storing an empty
string; blank group deletes rather than writing null, since most
ingredients carry no group key and none stores an explicit null.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: The admin role

**Files:**
- Modify: `src/lib/session.ts` (add `isAdmin`)
- Modify: `src/lib/session.test.ts` (add admin cases)
- Modify: `worker/account.ts` (`ADMIN_EMAILS` on `AccountEnv`, `isAdminUser`, `admin` on `/api/me`)
- Modify: `README.md`

**Interfaces:**
- Consumes: `parseAllowlist`, `isAllowed`, `SessionUser` from `src/lib/session.ts`; `sessionUser`, `AccountEnv` from `worker/account.ts`
- Produces:
  - `function isAdmin(email: string, admins: string[]): boolean` in `src/lib/session.ts`
  - `function isAdminUser(user: SessionUser, env: AccountEnv): boolean` in `worker/account.ts`
  - `AccountEnv` gains `ADMIN_EMAILS?: string`
  - `GET /api/me` response gains `admin: boolean`

Note the name is `isAdminUser`, not the `adminUser()` the spec's component table sketched. A helper returning `SessionUser | null` would collapse "not signed in" and "signed in without the role" into one value, and the endpoint has to answer 401 for the first and 403 for the second.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/session.test.ts`:

```ts
describe('the admin role', () => {
  it('grants the role to a listed address', () => {
    expect(isAdmin('kristinn@example.com', parseAllowlist('kristinn@example.com'))).toBe(true);
  });

  it('is case- and whitespace-insensitive, like the sign-in allowlist', () => {
    const admins = parseAllowlist(' Kristinn@Example.com , annar@example.com ');
    expect(isAdmin('  KRISTINN@example.com ', admins)).toBe(true);
  });

  it('refuses an address that is not listed', () => {
    expect(isAdmin('gestur@example.com', parseAllowlist('kristinn@example.com'))).toBe(false);
  });

  it('fails closed on an empty or unset list', () => {
    expect(isAdmin('kristinn@example.com', parseAllowlist(''))).toBe(false);
    expect(isAdmin('kristinn@example.com', parseAllowlist(undefined))).toBe(false);
    expect(isAdmin('kristinn@example.com', [])).toBe(false);
  });
});
```

Update the import at the top of the file from:

```ts
import { isAllowed, parseAllowlist, signSession, verifySession } from './session';
```

to:

```ts
import { isAdmin, isAllowed, parseAllowlist, signSession, verifySession } from './session';
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/session.test.ts`
Expected: FAIL — `isAdmin is not a function` (or an import error).

- [ ] **Step 3: Add `isAdmin`**

Append to `src/lib/session.ts`, after `isAllowed`:

```ts
/**
 * Whether an address holds the admin role, which is the right to rewrite
 * recipe text. Same fail-closed rule as the sign-in allowlist, and deliberately
 * a separate list: ALLOWED_EMAILS opens the door, ADMIN_EMAILS hands over the
 * pen, and an admin needs to be on both.
 */
export function isAdmin(email: string, admins: string[]): boolean {
  return isAllowed(email, admins);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/session.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire the role into the account API**

In `worker/account.ts`, change the import line from:

```ts
import { isAllowed, parseAllowlist, signSession, verifySession, type SessionUser } from '../src/lib/session';
```

to:

```ts
import { isAdmin, isAllowed, parseAllowlist, signSession, verifySession, type SessionUser } from '../src/lib/session';
```

Add `ADMIN_EMAILS` to `AccountEnv`:

```ts
export interface AccountEnv {
  DB?: D1Like;
  GOOGLE_CLIENT_ID?: string;
  SESSION_SECRET?: string;
  ALLOWED_EMAILS?: string;
  ADMIN_EMAILS?: string;
}
```

Add the helper immediately after the `export const sessionUser = currentUser;` line:

```ts
/**
 * Whether a signed-in user may edit recipes. Recomputed from the secret on
 * every call — the session cookie carries only who someone is, never what they
 * may do, so dropping an address from ADMIN_EMAILS takes effect on their next
 * request rather than whenever their 30-day cookie happens to expire.
 */
export function isAdminUser(user: SessionUser, env: AccountEnv): boolean {
  return isAdmin(user.email, parseAllowlist(env.ADMIN_EMAILS));
}
```

Then in the `/api/me` handler, replace:

```ts
    const user = await currentUser(req, env, now);
    return json(200, {
      enabled: true,
      signedIn: Boolean(user),
      email: user?.email ?? null,
      name: user?.name ?? null,
    });
```

with:

```ts
    const user = await currentUser(req, env, now);
    return json(200, {
      enabled: true,
      signedIn: Boolean(user),
      email: user?.email ?? null,
      name: user?.name ?? null,
      admin: user ? isAdminUser(user, env) : false,
    });
```

- [ ] **Step 6: Document the secret**

In `README.md`, in the "Accounts" section, after the `ALLOWED_EMAILS` code block and before the "**Configuration**" paragraph, insert:

```markdown
**Who may edit recipes** is the separate `ADMIN_EMAILS` secret, in the same
comma-separated form and equally fail-closed — unset means nobody:

```bash
printf 'kristinns72@gmail.com' | npx wrangler secret put ADMIN_EMAILS
```

The two lists are independent: `ALLOWED_EMAILS` grants sign-in, `ADMIN_EMAILS`
grants editing, and an admin has to be on **both**. Being an admin does not let
you in the door. The role is read fresh on every request rather than stored in
the session cookie, so removing someone takes effect immediately instead of
whenever their 30-day cookie expires.

Admins get an *Breyta texta* link on each recipe, which edits the recipe's
wording and commits it here — see `worker/recipe.ts`. Amounts, units, categories
and tags are deliberately not editable from the site: they feed the units engine
and the shopping list, and belong in a reviewed commit.
```

- [ ] **Step 7: Record that this revises the original design's non-goal**

`docs/superpowers/specs/2026-08-28-matur-recipe-pwa-design.md` §4 lists "No admin/CMS UI — recipes are files, edited in git" as a non-goal. Leaving it unqualified means the two documents contradict each other. Change that bullet to:

```markdown
- No admin/CMS UI — recipes are files, edited in git
  (**revised 2026-09-01:** an admin may edit recipe *text* from the site, but it
  commits to this repo — the files stay the only source of truth. See
  `specs/2026-09-01-admin-recipe-editing-design.md`.)
```

- [ ] **Step 8: Run the full gate**

Run: `npm run verify`
Expected: passes.

- [ ] **Step 9: Commit**

```bash
git add src/lib/session.ts src/lib/session.test.ts worker/account.ts README.md docs/superpowers/specs/2026-08-28-matur-recipe-pwa-design.md
git commit -m "feat(accounts): an admin role, from an ADMIN_EMAILS secret

Mirrors ALLOWED_EMAILS in form and in failing closed, but stays a
separate list: sign-in and editing are different grants and an admin
needs both. The role is recomputed per request rather than signed into
the session cookie, so revoking it does not wait out a 30-day token.

/api/me now reports admin, which is what lets the UI decide whether to
offer an edit affordance.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Extract the GitHub commit helper

Two endpoints now write files to this repo through the same contents API, needing the same fetch-SHA-then-PUT dance. They differ in exactly one policy decision — what to do when the SHA turns out stale — so that choice stays at the call site.

This task is a refactor: the photo endpoint must behave identically afterwards, including its retry.

**Files:**
- Create: `worker/github.ts`
- Test: `src/lib/github-base64.test.ts`
- Modify: `worker/index.ts` (photo handler uses the helper)

**Interfaces:**
- Consumes: nothing
- Produces:
  - `interface GitHubRepo { repo: string; token: string }`
  - `interface FileContent { text: string; sha: string }`
  - `interface PutResult { ok: boolean; status: number; conflict: boolean; detail: string }`
  - `function fileSha(r: GitHubRepo, path: string): Promise<string | undefined | null>` — `undefined` = no such file, `null` = GitHub failed
  - `function readFile(r: GitHubRepo, path: string): Promise<FileContent | null>`
  - `function putFile(r: GitHubRepo, path: string, contentBase64: string, message: string, sha: string | undefined): Promise<PutResult>`
  - `function toBase64(text: string): string` — UTF-8 safe
  - `function fromBase64(b64: string): string` — UTF-8 safe
  - `function commitCredit(name: string, email: string): string`

- [ ] **Step 1: Write the failing test for the base64 helpers**

The base64 pair is the part with a real bug waiting in it — recipe text is full of þ/ð/ö/é, and bare `btoa()` throws on any code point above U+00FF. It is also the only part testable without mocking `fetch`, so it is the part worth a test.

Create `src/lib/github-base64.test.ts`:

```ts
// Lives under src/ rather than beside worker/github.ts because vitest.config.ts
// only collects test files under src/. The subject is the Worker's base64 pair.
import { describe, it, expect } from 'vitest';
import { fromBase64, toBase64 } from '../../worker/github';

describe('UTF-8 safe base64', () => {
  it('round-trips Icelandic text', () => {
    const text = 'Kartöflustappa með hýði — þæfð í smjöri, 1½ dl rjómi.';
    expect(fromBase64(toBase64(text))).toBe(text);
  });

  it('encodes characters bare btoa would throw on', () => {
    // btoa('þ') throws InvalidCharacterError; this must not.
    expect(() => toBase64('þðöéÞÐÖÉ')).not.toThrow();
    expect(fromBase64(toBase64('þðöéÞÐÖÉ'))).toBe('þðöéÞÐÖÉ');
  });

  it('round-trips a whole recipe document', () => {
    const doc = JSON.stringify({ title: 'Lambaskankar', steps: [{ text: 'Brúnið {{lambaskankar}} vel.' }] }, null, 2) + '\n';
    expect(fromBase64(toBase64(doc))).toBe(doc);
  });

  it('reads base64 that GitHub has wrapped at 60 columns', () => {
    const text = 'Þetta er langur texti sem GitHub skiptir í línur þegar það skilar honum.';
    const wrapped = toBase64(text).replace(/(.{20})/g, '$1\n');
    expect(fromBase64(wrapped)).toBe(text);
  });

  it('produces ordinary base64 for ASCII', () => {
    expect(toBase64('hello')).toBe('aGVsbG8=');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/github-base64.test.ts`
Expected: FAIL — `Failed to resolve import "../../worker/github"`.

- [ ] **Step 3: Write the helper**

Create `worker/github.ts`:

```ts
/**
 * Writing files to this repo through GitHub's contents API.
 *
 * Both the photo upload and the recipe editor commit here, and both need the
 * same fetch-SHA-then-PUT dance. They differ in exactly one decision — what to
 * do when the SHA turns out stale — so that choice is left to the caller: a
 * photo refetches and retries so the newer photo wins, while a text edit
 * refuses rather than silently clobbering someone's paragraph.
 */

export interface GitHubRepo {
  /** "owner/name" */
  repo: string;
  token: string;
}

export interface FileContent {
  text: string;
  sha: string;
}

export interface PutResult {
  ok: boolean;
  status: number;
  /** The SHA was stale — someone else wrote this path first. */
  conflict: boolean;
  /** Upstream message, for the logs. Never for the client. */
  detail: string;
}

function headers(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'matur-worker',
  };
}

const contentsUrl = (r: GitHubRepo, path: string) =>
  `https://api.github.com/repos/${r.repo}/contents/${path}`;

/**
 * UTF-8 text as base64. Recipe text is full of þ/ð/ö/é and bare btoa() throws
 * on any code point above U+00FF, so the bytes have to be produced first.
 */
export function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** The inverse. GitHub wraps its base64 at 60 columns, so newlines are stripped. */
export function fromBase64(b64: string): string {
  const bytes = Uint8Array.from(atob(b64.replace(/\s+/g, '')), (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** undefined = no such file yet; null = GitHub itself failed. */
export async function fileSha(r: GitHubRepo, path: string): Promise<string | undefined | null> {
  const res = await fetch(contentsUrl(r, path), { headers: headers(r.token) });
  if (res.ok) return ((await res.json()) as { sha?: string }).sha;
  if (res.status === 404) return undefined;
  return null;
}

/** A file's current text and SHA, or null when it is missing or unreachable. */
export async function readFile(r: GitHubRepo, path: string): Promise<FileContent | null> {
  const res = await fetch(contentsUrl(r, path), { headers: headers(r.token) });
  if (!res.ok) return null;
  const body = (await res.json().catch(() => null)) as {
    content?: string;
    encoding?: string;
    sha?: string;
  } | null;
  if (!body?.content || !body.sha || body.encoding !== 'base64') return null;
  try {
    return { text: fromBase64(body.content), sha: body.sha };
  } catch {
    return null;
  }
}

/** `contentBase64` must already be base64 — use toBase64 for text. */
export async function putFile(
  r: GitHubRepo,
  path: string,
  contentBase64: string,
  message: string,
  sha: string | undefined,
): Promise<PutResult> {
  const res = await fetch(contentsUrl(r, path), {
    method: 'PUT',
    headers: { ...headers(r.token), 'content-type': 'application/json' },
    body: JSON.stringify({ message, content: contentBase64, ...(sha ? { sha } : {}) }),
  });
  if (res.ok) return { ok: true, status: res.status, conflict: false, detail: '' };
  const detail = ((await res.json().catch(() => ({}))) as { message?: string }).message ?? '';
  // A stale SHA comes back as 409, and as 422 when GitHub decides the sha field
  // itself is invalid rather than merely out of date.
  return {
    ok: false,
    status: res.status,
    conflict: res.status === 409 || res.status === 422,
    detail,
  };
}

/**
 * Who to credit in a commit message. First name only: this lands in a public
 * repo's permanent history, and an email address there can never be taken back.
 */
export function commitCredit(name: string, email: string): string {
  return name.trim().split(/\s+/)[0] || email.split('@')[0]?.trim() || 'fjölskyldunni';
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/github-base64.test.ts`
Expected: PASS.

- [ ] **Step 5: Move the photo handler onto the helper**

In `worker/index.ts`, add to the imports:

```ts
import { commitCredit, fileSha, putFile, type GitHubRepo } from './github';
```

Then in `handlePhoto`, replace everything from the `const path = ...` line down to the `return json(200, ...)` at the end of the function with:

```ts
  const path = `src/content/recipes/photos/${slug}.jpg`;
  const repo: GitHubRepo = { repo: env.GITHUB_REPO, token: env.GITHUB_TOKEN };
  // This lands in a public repo's history, so credit by first name only.
  const credit = commitCredit(uploader.name, uploader.email);
  const message = `photo: ${slug} (upphlaðin af ${credit})`;

  // Replacing an existing photo needs its current blob SHA.
  let sha = await fileSha(repo, path);
  if (sha === null) return json(502, { error: 'GitHub svaraði ekki — reyndu aftur.' });

  let put = await putFile(repo, path, data, message, sha);
  // Two uploads racing the same file: the loser's SHA is stale. Refetch once
  // and retry so the second photo wins instead of erroring. A text edit
  // deliberately does the opposite — see worker/recipe.ts.
  if (put.conflict) {
    const fresh = await fileSha(repo, path);
    if (fresh !== null) {
      sha = fresh;
      put = await putFile(repo, path, data, message, sha);
    }
  }

  if (!put.ok) {
    // Upstream details go to the logs, not to the client.
    console.error(`github put failed for ${slug}: ${put.status} ${put.detail}`);
    return json(502, { error: 'GitHub hafnaði myndinni — reyndu aftur eftir smástund.' });
  }

  return json(200, { ok: true, path, replaced: Boolean(sha) });
```

Delete the now-unused local `gh`, `fetchSha` and `putPhoto` definitions.

- [ ] **Step 6: Verify the refactor changed no behaviour**

Run: `npm run verify`
Expected: passes.

Then confirm the worker still bundles — this also proves esbuild resolves the `./taxonomy.ts` extension inside `src/lib/lint.ts`, which Task 5 depends on:

```bash
npx wrangler deploy --dry-run --outdir=.wrangler/dry-run
```

Expected: `Total Upload: … ` with no resolution errors. If it fails on a `.ts` extension, change `src/lib/lint.ts`'s import from `'./taxonomy.ts'` to `'./taxonomy'` — `scripts/check.ts` runs under Node's TS stripping, which accepts both.

- [ ] **Step 7: Commit**

```bash
git add worker/github.ts worker/index.ts src/lib/github-base64.test.ts
git commit -m "refactor(worker): extract the GitHub contents-API helper

The photo endpoint already did fetch-SHA-then-PUT-with-retry, and the
recipe editor needs the same thing with one decision reversed. Pulling
it out leaves the retry-versus-refuse choice at the call site, where it
belongs.

Adds UTF-8-safe base64 in the process: bare btoa() throws on þ/ð/ö/é,
which the coming recipe writes are full of.

No behaviour change to photo upload.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: The `/api/recipe` endpoint

**Files:**
- Create: `worker/recipe.ts`
- Modify: `worker/index.ts` (route it, extend `Env`)

**Interfaces:**
- Consumes: `applyPatch`, `serialiseRecipe`, `Recipe`, `RecipePatch` from `src/lib/recipe-edit.ts`; `lintRecipe` from `src/lib/lint.ts`; `sessionUser`, `isAdminUser`, `AccountEnv` from `worker/account.ts`; `readFile`, `putFile`, `toBase64`, `commitCredit`, `GitHubRepo` from `worker/github.ts`
- Produces:
  - `interface RecipeEnv extends AccountEnv { GITHUB_REPO: string; GITHUB_TOKEN?: string }`
  - `function handleRecipe(req: Request, env: RecipeEnv): Promise<Response>`
  - `PUT /api/recipe` accepting `{ slug: string, patch: RecipePatch }` and answering `{ ok: true, warnings: string[] }` or `{ error: string, details?: string[] }`

- [ ] **Step 1: Write the endpoint**

Create `worker/recipe.ts`:

```ts
/**
 * PUT /api/recipe — an admin rewriting a recipe's text.
 *
 * The patch is applied to the copy GitHub holds right now, never to a recipe
 * body the browser sends: the page the editor was rendered from was built at
 * deploy time and may be stale, and a whole recipe from a client is a whole
 * recipe to have to trust.
 *
 * What comes out is linted before it is committed. npm run verify gates every
 * deploy and the recipe lint is part of it, so an edit that fails the lint
 * would not merely publish a bad recipe — it would stop the site deploying at
 * all until someone fixed it by hand. Refusing here is what keeps the deploy
 * gate unreachable from a text field.
 */
import { lintRecipe } from '../src/lib/lint';
import {
  applyPatch,
  serialiseRecipe,
  type Recipe,
  type RecipePatch,
} from '../src/lib/recipe-edit';
import { isAdminUser, sessionUser, type AccountEnv } from './account';
import { commitCredit, putFile, readFile, toBase64, type GitHubRepo } from './github';

const SLUG = /^[a-z0-9-]{3,80}$/;
/** A generous ceiling on a recipe's text; the largest in the corpus is ~5 KB. */
const MAX_BYTES = 128 * 1024;

export interface RecipeEnv extends AccountEnv {
  GITHUB_REPO: string;
  GITHUB_TOKEN?: string;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

export async function handleRecipe(req: Request, env: RecipeEnv): Promise<Response> {
  if (req.method !== 'PUT') return json(405, { error: 'PUT only' });
  if (!env.GITHUB_TOKEN) {
    return json(503, {
      error: 'Breytingar eru ekki virkjaðar enn — GitHub-lykil vantar á vefþjóninn.',
    });
  }

  // 401 and 403 are different answers and the editor says different things
  // about them, so the two checks stay separate.
  const user = await sessionUser(req, env, Date.now());
  if (!user) return json(401, { error: 'Skráðu þig inn til að breyta uppskrift.' });
  if (!isAdminUser(user, env)) {
    return json(403, { error: 'Þú hefur ekki réttindi til að breyta uppskriftum.' });
  }

  const length = Number(req.headers.get('content-length') ?? '0');
  if (length > MAX_BYTES) return json(413, { error: 'Textinn er of langur.' });

  let parsed: unknown;
  try {
    parsed = await req.json();
  } catch {
    return json(400, { error: 'Ógilt beiðniform.' });
  }
  // null is valid JSON and an array is typeof 'object', so neither a bare
  // `null` body nor `patch: []` is caught by a truthiness-and-typeof check.
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return json(400, { error: 'Ógilt beiðniform.' });
  }
  const body = parsed as { slug?: unknown; patch?: unknown };

  const slug = typeof body.slug === 'string' ? body.slug : '';
  if (!SLUG.test(slug)) return json(400, { error: 'Ógilt uppskriftarheiti.' });
  if (!body.patch || typeof body.patch !== 'object' || Array.isArray(body.patch)) {
    return json(400, { error: 'Engar breytingar fylgdu.' });
  }

  const repo: GitHubRepo = { repo: env.GITHUB_REPO, token: env.GITHUB_TOKEN };
  const path = `src/content/recipes/${slug}.json`;

  const current = await readFile(repo, path);
  if (!current) return json(502, { error: 'Náði ekki í uppskriftina frá GitHub — reyndu aftur.' });

  let recipe: Recipe;
  try {
    recipe = JSON.parse(current.text) as Recipe;
  } catch {
    console.error(`unparseable recipe on github: ${path}`);
    return json(502, { error: 'Uppskriftin á GitHub er skemmd.' });
  }

  const outcome = applyPatch(recipe, body.patch as RecipePatch);
  if (!outcome.ok) {
    return json(outcome.reason === 'conflict' ? 409 : 422, { error: outcome.message });
  }

  const { errors, warnings } = lintRecipe(outcome.recipe);
  if (errors.length) {
    return json(422, { error: 'Breytingin stenst ekki yfirlestur.', details: errors });
  }

  const message = `edit: ${slug} (breytt af ${commitCredit(user.name, user.email)})`;
  const put = await putFile(
    repo,
    path,
    toBase64(serialiseRecipe(outcome.recipe)),
    message,
    current.sha,
  );

  // Unlike a photo, this does not refetch and retry. Overwriting a paragraph
  // someone else just wrote loses work that cannot be recovered from the UI.
  if (put.conflict) {
    return json(409, {
      error: 'Einhver annar breytti uppskriftinni á meðan. Endurhlaðið síðuna og reynið aftur.',
    });
  }
  if (!put.ok) {
    console.error(`github put failed for ${slug}: ${put.status} ${put.detail}`);
    return json(502, { error: 'GitHub hafnaði breytingunni — reyndu aftur eftir smástund.' });
  }

  return json(200, { ok: true, warnings });
}
```

- [ ] **Step 2: Route it**

In `worker/index.ts`, add to the imports:

```ts
import { handleRecipe } from './recipe';
```

Change the `Env` interface so the recipe endpoint's requirements are part of it:

```ts
export interface Env extends AccountEnv {
  ASSETS: Fetcher;
  GITHUB_REPO: string;
  GITHUB_TOKEN?: string;
}
```

(That is already its shape — confirm rather than change it.) Then in the default export's `fetch`, add the route:

```ts
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/api/photo') return handlePhoto(req, env);
    if (url.pathname === '/api/recipe') return handleRecipe(req, env);
    const account = await handleAccount(req, env, url);
    if (account) return account;
    return env.ASSETS.fetch(req);
  },
};
```

Update the module docblock at the top of `worker/index.ts` from:

```
 * POST /api/photo commits an uploaded JPEG to the GitHub repo (triggering the
 * normal build), authenticated by the signed-in user. /api/auth/*, /api/me,
```

to:

```
 * POST /api/photo commits an uploaded JPEG to the GitHub repo (triggering the
 * normal build), authenticated by the signed-in user. PUT /api/recipe does the
 * same for a recipe's text, for admins only — see recipe.ts. /api/auth/*, /api/me,
```

- [ ] **Step 3: Verify it typechecks and bundles**

Run: `npm run verify`
Expected: passes.

Run: `npx wrangler deploy --dry-run --outdir=.wrangler/dry-run`
Expected: bundles with no resolution errors.

- [ ] **Step 4: Check the endpoint answers correctly when signed out**

Start the worker: `npx wrangler dev` (it reads `.dev.vars`). In a second shell:

```bash
curl -s -X PUT http://localhost:8787/api/recipe -H 'content-type: application/json' -d '{"slug":"bolognese","patch":{"title":"Nýr titill"}}'
```

Expected: `{"error":"Skráðu þig inn til að breyta uppskrift."}` with status 401 — or the 503 about a missing GitHub key if `.dev.vars` has no `GITHUB_TOKEN`. Either proves the route is wired and refusing. Confirm the status with `-o /dev/null -w '%{http_code}\n'`.

```bash
curl -s -X GET http://localhost:8787/api/recipe -o /dev/null -w '%{http_code}\n'
```

Expected: `405`.

Stop `wrangler dev`.

- [ ] **Step 5: Commit**

```bash
git add worker/recipe.ts worker/index.ts
git commit -m "feat(worker): PUT /api/recipe for admin text edits

Fetches the canonical recipe from GitHub, applies the whitelisted patch
to that rather than to anything the browser sent, lints the result, and
commits it. Lint errors refuse the write: npm run verify gates every
deploy, so an edit that fails the lint would block the site from
deploying rather than merely publish a bad recipe.

A stale SHA returns 409 instead of retrying, deliberately unlike photo
upload — clobbering a paragraph someone just wrote loses work.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: The editor page and the affordance

**Files:**
- Create: `src/pages/uppskrift/[slug]/breyta.astro`
- Create: `src/scripts/recipe-edit.ts`
- Modify: `src/scripts/account-ui.ts` (set `data-admin`)
- Modify: `src/components/RecipeView.astro` (edit link)
- Modify: `src/scripts/account.ts` (`admin` on `AccountState`)
- Modify: `src/styles/global.css` (reveal under `[data-admin]`, form styles)

**Interfaces:**
- Consumes: `state` from `src/scripts/account.ts`; `RecipePatch` from `src/lib/recipe-edit.ts`; `GET /api/me`'s `admin` field; `PUT /api/recipe`
- Produces: `/uppskrift/<slug>/breyta/` for every recipe; `AccountState` gains `admin: boolean`; `<html data-admin>` when the signed-in user holds the role

- [ ] **Step 1: Carry `admin` through the client account state**

In `src/scripts/account.ts`, add the field to the interface:

```ts
export interface AccountState {
  enabled: boolean;
  signedIn: boolean;
  admin: boolean;
  email: string | null;
  name: string | null;
  personal: Personal;
}
```

Add it to the initial state:

```ts
export const state: AccountState = {
  enabled: false,
  signedIn: false,
  admin: false,
  email: null,
  name: null,
  personal: readCache(),
};
```

In `refresh()`, set it from the response:

```ts
  state.enabled = Boolean(data?.enabled);
  state.signedIn = Boolean(data?.signedIn);
  state.admin = Boolean(data?.admin);
  state.email = data?.email ?? null;
  state.name = data?.name ?? null;
```

And clear it in `signOut()`, next to the other fields:

```ts
  state.signedIn = false;
  state.admin = false;
  state.email = null;
  state.name = null;
```

- [ ] **Step 2: Expose the role to CSS**

In `src/scripts/account-ui.ts`, in `render()`, extend the existing attribute toggle:

```ts
    // Lets CSS reveal things only a signed-in person can act on, such as the
    // "vantar mynd" marker on photo-less cards, without per-element scripting.
    document.documentElement.toggleAttribute('data-signed-in', state.signedIn);
    document.documentElement.toggleAttribute('data-admin', state.admin);
```

- [ ] **Step 3: Add the edit link to the recipe page**

In `src/components/RecipeView.astro`, in the `.recipe-actions` block, add the link after the shopping-list button:

```astro
      <div class="recipe-actions">
        <a class="cook-link" href={`/uppskrift/${recipe.id}/elda/`}>Byrja að elda</a>
        <button type="button" id="add-to-list" class="list-btn" data-slug={recipe.id} data-servings={d.servings}>Setja á innkaupalista</button>
        {/* Revealed by CSS only under [data-admin]; the API is the real gate. */}
        <a class="edit-link" href={`/uppskrift/${recipe.id}/breyta/`}>Breyta texta</a>
      </div>
```

- [ ] **Step 4: Build the editor page**

Create `src/pages/uppskrift/[slug]/breyta.astro`:

```astro
---
import { getCollection } from 'astro:content';
import Base from '../../../layouts/Base.astro';
import { formatScaled, type Ingredient } from '../../../lib/units';

export async function getStaticPaths() {
  const recipes = await getCollection('recipes');
  return recipes.map((r) => ({ params: { slug: r.id }, props: { recipe: r } }));
}

const { recipe } = Astro.props;
const d = recipe.data;
const ings = d.ingredients as Ingredient[];
// Written out rather than typed inline, so the {{ }} never reaches Astro's parser.
const refExample = '{{hveiti}}';
---
<Base title={`${d.title} — breyta texta`}>
  <meta name="robots" content="noindex" slot="head" />
  <article class="wrap recipe-edit" data-slug={recipe.id}>
    <p id="edit-signedout" class="muted" hidden>
      Þú hefur ekki aðgang að þessari síðu.
      <a href={`/uppskrift/${recipe.id}/`}>Til baka í uppskriftina</a>.
    </p>

    <form id="edit-form" hidden>
      <h1>Breyta texta</h1>
      <p class="muted">
        Aðeins texti breytist hér. Magn, einingar, skammtar, flokkar og upprunaslóð eru
        óbreytt — þau stýra útreikningi og innkaupalistanum og eiga heima í yfirlesinni
        breytingu. <a href={`/uppskrift/${recipe.id}/`}>Til baka í uppskriftina</a>.
      </p>

      <label class="edit-field">
        <span>Titill</span>
        <input type="text" name="title" value={d.title} required />
      </label>
      <label class="edit-field">
        <span>Undirtitill <span class="muted">(valfrjálst)</span></span>
        <input type="text" name="subtitle" value={d.subtitle ?? ''} />
      </label>
      <label class="edit-field">
        <span>Lýsing</span>
        <textarea name="description" rows="5" required set:text={d.description} />
      </label>

      <h2>Hráefni</h2>
      <p class="muted">Magnið er sýnt til viðmiðunar og breytist ekki hér.</p>
      {ings.map((i) => (
        <fieldset class="edit-ing" data-id={i.id}>
          <legend class="muted">{formatScaled(i, 1)}</legend>
          <label class="edit-field">
            <span>Hráefni</span>
            <input type="text" name={`item:${i.id}`} value={i.item} required />
          </label>
          <label class="edit-field">
            <span>Athugasemd <span class="muted">(valfrjálst)</span></span>
            <input type="text" name={`note:${i.id}`} value={i.note ?? ''} />
          </label>
          <label class="edit-field">
            <span>Hópur <span class="muted">(valfrjálst)</span></span>
            <input type="text" name={`group:${i.id}`} value={i.group ?? ''} />
          </label>
        </fieldset>
      ))}

      <h2>Aðferð</h2>
      <p class="muted">
        {refExample} vísar í hráefni og reiknast sjálfkrafa eftir skömmtum — skrifaðu
        þau eins og þau standa. Ekki skrifa magn beint í textann.
      </p>
      {d.steps.map((s: { text: string }, n: number) => (
        <label class="edit-field edit-step">
          <span>Skref {n + 1}</span>
          <textarea name={`step:${n}`} rows="4" required set:text={s.text} />
        </label>
      ))}

      <h2>Athugasemdir</h2>
      <label class="edit-field">
        <span>Endurbætur <span class="muted">(valfrjálst)</span></span>
        <textarea name="improvements" rows="5" set:text={d.notes.improvements ?? ''} />
      </label>
      <label class="edit-field">
        <span>Geymsla <span class="muted">(valfrjálst)</span></span>
        <textarea name="storage" rows="4" set:text={d.notes.storage ?? ''} />
      </label>
      <label class="edit-field">
        <span>Tilbrigði <span class="muted">(valfrjálst)</span></span>
        <textarea name="variants" rows="4" set:text={d.notes.variants ?? ''} />
      </label>

      <div class="edit-actions">
        <button type="submit" id="edit-save" class="cook-link">Vista</button>
      </div>
      <p id="edit-status" role="status" aria-live="polite"></p>
    </form>
  </article>

  <script>
    import '../../../scripts/recipe-edit.ts';
  </script>
</Base>
```

- [ ] **Step 5: Write the client script**

Create `src/scripts/recipe-edit.ts`:

```ts
/**
 * The recipe text editor.
 *
 * The page itself is static and public — it holds nothing that is not already
 * on the recipe page — so hiding the form from non-admins is courtesy, not
 * security. PUT /api/recipe is the gate that matters.
 */
import type { RecipePatch } from '../lib/recipe-edit';
import { state } from './account';

const page = document.querySelector<HTMLElement>('.recipe-edit');
const form = document.querySelector<HTMLFormElement>('#edit-form');
const signedOut = document.querySelector<HTMLElement>('#edit-signedout');
const status = document.querySelector<HTMLElement>('#edit-status');
const save = document.querySelector<HTMLButtonElement>('#edit-save');

if (page && form && signedOut && status && save) {
  const slug = page.dataset.slug!;

  const show = () => {
    form.hidden = !state.admin;
    signedOut.hidden = state.admin;
  };
  document.addEventListener('matur:account-changed', show);
  show();

  /** A field's value by name, or '' when the input is missing. */
  const value = (name: string): string =>
    (form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | null)?.value ?? '';

  /**
   * Every rendered field is sent, blank ones included: the API reads an absent
   * field as "leave it alone" and a blank one as "clear it", so omitting blanks
   * would make clearing a subtitle impossible.
   */
  function buildPatch(): RecipePatch {
    const ingredients: RecipePatch['ingredients'] = {};
    for (const fieldset of form.querySelectorAll<HTMLElement>('.edit-ing')) {
      const id = fieldset.dataset.id!;
      ingredients[id] = {
        item: value(`item:${id}`),
        note: value(`note:${id}`),
        group: value(`group:${id}`),
      };
    }

    const steps: string[] = [];
    for (const area of form.querySelectorAll<HTMLTextAreaElement>('.edit-step textarea')) {
      steps.push(area.value);
    }

    return {
      title: value('title'),
      subtitle: value('subtitle'),
      description: value('description'),
      ingredients,
      steps,
      notes: {
        improvements: value('improvements'),
        storage: value('storage'),
        variants: value('variants'),
      },
    };
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (save.disabled) return;
    save.disabled = true;
    status.textContent = 'Vista …';

    let res: Response;
    try {
      res = await fetch('/api/recipe', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug, patch: buildPatch() }),
      });
    } catch {
      status.textContent = 'Vistun mistókst — athugaðu nettenginguna.';
      save.disabled = false;
      return;
    }

    const body = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      warnings?: string[];
      error?: string;
      details?: string[];
    };

    if (res.ok && body.ok) {
      const warnings = body.warnings?.length
        ? ` Ath.: ${body.warnings.join('; ')}`
        : '';
      // The recipe page is static and still shows the old wording until the
      // build lands, so say so rather than let it look broken.
      status.textContent = `Vistað! Breytingin fer í loftið eftir um 2 mínútur.${warnings}`;
      save.disabled = false;
      return;
    }

    const details = body.details?.length ? ` ${body.details.join('; ')}` : '';
    status.textContent = `${body.error ?? `Villa (${res.status}).`}${details}`;
    save.disabled = false;
  });
}
```

- [ ] **Step 6: Style the link and the form**

Append to `src/styles/global.css`:

```css
/* Editing recipe text is an admin's affordance. Hidden by default and revealed
   by the role, the same way .needs-photo is revealed by being signed in — the
   API is the real gate, this just keeps the button out of everyone else's way. */
.edit-link { display: none; }
[data-admin] .edit-link {
  display: inline-block;
  align-self: center;
  font-size: 0.9rem;
  text-decoration: underline;
}

.recipe-edit .edit-field {
  display: block;
  margin: 0 0 1rem;
}
.recipe-edit .edit-field > span {
  display: block;
  margin-bottom: 0.25rem;
  font-weight: 700;
}
.recipe-edit input[type='text'],
.recipe-edit textarea {
  width: 100%;
  padding: 0.5rem 0.6rem;
  font: inherit;
  border: 1px solid currentColor;
  border-radius: 0.4rem;
  background: transparent;
  color: inherit;
}
.recipe-edit textarea {
  resize: vertical;
  line-height: 1.5;
}
.recipe-edit .edit-ing {
  margin: 0 0 1rem;
  padding: 0.75rem;
  border: 1px solid rgb(0 0 0 / 0.15);
  border-radius: 0.5rem;
}
.recipe-edit .edit-ing legend {
  padding: 0 0.4rem;
  font-family: var(--font-display);
}
.recipe-edit .edit-actions {
  margin: 1.5rem 0 0.5rem;
}
```

- [ ] **Step 7: Verify the page builds and renders**

Run: `npm run verify`
Expected: passes, and the build reports one `breyta` page per recipe.

Confirm the pages exist and hold raw step source:

```bash
ls dist/uppskrift/kartoflustappa-med-hydi/
grep -c 'kartoflur' dist/uppskrift/kartoflustappa-med-hydi/breyta/index.html
```

Expected: `breyta/` is listed, and the grep finds matches — the raw `{{kartoflur}}` token, HTML-escaped, is in the textarea.

- [ ] **Step 8: Check it in the browser**

Start the dev server and load `/uppskrift/kartoflustappa-med-hydi/breyta/`.

Expected while signed out: the form is hidden and "Þú hefur ekki aðgang að þessari síðu." shows. Confirm in the console that `document.documentElement.hasAttribute('data-admin')` is `false`, and that the step textarea contains `{{kartoflur}}` rather than "800 g litlar rauðar kartöflur".

- [ ] **Step 9: Commit**

```bash
git add src/pages/uppskrift/ src/scripts/recipe-edit.ts src/scripts/account-ui.ts src/scripts/account.ts src/components/RecipeView.astro src/styles/global.css
git commit -m "feat(recipes): an editor page for recipe text

/uppskrift/<slug>/breyta/ per recipe, pre-rendered like /elda. It shows
the raw authored source — {{kartoflur}}, not the inlined 800 g — so what
you edit is what gets stored, with each ingredient's amount beside it
read-only.

The form and the recipe-page link are revealed by data-admin, mirroring
how data-signed-in reveals the missing-photo marker. Both are courtesy:
the page is static and public, and PUT /api/recipe is the real gate.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: End-to-end verification

Everything so far was verified in pieces. This task exercises the whole path against a real repo write, which is the only way to catch a bad commit message, a broken base64 round trip or a lint refusal that never fires.

**Files:**
- Modify: `.dev.vars` (local only — it is gitignored; confirm with `git check-ignore .dev.vars`)
- No committed code changes unless a defect turns up

**Interfaces:**
- Consumes: everything from Tasks 1–6
- Produces: a verified feature, and a working tree with no uncommitted changes

- [ ] **Step 1: Point the local worker at the real secrets**

Confirm `.dev.vars` is ignored before putting a token in it:

```bash
git check-ignore -v .dev.vars
```

Expected: a line naming `.gitignore`. If it prints nothing, stop — do not write a token into a tracked file.

Then ensure `.dev.vars` contains `SESSION_SECRET`, `GOOGLE_CLIENT_ID` (already a var in `wrangler.jsonc`), `ALLOWED_EMAILS=kristinns72@gmail.com`, `ADMIN_EMAILS=kristinns72@gmail.com`, and a `GITHUB_TOKEN` with contents write on this repo.

- [ ] **Step 2: Run the site and sign in**

Run: `npx wrangler dev`

Open the site, sign in with Google as `kristinns72@gmail.com`, and confirm in the console:

```js
await (await fetch('/api/me')).json()
```

Expected: `{ enabled: true, signedIn: true, admin: true, ... }`.

- [ ] **Step 3: Confirm a non-admin is refused**

Remove `ADMIN_EMAILS` from `.dev.vars`, restart `wrangler dev`, reload, and check `/api/me` again.

Expected: `admin: false`, the *Breyta texta* link is gone from the recipe page, and the editor page shows the no-access message. Then:

```js
await (await fetch('/api/recipe', {method:'PUT', headers:{'content-type':'application/json'}, body: JSON.stringify({slug:'bolognese', patch:{title:'Nei'}})})).status
```

Expected: `403` — proving the fail-closed rule holds for a signed-in non-admin. Restore `ADMIN_EMAILS` and restart.

- [ ] **Step 4: Confirm the lint gate refuses a bad edit**

On `/uppskrift/bolognese/breyta/`, change a step to reference an ingredient that does not exist — append ` Bætið {{ekkitil}} við.` to step 1 — and save.

Expected: status `422`, the message "Breytingin stenst ekki yfirlestur." followed by `step 1 references missing ingredient: ekkitil`, and **no commit on GitHub**. Confirm with `git fetch && git log origin/main --oneline -1` that nothing new landed.

Then try an English unit word: append ` Add 2 cups of water.` to a step and save.

Expected: `422` with `step N contains english unit words`, again with no commit.

- [ ] **Step 5: Confirm a blank required field is refused**

Clear the title field and save.

Expected: `422` with "Þessir reitir mega ekki vera auðir: titill." and no commit.

- [ ] **Step 6: Make a real edit and confirm the commit**

Fix a genuine wording nit in one recipe's description and save.

Expected: "Vistað! Breytingin fer í loftið eftir um 2 mínútur."

Then:

```bash
git fetch
git log origin/main --oneline -1
git show origin/main --stat
```

Expected: a commit `edit: <slug> (breytt af Kristinn)` touching exactly one file. Confirm the credit is a first name only and no email address appears:

```bash
git log origin/main -1 --format=%s%n%b | grep -c '@' || echo "no address in message"
```

Expected: `no address in message`.

- [ ] **Step 7: Confirm the diff is minimal and the Icelandic survived**

Run:

```bash
git show origin/main -- src/content/recipes/
```

Expected: a small diff — only the lines actually edited, not a reformatted file. Confirm Icelandic characters are intact (þ, ð, ö, é render correctly, not as mojibake), which is what proves the UTF-8 base64 path.

Then pull and confirm the file is still canonical:

```bash
git pull --rebase
node --input-type=module -e '
import { readFileSync } from "node:fs";
const p = process.argv[1];
const raw = readFileSync(p, "utf8");
console.log(raw.replace(/\r\n/g, "\n") === JSON.stringify(JSON.parse(raw), null, 2) + "\n" ? "canonical" : "NOT canonical");
' src/content/recipes/<slug>.json
```

Expected: `canonical`.

- [ ] **Step 8: Confirm the deploy gate still passes on the edited content**

Run: `npm run verify`
Expected: passes — which is the proof that a site-made edit cannot block a deploy.

- [ ] **Step 9: Confirm the conflict path**

With the editor page open, edit the same recipe's title directly on GitHub (or locally and push). Then save from the still-open form.

Expected: status `409` and "Einhver annar breytti uppskriftinni á meðan. Endurhlaðið síðuna og reynið aftur." — the edit is refused rather than clobbering the other change.

- [ ] **Step 10: Confirm photo upload still works**

Task 4 refactored the photo handler. Upload a photo to any recipe from the recipe page.

Expected: success, and a `photo: <slug> (upphlaðin af Kristinn)` commit on GitHub — proving the extraction preserved the retry path.

- [ ] **Step 11: Final state**

Run: `git status --short`
Expected: clean (any edits made during testing landed as commits from the site itself; `git pull --rebase` first if needed).

Stop `wrangler dev`.

---

## Handoff (user)

One step, once the branch is merged and deployed:

```bash
printf 'kristinns72@gmail.com' | npx wrangler secret put ADMIN_EMAILS
```

Until that secret exists the feature is inert on the live site: no edit link appears and `/api/recipe` refuses every request. That is the intended shipping state, matching how photo upload shipped disabled behind a missing secret.

Adding a second admin later means rewriting the whole secret — it is not additive:

```bash
printf 'kristinns72@gmail.com,annar@gmail.com' | npx wrangler secret put ADMIN_EMAILS
```

Remember that anyone listed there must also be in `ALLOWED_EMAILS`, or they cannot sign in to use it.

# Matur Foundation, Units & Site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deployed, offline-capable Icelandic recipe PWA with a tested units subsystem, a serving scaler, and a kitchen-usable cook mode.

**Architecture:** Astro 5 static site. Recipes are JSON files validated by a Zod content-collection schema at build time. All unit arithmetic runs through `src/lib/units.ts`, which stores canonical values (grams / millilitres / counts) internally and produces Icelandic display units only at render time. Interactivity is confined to two client islands: the serving scaler and cook mode.

**Tech Stack:** Astro 5, TypeScript (strict), Vitest, Cloudflare Pages.

## Global Constraints

- All user-facing text is Icelandic. No English strings in UI copy.
- Never render a decimal where a fraction exists: `½`, not `0.5`.
- Never render `ml` at or above 100 ml — use `dl`. Never render `g` at or above 1000 g — use `kg`.
- `tsk` and `msk` are never converted into `ml` for display; they stay in their authored unit.
- Ingredients with `scalable: false` never change when servings change.
- Every recipe page shows a visible credit link to `source.url`.
- Typeface must render `þ ð æ ö á í ó ú ý é`; verify before adopting.
- TypeScript `strict: true`. No `any` in `src/lib/`.

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `astro.config.mjs`, `tsconfig.json`, `vitest.config.ts`, `src/env.d.ts`
- Create: `README.md`

**Interfaces:**
- Consumes: nothing
- Produces: a buildable Astro project; `npm test` runs Vitest; `npm run build` emits `dist/`

- [ ] **Step 1: Initialise the project**

```bash
cd /c/repo/matur
npm init -y
npm install astro@^5 --save
npm install -D typescript vitest @types/node
```

- [ ] **Step 2: Write `astro.config.mjs`**

```js
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://matur.kristinn.eu',
  output: 'static',
  build: { format: 'directory' },
});
```

- [ ] **Step 3: Write `tsconfig.json`**

```json
{
  "extends": "astro/tsconfigs/strict",
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "types": ["astro/client", "vitest/globals"]
  },
  "include": ["src/**/*", "scripts/**/*"]
}
```

- [ ] **Step 4: Write `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { globals: true, include: ['src/**/*.test.ts'] },
});
```

- [ ] **Step 5: Add scripts to `package.json`**

Set the `scripts` block to:

```json
{
  "dev": "astro dev",
  "build": "astro build",
  "preview": "astro preview",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

- [ ] **Step 6: Verify the build runs**

Run: `npm run build`
Expected: build completes; `dist/` created. A warning about no pages is fine at this stage.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold Astro project with Vitest"
```

---

### Task 2: Units — canonical representation

**Files:**
- Create: `src/lib/units.ts`
- Test: `src/lib/units.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `type Unit` — the union of all supported unit strings
  - `type UnitClass = 'mass' | 'volume' | 'count'`
  - `UNITS: Record<Unit, { class: UnitClass; toCanonical: number }>`
  - `toCanonical(amount: number, unit: Unit): number`

- [ ] **Step 1: Write the failing test**

Create `src/lib/units.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { toCanonical, UNITS } from './units';

describe('toCanonical', () => {
  it('converts mass to grams', () => {
    expect(toCanonical(1, 'kg')).toBe(1000);
    expect(toCanonical(150, 'g')).toBe(150);
  });

  it('converts volume to millilitres', () => {
    expect(toCanonical(5, 'dl')).toBe(500);
    expect(toCanonical(1, 'l')).toBe(1000);
    expect(toCanonical(1, 'tsk')).toBe(5);
    expect(toCanonical(1, 'msk')).toBe(15);
  });

  it('leaves counts unchanged', () => {
    expect(toCanonical(3, 'stk')).toBe(3);
    expect(toCanonical(2, 'rif')).toBe(2);
  });

  it('classifies every unit', () => {
    for (const def of Object.values(UNITS)) {
      expect(['mass', 'volume', 'count']).toContain(def.class);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `./units`

- [ ] **Step 3: Write the implementation**

Create `src/lib/units.ts`:

```ts
export type Unit =
  | 'g' | 'kg'
  | 'ml' | 'dl' | 'l' | 'tsk' | 'msk'
  | 'stk' | 'rif' | 'búnt' | 'dós' | 'pakki' | 'sneið' | 'klípa';

export type UnitClass = 'mass' | 'volume' | 'count';

export interface UnitDef {
  class: UnitClass;
  /** Multiply an amount in this unit by this factor to get the canonical value. */
  toCanonical: number;
}

export const UNITS: Record<Unit, UnitDef> = {
  g:  { class: 'mass',   toCanonical: 1 },
  kg: { class: 'mass',   toCanonical: 1000 },

  ml:  { class: 'volume', toCanonical: 1 },
  dl:  { class: 'volume', toCanonical: 100 },
  l:   { class: 'volume', toCanonical: 1000 },
  tsk: { class: 'volume', toCanonical: 5 },
  msk: { class: 'volume', toCanonical: 15 },

  stk:    { class: 'count', toCanonical: 1 },
  rif:    { class: 'count', toCanonical: 1 },
  'búnt': { class: 'count', toCanonical: 1 },
  'dós':  { class: 'count', toCanonical: 1 },
  pakki:  { class: 'count', toCanonical: 1 },
  'sneið':{ class: 'count', toCanonical: 1 },
  'klípa':{ class: 'count', toCanonical: 1 },
};

export function toCanonical(amount: number, unit: Unit): number {
  return amount * UNITS[unit].toCanonical;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: PASS — 4 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/units.ts src/lib/units.test.ts
git commit -m "feat(units): canonical unit representation"
```

---

### Task 3: Units — Icelandic display formatting

This is the task that directly fixes the defect in spec §2.

**Files:**
- Modify: `src/lib/units.ts`
- Test: `src/lib/units.test.ts`

**Interfaces:**
- Consumes: `Unit`, `UNITS`, `toCanonical` from Task 2
- Produces:
  - `formatAmount(amount: number): string` — fractions, Icelandic decimal comma
  - `displayUnit(canonical: number, authored: Unit): { amount: number; unit: Unit }`
  - `formatIngredientAmount(amount: number, unit: Unit): string` — the combined public entry point

- [ ] **Step 1: Write the failing test**

Append to `src/lib/units.test.ts`:

```ts
import { formatAmount, displayUnit, formatIngredientAmount } from './units';

describe('formatAmount', () => {
  it('renders whole numbers plainly', () => {
    expect(formatAmount(1)).toBe('1');
    expect(formatAmount(8)).toBe('8');
  });

  it('renders fractions as glyphs, never decimals', () => {
    expect(formatAmount(0.5)).toBe('½');
    expect(formatAmount(0.25)).toBe('¼');
    expect(formatAmount(0.75)).toBe('¾');
    expect(formatAmount(1.5)).toBe('1½');
    expect(formatAmount(2.25)).toBe('2¼');
  });

  it('falls back to an Icelandic decimal comma', () => {
    expect(formatAmount(1.2)).toBe('1,2');
  });
});

describe('displayUnit', () => {
  it('promotes ml to dl at 100 and above', () => {
    expect(displayUnit(500, 'ml')).toEqual({ amount: 5, unit: 'dl' });
    expect(displayUnit(100, 'ml')).toEqual({ amount: 1, unit: 'dl' });
    expect(displayUnit(50, 'ml')).toEqual({ amount: 50, unit: 'ml' });
  });

  it('promotes g to kg at 1000 and above', () => {
    expect(displayUnit(1000, 'g')).toEqual({ amount: 1, unit: 'kg' });
    expect(displayUnit(150, 'g')).toEqual({ amount: 150, unit: 'g' });
  });

  it('never converts tsk or msk into ml', () => {
    expect(displayUnit(5, 'tsk')).toEqual({ amount: 1, unit: 'tsk' });
    expect(displayUnit(15, 'msk')).toEqual({ amount: 1, unit: 'msk' });
  });

  it('leaves count units alone', () => {
    expect(displayUnit(3, 'stk')).toEqual({ amount: 3, unit: 'stk' });
  });
});

describe('formatIngredientAmount — regression cases from spec §2', () => {
  it('renders the Boeuf Bourguignon ingredients in Icelandic', () => {
    expect(formatIngredientAmount(1, 'kg')).toBe('1 kg');
    expect(formatIngredientAmount(1, 'tsk')).toBe('1 tsk');
    expect(formatIngredientAmount(0.5, 'tsk')).toBe('½ tsk');
    expect(formatIngredientAmount(1, 'msk')).toBe('1 msk');
    expect(formatIngredientAmount(500, 'ml')).toBe('5 dl');
    expect(formatIngredientAmount(150, 'g')).toBe('150 g');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `formatAmount` is not exported

- [ ] **Step 3: Write the implementation**

Append to `src/lib/units.ts`:

```ts
const FRACTION_GLYPHS: ReadonlyArray<readonly [number, string]> = [
  [0.25, '¼'],
  [1 / 3, '⅓'],
  [0.5,  '½'],
  [2 / 3, '⅔'],
  [0.75, '¾'],
];

const EPSILON = 0.02;

/** Units that may be promoted or demoted within their own family for display. */
const DISPLAY_FAMILIES: Partial<Record<Unit, readonly Unit[]>> = {
  ml: ['ml', 'dl', 'l'],
  dl: ['ml', 'dl', 'l'],
  l:  ['ml', 'dl', 'l'],
  g:  ['g', 'kg'],
  kg: ['g', 'kg'],
};

export function formatAmount(amount: number): string {
  const whole = Math.floor(amount);
  const remainder = amount - whole;

  if (remainder < EPSILON) return String(whole);

  for (const [value, glyph] of FRACTION_GLYPHS) {
    if (Math.abs(remainder - value) < EPSILON) {
      return whole === 0 ? glyph : `${whole}${glyph}`;
    }
  }

  return amount.toFixed(1).replace('.', ',');
}

export function displayUnit(
  canonical: number,
  authored: Unit,
): { amount: number; unit: Unit } {
  const family = DISPLAY_FAMILIES[authored];

  if (!family) {
    return { amount: canonical / UNITS[authored].toCanonical, unit: authored };
  }

  // Pick the largest unit in the family that still yields a value of at least 1.
  let chosen: Unit = family[0]!;
  for (const candidate of family) {
    if (canonical / UNITS[candidate].toCanonical >= 1) chosen = candidate;
  }

  return { amount: canonical / UNITS[chosen].toCanonical, unit: chosen };
}

export function formatIngredientAmount(amount: number, unit: Unit): string {
  const canonical = toCanonical(amount, unit);
  const display = displayUnit(canonical, unit);
  return `${formatAmount(display.amount)} ${display.unit}`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: PASS — all describe blocks green, including the spec §2 regression cases

- [ ] **Step 5: Commit**

```bash
git add src/lib/units.ts src/lib/units.test.ts
git commit -m "feat(units): Icelandic display formatting with fraction glyphs"
```

---

### Task 4: Units — scaling with class-aware rounding

**Files:**
- Modify: `src/lib/units.ts`
- Test: `src/lib/units.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 2–3
- Produces:
  - `interface Ingredient { id: string; amount: number; unit: Unit; item: string; note?: string; group?: string | null; scalable: boolean }`
  - `scaleIngredient(ing: Ingredient, factor: number): Ingredient`
  - `formatScaled(ing: Ingredient, factor: number): string` — may return a range such as `1–2`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/units.test.ts`:

```ts
import { scaleIngredient, formatScaled, type Ingredient } from './units';

const ing = (over: Partial<Ingredient>): Ingredient => ({
  id: 'x', amount: 1, unit: 'stk', item: 'laukur', scalable: true, ...over,
});

describe('scaleIngredient', () => {
  it('does not scale ingredients flagged scalable: false', () => {
    const salt = ing({ amount: 1, unit: 'tsk', item: 'salt', scalable: false });
    expect(scaleIngredient(salt, 3).amount).toBe(1);
  });

  it('scales mass and rounds to 10 g above 100 g', () => {
    const beef = ing({ amount: 1, unit: 'kg', item: 'nautakjöt' });
    expect(formatScaled(beef, 0.5)).toBe('500 g');
  });

  it('scales mass and rounds to 5 g below 100 g', () => {
    const flour = ing({ amount: 40, unit: 'g', item: 'hveiti' });
    expect(formatScaled(flour, 0.5)).toBe('20 g');
  });

  it('keeps tsk and msk in their own unit when scaled', () => {
    const puree = ing({ amount: 1, unit: 'msk', item: 'tómatpúrra' });
    expect(formatScaled(puree, 2)).toBe('2 msk');
  });

  it('renders awkward counts as a range, never a decimal', () => {
    const onion = ing({ amount: 3, unit: 'stk', item: 'gulrætur' });
    expect(formatScaled(onion, 0.444)).toBe('1–2 stk');
  });

  it('keeps sub-unit counts as a fraction', () => {
    const onion = ing({ amount: 1, unit: 'stk', item: 'laukur' });
    expect(formatScaled(onion, 0.5)).toBe('½ stk');
  });

  it('leaves whole counts whole', () => {
    const clove = ing({ amount: 2, unit: 'rif', item: 'hvítlaukur' });
    expect(formatScaled(clove, 2)).toBe('4 rif');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `scaleIngredient` is not exported

- [ ] **Step 3: Write the implementation**

Append to `src/lib/units.ts`:

```ts
export interface Ingredient {
  id: string;
  amount: number;
  unit: Unit;
  item: string;
  note?: string;
  group?: string | null;
  scalable: boolean;
}

function roundToStep(value: number, step: number): number {
  return Math.round(value / step) * step;
}

/** Round a canonical value according to its unit class and authored unit. */
function roundCanonical(canonical: number, authored: Unit): number {
  const def = UNITS[authored];

  if (authored === 'tsk' || authored === 'msk') {
    // Round in the authored unit, to the nearest quarter.
    const inUnit = canonical / def.toCanonical;
    return roundToStep(inUnit, 0.25) * def.toCanonical;
  }

  if (def.class === 'count') return roundToStep(canonical, 0.5);

  return canonical < 100 ? roundToStep(canonical, 5) : roundToStep(canonical, 10);
}

export function scaleIngredient(ing: Ingredient, factor: number): Ingredient {
  if (!ing.scalable) return ing;

  const canonical = roundCanonical(toCanonical(ing.amount, ing.unit) * factor, ing.unit);
  return { ...ing, amount: canonical / UNITS[ing.unit].toCanonical };
}

export function formatScaled(ing: Ingredient, factor: number): string {
  const scaled = scaleIngredient(ing, factor);

  if (UNITS[scaled.unit].class === 'count') {
    const n = scaled.amount;
    const isWhole = Math.abs(n - Math.round(n)) < EPSILON;

    // A non-whole count of one or more reads badly as a fraction — show a range.
    if (n >= 1 && !isWhole) {
      return `${Math.floor(n)}–${Math.ceil(n)} ${scaled.unit}`;
    }
    return `${formatAmount(n)} ${scaled.unit}`;
  }

  return formatIngredientAmount(scaled.amount, scaled.unit);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: PASS — all 7 scaling tests green

- [ ] **Step 5: Commit**

```bash
git add src/lib/units.ts src/lib/units.test.ts
git commit -m "feat(units): serving scaling with class-aware rounding"
```

---

### Task 5: Content schema and the seed recipe

**Files:**
- Create: `src/content.config.ts`
- Create: `src/content/recipes/boeuf-bourguignon.json`

**Interfaces:**
- Consumes: `Unit` from Task 2
- Produces: the `recipes` collection, queryable via `getCollection('recipes')`

- [ ] **Step 1: Write `src/content.config.ts`**

```ts
import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const UNIT_VALUES = [
  'g', 'kg', 'ml', 'dl', 'l', 'tsk', 'msk',
  'stk', 'rif', 'búnt', 'dós', 'pakki', 'sneið', 'klípa',
] as const;

export const CATEGORIES = {
  kjot: 'Kjöt',
  kjuklingur: 'Kjúklingur',
  fiskur: 'Fiskur og sjávarréttir',
  graenmeti: 'Grænmetisréttir',
  pasta: 'Pasta og núðlur',
  pottrettir: 'Súpur og pottréttir',
  bakstur: 'Bakstur',
  eftirrettir: 'Eftirréttir',
  morgunmatur: 'Morgunmatur',
  medlaeti: 'Meðlæti',
  sosur: 'Sósur og dressingar',
} as const;

export const TAGS = {
  fljotlegt: 'Fljótlegt',
  haegeldad: 'Hægeldað',
  veislumatur: 'Veislumatur',
  barnvaent: 'Barnvænt',
  frystivaent: 'Frystivænt',
} as const;

const ingredient = z.object({
  id: z.string(),
  amount: z.number().positive(),
  unit: z.enum(UNIT_VALUES),
  item: z.string(),
  note: z.string().optional(),
  group: z.string().nullable().default(null),
  scalable: z.boolean().default(true),
});

const recipes = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/recipes' }),
  schema: z.object({
    title: z.string(),
    subtitle: z.string().optional(),
    description: z.string(),
    categories: z.array(z.enum(Object.keys(CATEGORIES) as [string, ...string[]])).min(1),
    tags: z.array(z.enum(Object.keys(TAGS) as [string, ...string[]])).default([]),
    servings: z.number().int().positive(),
    time: z.object({ prep: z.number().int(), cook: z.number().int() }),
    ingredients: z.array(ingredient).min(1),
    steps: z.array(z.object({
      text: z.string(),
      refs: z.array(z.string()).default([]),
    })).min(1),
    notes: z.object({
      improvements: z.string().optional(),
      storage: z.string().optional(),
      variants: z.string().optional(),
    }).default({}),
    source: z.object({ url: z.string().url(), site: z.string() }),
    image: z.string().optional(),
  }),
});

export const collections = { recipes };
```

- [ ] **Step 2: Write the seed recipe**

Create `src/content/recipes/boeuf-bourguignon.json`. Note that units are Icelandic
(`kg`, `g`, `tsk`, `msk`, `dl`) — this file is the corrected version of the defect in spec §2:

```json
{
  "title": "Boeuf Bourguignon",
  "subtitle": "franskur nautapottréttur",
  "description": "Meyrt nautakjöt hægeldað í rauðvíni með beikoni, perlulauk, gulrótum og sveppum. Klassískur franskur pottréttur sem verður jafnvel enn betri daginn eftir.",
  "categories": ["kjot", "pottrettir"],
  "tags": ["haegeldad", "veislumatur", "frystivaent"],
  "servings": 8,
  "time": { "prep": 30, "cook": 180 },
  "ingredients": [
    { "id": "naut", "amount": 1, "unit": "kg", "item": "nautagúllas", "note": "eða nautakjöt í bitum" },
    { "id": "beikon", "amount": 150, "unit": "g", "item": "beikon", "note": "skorið í bita" },
    { "id": "hveiti", "amount": 40, "unit": "g", "item": "hveiti" },
    { "id": "salt", "amount": 1, "unit": "tsk", "item": "salt", "scalable": false },
    { "id": "pipar", "amount": 0.5, "unit": "tsk", "item": "nýmalaður svartur pipar", "scalable": false },
    { "id": "smjor", "amount": 40, "unit": "g", "item": "smjör" },
    { "id": "perlulaukur", "amount": 350, "unit": "g", "item": "perlulaukur", "note": "frosinn er í lagi" },
    { "id": "gulraetur", "amount": 3, "unit": "stk", "item": "gulrætur", "note": "í 4–5 cm bitum" },
    { "id": "hvitlaukur", "amount": 2, "unit": "rif", "item": "hvítlaukur", "note": "fínsaxaður" },
    { "id": "tomatpurra", "amount": 1, "unit": "msk", "item": "tómatpúrra" },
    { "id": "raudvin", "amount": 5, "unit": "dl", "item": "rauðvín", "note": "Pinot Noir eða annað Búrgundarvín" },
    { "id": "nautasod", "amount": 2.5, "unit": "dl", "item": "nautasoð" },
    { "id": "larvidarlauf", "amount": 1, "unit": "stk", "item": "lárviðarlauf", "scalable": false },
    { "id": "timjan", "amount": 1, "unit": "tsk", "item": "ferskt timjan", "note": "lauf", "scalable": false },
    { "id": "sveppir", "amount": 250, "unit": "g", "item": "kastaníusveppir", "note": "skornir í tvennt" }
  ],
  "steps": [
    { "text": "Hitið ofninn í 160°C (undir- og yfirhiti). Rétturinn eldast hægt og rólega í ofninum.", "refs": [] },
    { "text": "Steikið {{beikon}} í stórum pottjárnspotti á miðlungshita þar til það er stökkt, um 5 mínútur. Takið beikonið upp úr en skiljið fituna eftir í pottinum.", "refs": ["beikon"] },
    { "text": "Þerrið {{naut}} vel með eldhúspappír og veltið því upp úr blöndu af {{hveiti}}, {{salt}} og {{pipar}}. Bætið {{smjor}} í pottinn og brúnið kjötið á öllum hliðum í 2–3 skömmtum – ekki troða í pottinn, annars sýður kjötið í stað þess að brúnast. Um 4–5 mínútur á skammt. Takið kjötið frá.", "refs": ["naut", "hveiti", "salt", "pipar", "smjor"] },
    { "text": "Setjið {{perlulaukur}} og {{gulraetur}} í pottinn og steikið í 4–5 mínútur þar til það fer að taka lit.", "refs": ["perlulaukur", "gulraetur"] },
    { "text": "Bætið {{hvitlaukur}} og {{tomatpurra}} út í og steikið í 1 mínútu. Hellið {{raudvin}} í pottinn og skafið vel upp allt sem hefur fest við botninn – þar liggur bragðið. Bætið {{nautasod}}, kjötinu, beikoninu, {{larvidarlauf}} og {{timjan}} út í.", "refs": ["hvitlaukur", "tomatpurra", "raudvin", "nautasod", "larvidarlauf", "timjan"] },
    { "text": "Setjið lokið á pottinn og eldið í ofninum í 2 klukkustundir.", "refs": [] },
    { "text": "Bætið {{sveppir}} út í pottinn, setjið lokið aftur á og eldið í 1 klukkustund í viðbót, þar til kjötið er lungamjúkt.", "refs": ["sveppir"] },
    { "text": "Veiðið lárviðarlaufið upp úr og smakkið til með salti og pipar. Ef sósan er of þunn má sjóða hana niður á hellu í nokkrar mínútur án loks. Berið fram með kartöflumús, soðnum kartöflum eða góðu brauði.", "refs": [] }
  ],
  "notes": {
    "improvements": "Endurbætur frá upprunalegu uppskriftinni: beikon, tómatpúrra og nautasoð gefa dýpra bragð og koma í veg fyrir að sósan verði of súr eða þurr. Kjötið er þerrað og brúnað í skömmtum svo það brúnist almennilega.",
    "storage": "Geymist í 3 daga í kæli og allt að 3 mánuði í frysti – og er oft enn betri daginn eftir.",
    "variants": "Áfengislaus útgáfa: skiptið víninu út fyrir auka nautasoð og 1 msk af balsamikediki."
  },
  "source": {
    "url": "https://thatovenfeelin.com/french-beef-bourguignon/",
    "site": "thatovenfeelin.com"
  }
}
```

- [ ] **Step 3: Verify the schema validates**

Run: `npm run build`
Expected: build succeeds; no content-collection validation errors.

- [ ] **Step 4: Verify the schema rejects a bad recipe**

Temporarily change `"unit": "kg"` on the first ingredient to `"unit": "kilograms"`, then run `npm run build`.
Expected: FAIL with an enum validation error naming `unit`. This proves the defect from spec §2 is now caught at build time. Revert the change afterwards.

- [ ] **Step 5: Commit**

```bash
git add src/content.config.ts src/content/recipes/
git commit -m "feat(content): recipe schema and Boeuf Bourguignon seed recipe"
```

---

### Task 6: Step text interpolation

**Files:**
- Create: `src/lib/steps.ts`
- Test: `src/lib/steps.test.ts`

**Interfaces:**
- Consumes: `Ingredient`, `formatScaled` from Task 4
- Produces: `renderStep(text: string, ingredients: Ingredient[], factor: number): string`

- [ ] **Step 1: Write the failing test**

Create `src/lib/steps.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { renderStep } from './steps';
import type { Ingredient } from './units';

const ingredients: Ingredient[] = [
  { id: 'beikon', amount: 150, unit: 'g', item: 'beikon', note: 'skorið í bita', scalable: true },
  { id: 'salt', amount: 1, unit: 'tsk', item: 'salt', scalable: false },
];

describe('renderStep', () => {
  it('inlines the quantity and item name', () => {
    expect(renderStep('Steikið {{beikon}} þar til stökkt.', ingredients, 1))
      .toBe('Steikið 150 g beikon þar til stökkt.');
  });

  it('reflects the scaling factor', () => {
    expect(renderStep('Steikið {{beikon}}.', ingredients, 2))
      .toBe('Steikið 300 g beikon.');
  });

  it('does not scale non-scalable ingredients', () => {
    expect(renderStep('Bætið {{salt}} út í.', ingredients, 4))
      .toBe('Bætið 1 tsk salt út í.');
  });

  it('leaves an unknown reference visible rather than silently blank', () => {
    expect(renderStep('Bætið {{vantar}} út í.', ingredients, 1))
      .toBe('Bætið {{vantar}} út í.');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `./steps`

- [ ] **Step 3: Write the implementation**

Create `src/lib/steps.ts`:

```ts
import { formatScaled, type Ingredient } from './units';

const REF_PATTERN = /\{\{(\w+)\}\}/g;

export function renderStep(
  text: string,
  ingredients: readonly Ingredient[],
  factor: number,
): string {
  return text.replace(REF_PATTERN, (match, id: string) => {
    const ing = ingredients.find((i) => i.id === id);
    // An unresolved reference stays visible so it is caught in review,
    // rather than silently vanishing from the instruction.
    if (!ing) return match;
    return `${formatScaled(ing, factor)} ${ing.item}`;
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: PASS — 4 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/steps.ts src/lib/steps.test.ts
git commit -m "feat(steps): inline scaled quantities into step text"
```

---

### Task 7: Base layout, theme and typography

**Files:**
- Create: `src/layouts/Base.astro`, `src/styles/global.css`

**Interfaces:**
- Consumes: nothing
- Produces: `Base.astro` accepting props `{ title: string; description?: string }`

- [ ] **Step 1: Verify Icelandic glyph coverage before choosing a face**

Confirm the chosen typeface renders `þ ð æ ö á í ó ú ý é`. Source Serif 4 and Newsreader both
have full Icelandic coverage on Google Fonts; several otherwise-suitable faces omit `þ` and `ð`.
Use Source Serif 4 for body and headings, with a system fallback stack.

- [ ] **Step 2: Write `src/styles/global.css`**

```css
:root {
  --bg: #faf7f2;
  --surface: #ffffff;
  --text: #1f1b16;
  --muted: #6b6259;
  --accent: #8c3b1e;
  --border: #e5ded4;
  --radius: 10px;
  --measure: 34rem;
  font-family: 'Source Serif 4', Georgia, 'Times New Roman', serif;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {
    --bg: #17140f;
    --surface: #211d17;
    --text: #f0e9df;
    --muted: #a89e92;
    --accent: #e08b62;
    --border: #332c23;
  }
}

:root[data-theme='dark'] {
  --bg: #17140f;
  --surface: #211d17;
  --text: #f0e9df;
  --muted: #a89e92;
  --accent: #e08b62;
  --border: #332c23;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-size: 1.0625rem;
  line-height: 1.6;
  -webkit-text-size-adjust: 100%;
}

h1, h2, h3 { line-height: 1.2; font-weight: 600; }
a { color: var(--accent); }

.wrap { max-width: 46rem; margin: 0 auto; padding: 1.5rem 1.25rem 4rem; }
.prose { max-width: var(--measure); }
```

- [ ] **Step 3: Write `src/layouts/Base.astro`**

```astro
---
import '../styles/global.css';
interface Props { title: string; description?: string }
const { title, description = 'Persónulegur uppskriftavefur' } = Astro.props;
---
<!doctype html>
<html lang="is">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{title}</title>
    <meta name="description" content={description} />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&display=swap"
    />
    <link rel="manifest" href="/manifest.webmanifest" />
    <meta name="theme-color" content="#8c3b1e" />
  </head>
  <body>
    <slot />
  </body>
</html>
```

- [ ] **Step 4: Verify the build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/layouts src/styles
git commit -m "feat(ui): base layout, theme tokens and Icelandic-capable typography"
```

---

### Task 8: Recipe page with serving scaler

**Files:**
- Create: `src/pages/uppskrift/[slug].astro`
- Create: `src/components/RecipeView.astro`
- Create: `src/scripts/scaler.ts`

**Interfaces:**
- Consumes: `getCollection('recipes')`, `formatScaled`, `renderStep`
- Produces: a page at `/uppskrift/<slug>/` with a working client-side serving scaler

- [ ] **Step 1: Write `src/pages/uppskrift/[slug].astro`**

```astro
---
import { getCollection, render } from 'astro:content';
import Base from '../../layouts/Base.astro';
import RecipeView from '../../components/RecipeView.astro';

export async function getStaticPaths() {
  const recipes = await getCollection('recipes');
  return recipes.map((r) => ({ params: { slug: r.id }, props: { recipe: r } }));
}

const { recipe } = Astro.props;
---
<Base title={`${recipe.data.title} — Matur`} description={recipe.data.description}>
  <RecipeView recipe={recipe} />
</Base>
```

- [ ] **Step 2: Write `src/components/RecipeView.astro`**

Render every ingredient with `data-` attributes so the client scaler can recompute without a
round trip. Server-render the factor-1 text so the page is correct with JavaScript disabled.

```astro
---
import { formatScaled, type Ingredient } from '../lib/units';
import { renderStep } from '../lib/steps';

const { recipe } = Astro.props;
const d = recipe.data;
const ings = d.ingredients as Ingredient[];
---
<article class="wrap">
  <h1>{d.title}</h1>
  {d.subtitle && <p class="muted">{d.subtitle}</p>}
  <p class="prose">{d.description}</p>

  <div class="scaler">
    <label for="servings">Skammtar</label>
    <button type="button" data-step="-1" aria-label="Fækka skömmtum">−</button>
    <output id="servings" data-base={d.servings}>{d.servings}</output>
    <button type="button" data-step="1" aria-label="Fjölga skömmtum">+</button>
  </div>

  <h2>Hráefni</h2>
  <ul class="ingredients">
    {ings.map((i) => (
      <li>
        <input type="checkbox" id={`ing-${i.id}`} />
        <label for={`ing-${i.id}`}>
          <span
            class="qty"
            data-id={i.id}
            data-amount={i.amount}
            data-unit={i.unit}
            data-item={i.item}
            data-scalable={String(i.scalable ?? true)}
          >{formatScaled(i, 1)}</span>
          {' '}{i.item}{i.note && <span class="muted">, {i.note}</span>}
        </label>
      </li>
    ))}
  </ul>

  <h2>Aðferð</h2>
  <ol class="steps">
    {d.steps.map((s: { text: string; refs: string[] }) => (
      <li data-template={s.text}>{renderStep(s.text, ings, 1)}</li>
    ))}
  </ol>

  {(d.notes.improvements || d.notes.storage || d.notes.variants) && (
    <section class="notes prose">
      <h2>Athugasemdir</h2>
      {d.notes.improvements && <p>{d.notes.improvements}</p>}
      {d.notes.storage && <p>{d.notes.storage}</p>}
      {d.notes.variants && <p>{d.notes.variants}</p>}
    </section>
  )}

  <p class="source muted">
    Byggt á uppskrift frá <a href={d.source.url} rel="noopener nofollow">{d.source.site}</a>
  </p>

  <a class="cook-link" href={`/uppskrift/${recipe.id}/elda/`}>Byrja að elda</a>
</article>

<script>
  import '../scripts/scaler.ts';
</script>
```

- [ ] **Step 3: Write `src/scripts/scaler.ts`**

```ts
import { formatScaled, type Ingredient, type Unit } from '../lib/units';
import { renderStep } from '../lib/steps';

const output = document.querySelector<HTMLOutputElement>('#servings');
if (output) {
  const base = Number(output.dataset.base);
  let servings = base;

  const qtyNodes = Array.from(document.querySelectorAll<HTMLElement>('.qty'));
  const stepNodes = Array.from(document.querySelectorAll<HTMLLIElement>('.steps li'));

  const ingredients: Ingredient[] = qtyNodes.map((n) => ({
    id: n.dataset.id!,
    amount: Number(n.dataset.amount),
    unit: n.dataset.unit as Unit,
    item: n.dataset.item!,
    scalable: n.dataset.scalable !== 'false',
  }));

  const apply = () => {
    const factor = servings / base;
    output.textContent = String(servings);

    qtyNodes.forEach((node, i) => {
      node.textContent = formatScaled(ingredients[i]!, factor);
    });

    stepNodes.forEach((node) => {
      const template = node.dataset.template;
      if (template) node.textContent = renderStep(template, ingredients, factor);
    });
  };

  document.querySelectorAll<HTMLButtonElement>('[data-step]').forEach((btn) => {
    btn.addEventListener('click', () => {
      servings = Math.max(1, servings + Number(btn.dataset.step));
      apply();
    });
  });
}
```

- [ ] **Step 4: Verify in the browser**

Run: `npm run dev`
Visit `http://localhost:4321/uppskrift/boeuf-bourguignon/`.
Expected: ingredients read `1 kg nautagúllas`, `½ tsk nýmalaður svartur pipar`, `5 dl rauðvín`.
Press `+` twice (8 → 10 servings): beef becomes `1,25 kg`, salt stays `1 tsk`, and step 2 text
updates its inlined gram figure.

- [ ] **Step 5: Commit**

```bash
git add src/pages src/components src/scripts
git commit -m "feat(recipe): recipe page with live serving scaler"
```

---

### Task 9: Index and category pages

**Files:**
- Create: `src/pages/index.astro`, `src/pages/flokkur/[flokkur].astro`
- Create: `src/components/RecipeCard.astro`

**Interfaces:**
- Consumes: `getCollection('recipes')`, `CATEGORIES` from `src/content.config.ts`
- Produces: `/` and `/flokkur/<key>/`

- [ ] **Step 1: Write `src/components/RecipeCard.astro`**

```astro
---
const { recipe } = Astro.props;
const d = recipe.data;
---
<a class="card" href={`/uppskrift/${recipe.id}/`}>
  {d.image && <img src={d.image} alt="" loading="lazy" />}
  <h3>{d.title}</h3>
  <p class="muted">{d.subtitle ?? d.description.slice(0, 90)}</p>
  <p class="meta muted">{d.time.prep + d.time.cook} mín · {d.servings} skammtar</p>
</a>
```

- [ ] **Step 2: Write `src/pages/index.astro`**

```astro
---
import { getCollection } from 'astro:content';
import Base from '../layouts/Base.astro';
import RecipeCard from '../components/RecipeCard.astro';
import { CATEGORIES } from '../content.config';

const recipes = await getCollection('recipes');
const used = new Set(recipes.flatMap((r) => r.data.categories));
---
<Base title="Matur">
  <div class="wrap">
    <h1>Matur</h1>
    <nav class="categories">
      {Object.entries(CATEGORIES)
        .filter(([key]) => used.has(key))
        .map(([key, label]) => <a href={`/flokkur/${key}/`}>{label}</a>)}
    </nav>
    <div class="grid">
      {recipes.map((r) => <RecipeCard recipe={r} />)}
    </div>
  </div>
</Base>
```

- [ ] **Step 3: Write `src/pages/flokkur/[flokkur].astro`**

```astro
---
import { getCollection } from 'astro:content';
import Base from '../../layouts/Base.astro';
import RecipeCard from '../../components/RecipeCard.astro';
import { CATEGORIES } from '../../content.config';

export async function getStaticPaths() {
  const recipes = await getCollection('recipes');
  return Object.keys(CATEGORIES).map((key) => ({
    params: { flokkur: key },
    props: { recipes: recipes.filter((r) => r.data.categories.includes(key)), key },
  }));
}

const { recipes, key } = Astro.props;
const label = CATEGORIES[key as keyof typeof CATEGORIES];
---
<Base title={`${label} — Matur`}>
  <div class="wrap">
    <p><a href="/">← Allar uppskriftir</a></p>
    <h1>{label}</h1>
    {recipes.length === 0
      ? <p class="muted">Engar uppskriftir í þessum flokki enn.</p>
      : <div class="grid">{recipes.map((r) => <RecipeCard recipe={r} />)}</div>}
  </div>
</Base>
```

- [ ] **Step 4: Verify the build**

Run: `npm run build`
Expected: `dist/index.html` plus one directory per category exist.

- [ ] **Step 5: Commit**

```bash
git add src/pages src/components
git commit -m "feat(nav): index and category pages"
```

---

### Task 10: Cook mode

**Files:**
- Create: `src/pages/uppskrift/[slug]/elda.astro`
- Create: `src/scripts/cook.ts`

**Interfaces:**
- Consumes: the recipe collection, `renderStep`
- Produces: `/uppskrift/<slug>/elda/` — full-screen stepper with wake lock

- [ ] **Step 1: Write `src/pages/uppskrift/[slug]/elda.astro`**

```astro
---
import { getCollection } from 'astro:content';
import Base from '../../../layouts/Base.astro';
import { renderStep } from '../../../lib/steps';
import type { Ingredient } from '../../../lib/units';

export async function getStaticPaths() {
  const recipes = await getCollection('recipes');
  return recipes.map((r) => ({ params: { slug: r.id }, props: { recipe: r } }));
}

const { recipe } = Astro.props;
const d = recipe.data;
const ings = d.ingredients as Ingredient[];
---
<Base title={`${d.title} — elda`}>
  <main class="cook">
    <header>
      <a href={`/uppskrift/${recipe.id}/`}>← Til baka</a>
      <span class="counter"><span id="current">1</span> / {d.steps.length}</span>
    </header>

    {d.steps.map((s: { text: string }, i: number) => (
      <section class="step" data-index={i} hidden={i !== 0}>
        <p>{renderStep(s.text, ings, 1)}</p>
      </section>
    ))}

    <nav class="cook-nav">
      <button type="button" id="prev">Fyrra</button>
      <button type="button" id="next">Næsta</button>
    </nav>
  </main>
</Base>

<script>
  import '../../../scripts/cook.ts';
</script>
```

- [ ] **Step 2: Write `src/scripts/cook.ts`**

```ts
const steps = Array.from(document.querySelectorAll<HTMLElement>('.step'));
const current = document.querySelector<HTMLElement>('#current');
let index = 0;

const show = (n: number) => {
  index = Math.min(Math.max(n, 0), steps.length - 1);
  steps.forEach((s, i) => { s.hidden = i !== index; });
  if (current) current.textContent = String(index + 1);
};

document.querySelector('#next')?.addEventListener('click', () => show(index + 1));
document.querySelector('#prev')?.addEventListener('click', () => show(index - 1));

document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight') show(index + 1);
  if (e.key === 'ArrowLeft') show(index - 1);
});

// Keep the screen awake while cooking. Unsupported browsers simply skip this.
let lock: WakeLockSentinel | null = null;

const acquire = async () => {
  try {
    if ('wakeLock' in navigator) {
      lock = await navigator.wakeLock.request('screen');
    }
  } catch {
    // Denied or unsupported — cooking still works, the screen just sleeps.
  }
};

void acquire();

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && lock === null) void acquire();
});
```

- [ ] **Step 3: Verify in the browser**

Run: `npm run dev`
Visit `http://localhost:4321/uppskrift/boeuf-bourguignon/elda/`.
Expected: one step visible at a time; `Næsta` advances and the counter increments; arrow keys work.

- [ ] **Step 4: Commit**

```bash
git add src/pages/uppskrift src/scripts/cook.ts
git commit -m "feat(cook): full-screen cook mode with screen wake lock"
```

---

### Task 11: PWA — manifest, icons and offline

**Files:**
- Create: `public/manifest.webmanifest`, `public/icons/icon-192.png`, `public/icons/icon-512.png`
- Create: `public/sw.js`
- Modify: `src/layouts/Base.astro`

**Interfaces:**
- Consumes: the built `dist/` output
- Produces: an installable, offline-capable PWA

- [ ] **Step 1: Write `public/manifest.webmanifest`**

```json
{
  "name": "Matur",
  "short_name": "Matur",
  "description": "Persónulegur uppskriftavefur",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#faf7f2",
  "theme_color": "#8c3b1e",
  "lang": "is",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```

- [ ] **Step 2: Write `public/sw.js`**

Cache-first for navigations so recipes open offline; network-first would fail in a kitchen
with poor signal, which is the exact case this exists for.

```js
const CACHE = 'matur-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/', '/manifest.webmanifest'])));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
          return response;
        })
        .catch(() => cached ?? Response.error());
      return cached ?? network;
    }),
  );
});
```

- [ ] **Step 3: Register the service worker in `src/layouts/Base.astro`**

Add before `</body>`:

```astro
<script is:inline>
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js'));
  }
</script>
```

- [ ] **Step 4: Generate the icons**

Create two PNG icons (192×192 and 512×512) at `public/icons/`. A plain `M` mark on the
`#8c3b1e` accent colour is sufficient; the maskable variant needs ~10% safe-area padding.

- [ ] **Step 5: Verify offline behaviour**

Run: `npm run build && npm run preview`
In DevTools → Application, confirm the manifest parses and the service worker activates.
Load a recipe, then set Network to Offline and reload.
Expected: the recipe still renders.

- [ ] **Step 6: Commit**

```bash
git add public src/layouts/Base.astro
git commit -m "feat(pwa): manifest, icons and offline service worker"
```

---

### Task 12: Deploy to Cloudflare Pages

**Files:**
- Create: `docs/DEPLOY.md`

**Interfaces:**
- Consumes: the full build
- Produces: a live site at `matur.kristinn.eu`

- [ ] **Step 1: Push the branch**

```bash
git push origin main
```

- [ ] **Step 2: Create the Pages project**

In the Cloudflare dashboard: Workers & Pages → Create → Pages → Connect to Git →
select `kristinnthor/matur`. Build command `npm run build`, output directory `dist`,
framework preset Astro.

- [ ] **Step 3: Add the custom domain**

In the Pages project: Custom domains → Set up a custom domain → `matur.kristinn.eu`.
Because `kristinn.eu` is already on Cloudflare, the CNAME is created automatically.

- [ ] **Step 4: Verify the deployment**

Visit `https://matur.kristinn.eu/uppskrift/boeuf-bourguignon/`.
Expected: the recipe renders, HTTPS is valid, and the site is installable on mobile.

- [ ] **Step 5: Write `docs/DEPLOY.md`**

Record the project name, build command, output directory, and custom-domain steps above so the
setup is reproducible.

- [ ] **Step 6: Commit**

```bash
git add docs/DEPLOY.md
git commit -m "docs: Cloudflare Pages deployment notes"
git push origin main
```

---

## Deferred to later plans

- **Phase 4 — import and translation pipeline** (`scripts/import.ts`, `scripts/translate.ts`,
  `glossary/`). Blocked on the recipe links.
- **Phase 5 — shopping list.** Selection UI, cross-recipe aggregation, supermarket-section
  grouping, print stylesheet.
- **Remaining seed recipes.** Four more hand-translated recipes to complete the phase 2 content
  seed and provide enough material to extract `glossary/` from.

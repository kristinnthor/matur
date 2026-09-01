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

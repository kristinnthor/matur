/** Project-rule lint for recipe JSON — rules the Zod schema cannot express. */
import { CATEGORIES, TAGS, UNIT_VALUES } from './taxonomy.ts';

export interface LintResult {
  errors: string[];
  warnings: string[];
}

const ENGLISH_UNITS = /\b(cups?|tsp|tbsp|teaspoons?|tablespoons?|ounces?|oz|pounds?|lbs?|grams?|milliliters?)\b/i;
const SEASONING = /salt\b|pipar|chili|cayenne|lárviðar|múskat/i;
/** A number immediately followed by an Icelandic unit token inside step prose. */
const INLINE_QTY = /\d+\s?(g|kg|dl|ml|tsk|msk)\b/;

interface Ing {
  id?: unknown;
  amount?: unknown;
  unit?: unknown;
  item?: unknown;
  scalable?: unknown;
}

export function lintRecipe(r: unknown): LintResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const rec = (r ?? {}) as Record<string, unknown>;

  for (const field of ['title', 'description', 'servings', 'time', 'ingredients', 'steps', 'source']) {
    if (rec[field] === undefined) errors.push(`missing required field: ${field}`);
  }

  const cats = Array.isArray(rec.categories) ? rec.categories : [];
  if (cats.length === 0) errors.push('no categories');
  for (const c of cats) {
    if (!(c in CATEGORIES)) errors.push(`unknown category: ${c}`);
  }
  for (const t of Array.isArray(rec.tags) ? rec.tags : []) {
    if (!(t in TAGS)) errors.push(`unknown tag: ${t}`);
  }

  const ings = (Array.isArray(rec.ingredients) ? rec.ingredients : []) as Ing[];
  const ids = new Set<string>();
  for (const i of ings) {
    const label = String(i.id ?? i.item ?? '?');
    if (typeof i.id === 'string') {
      if (ids.has(i.id)) errors.push(`duplicate ingredient id: ${i.id}`);
      ids.add(i.id);
    } else {
      errors.push(`ingredient missing id: ${label}`);
    }
    if (typeof i.amount !== 'number' || i.amount <= 0) errors.push(`bad amount on ${label}`);
    if (!UNIT_VALUES.includes(i.unit as (typeof UNIT_VALUES)[number])) {
      errors.push(`bad unit on ${label}: ${String(i.unit)}`);
    }
    if (i.unit === 'ml' && typeof i.amount === 'number' && i.amount >= 100) {
      warnings.push(`${label}: ${i.amount} ml should be authored in dl`);
    }
    if (typeof i.item === 'string' && SEASONING.test(i.item) && i.scalable !== false) {
      warnings.push(`${label}: seasoning without scalable: false`);
    }
    if (typeof i.item === 'string' && /kúmen\b/i.test(i.item)) {
      warnings.push(`${label}: 'kúmen' is caraway — did you mean kúmín (cumin)?`);
    }
  }

  const steps = (Array.isArray(rec.steps) ? rec.steps : []) as { text?: unknown }[];
  steps.forEach((s, n) => {
    const text = typeof s.text === 'string' ? s.text : '';
    for (const m of text.matchAll(/\{\{(\w+)\}\}/g)) {
      if (!ids.has(m[1]!)) errors.push(`step ${n + 1} references missing ingredient: ${m[1]}`);
    }
    if (ENGLISH_UNITS.test(text)) errors.push(`step ${n + 1} contains english unit words`);
    if (INLINE_QTY.test(text)) {
      warnings.push(`step ${n + 1} has a literal quantity in prose — use {{refs}}`);
    }
  });

  return { errors, warnings };
}

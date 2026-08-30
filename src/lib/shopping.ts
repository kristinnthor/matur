/** Shopping-list aggregation — pure. Spec §8 plus the Vínbúðin reality. */
import { UNITS, formatAmount, skammtar, toCanonical, type Ingredient, type Unit } from './units';

export interface RecipeData {
  title: string;
  servings: number;
  ingredients: Ingredient[];
}

export interface ShoppingItem {
  key: string;
  label: string;
  amount: string;
  recipes: string[];
}

export interface Section {
  name: string;
  items: ShoppingItem[];
}

/** Aisle order. */
export const SECTIONS = [
  'Grænmeti og ávextir',
  'Kjöt og fiskur',
  'Mjólkurvörur og egg',
  'Þurrvara',
  'Krydd',
  'Frystivara',
  'Vínbúðin',
  'Annað',
] as const;

/** Ordered rules — first match wins, so powders beat their fresh namesakes. */
const SECTION_RULES: ReadonlyArray<readonly [RegExp, (typeof SECTIONS)[number]]> = [
  [/frosi|frysti/i, 'Frystivara'],
  [/vín\b|rauðvín|hvítvín/i, 'Vínbúðin'],
  [/duft|þurrkað|þurrkuð|kryddblanda|chiliflög|kanil|kúmín|kóríanderfræ|múskat|lárviðar|paprikukrydd|reykt paprika|salt\b|flögusalt|\bpipar\b|kraftur|teningur|oregano þurrk/i, 'Krydd'],
  [/kjúkling|naut|lamb|beikon|hakk|humar|pancetta|rækj|fisk|kjöt/i, 'Kjöt og fiskur'],
  [/rjómi|rjóma|smjör|ost(ur|i|a)?\b|parmesan|mozzarella|feta|egg\b|majónes|sýrður|jógúrt|mascarpone|piparost/i, 'Mjólkurvörur og egg'],
  [/lauk|kartafl|kartöfl|svepp|spínat|tómat|gulræt|sítrón|epli|rósakál|basilík|steinselj|mynt|oregano|timjan|salví|rósmarín|chili|fennel|klettasalat|blaðlauk|sæt|avókadó|paprika\b/i, 'Grænmeti og ávextir'],
  [/hveiti|sykur|spaghetti|pasta|núðl|hrísgrjón|kex|\bger\b|síróp|edik|olía|olífu|ólífu|pestó|tómatpúrr|sinnep|worcestershire|sósa|hnet|trönuber|eplamauk|orzo|bygg|linsu|baun/i, 'Þurrvara'],
];

export function sectionFor(item: string): string {
  for (const [pattern, section] of SECTION_RULES) {
    if (pattern.test(item)) return section;
  }
  return 'Annað';
}

const normalise = (item: string) => item.toLowerCase().trim();

/** Merge group: exact unit for counts and same-unit runs; class pools for mass and volume. */
function unitGroup(unit: Unit): string {
  const cls = UNITS[unit].class;
  return cls === 'count' ? `count:${unit}` : cls;
}

function ceilToStep(value: number, step: number): number {
  return Math.ceil(value / step - 1e-9) * step;
}

/** Format a summed total, rounding UP into something you can buy. */
function formatTotal(canonical: number, units: Set<Unit>): string {
  const [only] = units;
  if (units.size === 1 && UNITS[only!].class === 'count') {
    return `${formatAmount(ceilToStep(canonical, 1))} ${only}`;
  }
  if (units.size === 1 && (only === 'tsk' || only === 'msk')) {
    const inUnit = ceilToStep(canonical / UNITS[only!].toCanonical, 0.25);
    return `${formatAmount(inUnit)} ${only}`;
  }
  const cls = UNITS[only!].class;
  if (cls === 'mass') {
    const grams = canonical < 100 ? ceilToStep(canonical, 5) : ceilToStep(canonical, 10);
    // At a kilo and above, ceil in the display unit too - formatAmount rounds
    // to nearest, which would quietly under-report what to buy.
    if (grams >= 1000) return `${formatAmount(ceilToStep(grams / 1000, 0.25))} kg`;
    return `${grams} g`;
  }
  // Pourable volume: choose the display unit for the magnitude, ceil to its quarter.
  const unit: Unit = canonical >= 1000 ? 'l' : canonical >= 100 ? 'dl' : 'ml';
  if (unit === 'ml') return `${ceilToStep(canonical, 5)} ml`;
  const inUnit = ceilToStep(canonical / UNITS[unit].toCanonical, 0.25);
  return `${formatAmount(inUnit)} ${unit}`;
}

export function aggregate(
  selections: Record<string, number>,
  recipes: Record<string, RecipeData>,
): Section[] {
  interface Bucket {
    label: string;
    canonical: number;
    units: Set<Unit>;
    recipes: Set<string>;
  }
  const buckets = new Map<string, Bucket>();

  for (const [slug, servings] of Object.entries(selections)) {
    const recipe = recipes[slug];
    if (!recipe) continue;
    const factor = servings / recipe.servings;

    for (const i of recipe.ingredients) {
      const amount = i.scalable === false ? i.amount : i.amount * factor;
      const key = `${normalise(i.item)}|${unitGroup(i.unit)}`;
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { label: i.item, canonical: 0, units: new Set(), recipes: new Set() };
        buckets.set(key, bucket);
      }
      bucket.canonical += toCanonical(amount, i.unit);
      bucket.units.add(i.unit);
      bucket.recipes.add(recipe.title);
    }
  }

  const bySection = new Map<string, ShoppingItem[]>();
  for (const [key, b] of buckets) {
    const section = sectionFor(b.label);
    const item: ShoppingItem = {
      key,
      label: b.label,
      amount: formatTotal(b.canonical, b.units),
      recipes: [...b.recipes],
    };
    const list = bySection.get(section);
    if (list) list.push(item);
    else bySection.set(section, [item]);
  }

  return SECTIONS.filter((s) => bySection.has(s)).map((name) => ({
    name,
    items: bySection.get(name)!.sort((a, b) => a.label.localeCompare(b.label, 'is')),
  }));
}

export interface ListRecipeLine {
  title: string;
  servings: number;
}

/**
 * Render the list as plain text for sharing — the aisle order and totals are
 * exactly what the page shows, so what arrives in someone's messages matches
 * what the sender is looking at. Ticked-off items are included: the recipient
 * has not ticked anything, and a list missing half its items is a trap.
 */
export function formatListText(sections: Section[], recipes: ListRecipeLine[] = []): string {
  const lines: string[] = ['Innkaupalisti — Matur'];

  if (recipes.length > 0) {
    lines.push('');
    for (const r of recipes) lines.push(`${r.title} (${r.servings} ${skammtar(r.servings)})`);
  }

  for (const section of sections) {
    lines.push('', section.name.toUpperCase());
    for (const item of section.items) lines.push(`- ${item.amount} ${item.label}`);
  }

  return lines.join('\n');
}

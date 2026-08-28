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

  stk:     { class: 'count', toCanonical: 1 },
  rif:     { class: 'count', toCanonical: 1 },
  'búnt':  { class: 'count', toCanonical: 1 },
  'dós':   { class: 'count', toCanonical: 1 },
  pakki:   { class: 'count', toCanonical: 1 },
  'sneið': { class: 'count', toCanonical: 1 },
  'klípa': { class: 'count', toCanonical: 1 },
};

export function toCanonical(amount: number, unit: Unit): number {
  return amount * UNITS[unit].toCanonical;
}

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

  if (def.class === 'count') return roundToStep(canonical, 0.5);

  // Round in the unit the amount will actually be displayed in, so the result
  // lands on something a cook can measure: 6¼ dl, not 6,3 dl.
  const display = displayUnit(canonical, authored);
  const displayDef = UNITS[display.unit];

  if (displayDef.class === 'volume') {
    // Millilitres are read as whole numbers; larger volume units as quarters.
    if (display.unit === 'ml') return roundToStep(canonical, 5);
    return roundToStep(display.amount, 0.25) * displayDef.toCanonical;
  }

  // Mass is weighed in grams whether it displays as g or kg.
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

    // A non-whole count of one or more reads badly as a fraction - show a range.
    if (n >= 1 && !isWhole) {
      return `${Math.floor(n)}–${Math.ceil(n)} ${scaled.unit}`;
    }
    return `${formatAmount(n)} ${scaled.unit}`;
  }

  return formatIngredientAmount(scaled.amount, scaled.unit);
}

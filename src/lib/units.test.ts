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

describe('formatIngredientAmount - regression cases from spec section 2', () => {
  it('renders the Boeuf Bourguignon ingredients in Icelandic', () => {
    expect(formatIngredientAmount(1, 'kg')).toBe('1 kg');
    expect(formatIngredientAmount(1, 'tsk')).toBe('1 tsk');
    expect(formatIngredientAmount(0.5, 'tsk')).toBe('½ tsk');
    expect(formatIngredientAmount(1, 'msk')).toBe('1 msk');
    expect(formatIngredientAmount(500, 'ml')).toBe('5 dl');
    expect(formatIngredientAmount(150, 'g')).toBe('150 g');
  });
});

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
    const beef = ing({ amount: 1, unit: 'kg', item: 'nautakjot' });
    expect(formatScaled(beef, 0.5)).toBe('500 g');
  });

  it('scales mass and rounds to 5 g below 100 g', () => {
    const flour = ing({ amount: 40, unit: 'g', item: 'hveiti' });
    expect(formatScaled(flour, 0.5)).toBe('20 g');
  });

  it('keeps tsk and msk in their own unit when scaled', () => {
    const puree = ing({ amount: 1, unit: 'msk', item: 'tomatpurra' });
    expect(formatScaled(puree, 2)).toBe('2 msk');
  });

  it('renders awkward counts as a range, never a decimal', () => {
    const carrots = ing({ amount: 3, unit: 'stk', item: 'gulraetur' });
    expect(formatScaled(carrots, 0.444)).toBe('1–2 stk');
  });

  it('keeps sub-unit counts as a fraction', () => {
    const onion = ing({ amount: 1, unit: 'stk', item: 'laukur' });
    expect(formatScaled(onion, 0.5)).toBe('½ stk');
  });

  it('leaves whole counts whole', () => {
    const clove = ing({ amount: 2, unit: 'rif', item: 'hvitlaukur' });
    expect(formatScaled(clove, 2)).toBe('4 rif');
  });
});

describe('scaling rounds to measurable quantities in the display unit', () => {
  it('rounds decilitres to quarters, not to an unmeasurable decimal', () => {
    const wine = ing({ amount: 5, unit: 'dl', item: 'raudvin' });
    // 5 dl scaled by 1.25 is 6.25 dl - must read as 6¼ dl, never 6,3 dl.
    expect(formatScaled(wine, 1.25)).toBe('6¼ dl');
  });

  it('rounds a half-decilitre base cleanly', () => {
    const stock = ing({ amount: 2.5, unit: 'dl', item: 'nautasod' });
    expect(formatScaled(stock, 1.25)).toBe('3¼ dl');
  });

  it('leaves unscaled decilitres untouched', () => {
    const wine = ing({ amount: 5, unit: 'dl', item: 'raudvin' });
    expect(formatScaled(wine, 1)).toBe('5 dl');
    const stock = ing({ amount: 2.5, unit: 'dl', item: 'nautasod' });
    expect(formatScaled(stock, 1)).toBe('2½ dl');
  });

  it('still uses millilitres below 100 ml', () => {
    const cream = ing({ amount: 60, unit: 'ml', item: 'rjomi' });
    expect(formatScaled(cream, 1.25)).toBe('75 ml');
  });
});

describe('scaling is identity at factor 1 and never rounds to zero (issue #2)', () => {
  it('leaves tiny authored amounts untouched at factor 1', () => {
    expect(formatScaled(ing({ amount: 2, unit: 'g', item: 'ger' }), 1)).toBe('2 g');
    expect(formatScaled(ing({ amount: 2, unit: 'ml', item: 'dropar' }), 1)).toBe('2 ml');
  });

  it('clamps counts to a half instead of zero', () => {
    expect(formatScaled(ing({ amount: 1, unit: 'stk', item: 'chili' }), 0.125)).toBe('½ stk');
    expect(formatScaled(ing({ amount: 1, unit: 'búnt', item: 'steinselja' }), 0.125)).toBe('½ búnt');
  });

  it('clamps mass and spoon volumes to their smallest step', () => {
    expect(formatScaled(ing({ amount: 5, unit: 'g', item: 'x' }), 0.4)).toBe('5 g');
    expect(formatScaled(ing({ amount: 1, unit: 'tsk', item: 'x' }), 0.1)).toBe('¼ tsk');
    expect(formatScaled(ing({ amount: 2, unit: 'ml', item: 'x' }), 0.5)).toBe('2 ml');
  });
});

describe('review follow-ups on the zero-clamp and identity path', () => {
  it('clamp never exceeds the authored amount when scaling down', () => {
    expect(formatScaled(ing({ amount: 0.25, unit: 'stk', item: 'raudlaukur' }), 0.5)).toBe('¼ stk');
    expect(formatScaled(ing({ amount: 2, unit: 'g', item: 'x' }), 0.25)).toBe('2 g');
  });

  it('identity path keeps the authored unit instead of promoting to a decimal', () => {
    expect(formatScaled(ing({ amount: 13, unit: 'dl', item: 'hveiti' }), 1)).toBe('13 dl');
  });
});

import { skammtar } from './units';

describe('skammtar plural', () => {
  it('uses singular for numbers ending in 1 except 11', () => {
    expect(skammtar(1)).toBe('skammtur');
    expect(skammtar(21)).toBe('skammtur');
    expect(skammtar(11)).toBe('skammtar');
    expect(skammtar(4)).toBe('skammtar');
  });
});

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

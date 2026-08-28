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

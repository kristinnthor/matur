import { describe, it, expect } from 'vitest';
import { renderStep } from './steps';
import type { Ingredient } from './units';

const ingredients: Ingredient[] = [
  { id: 'beikon', amount: 150, unit: 'g', item: 'beikon', note: 'skorid i bita', scalable: true },
  { id: 'salt', amount: 1, unit: 'tsk', item: 'salt', scalable: false },
];

describe('renderStep', () => {
  it('inlines the quantity and item name', () => {
    expect(renderStep('Steikid {{beikon}} thar til stokkt.', ingredients, 1))
      .toBe('Steikid 150 g beikon thar til stokkt.');
  });

  it('reflects the scaling factor', () => {
    expect(renderStep('Steikid {{beikon}}.', ingredients, 2))
      .toBe('Steikid 300 g beikon.');
  });

  it('does not scale non-scalable ingredients', () => {
    expect(renderStep('Baetid {{salt}} ut i.', ingredients, 4))
      .toBe('Baetid 1 tsk salt ut i.');
  });

  it('leaves an unknown reference visible rather than silently blank', () => {
    expect(renderStep('Baetid {{vantar}} ut i.', ingredients, 1))
      .toBe('Baetid {{vantar}} ut i.');
  });
});

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

import { renderStepHtml } from './steps';

describe('renderStepHtml', () => {
  it('wraps the quantity in a span and leaves the item as text', () => {
    expect(renderStepHtml('Steikid {{beikon}} vel.', ingredients, 1))
      .toBe('Steikid <span class="qty-i">150 g</span> beikon vel.');
  });

  it('escapes HTML in the base text', () => {
    expect(renderStepHtml('Hitid ofninn <b>vel</b> & lengi.', ingredients, 1))
      .toBe('Hitid ofninn &lt;b&gt;vel&lt;/b&gt; &amp; lengi.');
  });

  it('escapes HTML in ingredient names', () => {
    const evil = [{ id: 'x', amount: 1, unit: 'stk' as const, item: '<img>', scalable: true }];
    expect(renderStepHtml('Notid {{x}}.', evil, 1))
      .toBe('Notid <span class="qty-i">1 stk</span> &lt;img&gt;.');
  });

  it('keeps unknown references visible as literal text', () => {
    expect(renderStepHtml('Baetid {{vantar}} vid.', ingredients, 1))
      .toBe('Baetid {{vantar}} vid.');
  });

  it('reflects scaling in the wrapped quantity', () => {
    expect(renderStepHtml('Steikid {{beikon}}.', ingredients, 2))
      .toBe('Steikid <span class="qty-i">300 g</span> beikon.');
  });
});

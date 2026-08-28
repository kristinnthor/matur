import { describe, it, expect } from 'vitest';
import { lintRecipe } from './lint';

const valid = {
  title: 'Prufa',
  description: 'Lýsing.',
  categories: ['kjot'],
  tags: ['fljotlegt'],
  servings: 4,
  time: { prep: 10, cook: 20 },
  ingredients: [
    { id: 'naut', amount: 1, unit: 'kg', item: 'nautakjöt' },
    { id: 'salt', amount: 1, unit: 'tsk', item: 'salt', scalable: false },
  ],
  steps: [{ text: 'Steikið {{naut}} og saltið með {{salt}}.', refs: ['naut', 'salt'] }],
  notes: {},
  source: { url: 'https://example.com/x', site: 'example.com' },
};

const withIngredient = (ing: object) => ({
  ...valid,
  ingredients: [...valid.ingredients, ing],
});

describe('lintRecipe errors', () => {
  it('accepts a valid recipe', () => {
    const r = lintRecipe(valid);
    expect(r.errors).toEqual([]);
  });

  it('rejects units outside the enum', () => {
    const r = lintRecipe(withIngredient({ id: 'x', amount: 1, unit: 'cup', item: 'hveiti' }));
    expect(r.errors.join()).toMatch(/unit/);
  });

  it('rejects unknown categories and tags', () => {
    expect(lintRecipe({ ...valid, categories: ['dessert'] }).errors.join()).toMatch(/categor/);
    expect(lintRecipe({ ...valid, tags: ['quick'] }).errors.join()).toMatch(/tag/);
  });

  it('rejects steps referencing missing ingredient ids', () => {
    const r = lintRecipe({
      ...valid,
      steps: [{ text: 'Bætið {{vantar}} út í.', refs: ['vantar'] }],
    });
    expect(r.errors.join()).toMatch(/vantar/);
  });

  it('rejects english unit words in step text', () => {
    const r = lintRecipe({
      ...valid,
      steps: [{ text: 'Add 2 cups of flour and stir.', refs: [] }],
    });
    expect(r.errors.join()).toMatch(/english/i);
  });
});

describe('lintRecipe warnings', () => {
  it('warns on ml amounts at or above 100', () => {
    const r = lintRecipe(withIngredient({ id: 'v', amount: 250, unit: 'ml', item: 'vatn' }));
    expect(r.warnings.join()).toMatch(/dl/);
  });

  it('warns on seasoning without scalable:false', () => {
    const r = lintRecipe(withIngredient({ id: 'p', amount: 1, unit: 'tsk', item: 'svartur pipar' }));
    expect(r.warnings.join()).toMatch(/scalable/);
  });

  it('does not flag piparostur as seasoning', () => {
    const r = lintRecipe(withIngredient({ id: 'po', amount: 150, unit: 'g', item: 'piparostur' }));
    expect(r.warnings.join()).not.toMatch(/scalable/);
  });

  it('warns on kúmen (caraway) as a likely cumin mistranslation', () => {
    const r = lintRecipe(withIngredient({ id: 'k', amount: 1, unit: 'tsk', item: 'kúmen', scalable: false }));
    expect(r.warnings.join()).toMatch(/kúmín/);
  });

  it('warns on literal quantities glued to units in step text', () => {
    const r = lintRecipe({
      ...valid,
      steps: [{ text: 'Bætið 150 g af hveiti út í.', refs: [] }],
    });
    expect(r.warnings.join()).toMatch(/quantit/i);
  });
});

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

describe('issue #4: ref integrity for non-ASCII and malformed ids', () => {
  it('errors on ingredient ids outside the safe charset', () => {
    const r = lintRecipe(withIngredient({ id: 'hvítlaukur', amount: 1, unit: 'rif', item: 'hvítlaukur' }));
    expect(r.errors.join()).toMatch(/id/);
  });

  it('errors on ref tokens that the renderer cannot resolve', () => {
    const r = lintRecipe({
      ...valid,
      steps: [{ text: 'Notið {{olifu-olia}} og {{beikon }}.', refs: [] }],
    });
    expect(r.errors.length).toBeGreaterThanOrEqual(2);
  });
});

describe('issue #5: fresh chili is produce, not seasoning', () => {
  it('does not flag a whole fresh chili', () => {
    const r = lintRecipe(withIngredient({ id: 'c', amount: 1, unit: 'stk', item: 'rauður chilipipar' }));
    expect(r.warnings.join()).not.toMatch(/scalable/);
  });

  it('still flags chili flakes and powders', () => {
    const r = lintRecipe(withIngredient({ id: 'cf', amount: 1, unit: 'tsk', item: 'chiliflögur' }));
    expect(r.warnings.join()).toMatch(/scalable/);
  });
});

describe('issue #6: taxonomy checks ignore the prototype chain', () => {
  it('rejects prototype-chain names as categories and tags', () => {
    expect(lintRecipe({ ...valid, categories: ['toString'] }).errors.join()).toMatch(/categor/);
    expect(lintRecipe({ ...valid, tags: ['constructor'] }).errors.join()).toMatch(/tag/);
  });
});

describe('notes that scaling would invalidate', () => {
  it('warns when a note restates the whole amount', () => {
    const r = lintRecipe(withIngredient({ id: 'hveiti', amount: 600, unit: 'g', item: 'hveiti', note: 'um 10 dl' }));
    expect(r.warnings.some((w) => w.includes('scaling will invalidate'))).toBe(true);
  });

  it('allows a per-unit note, which stays true at any serving count', () => {
    const r = lintRecipe(withIngredient({ id: 'tomatar', amount: 2, unit: 'dós', item: 'niðursoðnir tómatar', note: 'hver dós 400 g' }));
    expect(r.warnings.some((w) => w.includes('scaling will invalidate'))).toBe(false);
  });

  it('allows a per-person note', () => {
    const r = lintRecipe(withIngredient({ id: 'steik', amount: 2, unit: 'kg', item: 'nautasteik', note: '400–500 g á mann' }));
    expect(r.warnings.some((w) => w.includes('scaling will invalidate'))).toBe(false);
  });

  it('ignores non-scalable ingredients, which never change', () => {
    const r = lintRecipe(withIngredient({ id: 'ger', amount: 15, unit: 'g', item: 'þurrger', note: 'eða 50 g pressuger', scalable: false }));
    expect(r.warnings.some((w) => w.includes('scaling will invalidate'))).toBe(false);
  });
});

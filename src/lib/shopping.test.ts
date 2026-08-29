import { describe, it, expect } from 'vitest';
import { aggregate, sectionFor, SECTIONS, type RecipeData } from './shopping';
import type { Ingredient } from './units';

const ing = (over: Partial<Ingredient> & Pick<Ingredient, 'id' | 'amount' | 'unit' | 'item'>): Ingredient => ({
  scalable: true,
  ...over,
});

const recipes: Record<string, RecipeData> = {
  carbonara: {
    title: 'Spaghetti carbonara',
    servings: 4,
    ingredients: [
      ing({ id: 'beikon', amount: 250, unit: 'g', item: 'beikon' }),
      ing({ id: 'egg', amount: 4, unit: 'stk', item: 'egg' }),
      ing({ id: 'salt', amount: 0.5, unit: 'tsk', item: 'salt', scalable: false }),
      ing({ id: 'spaghetti', amount: 500, unit: 'g', item: 'spaghetti' }),
    ],
  },
  rosakal: {
    title: 'Rósakál með beikoni',
    servings: 4,
    ingredients: [
      ing({ id: 'beikon', amount: 100, unit: 'g', item: 'beikon' }),
      ing({ id: 'salt', amount: 0.5, unit: 'tsk', item: 'salt', scalable: false }),
      ing({ id: 'olia', amount: 2, unit: 'msk', item: 'ólífuolía' }),
    ],
  },
  chimichurri: {
    title: 'Chimichurri',
    servings: 6,
    ingredients: [
      ing({ id: 'olia', amount: 1.25, unit: 'dl', item: 'ólífuolía' }),
      ing({ id: 'hvitlaukur', amount: 6, unit: 'rif', item: 'hvítlaukur' }),
      ing({ id: 'vin', amount: 5, unit: 'dl', item: 'rauðvín' }),
    ],
  },
  humar: {
    title: 'Humar',
    servings: 8,
    ingredients: [
      ing({ id: 'hvitlaukur', amount: 2, unit: 'stk', item: 'hvítlaukur', note: 'heilir hausar' }),
    ],
  },
};

const flat = (sections: ReturnType<typeof aggregate>) =>
  sections.flatMap((s) => s.items.map((i) => ({ section: s.name, ...i })));

describe('sectionFor', () => {
  it('routes powders to Krydd before fresh produce matches', () => {
    expect(sectionFor('hvítlauksduft')).toBe('Krydd');
    expect(sectionFor('hvítlaukur')).toBe('Grænmeti og ávextir');
    expect(sectionFor('þurrkað oregano')).toBe('Krydd');
  });

  it('routes core categories', () => {
    expect(sectionFor('beikon')).toBe('Kjöt og fiskur');
    expect(sectionFor('rjómi')).toBe('Mjólkurvörur og egg');
    expect(sectionFor('spaghetti')).toBe('Þurrvara');
    expect(sectionFor('rauðvín')).toBe('Vínbúðin');
    expect(sectionFor('eitthvað óþekkt')).toBe('Annað');
  });
});

describe('aggregate', () => {
  it('merges the same item within a mass class across recipes', () => {
    const items = flat(aggregate({ carbonara: 4, rosakal: 4 }, recipes));
    const beikon = items.filter((i) => i.label === 'beikon');
    expect(beikon).toHaveLength(1);
    expect(beikon[0]!.amount).toBe('350 g');
    expect(beikon[0]!.recipes.sort()).toEqual(['Rósakál með beikoni', 'Spaghetti carbonara']);
    expect(beikon[0]!.section).toBe('Kjöt og fiskur');
  });

  it('merges mixed msk and dl volume into a display unit, rounded up to quarters', () => {
    // 2 msk (30 ml) + 1.25 dl (125 ml) = 155 ml -> 1.55 dl -> ceil quarter = 1.75 dl
    const items = flat(aggregate({ rosakal: 4, chimichurri: 6 }, recipes));
    const olia = items.filter((i) => i.label === 'ólífuolía');
    expect(olia).toHaveLength(1);
    expect(olia[0]!.amount).toBe('1¾ dl');
  });

  it('never merges different count units', () => {
    const items = flat(aggregate({ chimichurri: 6, humar: 8 }, recipes));
    const garlic = items.filter((i) => i.label === 'hvítlaukur');
    expect(garlic).toHaveLength(2);
    const units = garlic.map((g) => g.amount.split(' ')[1]).sort();
    expect(units).toEqual(['rif', 'stk']);
  });

  it('scales by servings and rounds counts up to whole', () => {
    const items = flat(aggregate({ carbonara: 6 }, recipes)); // factor 1.5: 4 eggs -> 6
    expect(items.find((i) => i.label === 'egg')!.amount).toBe('6 stk');
    // 250 g * 1.5 = 375 g
    expect(items.find((i) => i.label === 'beikon')!.amount).toBe('380 g');
  });

  it('does not scale non-scalable amounts but still sums them in their own unit', () => {
    const items = flat(aggregate({ carbonara: 8, rosakal: 8 }, recipes));
    expect(items.find((i) => i.label === 'salt')!.amount).toBe('1 tsk');
  });

  it('puts wine in Vínbúðin and keeps aisle order', () => {
    const sections = aggregate({ chimichurri: 6 }, recipes);
    const names = sections.map((s) => s.name);
    expect(names).toContain('Vínbúðin');
    const order = names.map((n) => SECTIONS.indexOf(n as (typeof SECTIONS)[number]));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('ignores selections for unknown slugs', () => {
    expect(aggregate({ horfin: 4 }, recipes)).toEqual([]);
  });
});

describe('mass totals at or above 1 kg round UP in the display unit (issue #3)', () => {
  it('never under-reports a kilogram total', () => {
    // 500 g spaghetti scaled 4->9 servings needs 1125 g; must show 1¼ kg, not 1,1 kg.
    const items = flat(aggregate({ carbonara: 9 }, recipes));
    expect(items.find((i) => i.label === 'spaghetti')!.amount).toBe('1¼ kg');
  });

  it('a hair over a kilo rounds up to the next quarter', () => {
    const items = flat(
      aggregate(
        { carbonara: 4 },
        { carbonara: { title: 'X', servings: 4, ingredients: [ing({ id: 's', amount: 1010, unit: 'g', item: 'spaghetti' })] } },
      ),
    );
    expect(items.find((i) => i.label === 'spaghetti')!.amount).toBe('1¼ kg');
  });
});

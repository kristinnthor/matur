import { describe, it, expect } from 'vitest';
import { applyPatch, deriveRefs, serialiseRecipe, type Recipe, type RecipePatch } from './recipe-edit';

/** A recipe shaped like the real ones, small enough to assert against whole. */
function base(): Recipe {
  return {
    title: 'Kartöflustappa með hýði',
    subtitle: 'gróf stappa með smjöri',
    description: 'Stappa þar sem hýðið fylgir með.',
    categories: ['medlaeti'],
    tags: ['fljotlegt'],
    servings: 4,
    time: { prep: 10, cook: 20 },
    ingredients: [
      { id: 'kartoflur', amount: 800, unit: 'g', item: 'litlar rauðar kartöflur', note: 'óafhýddar' },
      { id: 'smjor', amount: 57, unit: 'g', item: 'ósaltað smjör' },
      { id: 'salt', amount: 1, unit: 'tsk', item: 'salt', scalable: false },
    ],
    steps: [
      { text: 'Skolið {{kartoflur}} vel.', refs: ['kartoflur'] },
      { text: 'Bræðið {{smjor}} og saltið með {{salt}}.', refs: ['smjor', 'salt'] },
    ],
    notes: { improvements: 'Meira af kartöflum.', storage: 'Geymist í 2–3 daga.' },
    source: { url: 'https://example.com/mash', site: 'example.com' },
  } as unknown as Recipe;
}

describe('deriveRefs', () => {
  it('collects refs in order of appearance', () => {
    expect(deriveRefs('Hitið {{rjomi}} og {{smjor}}.')).toEqual(['rjomi', 'smjor']);
  });

  it('deduplicates a ref used twice', () => {
    expect(deriveRefs('{{salt}} fyrst, svo meira {{salt}}.')).toEqual(['salt']);
  });

  it('finds nothing in plain prose', () => {
    expect(deriveRefs('Sjóðið í 20 mínútur.')).toEqual([]);
  });

  it('ignores a malformed token the renderer would not resolve', () => {
    // steps.ts REF_PATTERN is /\{\{(\w+)\}\}/g — a hyphen is not \w.
    expect(deriveRefs('{{ekki-gilt}} og {{gilt}}')).toEqual(['gilt']);
  });
});

describe('applyPatch — what it changes', () => {
  it('rewrites the free text fields', () => {
    const out = applyPatch(base(), { title: 'Ný stappa', description: 'Ný lýsing.' });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.recipe.title).toBe('Ný stappa');
    expect(out.recipe.description).toBe('Ný lýsing.');
  });

  it('trims surrounding whitespace', () => {
    const out = applyPatch(base(), { title: '  Ný stappa  ' });
    expect(out.ok && out.recipe.title).toBe('Ný stappa');
  });

  it('matches ingredients by id, not by position', () => {
    const out = applyPatch(base(), { ingredients: { smjor: { item: 'saltað smjör' } } });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const ings = out.recipe.ingredients as { id: string; item: string }[];
    expect(ings.find((i) => i.id === 'smjor')!.item).toBe('saltað smjör');
    expect(ings.find((i) => i.id === 'kartoflur')!.item).toBe('litlar rauðar kartöflur');
  });

  it('skips an ingredient id the recipe no longer has', () => {
    const out = applyPatch(base(), { ingredients: { horfid: { item: 'eitthvað' } } });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.recipe.ingredients).toHaveLength(3);
  });

  it('re-derives refs when a step gains a reference', () => {
    const out = applyPatch(base(), {
      steps: ['Skolið {{kartoflur}} og {{salt}} vel.', 'Bræðið {{smjor}} og saltið með {{salt}}.'],
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const steps = out.recipe.steps as { refs: string[] }[];
    expect(steps[0]!.refs).toEqual(['kartoflur', 'salt']);
  });

  it('re-derives refs when a step loses a reference', () => {
    const out = applyPatch(base(), { steps: ['Skolið kartöflur vel.', 'Bræðið {{smjor}}.'] });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const steps = out.recipe.steps as { refs: string[] }[];
    expect(steps[0]!.refs).toEqual([]);
    expect(steps[1]!.refs).toEqual(['smjor']);
  });
});

describe('applyPatch — what it refuses to change', () => {
  it('ignores amounts, units, servings, taxonomy and source', () => {
    const patch = {
      title: 'Ný stappa',
      ingredients: { kartoflur: { item: 'nýjar kartöflur', amount: 5, unit: 'kg', scalable: false } },
      servings: 99,
      categories: ['bakstur'],
      tags: [],
      time: { prep: 0, cook: 0 },
      source: { url: 'https://evil.example', site: 'evil.example' },
    } as unknown as RecipePatch;
    const out = applyPatch(base(), patch);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const r = out.recipe as Record<string, unknown>;
    const kart = (r.ingredients as { id: string; item: string; amount: number; unit: string }[])[0]!;
    expect(kart.item).toBe('nýjar kartöflur');
    expect(kart.amount).toBe(800);
    expect(kart.unit).toBe('g');
    expect(r.servings).toBe(4);
    expect(r.categories).toEqual(['medlaeti']);
    expect(r.time).toEqual({ prep: 10, cook: 20 });
    expect(r.source).toEqual({ url: 'https://example.com/mash', site: 'example.com' });
  });

  it('never mutates the recipe it was given', () => {
    const original = base();
    const snapshot = JSON.stringify(original);
    applyPatch(original, { title: 'Annað' });
    expect(JSON.stringify(original)).toBe(snapshot);
  });
});

describe('applyPatch — blank handling', () => {
  it('deletes a blank subtitle rather than storing an empty string', () => {
    const out = applyPatch(base(), { subtitle: '   ' });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect('subtitle' in out.recipe).toBe(false);
  });

  it('deletes a blank ingredient note', () => {
    const out = applyPatch(base(), { ingredients: { kartoflur: { note: '' } } });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect('note' in (out.recipe.ingredients as object[])[0]!).toBe(false);
  });

  it('deletes a blank group key instead of writing null', () => {
    // 468 of 746 ingredients omit group entirely; writing null would add a
    // key to hundreds of lines on every save.
    const out = applyPatch(base(), { ingredients: { kartoflur: { group: '' } } });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect('group' in (out.recipe.ingredients as object[])[0]!).toBe(false);
  });

  it('sets a non-blank group', () => {
    const out = applyPatch(base(), { ingredients: { kartoflur: { group: 'Fyrir stöppuna' } } });
    expect(out.ok && (out.recipe.ingredients as { group: string }[])[0]!.group).toBe('Fyrir stöppuna');
  });

  it('deletes a blank note key from the notes block', () => {
    const out = applyPatch(base(), { notes: { storage: '' } });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect('storage' in (out.recipe.notes as object)).toBe(false);
    expect('improvements' in (out.recipe.notes as object)).toBe(true);
  });

  it('rejects a blank title', () => {
    const out = applyPatch(base(), { title: '  ' });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toBe('blank');
    expect(out.message).toContain('titill');
  });

  it('rejects a blank description', () => {
    const out = applyPatch(base(), { description: '' });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toBe('blank');
  });

  it('rejects a blank step', () => {
    const out = applyPatch(base(), { steps: ['Skolið {{kartoflur}} vel.', '   '] });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toBe('blank');
    expect(out.message).toContain('skref 2');
  });

  it('reports every blank field at once', () => {
    const out = applyPatch(base(), { title: '', description: '' });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.message).toContain('titill');
    expect(out.message).toContain('lýsing');
  });
});

describe('applyPatch — omitted versus blank', () => {
  it('leaves an omitted field untouched', () => {
    const out = applyPatch(base(), { title: 'Ný stappa' });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.recipe.subtitle).toBe('gróf stappa með smjöri');
    expect(out.recipe.description).toBe('Stappa þar sem hýðið fylgir með.');
  });

  it('leaves steps alone when the patch omits them', () => {
    const out = applyPatch(base(), { title: 'Ný stappa' });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect((out.recipe.steps as { text: string }[])[0]!.text).toBe('Skolið {{kartoflur}} vel.');
  });
});

describe('applyPatch — conflict', () => {
  it('rejects a patch built from a different number of steps', () => {
    const out = applyPatch(base(), { steps: ['Bara eitt skref.'] });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toBe('conflict');
  });
});

describe('applyPatch — hostile input', () => {
  // The patch comes off a request body, so nothing about its shape is given.
  it('ignores a steps field that is not an array', () => {
    const out = applyPatch(base(), { steps: 'ekki fylki' } as unknown as RecipePatch);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect((out.recipe.steps as { text: string }[])[0]!.text).toBe('Skolið {{kartoflur}} vel.');
  });

  it('ignores non-string field values', () => {
    const out = applyPatch(base(), { title: 42, description: null } as unknown as RecipePatch);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.recipe.title).toBe('Kartöflustappa með hýði');
    expect(out.recipe.description).toBe('Stappa þar sem hýðið fylgir með.');
  });

  it('cannot add an ingredient through an unknown id', () => {
    const out = applyPatch(base(), { ingredients: { nytt: { item: 'laumufarþegi' } } });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const ings = out.recipe.ingredients as { id: string }[];
    expect(ings.map((i) => i.id)).toEqual(['kartoflur', 'smjor', 'salt']);
  });
});

describe('serialiseRecipe', () => {
  it('round-trips an unmodified recipe byte for byte', () => {
    const recipe = base();
    const before = serialiseRecipe(recipe);
    const out = applyPatch(recipe, {
      title: recipe.title as string,
      subtitle: recipe.subtitle as string,
      description: recipe.description as string,
      steps: (recipe.steps as { text: string }[]).map((s) => s.text),
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(serialiseRecipe(out.recipe)).toBe(before);
  });

  it('emits two-space indentation and a trailing newline', () => {
    const text = serialiseRecipe(base());
    expect(text.startsWith('{\n  "title"')).toBe(true);
    expect(text.endsWith('}\n')).toBe(true);
  });

  it('preserves key order', () => {
    const out = applyPatch(base(), { title: 'Ný stappa' });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(Object.keys(out.recipe).slice(0, 4)).toEqual(['title', 'subtitle', 'description', 'categories']);
  });
});

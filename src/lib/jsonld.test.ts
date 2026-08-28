import { describe, it, expect } from 'vitest';
import { extractRecipe } from './jsonld';

const wrap = (json: string) =>
  `<html><head><script type="application/ld+json">${json}</script></head><body></body></html>`;

describe('extractRecipe', () => {
  it('parses a plain Recipe block', () => {
    const html = wrap(JSON.stringify({
      '@type': 'Recipe',
      name: 'Test Stew',
      recipeYield: '4 servings',
      prepTime: 'PT15M',
      cookTime: 'PT1H',
      recipeIngredient: ['1 kg beef', '2 carrots'],
      recipeInstructions: [{ '@type': 'HowToStep', text: 'Brown the beef.' }],
    }));
    const r = extractRecipe(html);
    expect(r?.name).toBe('Test Stew');
    expect(r?.yield).toBe('4 servings');
    expect(r?.prepTime).toBe('PT15M');
    expect(r?.ingredients).toEqual(['1 kg beef', '2 carrots']);
    expect(r?.instructions).toEqual(['Brown the beef.']);
  });

  it('finds a Recipe inside @graph with an array @type', () => {
    const html = wrap(JSON.stringify({
      '@graph': [
        { '@type': 'WebSite', name: 'Blog' },
        {
          '@type': ['Recipe', 'NewsArticle'],
          name: 'Graph Recipe',
          recipeIngredient: ['salt'],
          recipeInstructions: 'Just do it.',
        },
      ],
    }));
    const r = extractRecipe(html);
    expect(r?.name).toBe('Graph Recipe');
    expect(r?.instructions).toEqual(['Just do it.']);
  });

  it('flattens HowToSection nesting in order', () => {
    const html = wrap(JSON.stringify({
      '@type': 'Recipe',
      name: 'Sectioned',
      recipeIngredient: ['x'],
      recipeInstructions: [
        {
          '@type': 'HowToSection',
          name: 'Part A',
          itemListElement: [
            { '@type': 'HowToStep', text: 'Step one.' },
            { '@type': 'HowToStep', text: 'Step two.' },
          ],
        },
        { '@type': 'HowToStep', text: 'Step three.' },
      ],
    }));
    expect(extractRecipe(html)?.instructions).toEqual(['Step one.', 'Step two.', 'Step three.']);
  });

  it('strips HTML tags and entities from instruction text', () => {
    const html = wrap(JSON.stringify({
      '@type': 'Recipe',
      name: 'Tagged',
      recipeIngredient: ['x'],
      recipeInstructions: [{ '@type': 'HowToStep', text: 'Mix <b>well</b>.&nbsp; Rest.' }],
    }));
    expect(extractRecipe(html)?.instructions).toEqual(['Mix well. Rest.']);
  });

  it('returns null when no recipe exists', () => {
    expect(extractRecipe('<html><body><p>No recipes here</p></body></html>')).toBeNull();
  });

  it('survives a malformed block before a valid one', () => {
    const html =
      '<script type="application/ld+json">{not json</script>' +
      wrap(JSON.stringify({ '@type': 'Recipe', name: 'Valid', recipeIngredient: ['x'], recipeInstructions: 'Go.' }));
    expect(extractRecipe(html)?.name).toBe('Valid');
  });
});

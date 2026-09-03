import { describe, it, expect } from 'vitest';
import { mergeList } from './list-storage';

describe('mergeList', () => {
  it('adds new recipes to an existing list', () => {
    expect(mergeList({ a: 4 }, { b: 2, c: 6 })).toEqual({ a: 4, b: 2, c: 6 });
  });

  it('keeps the servings already chosen for a recipe on the list', () => {
    expect(mergeList({ a: 8 }, { a: 4, b: 2 })).toEqual({ a: 8, b: 2 });
  });

  it('is a plain add when the list is empty', () => {
    expect(mergeList({}, { a: 4 })).toEqual({ a: 4 });
  });

  it('does not mutate either input', () => {
    const existing = { a: 8 };
    const additions = { a: 4, b: 2 };
    mergeList(existing, additions);
    expect(existing).toEqual({ a: 8 });
    expect(additions).toEqual({ a: 4, b: 2 });
  });
});

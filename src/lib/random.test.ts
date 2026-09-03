import { describe, it, expect } from 'vitest';
import { clampCount, MAX_COUNT, MIN_COUNT, pick } from './random';

const pool = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

/** Small deterministic generator so a test can replay the same draw. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

describe('clampCount', () => {
  it('keeps values inside the range', () => {
    expect(clampCount(1)).toBe(1);
    expect(clampCount(3)).toBe(3);
    expect(clampCount(5)).toBe(5);
  });

  it('clamps out-of-range and odd inputs instead of throwing', () => {
    expect(clampCount(0)).toBe(MIN_COUNT);
    expect(clampCount(-4)).toBe(MIN_COUNT);
    expect(clampCount(6)).toBe(MAX_COUNT);
    expect(clampCount(99)).toBe(MAX_COUNT);
    expect(clampCount(2.7)).toBe(2);
    expect(clampCount(Number.NaN)).toBe(MIN_COUNT);
    expect(clampCount(Number.POSITIVE_INFINITY)).toBe(MAX_COUNT);
  });
});

describe('pick', () => {
  it('draws exactly count from a large pool', () => {
    for (let count = 1; count <= 5; count++) {
      const { slugs, short } = pick({ count, pool, random: seeded(count) });
      expect(slugs).toHaveLength(count);
      expect(short).toBe(0);
      for (const s of slugs) expect(pool).toContain(s);
    }
  });

  it('never repeats a slug, over many draws', () => {
    const random = seeded(42);
    for (let i = 0; i < 500; i++) {
      const { slugs } = pick({ count: 5, pool, random });
      expect(new Set(slugs).size).toBe(slugs.length);
    }
  });

  it('is deterministic for a given generator', () => {
    const a = pick({ count: 4, pool, random: seeded(7) });
    const b = pick({ count: 4, pool, random: seeded(7) });
    expect(a).toEqual(b);
  });

  it('reaches every element of the pool eventually', () => {
    const random = seeded(3);
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) for (const s of pick({ count: 1, pool, random }).slugs) seen.add(s);
    expect([...seen].sort()).toEqual([...pool].sort());
  });

  it('respects exclude', () => {
    const random = seeded(9);
    const exclude = ['a', 'b', 'c'];
    for (let i = 0; i < 200; i++) {
      const { slugs } = pick({ count: 3, pool, exclude, random });
      expect(slugs).toHaveLength(3);
      for (const s of slugs) expect(exclude).not.toContain(s);
    }
  });

  it('returns the whole remainder and reports short when the pool is small', () => {
    const { slugs, short } = pick({ count: 5, pool: ['x', 'y'], random: seeded(1) });
    expect(slugs.sort()).toEqual(['x', 'y']);
    expect(short).toBe(3);
  });

  it('counts exclusions against the pool when reporting short', () => {
    const { slugs, short } = pick({ count: 3, pool: ['x', 'y', 'z'], exclude: ['x', 'y'], random: seeded(1) });
    expect(slugs).toEqual(['z']);
    expect(short).toBe(2);
  });

  it('draws nothing from an empty pool without failing', () => {
    expect(pick({ count: 3, pool: [] })).toEqual({ slugs: [], short: 3 });
    expect(pick({ count: 2, pool: ['a'], exclude: ['a'] })).toEqual({ slugs: [], short: 2 });
  });

  it('clamps count inside the draw too', () => {
    expect(pick({ count: 0, pool, random: seeded(2) }).slugs).toHaveLength(1);
    expect(pick({ count: 12, pool, random: seeded(2) }).slugs).toHaveLength(5);
  });

  it('does not let a duplicate pool entry double its odds or appear twice', () => {
    const { slugs } = pick({ count: 3, pool: ['a', 'a', 'a', 'b', 'c'], random: seeded(5) });
    expect(slugs.sort()).toEqual(['a', 'b', 'c']);
  });

  it('does not mutate the inputs', () => {
    const p = ['a', 'b', 'c', 'd'];
    const ex = ['a'];
    pick({ count: 2, pool: p, exclude: ex, random: seeded(11) });
    expect(p).toEqual(['a', 'b', 'c', 'd']);
    expect(ex).toEqual(['a']);
  });
});

/**
 * Random recipe selection — pure. The "what should we cook?" page calls this;
 * nothing here touches the DOM, storage or account state, so it is tested
 * like the shopping-list aggregation.
 */

/** The picker offers 1–5; anything else is a bug upstream, so clamp, never throw. */
export const MIN_COUNT = 1;
export const MAX_COUNT = 5;

export interface PickOptions {
  /** How many to draw; clamped to MIN_COUNT–MAX_COUNT. */
  count: number;
  /** Candidate slugs — every recipe, or one person's favourites. */
  pool: readonly string[];
  /** Slugs already on the results list; re-roll and "draw one more" pass these. */
  exclude?: readonly string[];
  /** Injectable for deterministic tests. Defaults to Math.random. */
  random?: () => number;
}

export interface PickResult {
  /** Drawn slugs in draw order, never repeating and never from `exclude`. */
  slugs: string[];
  /** How many fewer than `count` could be drawn; 0 when the pool sufficed. */
  short: number;
}

export function clampCount(n: number): number {
  if (Number.isNaN(n)) return MIN_COUNT;
  return Math.min(MAX_COUNT, Math.max(MIN_COUNT, Math.floor(n)));
}

export function pick({ count, pool, exclude = [], random = Math.random }: PickOptions): PickResult {
  const want = clampCount(count);
  const out = new Set(exclude);
  // De-duplicate the pool too: a slug listed twice must not double its odds.
  const candidates = [...new Set(pool)].filter((s) => !out.has(s));

  // Partial Fisher–Yates on a copy: the caller's arrays are never mutated.
  const n = Math.min(want, candidates.length);
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(random() * (candidates.length - i));
    [candidates[i], candidates[j]] = [candidates[j]!, candidates[i]!];
  }
  return { slugs: candidates.slice(0, n), short: want - n };
}

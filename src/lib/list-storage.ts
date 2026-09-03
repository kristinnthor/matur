/**
 * The shopping-list selection — pure helpers over the shape every page shares.
 *
 * The list itself is `localStorage['matur:list']`, a map of recipe slug to the
 * number of servings wanted. Reading and writing it lives in
 * `scripts/list-store.ts`; this module only knows the shape, so the merge rule
 * can be unit-tested.
 */

export const LIST_KEY = 'matur:list';

export type ListSelection = Record<string, number>;

/**
 * Add recipes to a list that already has things on it. A recipe that is already
 * there keeps the servings the person set for it — adding to the list must never
 * silently reset a count they chose on purpose.
 */
export function mergeList(existing: ListSelection, additions: ListSelection): ListSelection {
  return { ...additions, ...existing };
}

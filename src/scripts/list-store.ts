/**
 * Browser side of the shopping-list selection: the one place that reads and
 * writes `matur:list`, so the recipe page button, the random picker and the
 * list page all agree on the key, the event and what happens when storage is
 * unavailable.
 */
import { LIST_KEY, type ListSelection } from '../lib/list-storage';

const SERVINGS_KEY = 'matur:servings';

export function readList(): ListSelection {
  try {
    return JSON.parse(localStorage.getItem(LIST_KEY) ?? '{}');
  } catch {
    return {};
  }
}

export function writeList(list: ListSelection): void {
  try {
    localStorage.setItem(LIST_KEY, JSON.stringify(list));
  } catch {
    // Storage unavailable — the button simply won't persist.
  }
  document.dispatchEvent(new CustomEvent('matur:list-changed'));
}

/**
 * The servings a recipe should land on the list with: whatever the person last
 * dialled on its page (the scaler remembers that under its own key), else the
 * authored default. Using the remembered value keeps the recipe page and the
 * list from disagreeing about the same recipe.
 */
export function servingsFor(slug: string, fallback: number): number {
  try {
    const remembered = (JSON.parse(localStorage.getItem(SERVINGS_KEY) ?? '{}') as Record<string, unknown>)[slug];
    if (typeof remembered === 'number' && remembered >= 1) return remembered;
  } catch {
    /* fall through to the default */
  }
  return fallback;
}

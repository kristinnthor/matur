import { aggregate, type RecipeData } from '../lib/shopping';
import { skammtar } from '../lib/units';

const LIST_KEY = 'matur:list';
const CHECKED_KEY = 'matur:checked';
const SERVINGS_KEY = 'matur:servings';

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode or blocked storage: the page still renders, nothing persists.
  }
}

const dataEl = document.querySelector('#recipe-data');
let recipes: Record<string, RecipeData> = {};
try {
  recipes = dataEl ? JSON.parse(dataEl.textContent ?? '{}') : {};
} catch {
  // A corrupt embed must not blank the page; the empty state still renders.
}

const selectedEl = document.querySelector<HTMLElement>('#selected-recipes')!;
const sectionsEl = document.querySelector<HTMLElement>('#shopping-sections')!;
const emptyEl = document.querySelector<HTMLElement>('#list-empty')!;
const actionsEl = document.querySelector<HTMLElement>('#list-actions')!;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== undefined) node.textContent = text;
  return node;
}

function setServings(slug: string, n: number): void {
  const list = { ...readJson<Record<string, number>>(LIST_KEY, {}), [slug]: n };
  writeJson(LIST_KEY, list);
  // Keep the recipe-page scaler in sync so both views agree on the count.
  const servings = readJson<Record<string, number>>(SERVINGS_KEY, {});
  if (recipes[slug] && n === recipes[slug]!.servings) delete servings[slug];
  else servings[slug] = n;
  writeJson(SERVINGS_KEY, servings);
  document.dispatchEvent(new CustomEvent('matur:list-changed'));
}

function render(): void {
  const rawSelections = readJson<Record<string, number>>(LIST_KEY, {});
  // Drop selections for recipes that no longer exist — and write the pruned
  // map back so the header badge stops counting ghosts.
  const selections = Object.fromEntries(
    Object.entries(rawSelections).filter(([slug]) => recipes[slug]),
  );
  if (Object.keys(selections).length !== Object.keys(rawSelections).length) {
    writeJson(LIST_KEY, selections);
    document.dispatchEvent(new CustomEvent('matur:list-changed'));
  }
  const slugs = Object.keys(selections);

  // Remember which control had focus; re-rendering destroys the old nodes.
  const active = document.activeElement as HTMLElement | null;
  const focusKey = active?.dataset?.slug && active?.dataset?.act
    ? `${active.dataset.slug}|${active.dataset.act}`
    : null;

  selectedEl.replaceChildren();
  sectionsEl.replaceChildren();
  emptyEl.hidden = slugs.length > 0;
  actionsEl.hidden = slugs.length === 0;

  for (const slug of slugs) {
    const r = recipes[slug]!;
    const row = el('div', { class: 'sel-recipe' });
    const link = el('a', { href: `/uppskrift/${slug}/` }, r.title);
    const stepper = el('div', { class: 'sel-stepper' });
    const minus = el('button', { type: 'button', 'data-slug': slug, 'data-act': 'minus', 'aria-label': 'Fækka skömmtum' }, '−');
    const count = el('output', {}, `${selections[slug]}`);
    const plus = el('button', { type: 'button', 'data-slug': slug, 'data-act': 'plus', 'aria-label': 'Fjölga skömmtum' }, '+');
    const remove = el('button', { type: 'button', class: 'sel-remove', 'data-slug': slug, 'data-act': 'remove', 'aria-label': 'Fjarlægja' }, '×');

    minus.addEventListener('click', () => {
      setServings(slug, Math.max(1, selections[slug]! - 1));
      render();
    });
    plus.addEventListener('click', () => {
      setServings(slug, selections[slug]! + 1);
      render();
    });
    remove.addEventListener('click', () => {
      const next = { ...selections };
      delete next[slug];
      writeJson(LIST_KEY, next);
      document.dispatchEvent(new CustomEvent('matur:list-changed'));
      render();
    });

    stepper.append(minus, count, el('span', { class: 'muted sel-label' }, skammtar(selections[slug]!)), plus);
    row.append(link, stepper, remove);
    selectedEl.append(row);
  }

  const sections = aggregate(selections, recipes);
  const currentKeys = new Set(sections.flatMap((s) => s.items.map((i) => i.key)));

  // Checked state only survives for items still on the list; otherwise a
  // ticked-off "beikon" resurfaces pre-checked on next month's list.
  const checked = readJson<Record<string, boolean>>(CHECKED_KEY, {});
  const prunedChecked = Object.fromEntries(
    Object.entries(checked).filter(([key]) => currentKeys.has(key)),
  );
  if (Object.keys(prunedChecked).length !== Object.keys(checked).length) {
    writeJson(CHECKED_KEY, prunedChecked);
  }

  for (const section of sections) {
    const h = el('h2', {}, section.name);
    const ul = el('ul', { class: 'shop-items' });
    for (const item of section.items) {
      const li = el('li');
      const id = `shop-${item.key.replace(/[^a-z0-9]+/gi, '-')}`;
      const box = el('input', { type: 'checkbox', id });
      box.checked = prunedChecked[item.key] === true;
      const label = el('label', { for: id });
      label.append(
        el('span', { class: 'qty' }, item.amount),
        el('span', { class: 'shop-name' }, ` ${item.label}`),
        el('span', { class: 'muted shop-src' }, item.recipes.join(' · ')),
      );
      box.addEventListener('change', () => {
        const next = readJson<Record<string, boolean>>(CHECKED_KEY, {});
        if (box.checked) next[item.key] = true;
        else delete next[item.key];
        writeJson(CHECKED_KEY, next);
        li.classList.toggle('done', box.checked);
      });
      li.classList.toggle('done', box.checked);
      li.append(box, label);
      ul.append(li);
    }
    sectionsEl.append(h, ul);
  }

  if (focusKey) {
    const [slug, act] = focusKey.split('|');
    const same = document.querySelector<HTMLElement>(`[data-slug="${slug}"][data-act="${act}"]`);
    // If the focused row was removed, land on a sensible neighbor instead of <body>.
    (same ?? document.querySelector<HTMLElement>('.sel-remove') ?? document.querySelector<HTMLElement>('#clear-list'))?.focus();
  }
}

document.querySelector('#clear-list')?.addEventListener('click', () => {
  if (confirm('Hreinsa allan innkaupalistann?')) {
    writeJson(LIST_KEY, {});
    writeJson(CHECKED_KEY, {});
    document.dispatchEvent(new CustomEvent('matur:list-changed'));
    render();
  }
});
document.querySelector('#print-list')?.addEventListener('click', () => window.print());

render();

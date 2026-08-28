import { aggregate, type RecipeData } from '../lib/shopping';

const LIST_KEY = 'matur:list';
const CHECKED_KEY = 'matur:checked';

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
const recipes: Record<string, RecipeData> = dataEl ? JSON.parse(dataEl.textContent ?? '{}') : {};

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

function render(): void {
  let selections = readJson<Record<string, number>>(LIST_KEY, {});
  // Drop selections for recipes that no longer exist.
  selections = Object.fromEntries(Object.entries(selections).filter(([slug]) => recipes[slug]));
  const checked = readJson<Record<string, boolean>>(CHECKED_KEY, {});
  const slugs = Object.keys(selections);

  selectedEl.replaceChildren();
  sectionsEl.replaceChildren();
  emptyEl.hidden = slugs.length > 0;
  actionsEl.hidden = slugs.length === 0;

  for (const slug of slugs) {
    const r = recipes[slug]!;
    const row = el('div', { class: 'sel-recipe' });
    const link = el('a', { href: `/uppskrift/${slug}/` }, r.title);
    const stepper = el('div', { class: 'sel-stepper' });
    const minus = el('button', { type: 'button', 'aria-label': 'Fækka skömmtum' }, '−');
    const count = el('output', {}, `${selections[slug]}`);
    const plus = el('button', { type: 'button', 'aria-label': 'Fjölga skömmtum' }, '+');
    const remove = el('button', { type: 'button', class: 'sel-remove', 'aria-label': 'Fjarlægja' }, '×');

    minus.addEventListener('click', () => {
      const next = { ...selections, [slug]: Math.max(1, selections[slug]! - 1) };
      writeJson(LIST_KEY, next);
      render();
    });
    plus.addEventListener('click', () => {
      const next = { ...selections, [slug]: selections[slug]! + 1 };
      writeJson(LIST_KEY, next);
      render();
    });
    remove.addEventListener('click', () => {
      const next = { ...selections };
      delete next[slug];
      writeJson(LIST_KEY, next);
      render();
    });

    stepper.append(minus, count, el('span', { class: 'muted sel-label' }, 'skammtar'), plus);
    row.append(link, stepper, remove);
    selectedEl.append(row);
  }

  for (const section of aggregate(selections, recipes)) {
    const h = el('h2', {}, section.name);
    const ul = el('ul', { class: 'shop-items' });
    for (const item of section.items) {
      const li = el('li');
      const id = `shop-${item.key.replace(/[^a-z0-9]+/gi, '-')}`;
      const box = el('input', { type: 'checkbox', id });
      box.checked = checked[item.key] === true;
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
}

document.querySelector('#clear-list')?.addEventListener('click', () => {
  if (confirm('Hreinsa allan innkaupalistann?')) {
    writeJson(LIST_KEY, {});
    writeJson(CHECKED_KEY, {});
    render();
  }
});
document.querySelector('#print-list')?.addEventListener('click', () => window.print());

render();

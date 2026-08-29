import { formatScaled, type Ingredient, type Unit } from '../lib/units';
import { renderStepHtml } from '../lib/steps';

const output = document.querySelector<HTMLOutputElement>('#servings');

const SERVINGS_KEY = 'matur:servings';
const slug = location.pathname.match(/\/uppskrift\/([^/]+)/)?.[1] ?? '';

function readServings(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(SERVINGS_KEY) ?? '{}');
  } catch {
    return {};
  }
}

function storeServings(n: number, base: number): void {
  try {
    const map = readServings();
    // The authored default needs no entry; keep the map tidy.
    if (n === base) delete map[slug];
    else map[slug] = n;
    localStorage.setItem(SERVINGS_KEY, JSON.stringify(map));

    // If this recipe is already on the shopping list, keep its count in sync
    // so scaling here doesn't silently leave the list at an old number.
    const list = JSON.parse(localStorage.getItem('matur:list') ?? '{}') as Record<string, number>;
    if (slug in list && list[slug] !== n) {
      list[slug] = n;
      localStorage.setItem('matur:list', JSON.stringify(list));
      document.dispatchEvent(new CustomEvent('matur:list-changed'));
    }
  } catch {
    // Storage unavailable — scaling still works, it just is not remembered.
  }
}

if (output) {
  const base = Number(output.dataset.base);
  let servings = base;
  let pulseTimer: ReturnType<typeof setTimeout> | undefined;

  const remembered = readServings()[slug];
  if (typeof remembered === 'number' && remembered >= 1 && remembered !== base) {
    servings = remembered;
  }

  const article = document.querySelector<HTMLElement>('article');
  const qtyNodes = Array.from(document.querySelectorAll<HTMLElement>('.qty'));
  const stepNodes = Array.from(document.querySelectorAll<HTMLLIElement>('.steps li'));

  const ingredients: Ingredient[] = qtyNodes.map((n) => ({
    id: n.dataset.id!,
    amount: Number(n.dataset.amount),
    unit: n.dataset.unit as Unit,
    item: n.dataset.item!,
    scalable: n.dataset.scalable !== 'false',
  }));

  const apply = () => {
    const factor = servings / base;
    output.textContent = String(servings);
    storeServings(servings, base);

    qtyNodes.forEach((node, i) => {
      node.textContent = formatScaled(ingredients[i]!, factor);
    });

    stepNodes.forEach((node) => {
      const template = node.dataset.template;
      // renderStepHtml escapes all source text; the only markup is its own span.
      if (template) node.innerHTML = renderStepHtml(template, ingredients, factor);
    });

    // The living-quantity pulse: restart the animation class on each change.
    if (article) {
      article.classList.remove('pulse');
      void article.offsetWidth;
      article.classList.add('pulse');
      clearTimeout(pulseTimer);
      pulseTimer = setTimeout(() => article.classList.remove('pulse'), 550);
    }
  };

  document.querySelectorAll<HTMLButtonElement>('[data-step]').forEach((btn) => {
    btn.addEventListener('click', () => {
      servings = Math.max(1, servings + Number(btn.dataset.step));
      apply();
    });
  });

  if (servings !== base) apply();
}

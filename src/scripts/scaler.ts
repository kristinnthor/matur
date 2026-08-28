import { formatScaled, type Ingredient, type Unit } from '../lib/units';
import { renderStep } from '../lib/steps';

const output = document.querySelector<HTMLOutputElement>('#servings');

if (output) {
  const base = Number(output.dataset.base);
  let servings = base;

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

    qtyNodes.forEach((node, i) => {
      node.textContent = formatScaled(ingredients[i]!, factor);
    });

    stepNodes.forEach((node) => {
      const template = node.dataset.template;
      if (template) node.textContent = renderStep(template, ingredients, factor);
    });
  };

  document.querySelectorAll<HTMLButtonElement>('[data-step]').forEach((btn) => {
    btn.addEventListener('click', () => {
      servings = Math.max(1, servings + Number(btn.dataset.step));
      apply();
    });
  });
}

import { formatScaled, type Ingredient } from './units';

const REF_PATTERN = /\{\{(\w+)\}\}/g;

export function renderStep(
  text: string,
  ingredients: readonly Ingredient[],
  factor: number,
): string {
  return text.replace(REF_PATTERN, (match, id: string) => {
    const ing = ingredients.find((i) => i.id === id);
    // An unresolved reference stays visible so it is caught in review,
    // rather than silently vanishing from the instruction.
    if (!ing) return match;
    return `${formatScaled(ing, factor)} ${ing.item}`;
  });
}

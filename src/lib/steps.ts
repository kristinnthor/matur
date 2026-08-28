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

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/**
 * Like renderStep, but wraps each resolved quantity in
 * `<span class="qty-i">…</span>` so the living-quantity styling can reach
 * amounts inlined in step prose. All source text is escaped; the only HTML
 * in the output is the span this function emits itself.
 */
export function renderStepHtml(
  text: string,
  ingredients: readonly Ingredient[],
  factor: number,
): string {
  return escapeHtml(text).replace(REF_PATTERN, (match, id: string) => {
    const ing = ingredients.find((i) => i.id === id);
    if (!ing) return match;
    return `<span class="qty-i">${escapeHtml(formatScaled(ing, factor))}</span> ${escapeHtml(ing.item)}`;
  });
}

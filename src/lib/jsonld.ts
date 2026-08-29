/** schema.org/Recipe extraction from raw HTML — pure, no DOM. */

export interface JsonLdRecipe {
  name: string;
  yield?: string;
  prepTime?: string;
  cookTime?: string;
  totalTime?: string;
  ingredients: string[];
  instructions: string[];
}

const LD_BLOCK = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

function isRecipeType(t: unknown): boolean {
  if (typeof t === 'string') return t === 'Recipe';
  if (Array.isArray(t)) return t.includes('Recipe');
  return false;
}

function findRecipeNode(node: unknown): Record<string, unknown> | null {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const r = findRecipeNode(n);
      if (r) return r;
    }
    return null;
  }
  const obj = node as Record<string, unknown>;
  if (isRecipeType(obj['@type'])) return obj;
  if (obj['@graph']) return findRecipeNode(obj['@graph']);
  return null;
}

function cleanText(s: string): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function flattenInstructions(ins: unknown): string[] {
  if (!ins) return [];
  if (typeof ins === 'string') return [cleanText(ins)].filter(Boolean);
  if (!Array.isArray(ins)) ins = [ins];
  const out: string[] = [];
  for (const item of ins as unknown[]) {
    if (typeof item === 'string') {
      const t = cleanText(item);
      if (t) out.push(t);
      continue;
    }
    if (item && typeof item === 'object') {
      const obj = item as Record<string, unknown>;
      if (Array.isArray(obj.itemListElement)) {
        out.push(...flattenInstructions(obj.itemListElement));
      } else if (typeof obj.text === 'string') {
        const t = cleanText(obj.text);
        if (t) out.push(t);
      }
    }
  }
  return out;
}

function asString(v: unknown): string | undefined {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (Array.isArray(v) && v.length) return asString(v[0]);
  return undefined;
}

export function extractRecipe(html: string): JsonLdRecipe | null {
  for (const match of html.matchAll(LD_BLOCK)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(match[1]!.trim());
    } catch {
      continue; // one malformed block must not hide the next
    }
    const node = findRecipeNode(parsed);
    if (!node) continue;

    const rawIngredients = node.recipeIngredient;
    const ingredients = (Array.isArray(rawIngredients) ? rawIngredients : rawIngredients != null ? [rawIngredients] : [])
      .map((i) => cleanText(String(i)))
      .filter(Boolean);

    return {
      name: cleanText(String(node.name ?? '')),
      yield: asString(node.recipeYield),
      prepTime: asString(node.prepTime),
      cookTime: asString(node.cookTime),
      totalTime: asString(node.totalTime),
      ingredients,
      instructions: flattenInstructions(node.recipeInstructions),
    };
  }
  return null;
}

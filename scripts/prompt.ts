/** Builds the translation prompt document fed to the model via stdin. */
import { readFileSync } from 'node:fs';
import { CATEGORIES, TAGS, UNIT_VALUES } from '../src/lib/taxonomy.ts';

export interface Draft {
  source: { url: string; site: string };
  kind: 'jsonld' | 'text';
  recipe?: {
    name: string;
    yield?: string;
    prepTime?: string;
    cookTime?: string;
    totalTime?: string;
    ingredients: string[];
    instructions: string[];
  };
  text?: string;
}

export function buildPrompt(draft: Draft): string {
  const glossaries = ['units', 'products', 'tone']
    .map((n) => `### glossary/${n}.md\n\n${readFileSync(`glossary/${n}.md`, 'utf8')}`)
    .join('\n\n');

  const gold = readFileSync('src/content/recipes/kartoflusalat-med-beikoni-og-piparosti.json', 'utf8');

  const material =
    draft.kind === 'jsonld'
      ? `Structured source data:\n${JSON.stringify(draft.recipe, null, 2)}`
      : `Raw page text (extract the recipe from it; ignore navigation/comment noise):\n${draft.text}`;

  return `# Verkefni: Umbreyttu uppskrift í íslenskt matur-JSON

You convert a source recipe into a single JSON object for an Icelandic recipe site.
Follow the house glossaries below exactly. Answer with RAW JSON ONLY — no markdown
fences, no commentary before or after.

## Output schema

{
  "title": string,                 // Icelandic dish name
  "subtitle": string,              // short Icelandic descriptor, lowercase start
  "description": string,           // 1-2 appetising Icelandic sentences
  "categories": string[],          // 1-2 keys from: ${Object.keys(CATEGORIES).join(', ')}
  "tags": string[],                // 0-3 keys from: ${Object.keys(TAGS).join(', ')}
  "servings": number,
  "time": { "prep": number, "cook": number },   // minutes
  "ingredients": [ { "id": string, "amount": number, "unit": one of [${UNIT_VALUES.join(', ')}],
      "item": string, "note"?: string, "group"?: string, "scalable"?: false } ],
  "steps": [ { "text": string, "refs": string[] } ],
  "notes": { "improvements"?: string, "storage"?: string, "variants"?: string },
  "source": { "url": string, "site": string }
}

## Hard rules

- ingredient "id": short ascii slug, unique; every {{id}} used in step text MUST exist.
- Step text references ingredients as {{id}} — NEVER write an ingredient quantity
  directly into step prose; the site inlines and rescales them.
- Amounts follow glossary/units.md: dl for liquids ≥ 100 ml (author 2.5, renders 2½),
  quantities that land on quarters, tsk/msk stay tsk/msk. amount is a plain number
  (0.5, not "½").
- "scalable": false on salt, seasoning-to-taste, raising agents, chilli, bay leaves.
- English cumin = kúmín (NOT kúmen, which is caraway).
- Improve the recipe where it is genuinely weak (technique, missing times, implausible
  quantities, grill-only methods get a pan/oven alternative) and document every change
  in notes.improvements starting "Endurbætur frá upprunalegu uppskriftinni:". If you
  change nothing, omit improvements entirely — never invent changes.
- If the source is already Icelandic: keep its voice where it is good, normalise
  units/structure, still sanity-check quantities.
- notes.storage: fridge/freezer guidance. notes.variants: substitutions, Icelandic
  availability (see glossary/products.md).
- source must be exactly: {"url": "${draft.source.url}", "site": "${draft.source.site}"}

## House glossaries

${glossaries}

## Gold-standard example (structure and register to match)

${gold}

## Source material

${material}
`;
}

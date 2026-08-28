import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const UNIT_VALUES = [
  'g', 'kg', 'ml', 'dl', 'l', 'tsk', 'msk',
  'stk', 'rif', 'búnt', 'dós', 'pakki', 'sneið', 'klípa',
] as const;

export const CATEGORIES = {
  kjot: 'Kjöt',
  kjuklingur: 'Kjúklingur',
  fiskur: 'Fiskur og sjávarréttir',
  graenmeti: 'Grænmetisréttir',
  pasta: 'Pasta og núðlur',
  pottrettir: 'Súpur og pottréttir',
  bakstur: 'Bakstur',
  eftirrettir: 'Eftirréttir',
  morgunmatur: 'Morgunmatur',
  medlaeti: 'Meðlæti',
  sosur: 'Sósur og dressingar',
} as const;

export const TAGS = {
  fljotlegt: 'Fljótlegt',
  haegeldad: 'Hægeldað',
  veislumatur: 'Veislumatur',
  barnvaent: 'Barnvænt',
  frystivaent: 'Frystivænt',
} as const;

const CATEGORY_KEYS = Object.keys(CATEGORIES) as [string, ...string[]];
const TAG_KEYS = Object.keys(TAGS) as [string, ...string[]];

const ingredient = z.object({
  id: z.string(),
  amount: z.number().positive(),
  unit: z.enum(UNIT_VALUES),
  item: z.string(),
  note: z.string().optional(),
  group: z.string().nullable().default(null),
  scalable: z.boolean().default(true),
});

const recipes = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/recipes' }),
  schema: ({ image }) => z.object({
    title: z.string(),
    subtitle: z.string().optional(),
    description: z.string(),
    categories: z.array(z.enum(CATEGORY_KEYS)).min(1),
    tags: z.array(z.enum(TAG_KEYS)).default([]),
    servings: z.number().int().positive(),
    time: z.object({ prep: z.number().int(), cook: z.number().int() }),
    ingredients: z.array(ingredient).min(1),
    steps: z.array(z.object({
      text: z.string(),
      refs: z.array(z.string()).default([]),
    })).min(1),
    notes: z.object({
      improvements: z.string().optional(),
      storage: z.string().optional(),
      variants: z.string().optional(),
    }).default({}),
    source: z.object({ url: z.string().url(), site: z.string() }),
    image: image().optional(),
  }),
});

export const collections = { recipes };

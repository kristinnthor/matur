/** Photo-by-convention: a file named <slug>.jpg in the photos folder attaches itself. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { ImageMetadata } from 'astro';
import credits from '../content/recipes/photos/credits.json' with { type: 'json' };

const photos = import.meta.glob<ImageMetadata>(
  '/src/content/recipes/photos/*.{jpg,jpeg,png,webp}',
  { eager: true, import: 'default' },
);

const bySlug = new Map<string, ImageMetadata>();
for (const [path, img] of Object.entries(photos)) {
  const name = path.split('/').pop()!.replace(/\.(jpg|jpeg|png|webp)$/i, '');
  bySlug.set(name, img);
}

export function photoFor(slug: string): ImageMetadata | undefined {
  return bySlug.get(slug);
}

export interface PhotoCredit {
  creator: string;
  license: string;
  licenseUrl: string;
  sourceUrl: string;
}

type CreditEntry = PhotoCredit & { sha256: string };
const creditBySlug = credits as Record<string, CreditEntry>;

/**
 * Credit for a stock photo, or undefined when there is none to give.
 *
 * Photos are replaced in place by uploads from the site, so an entry is only
 * honoured while the file on disk is still byte-for-byte the one it describes —
 * otherwise a family snapshot would be credited to a stranger.
 */
export function creditFor(slug: string): PhotoCredit | undefined {
  const entry = creditBySlug[slug];
  const photo = bySlug.get(slug);
  if (!entry || !photo) return undefined;
  let actual: string;
  try {
    actual = createHash('sha256').update(readFileSync(`src/content/recipes/photos/${slug}.jpg`)).digest('hex');
  } catch {
    return undefined;
  }
  if (actual !== entry.sha256) return undefined;
  const { creator, license, licenseUrl, sourceUrl } = entry;
  return { creator, license, licenseUrl, sourceUrl };
}

/** Photo-by-convention: a file named <slug>.jpg in the photos folder attaches itself. */
import type { ImageMetadata } from 'astro';

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

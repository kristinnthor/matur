const MAP: Record<string, string> = {
  'þ': 'th', 'ð': 'd', 'æ': 'ae', 'ö': 'o',
  'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u', 'ý': 'y',
};

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[þðæöáéíóúý]/g, (ch) => MAP[ch] ?? ch)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

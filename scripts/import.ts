/**
 * Import a source recipe URL into a draft under drafts/.
 *
 *   npm run import -- <url> [slug]
 *
 * With schema.org/Recipe JSON-LD on the page the draft is structured
 * (kind: 'jsonld'); otherwise the main-content text is captured
 * (kind: 'text') for the translator to work from. Exit code 2 on fetch
 * failure so recovery cases stay explicit.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { extractRecipe } from '../src/lib/jsonld.ts';
import { slugify } from '../src/lib/slug.ts';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

function extractMainText(html: string): string {
  let s = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<(nav|header|footer|aside|form)[\s\S]*?<\/\1>/gi, ' ');
  // Prefer an <article> or <main> region when one exists.
  const region = s.match(/<(article|main)[^>]*>([\s\S]*?)<\/\1>/i);
  if (region) s = region[2]!;
  return s
    .replace(/<br\s*\/?>(\s*)/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*/g, '\n')
    .trim()
    .slice(0, 12000);
}

const [url, slugArg] = process.argv.slice(2);
if (!url) {
  console.error('Usage: npm run import -- <url> [slug]');
  process.exit(1);
}

const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' }).catch(
  (e: Error) => e,
);
if (res instanceof Error || !res.ok) {
  const why = res instanceof Error ? res.message : `HTTP ${res.status}`;
  console.error(`FETCH FAILED (${why}): ${url}`);
  console.error('Recover this source manually (browser fetch or Wayback) — see the plan.');
  process.exit(2);
}

const html = await res.text();
const site = new URL(res.url ?? url).hostname.replace(/^www\./, '');
const recipe = extractRecipe(html);
const slug = slugArg ?? slugify(recipe?.name ?? new URL(url).pathname.split('/').filter(Boolean).pop() ?? 'uppskrift');

mkdirSync('drafts', { recursive: true });
const draft = recipe
  ? { source: { url, site }, fetched: new Date().toISOString(), kind: 'jsonld', recipe }
  : { source: { url, site }, fetched: new Date().toISOString(), kind: 'text', text: extractMainText(html) };

const file = `drafts/${slug}.draft.json`;
writeFileSync(file, JSON.stringify(draft, null, 2) + '\n');
console.log(`${draft.kind === 'jsonld' ? 'JSON-LD' : 'text   '}  ${file}`);
if (draft.kind === 'text') {
  console.log(`         (${(draft as { text: string }).text.length} chars of page text)`);
}

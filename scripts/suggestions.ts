/**
 * Read and update the recipe-suggestion queue in D1.
 *
 *   npm run suggestions                       # list what is waiting
 *   npm run suggestions -- --all              # include processed ones
 *   npm run suggestions -- --done 3 --slug my-recipe
 *   npm run suggestions -- --skip 4
 *
 * Wraps `wrangler d1 execute`, so it needs a logged-in wrangler.
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const WRANGLER = join(process.cwd(), 'node_modules', 'wrangler', 'bin', 'wrangler.js');

function query(sql: string): Record<string, unknown>[] {
  // Run wrangler's entry point through node directly: no shell, so the
  // statement survives intact. (--file would avoid quoting too, but wrangler
  // reports statistics for a script rather than returning the rows.)
  const out = execFileSync(
    process.execPath,
    [WRANGLER, 'd1', 'execute', 'matur', '--remote', '--json', '--command', sql],
    { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 },
  );
  // A progress banner precedes the JSON, so start at the array.
  const start = out.indexOf('[');
  if (start < 0) throw new Error(`unexpected wrangler output:\n${out}`);
  const batches = JSON.parse(out.slice(start)) as { results: Record<string, unknown>[] }[];
  return batches[0]?.results ?? [];
}

const escape = (s: string) => s.replaceAll("'", "''");

const doneId = flag('done');
const skipId = flag('skip');

if (doneId) {
  const slug = flag('slug');
  if (!slug) {
    console.error('--done needs --slug <recipe-slug>');
    process.exit(1);
  }
  query(
    `UPDATE suggestions SET status = 'unnid', slug = '${escape(slug)}' WHERE id = ${Number(doneId)}`,
  );
  console.log(`#${doneId} → komið á vefinn (${slug})`);
} else if (skipId) {
  query(`UPDATE suggestions SET status = 'hafnad' WHERE id = ${Number(skipId)}`);
  console.log(`#${skipId} → sleppt`);
} else {
  const where = args.includes('--all') ? '' : " WHERE status = 'nytt'";
  const rows = query(
    `SELECT id, user_name, url, note, status, slug, created FROM suggestions${where} ORDER BY created DESC`,
  );
  if (rows.length === 0) {
    console.log('Engar tillögur bíða.');
  } else {
    for (const r of rows) {
      const when = new Date(Number(r.created)).toISOString().slice(0, 10);
      console.log(`#${r.id}  [${r.status}]  ${when}  frá ${r.user_name}`);
      console.log(`     ${r.url}`);
      if (r.note) console.log(`     „${r.note}“`);
      if (r.slug) console.log(`     → /uppskrift/${r.slug}/`);
    }
    console.log(`\n${rows.length} tillaga/tillögur.`);
  }
}

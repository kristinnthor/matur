/** Lint every recipe in src/content/recipes/. Exit 1 on any error. */
import { readFileSync, readdirSync } from 'node:fs';
import { lintRecipe } from '../src/lib/lint.ts';

let bad = 0;
for (const f of readdirSync('src/content/recipes').filter((f) => f.endsWith('.json'))) {
  const { errors, warnings } = lintRecipe(JSON.parse(readFileSync(`src/content/recipes/${f}`, 'utf8')));
  if (errors.length || warnings.length) {
    console.log(`\n${f}`);
    errors.forEach((e) => console.log(`  ERROR  ${e}`));
    warnings.forEach((w) => console.log(`  warn   ${w}`));
  }
  if (errors.length) bad++;
}
console.log(bad ? `\n${bad} recipe(s) with errors` : '\nAll recipes clean (errors: 0)');
process.exit(bad ? 1 : 0);

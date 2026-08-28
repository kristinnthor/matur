/**
 * Translate drafts into Icelandic recipe JSON.
 *
 *   npm run translate -- [--backend=claude-cli|api] [--limit=N] [--model=<m>] [drafts...]
 *
 * Default backend shells out to `claude -p` (draws on the Claude subscription).
 * Without draft arguments, every draft lacking a corresponding recipe is
 * processed (resume semantics), up to --limit.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { buildPrompt, type Draft } from './prompt.ts';

const args = process.argv.slice(2);
const opt = (name: string, dflt: string) =>
  args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? dflt;

const backend = opt('backend', 'claude-cli');
const limit = Number(opt('limit', '99'));
const model = opt('model', 'sonnet');
const explicit = args.filter((a) => !a.startsWith('--'));

const pending = (explicit.length
  ? explicit
  : readdirSync('drafts')
      .filter((f) => f.endsWith('.draft.json'))
      .map((f) => `drafts/${f}`)
)
  .filter((f) => !existsSync(`src/content/recipes/${slugOf(f)}.json`))
  .slice(0, limit);

function slugOf(draftPath: string): string {
  return draftPath.replace(/^.*[\\/]/, '').replace(/\.draft\.json$/, '');
}

function callClaudeCli(prompt: string): string {
  // Prompt goes via stdin — Windows argument length limits make -p "<doc>" unsafe.
  return execFileSync(
    'claude',
    ['-p', 'Fylgdu fyrirmælunum í skjalinu á stdin. Skilaðu eingöngu hráu JSON.', '--model', model],
    { input: prompt, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, shell: true },
  );
}

async function callApi(prompt: string): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    console.error('--backend=api requires ANTHROPIC_API_KEY');
    process.exit(1);
  }
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: model === 'sonnet' ? 'claude-sonnet-5' : model,
      max_tokens: 16000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { content: { type: string; text?: string }[] };
  return data.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
}

function parseReply(reply: string): unknown {
  const stripped = reply
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  if (start < 0 || end < 0) throw new Error('no JSON object in reply');
  return JSON.parse(stripped.slice(start, end + 1));
}

if (pending.length === 0) {
  console.log('Nothing to translate — all drafts have recipes.');
  process.exit(0);
}
console.log(`Translating ${pending.length} draft(s) via ${backend} (${model})…`);

let failures = 0;
for (const draftPath of pending) {
  const slug = slugOf(draftPath);
  const draft = JSON.parse(readFileSync(draftPath, 'utf8')) as Draft;
  const prompt = buildPrompt(draft);
  process.stdout.write(`  ${slug} … `);
  try {
    const reply = backend === 'api' ? await callApi(prompt) : callClaudeCli(prompt);
    const json = parseReply(reply) as Record<string, unknown>;
    json.source = draft.source; // never trust the model with the citation
    writeFileSync(`src/content/recipes/${slug}.json`, JSON.stringify(json, null, 2) + '\n');
    console.log('OK');
  } catch (e) {
    failures++;
    const msg = e instanceof Error ? e.message : String(e);
    writeFileSync(`drafts/${slug}.reply.txt`, msg);
    console.log(`FAILED (${msg.slice(0, 80)}) — reply saved`);
  }
}
process.exit(failures ? 1 : 0);

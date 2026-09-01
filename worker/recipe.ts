/**
 * PUT /api/recipe — an admin rewriting a recipe's text.
 *
 * The patch is applied to the copy GitHub holds right now, never to a recipe
 * body the browser sends: the page the editor was rendered from was built at
 * deploy time and may be stale, and a whole recipe from a client is a whole
 * recipe to have to trust.
 *
 * What comes out is linted before it is committed. npm run verify gates every
 * deploy and the recipe lint is part of it, so an edit that fails the lint
 * would not merely publish a bad recipe — it would stop the site deploying at
 * all until someone fixed it by hand. Refusing here is what keeps the deploy
 * gate unreachable from a text field.
 */
import { lintRecipe } from '../src/lib/lint';
import {
  applyPatch,
  serialiseRecipe,
  type Recipe,
  type RecipePatch,
} from '../src/lib/recipe-edit';
import { isAdminUser, sessionUser, type AccountEnv } from './account';
import { commitCredit, putFile, readFile, toBase64, type GitHubRepo } from './github';

const SLUG = /^[a-z0-9-]{3,80}$/;
/** A generous ceiling on a recipe's text; the largest in the corpus is ~5 KB. */
const MAX_BYTES = 128 * 1024;

export interface RecipeEnv extends AccountEnv {
  GITHUB_REPO: string;
  GITHUB_TOKEN?: string;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

export async function handleRecipe(req: Request, env: RecipeEnv): Promise<Response> {
  if (req.method !== 'PUT') return json(405, { error: 'PUT only' });
  if (!env.GITHUB_TOKEN) {
    return json(503, {
      error: 'Breytingar eru ekki virkjaðar enn — GitHub-lykil vantar á vefþjóninn.',
    });
  }

  // 401 and 403 are different answers and the editor says different things
  // about them, so the two checks stay separate.
  const user = await sessionUser(req, env, Date.now());
  if (!user) return json(401, { error: 'Skráðu þig inn til að breyta uppskrift.' });
  if (!isAdminUser(user, env)) {
    return json(403, { error: 'Þú hefur ekki réttindi til að breyta uppskriftum.' });
  }

  const length = Number(req.headers.get('content-length') ?? '0');
  if (length > MAX_BYTES) return json(413, { error: 'Textinn er of langur.' });

  let body: { slug?: unknown; patch?: unknown };
  try {
    body = (await req.json()) as { slug?: unknown; patch?: unknown };
  } catch {
    return json(400, { error: 'Ógilt beiðniform.' });
  }

  const slug = typeof body.slug === 'string' ? body.slug : '';
  if (!SLUG.test(slug)) return json(400, { error: 'Ógilt uppskriftarheiti.' });
  if (!body.patch || typeof body.patch !== 'object') {
    return json(400, { error: 'Engar breytingar fylgdu.' });
  }

  const repo: GitHubRepo = { repo: env.GITHUB_REPO, token: env.GITHUB_TOKEN };
  const path = `src/content/recipes/${slug}.json`;

  const current = await readFile(repo, path);
  if (!current) return json(502, { error: 'Náði ekki í uppskriftina frá GitHub — reyndu aftur.' });

  let recipe: Recipe;
  try {
    recipe = JSON.parse(current.text) as Recipe;
  } catch {
    console.error(`unparseable recipe on github: ${path}`);
    return json(502, { error: 'Uppskriftin á GitHub er skemmd.' });
  }

  const outcome = applyPatch(recipe, body.patch as RecipePatch);
  if (!outcome.ok) {
    return json(outcome.reason === 'conflict' ? 409 : 422, { error: outcome.message });
  }

  const { errors, warnings } = lintRecipe(outcome.recipe);
  if (errors.length) {
    return json(422, { error: 'Breytingin stenst ekki yfirlestur.', details: errors });
  }

  const message = `edit: ${slug} (breytt af ${commitCredit(user.name, user.email)})`;
  const put = await putFile(
    repo,
    path,
    toBase64(serialiseRecipe(outcome.recipe)),
    message,
    current.sha,
  );

  // Unlike a photo, this does not refetch and retry. Overwriting a paragraph
  // someone else just wrote loses work that cannot be recovered from the UI.
  if (put.conflict) {
    return json(409, {
      error: 'Einhver annar breytti uppskriftinni á meðan. Endurhlaðið síðuna og reynið aftur.',
    });
  }
  if (!put.ok) {
    console.error(`github put failed for ${slug}: ${put.status} ${put.detail}`);
    return json(502, { error: 'GitHub hafnaði breytingunni — reyndu aftur eftir smástund.' });
  }

  return json(200, { ok: true, warnings });
}

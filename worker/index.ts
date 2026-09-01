/**
 * Matur worker: serves the static site, plus the API.
 *
 * POST /api/photo commits an uploaded JPEG to the GitHub repo (triggering the
 * normal build), authenticated by the signed-in user. /api/auth/*, /api/me,
 * /api/personal, /api/favourite and /api/note handle sign-in and personal data
 * — see account.ts. Every secret is set on the Worker, outside this codebase.
 */
import { handleAccount, sessionUser, type AccountEnv } from './account';
import { commitCredit, fileSha, putFile, type GitHubRepo } from './github';

/** Minimal binding type — avoids pulling @cloudflare/workers-types, whose
 * global Request/Response redefinitions clash with the DOM lib the client
 * scripts compile against. */
interface Fetcher {
  fetch(req: Request): Promise<Response>;
}

export interface Env extends AccountEnv {
  ASSETS: Fetcher;
  GITHUB_REPO: string;
  GITHUB_TOKEN?: string;
}

const SLUG = /^[a-z0-9-]{3,80}$/;
const MAX_BYTES = 4.5 * 1024 * 1024;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      // API responses are per-request state; nothing may cache them.
      'cache-control': 'no-store',
    },
  });
}

async function handlePhoto(req: Request, env: Env): Promise<Response> {
  if (req.method !== 'POST') return json(405, { error: 'POST only' });
  if (!env.GITHUB_TOKEN) {
    return json(503, { error: 'Upphleðsla er ekki virkjuð enn — GitHub-lykil vantar á vefþjóninn.' });
  }
  // Uploading is a repo write, so it takes a real account rather than a secret
  // everyone shares: the commit can then say who took the photo, and there is
  // no passphrase sitting in every family phone waiting to leak.
  const uploader = await sessionUser(req, env, Date.now());
  if (!uploader) {
    return json(401, { error: 'Skráðu þig inn til að hlaða upp mynd.' });
  }

  // Reject oversized bodies before buffering/decoding anything. Base64 inflates
  // by 4/3, so the wire limit is the byte limit times 4/3 plus JSON overhead.
  const contentLength = Number(req.headers.get('content-length') ?? '0');
  if (contentLength > MAX_BYTES * (4 / 3) + 4096) {
    return json(413, { error: 'Myndin er of stór (hámark 4,5 MB).' });
  }

  let body: { slug?: string; data?: string };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'Ógilt beiðniform.' });
  }
  const { slug, data } = body;
  if (!slug || !SLUG.test(slug)) return json(400, { error: 'Ógilt uppskriftarheiti.' });
  if (!data) return json(400, { error: 'Engin mynd fylgdi.' });
  // The content-length preflight is advisory (a chunked body has no header),
  // so bound the decode work on the actual payload too.
  if (data.length > MAX_BYTES * (4 / 3) + 4) {
    return json(413, { error: 'Myndin er of stór (hámark 4,5 MB).' });
  }

  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
  } catch {
    return json(400, { error: 'Myndagögnin eru skemmd.' });
  }
  if (bytes.length > MAX_BYTES) return json(413, { error: 'Myndin er of stór (hámark 4,5 MB).' });
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return json(415, { error: 'Aðeins JPEG-myndir.' });

  const path = `src/content/recipes/photos/${slug}.jpg`;
  const repo: GitHubRepo = { repo: env.GITHUB_REPO, token: env.GITHUB_TOKEN };
  // This lands in a public repo's history, so credit by first name only.
  const credit = commitCredit(uploader.name, uploader.email);
  const message = `photo: ${slug} (upphlaðin af ${credit})`;

  // Replacing an existing photo needs its current blob SHA.
  let sha = await fileSha(repo, path);
  if (sha === null) return json(502, { error: 'GitHub svaraði ekki — reyndu aftur.' });

  let put = await putFile(repo, path, data, message, sha);
  // Two uploads racing the same file: the loser's SHA is stale. Refetch once
  // and retry so the second photo wins instead of erroring. A text edit
  // deliberately does the opposite — see worker/recipe.ts.
  if (put.conflict) {
    const fresh = await fileSha(repo, path);
    if (fresh !== null) {
      sha = fresh;
      put = await putFile(repo, path, data, message, sha);
    }
  }

  if (!put.ok) {
    // Upstream details go to the logs, not to the client.
    console.error(`github put failed for ${slug}: ${put.status} ${put.detail}`);
    return json(502, { error: 'GitHub hafnaði myndinni — reyndu aftur eftir smástund.' });
  }

  return json(200, { ok: true, path, replaced: Boolean(sha) });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/api/photo') return handlePhoto(req, env);
    const account = await handleAccount(req, env, url);
    if (account) return account;
    return env.ASSETS.fetch(req);
  },
};

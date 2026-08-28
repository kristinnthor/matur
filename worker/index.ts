/**
 * Matur worker: serves the static site, plus POST /api/photo which
 * commits an uploaded JPEG to the GitHub repo (triggering the normal
 * build). Auth is a shared passphrase; both it and the GitHub token are
 * Worker secrets set outside this codebase.
 */
export interface Env {
  ASSETS: Fetcher;
  GITHUB_REPO: string;
  GITHUB_TOKEN?: string;
  UPLOAD_PASS?: string;
}

const SLUG = /^[a-z0-9-]{3,80}$/;
const MAX_BYTES = 4.5 * 1024 * 1024;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function handlePhoto(req: Request, env: Env): Promise<Response> {
  if (req.method !== 'POST') return json(405, { error: 'POST only' });
  if (!env.GITHUB_TOKEN || !env.UPLOAD_PASS) {
    return json(503, { error: 'Upphleðsla er ekki virkjuð enn — leyninúmer og GitHub-lykil vantar á vefþjóninn.' });
  }
  const pass = req.headers.get('x-upload-pass') ?? '';
  if (!safeEqual(pass, env.UPLOAD_PASS)) {
    return json(401, { error: 'Rangt leyninúmer.' });
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

  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
  } catch {
    return json(400, { error: 'Myndagögnin eru skemmd.' });
  }
  if (bytes.length > MAX_BYTES) return json(413, { error: 'Myndin er of stór (hámark 4,5 MB).' });
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return json(415, { error: 'Aðeins JPEG-myndir.' });

  const path = `src/content/recipes/photos/${slug}.jpg`;
  const api = `https://api.github.com/repos/${env.GITHUB_REPO}/contents/${path}`;
  const gh = {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'matur-photo-upload',
  };

  // Replacing an existing photo needs its current blob SHA.
  let sha: string | undefined;
  const existing = await fetch(api, { headers: gh });
  if (existing.ok) {
    sha = ((await existing.json()) as { sha?: string }).sha;
  } else if (existing.status !== 404) {
    return json(502, { error: `GitHub svaraði ${existing.status} við uppflettingu.` });
  }

  const put = await fetch(api, {
    method: 'PUT',
    headers: { ...gh, 'content-type': 'application/json' },
    body: JSON.stringify({
      message: `photo: ${slug} (upphlaðin af síðunni)`,
      content: data,
      ...(sha ? { sha } : {}),
    }),
  });
  if (!put.ok) {
    const detail = ((await put.json().catch(() => ({}))) as { message?: string }).message ?? '';
    return json(502, { error: `GitHub hafnaði myndinni (${put.status}). ${detail}`.trim() });
  }

  return json(200, { ok: true, path, replaced: Boolean(sha) });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/api/photo') return handlePhoto(req, env);
    return env.ASSETS.fetch(req);
  },
};

/**
 * Matur worker: serves the static site, plus POST /api/photo which
 * commits an uploaded JPEG to the GitHub repo (triggering the normal
 * build). Auth is a shared passphrase; both it and the GitHub token are
 * Worker secrets set outside this codebase.
 */
/** Minimal binding type — avoids pulling @cloudflare/workers-types, whose
 * global Request/Response redefinitions clash with the DOM lib the client
 * scripts compile against. */
interface Fetcher {
  fetch(req: Request): Promise<Response>;
}

export interface Env {
  ASSETS: Fetcher;
  GITHUB_REPO: string;
  GITHUB_TOKEN?: string;
  UPLOAD_PASS?: string;
}

const SLUG = /^[a-z0-9-]{3,80}$/;
const MAX_BYTES = 4.5 * 1024 * 1024;

/**
 * Passphrase brute-force protection. In-memory per isolate, so a determined
 * attacker rotating IPs or hitting many PoPs can exceed it — acceptable for a
 * household site where the passphrase gates repo writes, not secrets. The
 * window is generous enough that a family member fat-fingering the passphrase
 * a few times is never locked out.
 */
const FAIL_LIMIT = 8;
const FAIL_WINDOW_MS = 15 * 60 * 1000;
const failures = new Map<string, { count: number; windowStart: number }>();

function tooManyFailures(ip: string, now: number): boolean {
  const entry = failures.get(ip);
  if (!entry || now - entry.windowStart > FAIL_WINDOW_MS) return false;
  return entry.count >= FAIL_LIMIT;
}

function recordFailure(ip: string, now: number): void {
  const entry = failures.get(ip);
  if (!entry || now - entry.windowStart > FAIL_WINDOW_MS) {
    failures.set(ip, { count: 1, windowStart: now });
  } else {
    entry.count++;
  }
  // Keep the map bounded even under IP rotation: purge expired entries first,
  // then evict oldest (Map preserves insertion order) until under the cap.
  if (failures.size > 1000) {
    for (const [key, e] of failures) {
      if (now - e.windowStart > FAIL_WINDOW_MS) failures.delete(key);
    }
    for (const key of failures.keys()) {
      if (failures.size <= 1000) break;
      failures.delete(key);
    }
  }
}

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
  const ip = req.headers.get('cf-connecting-ip') ?? 'unknown';
  const now = Date.now();
  if (tooManyFailures(ip, now)) {
    return json(429, { error: 'Of margar tilraunir — reyndu aftur eftir korter.' });
  }

  const pass = req.headers.get('x-upload-pass') ?? '';
  if (!safeEqual(pass, env.UPLOAD_PASS)) {
    recordFailure(ip, now);
    return json(401, { error: 'Rangt leyninúmer.' });
  }
  // A successful login forgives earlier typos — nobody sits one mistake from lockout.
  failures.delete(ip);

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

  const fetchSha = async (): Promise<string | undefined | null> => {
    const existing = await fetch(api, { headers: gh });
    if (existing.ok) return ((await existing.json()) as { sha?: string }).sha;
    if (existing.status === 404) return undefined;
    return null; // upstream error
  };

  const putPhoto = (sha: string | undefined) =>
    fetch(api, {
      method: 'PUT',
      headers: { ...gh, 'content-type': 'application/json' },
      body: JSON.stringify({
        message: `photo: ${slug} (upphlaðin af síðunni)`,
        content: data,
        ...(sha ? { sha } : {}),
      }),
    });

  // Replacing an existing photo needs its current blob SHA.
  let sha = await fetchSha();
  if (sha === null) return json(502, { error: 'GitHub svaraði ekki — reyndu aftur.' });

  let put = await putPhoto(sha);
  // Two uploads racing the same file: the loser's SHA is stale (409/422).
  // Refetch once and retry so the second photo wins instead of erroring.
  if (put.status === 409 || put.status === 422) {
    sha = await fetchSha();
    if (sha !== null) put = await putPhoto(sha);
  }

  if (!put.ok) {
    // Upstream details go to the logs, not to the client.
    const detail = ((await put.json().catch(() => ({}))) as { message?: string }).message ?? '';
    console.error(`github put failed for ${slug}: ${put.status} ${detail}`);
    return json(502, { error: 'GitHub hafnaði myndinni — reyndu aftur eftir smástund.' });
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

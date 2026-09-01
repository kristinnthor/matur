/**
 * Writing files to this repo through GitHub's contents API.
 *
 * Both the photo upload and the recipe editor commit here, and both need the
 * same fetch-SHA-then-PUT dance. They differ in exactly one decision — what to
 * do when the SHA turns out stale — so that choice is left to the caller: a
 * photo refetches and retries so the newer photo wins, while a text edit
 * refuses rather than silently clobbering someone's paragraph.
 */

export interface GitHubRepo {
  /** "owner/name" */
  repo: string;
  token: string;
}

export interface FileContent {
  text: string;
  sha: string;
}

export interface PutResult {
  ok: boolean;
  status: number;
  /** The SHA was stale — someone else wrote this path first. */
  conflict: boolean;
  /** Upstream message, for the logs. Never for the client. */
  detail: string;
}

function headers(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'matur-worker',
  };
}

const contentsUrl = (r: GitHubRepo, path: string) =>
  `https://api.github.com/repos/${r.repo}/contents/${path}`;

/**
 * UTF-8 text as base64. Recipe text is full of þ/ð/ö/é and bare btoa() throws
 * on any code point above U+00FF, so the bytes have to be produced first.
 */
export function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** The inverse. GitHub wraps its base64 at 60 columns, so newlines are stripped. */
export function fromBase64(b64: string): string {
  const bytes = Uint8Array.from(atob(b64.replace(/\s+/g, '')), (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** undefined = no such file yet; null = GitHub itself failed. */
export async function fileSha(r: GitHubRepo, path: string): Promise<string | undefined | null> {
  const res = await fetch(contentsUrl(r, path), { headers: headers(r.token) });
  if (res.ok) return ((await res.json()) as { sha?: string }).sha;
  if (res.status === 404) return undefined;
  return null;
}

/** A file's current text and SHA, or null when it is missing or unreachable. */
export async function readFile(r: GitHubRepo, path: string): Promise<FileContent | null> {
  const res = await fetch(contentsUrl(r, path), { headers: headers(r.token) });
  if (!res.ok) return null;
  const body = (await res.json().catch(() => null)) as {
    content?: string;
    encoding?: string;
    sha?: string;
  } | null;
  if (!body?.content || !body.sha || body.encoding !== 'base64') return null;
  try {
    return { text: fromBase64(body.content), sha: body.sha };
  } catch {
    return null;
  }
}

/** `contentBase64` must already be base64 — use toBase64 for text. */
export async function putFile(
  r: GitHubRepo,
  path: string,
  contentBase64: string,
  message: string,
  sha: string | undefined,
): Promise<PutResult> {
  const res = await fetch(contentsUrl(r, path), {
    method: 'PUT',
    headers: { ...headers(r.token), 'content-type': 'application/json' },
    body: JSON.stringify({ message, content: contentBase64, ...(sha ? { sha } : {}) }),
  });
  if (res.ok) return { ok: true, status: res.status, conflict: false, detail: '' };
  const detail = ((await res.json().catch(() => ({}))) as { message?: string }).message ?? '';
  // A stale SHA comes back as 409, and as 422 when GitHub decides the sha field
  // itself is invalid rather than merely out of date.
  return {
    ok: false,
    status: res.status,
    conflict: res.status === 409 || res.status === 422,
    detail,
  };
}

/**
 * Who to credit in a commit message. First name only: this lands in a public
 * repo's permanent history, and an email address there can never be taken back.
 */
export function commitCredit(name: string, email: string): string {
  return name.trim().split(/\s+/)[0] || email.split('@')[0]?.trim() || 'fjölskyldunni';
}

/**
 * Signed session cookies and the sign-in allowlist.
 *
 * The session is a compact signed token rather than a row in a table: there is
 * no session store to keep, and a stolen cookie expires on its own. It carries
 * only what the UI needs to greet someone — never anything private.
 *
 * Pure enough to unit-test, and used by the Worker. WebCrypto is available in
 * both Workers and Node, so there is one implementation, not two.
 */

export interface SessionUser {
  /** Google's stable account id — the key personal rows hang off. */
  sub: string;
  email: string;
  name: string;
}

interface Payload extends SessionUser {
  exp: number;
}

const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/');
  return Uint8Array.from(atob(padded + '='.repeat((4 - (padded.length % 4)) % 4)), (c) =>
    c.charCodeAt(0),
  );
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

/** Compare without leaking where two signatures diverge. */
function safeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

export async function signSession(
  user: SessionUser,
  secret: string,
  expiresAt: number,
): Promise<string> {
  const payload: Payload = { sub: user.sub, email: user.email, name: user.name, exp: expiresAt };
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const mac = await crypto.subtle.sign('HMAC', await hmacKey(secret), encoder.encode(body));
  return `${body}.${toBase64Url(new Uint8Array(mac))}`;
}

/** The user in a token, or null if it is malformed, forged or expired. */
export async function verifySession(
  token: string | undefined | null,
  secret: string,
  now: number,
): Promise<SessionUser | null> {
  if (!token) return null;
  const dot = token.indexOf('.');
  if (dot < 1) return null;
  const body = token.slice(0, dot);
  const signature = token.slice(dot + 1);

  let expected: Uint8Array;
  let given: Uint8Array;
  try {
    expected = new Uint8Array(
      await crypto.subtle.sign('HMAC', await hmacKey(secret), encoder.encode(body)),
    );
    given = fromBase64Url(signature);
  } catch {
    return null;
  }
  if (!safeEqual(expected, given)) return null;

  try {
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(body))) as Payload;
    if (typeof payload.exp !== 'number' || payload.exp <= now) return null;
    if (!payload.sub || !payload.email) return null;
    return { sub: payload.sub, email: payload.email, name: payload.name ?? '' };
  } catch {
    return null;
  }
}

/** Addresses allowed to sign in, from a comma or whitespace separated list. */
export function parseAllowlist(raw: string | undefined | null): string[] {
  return (raw ?? '')
    .split(/[,\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Fail closed: an empty allowlist admits nobody. A personal site left briefly
 * misconfigured should turn people away, not open itself to the whole world.
 */
export function isAllowed(email: string, allowlist: string[]): boolean {
  if (allowlist.length === 0) return false;
  return allowlist.includes(email.trim().toLowerCase());
}

/**
 * Verify a Google ID token.
 *
 * The token arrives from the browser, so it is verified properly: RS256
 * signature against Google's published keys, then issuer, audience, expiry and
 * a confirmed email address. Decoding the payload without checking the
 * signature would let anyone sign in as anyone.
 */

const JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);

export interface GoogleIdentity {
  sub: string;
  email: string;
  name: string;
}

interface Jwk {
  kid: string;
  n: string;
  e: string;
  alg?: string;
  kty: string;
}

// Google rotates these keys slowly; caching per isolate avoids a fetch per
// sign-in without risking a stale key outliving its usefulness.
let cache: { keys: Jwk[]; expires: number } | null = null;

async function jwks(now: number): Promise<Jwk[]> {
  if (cache && cache.expires > now) return cache.keys;
  const res = await fetch(JWKS_URL);
  if (!res.ok) throw new Error(`jwks ${res.status}`);
  const body = (await res.json()) as { keys: Jwk[] };
  const control = res.headers.get('cache-control') ?? '';
  const maxAge = Number(/max-age=(\d+)/.exec(control)?.[1] ?? 3600);
  cache = { keys: body.keys ?? [], expires: now + Math.min(Math.max(maxAge, 300), 86400) * 1000 };
  return cache.keys;
}

/** Backed by a plain ArrayBuffer, so it satisfies BufferSource for WebCrypto. */
function fromBase64Url(value: string) {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/');
  const raw = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/** The verified identity, or null for anything that does not check out. */
export async function verifyGoogleToken(
  token: string,
  clientId: string,
  now: number,
): Promise<GoogleIdentity | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [rawHeader, rawPayload, rawSignature] = parts as [string, string, string];

  let header: { kid?: string; alg?: string };
  let payload: {
    iss?: string;
    aud?: string;
    exp?: number;
    sub?: string;
    email?: string;
    email_verified?: boolean | string;
    name?: string;
  };
  try {
    header = JSON.parse(new TextDecoder().decode(fromBase64Url(rawHeader)));
    payload = JSON.parse(new TextDecoder().decode(fromBase64Url(rawPayload)));
  } catch {
    return null;
  }
  if (header.alg !== 'RS256' || !header.kid) return null;

  const key = (await jwks(now)).find((k) => k.kid === header.kid && k.kty === 'RSA');
  if (!key) return null;

  let ok: boolean;
  try {
    const publicKey = await crypto.subtle.importKey(
      'jwk',
      { kty: 'RSA', n: key.n, e: key.e, alg: 'RS256', ext: true },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    ok = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      publicKey,
      fromBase64Url(rawSignature),
      new TextEncoder().encode(`${rawHeader}.${rawPayload}`),
    );
  } catch {
    return null;
  }
  if (!ok) return null;

  if (!payload.iss || !ISSUERS.has(payload.iss)) return null;
  if (payload.aud !== clientId) return null;
  if (typeof payload.exp !== 'number' || payload.exp * 1000 <= now) return null;
  // An unverified address could belong to someone else entirely.
  if (payload.email_verified !== true && payload.email_verified !== 'true') return null;
  if (!payload.sub || !payload.email) return null;

  return { sub: payload.sub, email: payload.email, name: payload.name ?? '' };
}

/**
 * Sign-in, favourites and private notes.
 *
 * Every endpoint is off until the site is configured (Google client id, session
 * secret, allowlist, D1 binding) and says so plainly, the same way the photo
 * endpoint shipped disabled until its secrets existed.
 */
import { isAdmin, isAllowed, parseAllowlist, signSession, verifySession, type SessionUser } from '../src/lib/session';
import { MAX_NOTE as MAX_SUGGESTION_NOTE, normaliseUrl } from '../src/lib/suggestions';
import { verifyGoogleToken } from './google';

const COOKIE = 'matur_session';
const SESSION_DAYS = 30;
const SLUG = /^[a-z0-9-]{3,80}$/;
const MAX_NOTE = 4000;

/** Minimal D1 surface — avoids pulling workers-types, whose globals clash with
 * the DOM lib the client scripts compile against. */
export interface D1Like {
  prepare(query: string): {
    bind(...values: unknown[]): {
      run(): Promise<unknown>;
      all<T = unknown>(): Promise<{ results: T[] }>;
    };
    all<T = unknown>(): Promise<{ results: T[] }>;
  };
}

export interface AccountEnv {
  DB?: D1Like;
  GOOGLE_CLIENT_ID?: string;
  SESSION_SECRET?: string;
  ALLOWED_EMAILS?: string;
  ADMIN_EMAILS?: string;
}

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      // Personal data must never be held by a cache, shared or otherwise.
      'cache-control': 'no-store',
      ...headers,
    },
  });
}

function configured(env: AccountEnv): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID && env.SESSION_SECRET && env.DB);
}

const notConfigured = () =>
  json(503, { error: 'Innskráning er ekki virkjuð enn.' });

function cookieValue(req: Request, name: string): string | null {
  const header = req.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return null;
}

function setCookie(token: string, maxAgeSeconds: number): string {
  // HttpOnly so no script can read it; Lax so it survives a normal navigation
  // back to the site but is not sent from someone else's form post.
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

async function currentUser(req: Request, env: AccountEnv, now: number): Promise<SessionUser | null> {
  if (!env.SESSION_SECRET) return null;
  return verifySession(cookieValue(req, COOKIE), env.SESSION_SECRET, Math.floor(now / 1000));
}

/** The signed-in user, for endpoints outside this module (photo upload). */
export const sessionUser = currentUser;

/**
 * Whether a signed-in user may edit recipes. Recomputed from the secret on
 * every call — the session cookie carries only who someone is, never what they
 * may do, so dropping an address from ADMIN_EMAILS takes effect on their next
 * request rather than whenever their 30-day cookie happens to expire.
 */
export function isAdminUser(user: SessionUser, env: AccountEnv): boolean {
  return isAdmin(user.email, parseAllowlist(env.ADMIN_EMAILS));
}

async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function handleAccount(
  req: Request,
  env: AccountEnv,
  url: URL,
): Promise<Response | null> {
  const path = url.pathname;
  const now = Date.now();

  // What the client needs to decide whether to offer a sign-in button at all.
  if (path === '/api/auth/config') {
    return json(200, {
      enabled: configured(env),
      clientId: configured(env) ? env.GOOGLE_CLIENT_ID : null,
    });
  }

  if (path === '/api/auth/google') {
    if (req.method !== 'POST') return json(405, { error: 'POST only' });
    if (!configured(env)) return notConfigured();
    const body = await readJson(req);
    const credential = typeof body?.credential === 'string' ? body.credential : '';
    if (!credential) return json(400, { error: 'Innskráning mistókst.' });

    const identity = await verifyGoogleToken(credential, env.GOOGLE_CLIENT_ID!, now).catch(
      () => null,
    );
    if (!identity) return json(401, { error: 'Innskráning mistókst.' });

    if (!isAllowed(identity.email, parseAllowlist(env.ALLOWED_EMAILS))) {
      console.warn(`sign-in refused for ${identity.email}`);
      return json(403, { error: 'Þetta netfang hefur ekki aðgang að síðunni.' });
    }

    const maxAge = SESSION_DAYS * 24 * 60 * 60;
    const token = await signSession(identity, env.SESSION_SECRET!, Math.floor(now / 1000) + maxAge);
    return json(
      200,
      { signedIn: true, email: identity.email, name: identity.name },
      { 'set-cookie': setCookie(token, maxAge) },
    );
  }

  if (path === '/api/auth/signout') {
    if (req.method !== 'POST') return json(405, { error: 'POST only' });
    return json(200, { signedIn: false }, { 'set-cookie': setCookie('', 0) });
  }

  if (path === '/api/me') {
    if (!configured(env)) return json(200, { enabled: false, signedIn: false });
    const user = await currentUser(req, env, now);
    return json(200, {
      enabled: true,
      signedIn: Boolean(user),
      email: user?.email ?? null,
      name: user?.name ?? null,
      admin: user ? isAdminUser(user, env) : false,
    });
  }

  // Shared suggestion queue — everyone signed in sees the same list.
  if (path === '/api/suggestions' || path === '/api/suggestion') {
    if (!configured(env)) return notConfigured();
    const user = await currentUser(req, env, now);
    if (!user) return json(401, { error: 'Þú þarft að skrá þig inn.' });
    const db = env.DB!;

    if (path === '/api/suggestions') {
      const rows = await db
        .prepare(
          'SELECT id, user_name, url, note, status, slug, created FROM suggestions ORDER BY created DESC LIMIT 200',
        )
        .all<Record<string, unknown>>();
      return json(200, { suggestions: rows.results, me: user.sub });
    }

    const body = await readJson(req);

    if (req.method === 'DELETE') {
      const id = Number(body?.id);
      if (!Number.isInteger(id)) return json(400, { error: 'Ógilt auðkenni.' });
      // Only your own, and only while it is still untouched.
      await db
        .prepare("DELETE FROM suggestions WHERE id = ? AND user_sub = ? AND status = 'nytt'")
        .bind(id, user.sub)
        .run();
      return json(200, { ok: true });
    }

    if (req.method !== 'POST') return json(405, { error: 'POST only' });
    const url = normaliseUrl(typeof body?.url === 'string' ? body.url : '');
    if (!url) return json(400, { error: 'Þetta er ekki gild vefslóð.' });
    const note = typeof body?.note === 'string' ? body.note.trim().slice(0, MAX_SUGGESTION_NOTE) : '';

    // The same link from two phones is one suggestion, not two.
    await db
      .prepare(
        `INSERT INTO suggestions (user_sub, user_name, url, note, status, created)
         VALUES (?, ?, ?, ?, 'nytt', ?)
         ON CONFLICT (url) DO NOTHING`,
      )
      .bind(user.sub, user.name || user.email.split('@')[0] || 'fjölskyldan', url, note, now)
      .run();
    return json(200, { ok: true, url });
  }

  // Everything below needs a signed-in user.
  if (path === '/api/personal' || path === '/api/favourite' || path === '/api/note') {
    if (!configured(env)) return notConfigured();
    const user = await currentUser(req, env, now);
    if (!user) return json(401, { error: 'Þú þarft að skrá þig inn.' });
    const db = env.DB!;

    if (path === '/api/personal') {
      const favourites = await db
        .prepare('SELECT slug FROM favourites WHERE user_sub = ?')
        .bind(user.sub)
        .all<{ slug: string }>();
      const notes = await db
        .prepare('SELECT slug, body, updated FROM notes WHERE user_sub = ?')
        .bind(user.sub)
        .all<{ slug: string; body: string; updated: number }>();
      return json(200, {
        favourites: favourites.results.map((r) => r.slug),
        notes: Object.fromEntries(notes.results.map((n) => [n.slug, { body: n.body, updated: n.updated }])),
      });
    }

    const body = await readJson(req);
    const slug = typeof body?.slug === 'string' ? body.slug : '';
    if (!SLUG.test(slug)) return json(400, { error: 'Ógilt uppskriftarheiti.' });

    if (path === '/api/favourite') {
      if (body?.on === true) {
        await db
          .prepare('INSERT OR IGNORE INTO favourites (user_sub, slug, created) VALUES (?, ?, ?)')
          .bind(user.sub, slug, now)
          .run();
      } else {
        await db
          .prepare('DELETE FROM favourites WHERE user_sub = ? AND slug = ?')
          .bind(user.sub, slug)
          .run();
      }
      return json(200, { ok: true });
    }

    // /api/note — an empty body deletes rather than storing a blank row.
    const text = typeof body?.body === 'string' ? body.body.trim().slice(0, MAX_NOTE) : '';
    if (text) {
      await db
        .prepare(
          `INSERT INTO notes (user_sub, slug, body, updated) VALUES (?, ?, ?, ?)
           ON CONFLICT (user_sub, slug) DO UPDATE SET body = excluded.body, updated = excluded.updated`,
        )
        .bind(user.sub, slug, text, now)
        .run();
    } else {
      await db.prepare('DELETE FROM notes WHERE user_sub = ? AND slug = ?').bind(user.sub, slug).run();
    }
    return json(200, { ok: true, updated: now });
  }

  return null;
}

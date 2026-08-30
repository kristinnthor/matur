/**
 * Sign-in state and personal data (favourites, private notes).
 *
 * The site is static and works offline, so nothing here may be load-bearing:
 * if the account API is unconfigured, unreachable or the person is signed out,
 * every page still renders and every existing feature still works. Personal
 * data is mirrored to localStorage purely so a favourite still shows on a
 * phone in a kitchen with no signal.
 */

const GIS_SRC = 'https://accounts.google.com/gsi/client';
const CACHE_KEY = 'matur:personal';

export interface Personal {
  favourites: string[];
  notes: Record<string, { body: string; updated: number }>;
}

export interface AccountState {
  enabled: boolean;
  signedIn: boolean;
  email: string | null;
  name: string | null;
  personal: Personal;
}

const empty: Personal = { favourites: [], notes: {} };

export const state: AccountState = {
  enabled: false,
  signedIn: false,
  email: null,
  name: null,
  personal: readCache(),
};

function readCache(): Personal {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return { ...empty };
    const parsed = JSON.parse(raw) as Personal;
    return {
      favourites: Array.isArray(parsed.favourites) ? parsed.favourites : [],
      notes: parsed.notes && typeof parsed.notes === 'object' ? parsed.notes : {},
    };
  } catch {
    return { ...empty };
  }
}

function writeCache(): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(state.personal));
  } catch {
    // Storage unavailable; the page still works, nothing is remembered.
  }
}

/** Signing out must not leave one person's favourites on a shared device. */
function clearCache(): void {
  state.personal = { ...empty, notes: {} };
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    /* nothing to clear */
  }
}

function announce(): void {
  document.dispatchEvent(new CustomEvent('matur:account-changed'));
}

async function api(path: string, init?: RequestInit): Promise<Response | null> {
  try {
    return await fetch(path, { credentials: 'same-origin', ...init });
  } catch {
    return null; // offline
  }
}

async function loadPersonal(): Promise<void> {
  const res = await api('/api/personal');
  if (!res?.ok) return;
  const data = (await res.json().catch(() => null)) as Personal | null;
  if (!data) return;
  state.personal = {
    favourites: data.favourites ?? [],
    notes: data.notes ?? {},
  };
  writeCache();
  announce();
}

export function isFavourite(slug: string): boolean {
  return state.personal.favourites.includes(slug);
}

export async function setFavourite(slug: string, on: boolean): Promise<boolean> {
  if (!state.signedIn) return false;
  const before = state.personal.favourites;
  state.personal.favourites = on
    ? [...new Set([...before, slug])]
    : before.filter((s) => s !== slug);
  writeCache();
  announce();

  const res = await api('/api/favourite', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ slug, on }),
  });
  if (!res?.ok) {
    // Put it back rather than showing a heart the server never recorded.
    state.personal.favourites = before;
    writeCache();
    announce();
    return false;
  }
  return true;
}

export function noteFor(slug: string): string {
  return state.personal.notes[slug]?.body ?? '';
}

export async function saveNote(slug: string, body: string): Promise<boolean> {
  if (!state.signedIn) return false;
  const res = await api('/api/note', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ slug, body }),
  });
  if (!res?.ok) return false;
  const text = body.trim();
  if (text) state.personal.notes[slug] = { body: text, updated: Date.now() };
  else delete state.personal.notes[slug];
  writeCache();
  announce();
  return true;
}

function loadGis(): Promise<void> {
  if (document.querySelector(`script[src="${GIS_SRC}"]`)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GIS_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('gis failed'));
    document.head.append(script);
  });
}

interface GoogleIdApi {
  accounts: {
    id: {
      initialize(config: { client_id: string; callback: (r: { credential: string }) => void }): void;
      renderButton(el: HTMLElement, opts: Record<string, unknown>): void;
      disableAutoSelect(): void;
    };
  };
}

/** Render Google's own button — it is the only sanctioned way to sign in. */
export async function mountSignIn(target: HTMLElement, clientId: string): Promise<void> {
  await loadGis();
  const google = (window as unknown as { google?: GoogleIdApi }).google;
  if (!google) throw new Error('gis missing');
  google.accounts.id.initialize({
    client_id: clientId,
    callback: async (response) => {
      const res = await api('/api/auth/google', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ credential: response.credential }),
      });
      const body = (await res?.json().catch(() => null)) as { error?: string } | null;
      if (!res?.ok) {
        document.dispatchEvent(
          new CustomEvent('matur:account-error', {
            detail: body?.error ?? 'Innskráning mistókst.',
          }),
        );
        return;
      }
      await refresh();
    },
  });
  google.accounts.id.renderButton(target, {
    theme: 'filled_black',
    size: 'medium',
    shape: 'pill',
    text: 'signin',
    locale: 'is',
  });
}

export async function signOut(): Promise<void> {
  await api('/api/auth/signout', { method: 'POST' });
  (window as unknown as { google?: GoogleIdApi }).google?.accounts.id.disableAutoSelect();
  state.signedIn = false;
  state.email = null;
  state.name = null;
  clearCache();
  announce();
}

/** Ask the server who we are; safe to call on every page. */
export async function refresh(): Promise<AccountState> {
  const res = await api('/api/me');
  if (!res?.ok) {
    // Offline or not deployed yet: keep whatever the cache holds and stay quiet.
    announce();
    return state;
  }
  const data = (await res.json().catch(() => null)) as Partial<AccountState> | null;
  const wasSignedIn = state.signedIn;
  state.enabled = Boolean(data?.enabled);
  state.signedIn = Boolean(data?.signedIn);
  state.email = data?.email ?? null;
  state.name = data?.name ?? null;
  if (state.signedIn) await loadPersonal();
  else if (wasSignedIn) clearCache();
  announce();
  return state;
}

export async function config(): Promise<{ enabled: boolean; clientId: string | null }> {
  const res = await api('/api/auth/config');
  if (!res?.ok) return { enabled: false, clientId: null };
  return (await res.json().catch(() => ({ enabled: false, clientId: null }))) as {
    enabled: boolean;
    clientId: string | null;
  };
}

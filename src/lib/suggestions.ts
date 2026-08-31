/**
 * Recipe suggestions: a shared queue of links the family wants turned into
 * recipes.
 *
 * The URL is the whole payload, it is submitted by a person and later rendered
 * as a link, so it is validated rather than trusted: only http(s) survives, and
 * tracking junk is stripped so the same recipe posted from two phones does not
 * arrive as two different links.
 */

export const MAX_URL = 500;
export const MAX_NOTE = 500;

/** Query parameters that identify the sharer, not the recipe. */
const TRACKING = /^(utm_|fbclid$|gclid$|mc_[ce]id$|igshid$|ref$|ref_src$|si$|tp_image_id$|pin_)/i;

/**
 * A canonical http(s) URL, or null if it is not one.
 *
 * Anything that is not http(s) is refused outright — `javascript:` and `data:`
 * links must never reach an href, and no other scheme is a recipe.
 */
export function normaliseUrl(raw: string): string | null {
  const trimmed = (raw ?? '').trim();
  if (!trimmed || trimmed.length > MAX_URL) return null;

  let url: URL;
  try {
    // A bare "example.com/x" is what people paste; assume https for it.
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (!url.hostname.includes('.')) return null;

  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING.test(key)) url.searchParams.delete(key);
  }
  // A fragment never identifies a different recipe.
  url.hash = '';
  const cleaned = url.toString();
  return cleaned.length > MAX_URL ? null : cleaned;
}

/** Shown next to a suggestion so the list reads as sites, not raw URLs. */
export function siteOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export const STATUSES = ['nytt', 'unnid', 'hafnad'] as const;
export type Status = (typeof STATUSES)[number];

export const STATUS_LABEL: Record<Status, string> = {
  nytt: 'Nýtt',
  unnid: 'Komið á vefinn',
  hafnad: 'Sleppt',
};

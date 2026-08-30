/** Client-side photo upload helpers for the per-recipe photo editor. */

/**
 * Uploading used to be gated by a passphrase everyone shared. It is now gated by
 * signing in, so remove any copy still sitting in a family member's browser
 * rather than leaving a dead secret behind on their phone.
 */
export function forgetLegacyPassphrase(): void {
  try {
    localStorage.removeItem('matur:uploadpass');
  } catch {
    // Storage unavailable; nothing to forget.
  }
}

export function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export interface UploadResult {
  ok: boolean;
  replaced?: boolean;
  status: number;
  error?: string;
}

export async function uploadPhoto(slug: string, jpeg: Blob): Promise<UploadResult> {
  const data = await toBase64(jpeg);
  const res = await fetch('/api/photo', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ slug, data }),
  });
  const reply = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    replaced?: boolean;
    error?: string;
  };
  if (res.ok && reply.ok) {
    return { ok: true, replaced: reply.replaced, status: res.status };
  }
  return { ok: false, status: res.status, error: reply.error ?? `Villa (${res.status}).` };
}

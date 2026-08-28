/** Shared client-side photo upload helpers — used by /myndir/ and the per-recipe editor. */

const PASS_KEY = 'matur:uploadpass';
const MAX_DIM = 1600;

export function readPass(): string {
  try {
    return localStorage.getItem(PASS_KEY) ?? '';
  } catch {
    return '';
  }
}

export function writePass(pass: string): void {
  try {
    localStorage.setItem(PASS_KEY, pass);
  } catch {
    // Storage unavailable — the passphrase simply is not remembered.
  }
}

export function clearPass(): void {
  try {
    localStorage.removeItem(PASS_KEY);
  } catch {
    // fine
  }
}

/** Downscale to MAX_DIM and re-encode as JPEG; phones send 8 MB originals otherwise. */
export async function toJpeg(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() =>
    createImageBitmap(file),
  );
  const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/jpeg', 0.82),
  );
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

export async function uploadPhoto(slug: string, jpeg: Blob, pass: string): Promise<UploadResult> {
  const data = await toBase64(jpeg);
  const res = await fetch('/api/photo', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-upload-pass': pass },
    body: JSON.stringify({ slug, data }),
  });
  const reply = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    replaced?: boolean;
    error?: string;
  };
  if (res.ok && reply.ok) {
    writePass(pass);
    return { ok: true, replaced: reply.replaced, status: res.status };
  }
  if (res.status === 401) clearPass();
  return { ok: false, status: res.status, error: reply.error ?? `Villa (${res.status}).` };
}

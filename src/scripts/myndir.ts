const PASS_KEY = 'matur:uploadpass';
const MAX_DIM = 1600;

const form = document.querySelector<HTMLFormElement>('#upload-form')!;
const select = document.querySelector<HTMLSelectElement>('#recipe-select')!;
const fileInput = document.querySelector<HTMLInputElement>('#photo-input')!;
const passInput = document.querySelector<HTMLInputElement>('#pass-input')!;
const preview = document.querySelector<HTMLImageElement>('#preview')!;
const status = document.querySelector<HTMLElement>('#status')!;
const btn = document.querySelector<HTMLButtonElement>('#upload-btn')!;

try {
  passInput.value = localStorage.getItem(PASS_KEY) ?? '';
} catch {
  // Storage unavailable — the passphrase simply is not remembered.
}

/** Downscale to MAX_DIM and re-encode as JPEG; phones send 8 MB originals otherwise. */
async function toJpeg(file: File): Promise<Blob> {
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

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  const blob = await toJpeg(file).catch(() => null);
  if (blob) {
    preview.src = URL.createObjectURL(blob);
    preview.hidden = false;
  }
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const file = fileInput.files?.[0];
  if (!file || !select.value) return;

  btn.disabled = true;
  status.textContent = 'Vinn úr myndinni …';
  try {
    const blob = await toJpeg(file);
    const data = await toBase64(blob);
    status.textContent = `Hleð upp (${Math.round(blob.size / 1024)} KB) …`;

    const res = await fetch('/api/photo', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-upload-pass': passInput.value,
      },
      body: JSON.stringify({ slug: select.value, data }),
    });
    const reply = (await res.json().catch(() => ({}))) as { ok?: boolean; replaced?: boolean; error?: string };

    if (res.ok && reply.ok) {
      try {
        localStorage.setItem(PASS_KEY, passInput.value);
      } catch {
        // fine
      }
      status.textContent = reply.replaced
        ? 'Tókst! Myndinni verður skipt út á vefnum eftir um 2 mínútur.'
        : 'Tókst! Myndin fer í loftið eftir um 2 mínútur.';
      form.reset();
      passInput.value = localStorage.getItem(PASS_KEY) ?? passInput.value;
      preview.hidden = true;
    } else {
      status.textContent = reply.error ?? `Villa (${res.status}).`;
    }
  } catch (err) {
    status.textContent = 'Upphleðslan mistókst — athugaðu nettenginguna og reyndu aftur.';
  } finally {
    btn.disabled = false;
  }
});

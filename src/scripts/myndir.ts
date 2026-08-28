import { readPass, toJpeg, uploadPhoto } from '../lib/upload-client';

const form = document.querySelector<HTMLFormElement>('#upload-form')!;
const select = document.querySelector<HTMLSelectElement>('#recipe-select')!;
const fileInput = document.querySelector<HTMLInputElement>('#photo-input')!;
const passInput = document.querySelector<HTMLInputElement>('#pass-input')!;
const preview = document.querySelector<HTMLImageElement>('#preview')!;
const status = document.querySelector<HTMLElement>('#status')!;
const btn = document.querySelector<HTMLButtonElement>('#upload-btn')!;

passInput.value = readPass();

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
    status.textContent = `Hleð upp (${Math.round(blob.size / 1024)} KB) …`;
    const reply = await uploadPhoto(select.value, blob, passInput.value);

    if (reply.ok) {
      status.textContent = reply.replaced
        ? 'Tókst! Myndinni verður skipt út á vefnum eftir um 2 mínútur.'
        : 'Tókst! Myndin fer í loftið eftir um 2 mínútur.';
      form.reset();
      passInput.value = readPass() || passInput.value;
      preview.hidden = true;
    } else {
      status.textContent = reply.error ?? 'Villa.';
    }
  } catch {
    status.textContent = 'Upphleðslan mistókst — athugaðu nettenginguna og reyndu aftur.';
  } finally {
    btn.disabled = false;
  }
});

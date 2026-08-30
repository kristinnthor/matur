import { readPass, uploadPhoto } from '../lib/upload-client';
import { createCropper } from './cropper';

const form = document.querySelector<HTMLFormElement>('#upload-form')!;
const select = document.querySelector<HTMLSelectElement>('#recipe-select')!;
const fileInput = document.querySelector<HTMLInputElement>('#photo-input')!;
const passInput = document.querySelector<HTMLInputElement>('#pass-input')!;
const cropMount = document.querySelector<HTMLElement>('#preview-crop')!;
const status = document.querySelector<HTMLElement>('#status')!;
const btn = document.querySelector<HTMLButtonElement>('#upload-btn')!;

const cropper = createCropper();
cropMount.append(cropper.element);

passInput.value = readPass();

fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  status.textContent = '';
  try {
    await cropper.load(file);
  } catch {
    status.textContent = 'Gat ekki unnið úr myndinni — reyndu aðra.';
  }
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!select.value || !cropper.hasImage()) return;

  btn.disabled = true;
  status.textContent = 'Vinn úr myndinni …';
  try {
    const blob = await cropper.toBlob();
    status.textContent = `Hleð upp (${Math.round(blob.size / 1024)} KB) …`;
    const reply = await uploadPhoto(select.value, blob, passInput.value);

    if (reply.ok) {
      status.textContent = reply.replaced
        ? 'Tókst! Myndinni verður skipt út á vefnum eftir um 2 mínútur.'
        : 'Tókst! Myndin fer í loftið eftir um 2 mínútur.';
      form.reset();
      passInput.value = readPass() || passInput.value;
      cropper.element.hidden = true;
    } else {
      status.textContent = reply.error ?? 'Villa.';
    }
  } catch {
    status.textContent = 'Upphleðslan mistókst — athugaðu nettenginguna og reyndu aftur.';
  } finally {
    btn.disabled = false;
  }
});

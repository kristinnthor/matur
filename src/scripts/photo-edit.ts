import { readPass, toJpeg, uploadPhoto } from '../lib/upload-client';

const openBtn = document.querySelector<HTMLButtonElement>('#photo-edit-open');
const dialog = document.querySelector<HTMLDialogElement>('#photo-dialog');

if (openBtn && dialog && typeof dialog.showModal === 'function') {
  const slug = openBtn.dataset.slug!;
  const preview = dialog.querySelector<HTMLImageElement>('#photo-dialog-preview')!;
  const passInput = dialog.querySelector<HTMLInputElement>('#photo-dialog-pass')!;
  const submit = dialog.querySelector<HTMLButtonElement>('#photo-dialog-submit')!;
  const cancel = dialog.querySelector<HTMLButtonElement>('#photo-dialog-cancel')!;
  const status = dialog.querySelector<HTMLElement>('#photo-dialog-status')!;

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.setAttribute('capture', 'environment');
  fileInput.hidden = true;
  document.body.append(fileInput);

  let jpeg: Blob | null = null;

  openBtn.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    status.textContent = '';
    try {
      jpeg = await toJpeg(file);
    } catch {
      jpeg = null;
      status.textContent = 'Gat ekki unnið úr myndinni — reyndu aðra.';
    }
    if (jpeg) preview.src = URL.createObjectURL(jpeg);
    passInput.value = readPass();
    dialog.showModal();
  });

  cancel.addEventListener('click', () => {
    fileInput.value = '';
    dialog.close();
  });

  submit.addEventListener('click', async () => {
    if (!jpeg) return;
    submit.disabled = true;
    status.textContent = 'Hleð upp …';
    try {
      const result = await uploadPhoto(slug, jpeg, passInput.value);
      if (result.ok) {
        status.textContent = result.replaced
          ? 'Tókst! Nýja myndin fer í loftið eftir um 2 mínútur.'
          : 'Tókst! Myndin fer í loftið eftir um 2 mínútur.';
        swapHero(preview.src);
        setTimeout(() => {
          dialog.close();
          fileInput.value = '';
        }, 1800);
      } else {
        status.textContent = result.error ?? 'Villa.';
        if (result.status === 401) passInput.value = '';
      }
    } catch {
      status.textContent = 'Upphleðslan mistókst — athugaðu nettenginguna.';
    } finally {
      submit.disabled = false;
    }
  });

  /** Show the uploaded photo immediately while the build catches up. */
  function swapHero(src: string): void {
    const hero = document.querySelector<HTMLImageElement>('.recipe-hero');
    if (hero) {
      hero.srcset = '';
      hero.src = src;
      return;
    }
    // Recipe had no photo: replace the add-button with a local hero preview.
    const img = document.createElement('img');
    img.className = 'recipe-hero';
    img.src = src;
    img.alt = '';
    openBtn!.replaceWith(img);
  }
}

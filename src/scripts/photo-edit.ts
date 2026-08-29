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
  let previewUrl: string | null = null;
  // The blob URL currently shown by the page hero (via swapHero) — it must
  // survive dialog cleanup, or the hero image goes blank.
  let heroUrl: string | null = null;
  let closeTimer: ReturnType<typeof setTimeout> | undefined;
  // Bumped on every close: an upload still in flight when the dialog closes
  // belongs to a dead session and must not touch the UI again.
  let session = 0;

  const setPreview = (blob: Blob) => {
    if (previewUrl && previewUrl !== heroUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(blob);
    preview.src = previewUrl;
  };

  openBtn.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    status.textContent = '';
    try {
      jpeg = await toJpeg(file);
      setPreview(jpeg);
    } catch {
      jpeg = null;
      status.textContent = 'Gat ekki unnið úr myndinni — reyndu aðra.';
    }
    passInput.value = readPass();
    submit.disabled = false;
    dialog.showModal();
  });

  // Whatever closes the dialog (Hætta við, Esc, success timer): reset the
  // input so re-selecting the same photo fires change again next time.
  dialog.addEventListener('close', () => {
    session++;
    clearTimeout(closeTimer);
    fileInput.value = '';
    jpeg = null;
    submit.disabled = false;
  });

  cancel.addEventListener('click', () => dialog.close());

  passInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit.click();
    }
  });

  submit.addEventListener('click', async () => {
    if (!jpeg || submit.disabled) return;
    const mySession = session;
    const myPreview = previewUrl;
    submit.disabled = true;
    status.textContent = 'Hleð upp …';
    try {
      const result = await uploadPhoto(slug, jpeg, passInput.value);
      if (session !== mySession) return;
      if (result.ok) {
        status.textContent = result.replaced
          ? 'Tókst! Nýja myndin fer í loftið eftir um 2 mínútur.'
          : 'Tókst! Myndin fer í loftið eftir um 2 mínútur.';
        if (myPreview) swapHero(myPreview);
        // Stay disabled through the close window so a second tap cannot
        // commit the same photo twice.
        closeTimer = setTimeout(() => dialog.close(), 1800);
        return;
      }
      status.textContent = result.error ?? 'Villa.';
      if (result.status === 401) passInput.value = '';
      submit.disabled = false;
    } catch {
      if (session !== mySession) return;
      status.textContent = 'Upphleðslan mistókst — athugaðu nettenginguna.';
      submit.disabled = false;
    }
  });

  /** Show the uploaded photo immediately while the build catches up. */
  function swapHero(src: string): void {
    if (heroUrl && heroUrl !== src) URL.revokeObjectURL(heroUrl);
    heroUrl = src;
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

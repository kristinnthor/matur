import { forgetLegacyPassphrase, uploadPhoto } from '../lib/upload-client';
import { state } from './account';
import { createCropper } from './cropper';

const openBtn = document.querySelector<HTMLButtonElement>('#photo-edit-open');
const dialog = document.querySelector<HTMLDialogElement>('#photo-dialog');

if (openBtn && dialog && typeof dialog.showModal === 'function') {
  const slug = openBtn.dataset.slug!;
  const cropMount = dialog.querySelector<HTMLElement>('#photo-dialog-crop')!;
  const submit = dialog.querySelector<HTMLButtonElement>('#photo-dialog-submit')!;
  const cancel = dialog.querySelector<HTMLButtonElement>('#photo-dialog-cancel')!;
  const status = dialog.querySelector<HTMLElement>('#photo-dialog-status')!;

  const cropper = createCropper();
  cropMount.append(cropper.element);

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.setAttribute('capture', 'environment');
  fileInput.hidden = true;
  document.body.append(fileInput);

  // The blob URL the page hero is showing, so it can be released when replaced.
  let heroUrl: string | null = null;
  let closeTimer: ReturnType<typeof setTimeout> | undefined;
  // Bumped on every close: an upload still in flight when the dialog closes
  // belongs to a dead session and must not touch the UI again.
  let session = 0;

  forgetLegacyPassphrase();

  openBtn.addEventListener('click', () => {
    // Say why up front rather than letting someone frame a photo and only then
    // discover the upload will be refused.
    if (!state.signedIn) {
      status.textContent = 'Skráðu þig inn efst á síðunni til að hlaða upp mynd.';
      submit.disabled = true;
      dialog.showModal();
      return;
    }
    fileInput.click();
  });

  // Hoisted function declarations lose the null-narrowing above, so hold the
  // already-checked element in a local the whole block can rely on.
  const modal = dialog;

  /** Put an image into the cropper, opening the dialog if it is not already up. */
  async function openWith(file: File): Promise<void> {
    status.textContent = '';
    submit.disabled = true;
    // Open first: the crop frame has no width until it is laid out, and the
    // initial framing is computed from that width.
    if (!modal.open) modal.showModal();
    try {
      await cropper.load(file);
      submit.disabled = false;
    } catch {
      status.textContent = 'Gat ekki unnið úr myndinni — reyndu aðra.';
    }
  }

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) void openWith(file);
  });

  /** The first image in a clipboard payload, ignoring any text alongside it. */
  function imageFrom(data: DataTransfer | null): File | null {
    if (!data) return null;
    for (const item of data.items) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) return file;
      }
    }
    for (const file of data.files) {
      if (file.type.startsWith('image/')) return file;
    }
    return null;
  }

  // Ctrl/Cmd+V anywhere on the recipe: copy a photo, paste it, crop it.
  // Text pastes are untouched — only a clipboard carrying an image is claimed.
  document.addEventListener('paste', (e) => {
    if (!state.signedIn) return;
    const file = imageFrom((e as ClipboardEvent).clipboardData);
    if (!file) return;
    e.preventDefault();
    void openWith(file);
  });

  // Whatever closes the dialog (Hætta við, Esc, success timer): reset the
  // input so re-selecting the same photo fires change again next time.
  dialog.addEventListener('close', () => {
    session++;
    clearTimeout(closeTimer);
    fileInput.value = '';
    submit.disabled = false;
  });

  cancel.addEventListener('click', () => dialog.close());

  // Reading the clipboard directly needs both API support and permission, so
  // the button only appears where it can actually work; Ctrl+V always does.
  const pasteBtn = dialog.querySelector<HTMLButtonElement>('#photo-dialog-paste')!;
  if (typeof navigator.clipboard?.read === 'function') {
    pasteBtn.hidden = false;
    pasteBtn.addEventListener('click', async () => {
      try {
        for (const item of await navigator.clipboard.read()) {
          const type = item.types.find((t) => t.startsWith('image/'));
          if (!type) continue;
          const blob = await item.getType(type);
          await openWith(new File([blob], 'clipboard.jpg', { type }));
          return;
        }
        status.textContent = 'Engin mynd á klippiborðinu.';
      } catch {
        status.textContent = 'Fékk ekki aðgang að klippiborðinu.';
      }
    });
  }

  submit.addEventListener('click', async () => {
    if (!cropper.hasImage() || submit.disabled) return;
    const mySession = session;
    submit.disabled = true;
    status.textContent = 'Hleð upp …';
    try {
      const jpeg = await cropper.toBlob();
      const result = await uploadPhoto(slug, jpeg);
      if (session !== mySession) return;
      if (result.ok) {
        status.textContent = result.replaced
          ? 'Tókst! Nýja myndin fer í loftið eftir um 2 mínútur.'
          : 'Tókst! Myndin fer í loftið eftir um 2 mínútur.';
        swapHero(URL.createObjectURL(jpeg));
        // Stay disabled through the close window so a second tap cannot
        // commit the same photo twice.
        closeTimer = setTimeout(() => dialog.close(), 1800);
        return;
      }
      status.textContent = result.error ?? 'Villa.';
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

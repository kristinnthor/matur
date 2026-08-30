/**
 * The per-recipe favourite heart and private note.
 *
 * Both are hidden unless someone is signed in — a signed-out visitor sees the
 * recipe exactly as before. The note is private to its author: it is stored in
 * D1 and never rendered into the static HTML, so it cannot leak into the public
 * repo or a cache.
 */
import { isFavourite, noteFor, saveNote, setFavourite, state } from './account';

const box = document.querySelector<HTMLElement>('#recipe-personal');

if (box) {
  const slug = box.dataset.slug!;

  const fav = document.createElement('button');
  fav.type = 'button';
  fav.className = 'fav-btn';

  const noteLabel = document.createElement('label');
  noteLabel.className = 'note-label';
  noteLabel.htmlFor = 'recipe-note';
  noteLabel.textContent = 'Mín athugasemd';

  const note = document.createElement('textarea');
  note.id = 'recipe-note';
  note.className = 'note-box';
  note.rows = 3;
  note.placeholder = 'T.d. „við tvöfölduðum sósuna og slepptum chili“.';

  const noteStatus = document.createElement('span');
  noteStatus.className = 'note-status muted';
  noteStatus.setAttribute('role', 'status');
  noteStatus.setAttribute('aria-live', 'polite');

  fav.addEventListener('click', async () => {
    const next = !isFavourite(slug);
    fav.disabled = true;
    const ok = await setFavourite(slug, next);
    fav.disabled = false;
    if (!ok) noteStatus.textContent = 'Ekki tókst að vista.';
  });

  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let lastSaved = '';
  note.addEventListener('input', () => {
    clearTimeout(saveTimer);
    noteStatus.textContent = '';
    // Save on a pause rather than per keystroke; a note is written slowly.
    saveTimer = setTimeout(async () => {
      const value = note.value;
      if (value === lastSaved) return;
      noteStatus.textContent = 'Vista …';
      const ok = await saveNote(slug, value);
      lastSaved = ok ? value : lastSaved;
      noteStatus.textContent = ok ? 'Vistað' : 'Ekki tókst að vista.';
    }, 900);
  });
  // A note half-typed when the tab closes is still worth keeping.
  window.addEventListener('pagehide', () => {
    if (note.value !== lastSaved) void saveNote(slug, note.value);
  });

  const render = () => {
    box.hidden = !state.signedIn;
    if (!state.signedIn) {
      box.replaceChildren();
      return;
    }
    if (!box.contains(fav)) box.replaceChildren(fav, noteLabel, note, noteStatus);

    const on = isFavourite(slug);
    fav.classList.toggle('on', on);
    fav.setAttribute('aria-pressed', String(on));
    fav.textContent = on ? '★ Uppáhald' : '☆ Setja í uppáhald';

    // Don't overwrite what someone is in the middle of typing.
    if (document.activeElement !== note) {
      const stored = noteFor(slug);
      note.value = stored;
      lastSaved = stored;
    }
  };

  document.addEventListener('matur:account-changed', render);
  render();
}

/** Renders the signed-in person's favourites from the static recipe manifest. */
import { refresh, state } from './account';

interface Entry {
  title: string;
  subtitle: string;
  time: number;
  servings: number;
  word: string;
  photo: string | null;
}

const grid = document.querySelector<HTMLElement>('#mine-grid')!;
const signedOut = document.querySelector<HTMLElement>('#mine-signedout')!;
const empty = document.querySelector<HTMLElement>('#mine-empty')!;
const randomLink = document.querySelector<HTMLElement>('#mine-random')!;

let manifest: Record<string, Entry> = {};
try {
  manifest = JSON.parse(document.querySelector('#recipe-manifest')?.textContent ?? '{}');
} catch {
  // A corrupt embed must not blank the page.
}

function render(): void {
  grid.replaceChildren();
  signedOut.hidden = state.signedIn;
  // Favourites for recipes that have since been removed are simply skipped.
  const slugs = state.personal.favourites.filter((s) => manifest[s]);
  empty.hidden = !state.signedIn || slugs.length > 0;
  randomLink.hidden = !state.signedIn || slugs.length === 0;
  if (!state.signedIn) return;

  for (const slug of slugs.sort((a, b) =>
    manifest[a]!.title.localeCompare(manifest[b]!.title, 'is'),
  )) {
    const r = manifest[slug]!;
    const card = document.createElement('a');
    card.className = 'card';
    card.href = `/uppskrift/${slug}/`;

    // Show the real photo where there is one; otherwise the lettered
    // placeholder, carrying the same "vantar mynd" marker as every other card.
    let art: HTMLElement;
    if (r.photo) {
      const img = document.createElement('img');
      img.src = r.photo;
      img.alt = '';
      img.loading = 'lazy';
      art = img;
    } else {
      art = document.createElement('div');
      art.className = 'card-ph';
      art.setAttribute('aria-hidden', 'true');
      const initial = document.createElement('span');
      initial.textContent = r.title.slice(0, 1);
      const marker = document.createElement('em');
      marker.className = 'needs-photo';
      marker.textContent = 'Vantar mynd';
      art.append(initial, marker);
    }

    const h2 = document.createElement('h2');
    h2.className = 'card-title';
    h2.textContent = r.title;

    const sub = document.createElement('p');
    sub.className = 'muted';
    sub.textContent = r.subtitle;

    const meta = document.createElement('p');
    meta.className = 'muted card-meta';
    meta.textContent = `${r.time} mín · ${r.servings} ${r.word}`;

    card.append(art, h2, sub, meta);
    grid.append(card);
  }
}

document.addEventListener('matur:account-changed', render);
render();
void refresh();

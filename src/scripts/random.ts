/**
 * The "what should we cook?" page: draw 1–5 recipes at random, from every
 * recipe or from the signed-in person's favourites, let them tweak the draw,
 * then hand the final selection to the shopping list.
 */
import { mergeList, type ListSelection } from '../lib/list-storage';
import { MAX_COUNT, pick } from '../lib/random';
import { refresh, state } from './account';
import { readList, servingsFor, writeList } from './list-store';

interface Entry {
  title: string;
  subtitle: string;
  time: number;
  servings: number;
  word: string;
  photo: string | null;
}

/** Last chosen count and pool, so a repeat visit is one tap. */
const PREFS_KEY = 'matur:random-prefs';
/** The current draw. Session, not local: a draw is for tonight, not next month. */
const DRAW_KEY = 'matur:random-draw';

let manifest: Record<string, Entry> = {};
try {
  manifest = JSON.parse(document.querySelector('#recipe-manifest')?.textContent ?? '{}');
} catch {
  // A corrupt embed must not blank the page.
}

const form = document.querySelector<HTMLFormElement>('#random-form')!;
const poolToggle = document.querySelector<HTMLElement>('#pool-toggle')!;
const poolFav = document.querySelector<HTMLInputElement>('#pool-fav')!;
const poolHint = document.querySelector<HTMLElement>('#pool-hint')!;
const drawBtn = document.querySelector<HTMLButtonElement>('#draw')!;
const notice = document.querySelector<HTMLElement>('#draw-notice')!;
const results = document.querySelector<HTMLElement>('#draw-results')!;
const list = document.querySelector<HTMLOListElement>('#draw-list')!;
const moreBtn = document.querySelector<HTMLButtonElement>('#draw-more')!;
const againBtn = document.querySelector<HTMLButtonElement>('#draw-again')!;
const makeBtn = document.querySelector<HTMLButtonElement>('#make-list')!;
const dialog = document.querySelector<HTMLDialogElement>('#list-dialog')!;
const dialogText = document.querySelector<HTMLElement>('#list-dialog-text')!;

function readJson<T>(storage: Storage, key: string, fallback: T): T {
  try {
    const raw = storage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(storage: Storage, key: string, value: unknown): void {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode or blocked storage: the page still works, nothing is remembered.
  }
}

/* ---- Controls -------------------------------------------------------- */

function count(): number {
  return Number(form.querySelector<HTMLInputElement>('input[name="count"]:checked')?.value) || 3;
}

function setCount(n: number): void {
  const radio = form.querySelector<HTMLInputElement>(`input[name="count"][value="${n}"]`);
  if (radio) radio.checked = true;
}

function favouritesOnly(): boolean {
  return state.signedIn && !poolFav.disabled && poolFav.checked;
}

function favouritePool(): string[] {
  // Favourites for recipes that have since been removed are simply skipped.
  return state.personal.favourites.filter((s) => manifest[s]);
}

function pool(): string[] {
  return favouritesOnly() ? favouritePool() : Object.keys(manifest);
}

function savePrefs(): void {
  writeJson(localStorage, PREFS_KEY, { count: count(), favourites: poolFav.checked });
}

function loadPrefs(): void {
  const prefs = readJson<{ count?: number; favourites?: boolean }>(localStorage, PREFS_KEY, {});
  if (typeof prefs.count === 'number') setCount(prefs.count);
  if (typeof prefs.favourites === 'boolean') poolFav.checked = prefs.favourites;
  // "Mínar uppskriftir" links here with the pool pre-selected.
  if (new URLSearchParams(location.search).get('pool') === 'favourites') poolFav.checked = true;
}

/** The favourites toggle exists only for someone signed in with favourites. */
function syncAccount(): void {
  poolToggle.hidden = !state.signedIn;
  const none = state.signedIn && favouritePool().length === 0;
  poolFav.disabled = none;
  poolHint.hidden = !none;
  update();
}

/* ---- Draw ------------------------------------------------------------ */

let draw: string[] = readJson<string[]>(sessionStorage, DRAW_KEY, []).filter(
  (s) => typeof s === 'string' && manifest[s],
);

function persistDraw(): void {
  writeJson(sessionStorage, DRAW_KEY, draw);
}

function say(message: string): void {
  notice.textContent = message;
}

function shortNotice(short: number, drawn: number): void {
  if (short === 0) {
    say('');
    return;
  }
  if (drawn === 0) {
    say(favouritesOnly() ? 'Allar uppáhaldsuppskriftirnar eru þegar á listanum.' : 'Allar uppskriftirnar eru þegar á listanum.');
    return;
  }
  const n = favouritePool().length;
  say(
    favouritesOnly()
      ? `Aðeins ${n} ${n === 1 ? 'uppskrift' : 'uppskriftir'} í uppáhaldi — dró ${n === 1 ? 'hana' : 'þær allar'}.`
      : 'Ekki nógu margar uppskriftir til — dró þær sem voru eftir.',
  );
}

function card(slug: string): HTMLLIElement {
  const r = manifest[slug]!;
  const li = document.createElement('li');
  li.className = 'draw-item';
  li.dataset.slug = slug;

  let art: HTMLElement;
  if (r.photo) {
    const img = document.createElement('img');
    img.className = 'draw-thumb';
    img.src = r.photo;
    img.alt = '';
    img.loading = 'lazy';
    art = img;
  } else {
    art = document.createElement('div');
    art.className = 'draw-thumb draw-ph';
    art.setAttribute('aria-hidden', 'true');
    art.textContent = r.title.slice(0, 1);
  }

  const body = document.createElement('div');
  body.className = 'draw-body';
  const title = document.createElement('a');
  title.href = `/uppskrift/${slug}/`;
  title.textContent = r.title;
  const meta = document.createElement('p');
  meta.className = 'muted';
  meta.textContent = [r.subtitle, `${r.time} mín · ${r.servings} ${r.word}`].filter(Boolean).join(' · ');
  body.append(title, meta);

  const reroll = document.createElement('button');
  reroll.type = 'button';
  reroll.className = 'draw-reroll';
  reroll.dataset.act = 'reroll';
  reroll.setAttribute('aria-label', `Skipta út: ${r.title}`);
  reroll.title = 'Skipta út';
  reroll.textContent = '↻';
  reroll.addEventListener('click', () => rerollOne(slug));

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'draw-remove';
  remove.dataset.act = 'remove';
  remove.setAttribute('aria-label', `Fjarlægja: ${r.title}`);
  remove.title = 'Fjarlægja';
  remove.textContent = '×';
  remove.addEventListener('click', () => removeOne(slug));

  li.append(art, body, reroll, remove);
  return li;
}

/** Button states follow the draw; the list itself is only rebuilt on a full draw. */
function update(): void {
  results.hidden = draw.length === 0;
  const left = pool().filter((s) => !draw.includes(s)).length;
  moreBtn.disabled = draw.length >= MAX_COUNT || left === 0;
  moreBtn.title = draw.length >= MAX_COUNT ? `Mest ${MAX_COUNT} í einu` : left === 0 ? 'Ekkert eftir að draga' : '';
  for (const btn of list.querySelectorAll<HTMLButtonElement>('.draw-reroll')) {
    btn.disabled = left === 0;
  }
  makeBtn.disabled = draw.length === 0;
}

function renderAll(): void {
  list.replaceChildren(...draw.map(card));
  persistDraw();
  update();
}

function drawAll(): void {
  const { slugs, short } = pick({ count: count(), pool: pool() });
  draw = slugs;
  shortNotice(short, slugs.length);
  renderAll();
  if (draw.length > 0) list.querySelector<HTMLElement>('.draw-reroll')?.focus();
}

function drawMore(): void {
  if (draw.length >= MAX_COUNT) return;
  const { slugs, short } = pick({ count: 1, pool: pool(), exclude: draw });
  if (short > 0) {
    shortNotice(short, 0);
    update();
    return;
  }
  draw = [...draw, slugs[0]!];
  const li = card(slugs[0]!);
  list.append(li);
  say('');
  persistDraw();
  update();
  li.querySelector<HTMLElement>('.draw-reroll')?.focus();
}

/** Replace one card in place; the rest of the list, and focus, stay put. */
function rerollOne(slug: string): void {
  const { slugs, short } = pick({ count: 1, pool: pool(), exclude: draw });
  if (short > 0) {
    shortNotice(short, 0);
    update();
    return;
  }
  const next = slugs[0]!;
  const old = list.querySelector<HTMLElement>(`[data-slug="${CSS.escape(slug)}"]`);
  draw = draw.map((s) => (s === slug ? next : s));
  const li = card(next);
  if (old) old.replaceWith(li);
  else list.append(li);
  say('');
  persistDraw();
  update();
  li.querySelector<HTMLElement>('.draw-reroll')?.focus();
}

function removeOne(slug: string): void {
  const old = list.querySelector<HTMLElement>(`[data-slug="${CSS.escape(slug)}"]`);
  // Where focus lands next: the following card, else the previous, else the draw button.
  const neighbour = (old?.nextElementSibling ?? old?.previousElementSibling) as HTMLElement | null;
  draw = draw.filter((s) => s !== slug);
  old?.remove();
  say('');
  persistDraw();
  update();
  (neighbour?.querySelector<HTMLElement>('.draw-remove') ?? (draw.length ? moreBtn : drawBtn)).focus();
}

/* ---- Hand-off to the shopping list ----------------------------------- */

function selection(): ListSelection {
  return Object.fromEntries(draw.map((s) => [s, servingsFor(s, manifest[s]!.servings)]));
}

function go(next: ListSelection): void {
  writeList(next);
  location.assign('/innkaupalisti/');
}

function makeList(): void {
  if (draw.length === 0) return;
  const additions = selection();
  const existing = Object.fromEntries(Object.entries(readList()).filter(([s]) => manifest[s]));
  const n = Object.keys(existing).length;
  if (n === 0) {
    go(additions);
    return;
  }
  if (typeof dialog.showModal !== 'function') {
    // No <dialog> support: a plain question rather than a silent overwrite.
    go(confirm(`Það eru þegar ${n} uppskriftir á innkaupalistanum. Skipta þeim út?`) ? additions : mergeList(existing, additions));
    return;
  }
  dialogText.textContent =
    n === 1
      ? 'Það er þegar ein uppskrift á innkaupalistanum. Skipta henni út, eða bæta við?'
      : `Það eru þegar ${n} uppskriftir á innkaupalistanum. Skipta þeim út, eða bæta við?`;
  dialog.showModal();
}

dialog.addEventListener('click', (e) => {
  const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
  if (!act) return;
  dialog.close();
  if (act === 'cancel') return;
  const additions = selection();
  go(act === 'replace' ? additions : mergeList(readList(), additions));
});

/* ---- Wire-up --------------------------------------------------------- */

form.addEventListener('submit', (e) => {
  e.preventDefault();
  savePrefs();
  drawAll();
});
form.addEventListener('change', () => {
  savePrefs();
  update();
});
moreBtn.addEventListener('click', drawMore);
againBtn.addEventListener('click', () => {
  savePrefs();
  drawAll();
});
makeBtn.addEventListener('click', makeList);

document.addEventListener('matur:account-changed', syncAccount);

loadPrefs();
renderAll();
syncAccount();
void refresh();

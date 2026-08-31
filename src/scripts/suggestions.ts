/**
 * The shared queue of recipe links waiting to be turned into recipes.
 *
 * Everything here is built with DOM calls rather than innerHTML: the URL, the
 * note and the submitter's name all come from people, and this page renders
 * them straight back.
 */
import { state } from './account';
import { STATUS_LABEL, normaliseUrl, siteOf, type Status } from '../lib/suggestions';

interface Suggestion {
  id: number;
  user_name: string;
  url: string;
  note: string;
  status: Status;
  slug: string | null;
  created: number;
}

const form = document.querySelector<HTMLFormElement>('#sug-form')!;
const signedOut = document.querySelector<HTMLElement>('#sug-signedout')!;
const urlInput = document.querySelector<HTMLInputElement>('#sug-url')!;
const noteInput = document.querySelector<HTMLInputElement>('#sug-note')!;
const submit = document.querySelector<HTMLButtonElement>('#sug-submit')!;
const status = document.querySelector<HTMLElement>('#sug-status')!;
const list = document.querySelector<HTMLElement>('#sug-list')!;

let suggestions: Suggestion[] = [];
let mine = '';

async function load(): Promise<void> {
  if (!state.signedIn) return;
  try {
    const res = await fetch('/api/suggestions', { credentials: 'same-origin' });
    if (!res.ok) return;
    const data = (await res.json()) as { suggestions: Suggestion[]; me: string };
    suggestions = data.suggestions ?? [];
    mine = data.me ?? '';
    renderList();
  } catch {
    // Offline: the form still works when connectivity returns.
  }
}

function renderList(): void {
  list.replaceChildren();
  if (!state.signedIn || suggestions.length === 0) return;

  const heading = document.createElement('h2');
  heading.textContent = 'Á listanum';
  list.append(heading);

  const ul = document.createElement('ul');
  ul.className = 'sug-list';

  for (const s of suggestions) {
    const li = document.createElement('li');
    li.className = `sug-item sug-${s.status}`;

    const link = document.createElement('a');
    link.href = s.url;
    link.rel = 'noopener nofollow';
    link.target = '_blank';
    link.textContent = siteOf(s.url);

    const badge = document.createElement('span');
    badge.className = 'sug-badge';
    badge.textContent = STATUS_LABEL[s.status] ?? s.status;

    const top = document.createElement('p');
    top.className = 'sug-top';
    top.append(link, badge);
    li.append(top);

    if (s.status === 'unnid' && s.slug) {
      const added = document.createElement('a');
      added.className = 'sug-added';
      added.href = `/uppskrift/${s.slug}/`;
      added.textContent = 'Skoða uppskriftina →';
      li.append(added);
    }

    if (s.note) {
      const note = document.createElement('p');
      note.className = 'muted sug-note';
      note.textContent = s.note;
      li.append(note);
    }

    const by = document.createElement('p');
    by.className = 'muted sug-by';
    by.textContent = `Frá ${s.user_name}`;
    li.append(by);

    // You can withdraw your own, but only while nobody has acted on it.
    if (s.status === 'nytt' && mine) {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'sug-remove';
      remove.textContent = 'Fjarlægja';
      remove.addEventListener('click', async () => {
        remove.disabled = true;
        const res = await fetch('/api/suggestion', {
          method: 'DELETE',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id: s.id }),
        }).catch(() => null);
        if (res?.ok) await load();
        else remove.disabled = false;
      });
      li.append(remove);
    }

    ul.append(li);
  }
  list.append(ul);
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  // Check before the round trip so a typo is caught immediately.
  const url = normaliseUrl(urlInput.value);
  if (!url) {
    status.textContent = 'Þetta er ekki gild vefslóð.';
    return;
  }
  submit.disabled = true;
  status.textContent = 'Sendi …';
  try {
    const res = await fetch('/api/suggestion', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url, note: noteInput.value }),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (res.ok) {
      status.textContent = 'Takk! Tillagan er komin á listann.';
      form.reset();
      await load();
    } else {
      status.textContent = body.error ?? 'Ekki tókst að senda tillöguna.';
    }
  } catch {
    status.textContent = 'Ekki tókst að senda — athugaðu nettenginguna.';
  } finally {
    submit.disabled = false;
  }
});

function render(): void {
  form.hidden = !state.signedIn;
  signedOut.hidden = state.signedIn;
  if (state.signedIn) void load();
  else {
    suggestions = [];
    renderList();
  }
}

document.addEventListener('matur:account-changed', render);
render();

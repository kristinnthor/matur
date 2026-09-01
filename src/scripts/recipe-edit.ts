/**
 * The recipe text editor.
 *
 * The page itself is static and public — it holds nothing that is not already
 * on the recipe page — so hiding the form from non-admins is courtesy, not
 * security. PUT /api/recipe is the gate that matters.
 */
import type { RecipePatch } from '../lib/recipe-edit';
import { state } from './account';

const page = document.querySelector<HTMLElement>('.recipe-edit');
const form = document.querySelector<HTMLFormElement>('#edit-form');
const signedOut = document.querySelector<HTMLElement>('#edit-signedout');
const status = document.querySelector<HTMLElement>('#edit-status');
const save = document.querySelector<HTMLButtonElement>('#edit-save');

if (page && form && signedOut && status && save) {
  const slug = page.dataset.slug!;

  const show = () => {
    form.hidden = !state.admin;
    signedOut.hidden = state.admin;
  };
  document.addEventListener('matur:account-changed', show);
  show();

  /** A field's value by name, or '' when the input is missing. */
  const value = (name: string): string =>
    (form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | null)?.value ?? '';

  /**
   * Every rendered field is sent, blank ones included: the API reads an absent
   * field as "leave it alone" and a blank one as "clear it", so omitting blanks
   * would make clearing a subtitle impossible.
   */
  const buildPatch = (): RecipePatch => {
    const ingredients: RecipePatch['ingredients'] = {};
    for (const fieldset of form.querySelectorAll<HTMLElement>('.edit-ing')) {
      const id = fieldset.dataset.id!;
      ingredients[id] = {
        item: value(`item:${id}`),
        note: value(`note:${id}`),
        group: value(`group:${id}`),
      };
    }

    const steps: string[] = [];
    for (const area of form.querySelectorAll<HTMLTextAreaElement>('.edit-step textarea')) {
      steps.push(area.value);
    }

    return {
      title: value('title'),
      subtitle: value('subtitle'),
      description: value('description'),
      ingredients,
      steps,
      notes: {
        improvements: value('improvements'),
        storage: value('storage'),
        variants: value('variants'),
      },
    };
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (save.disabled) return;
    save.disabled = true;
    status.textContent = 'Vista …';

    let res: Response;
    try {
      res = await fetch('/api/recipe', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug, patch: buildPatch() }),
      });
    } catch {
      status.textContent = 'Vistun mistókst — athugaðu nettenginguna.';
      save.disabled = false;
      return;
    }

    const body = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      warnings?: string[];
      error?: string;
      details?: string[];
    };

    if (res.ok && body.ok) {
      const warnings = body.warnings?.length
        ? ` Ath.: ${body.warnings.join('; ')}`
        : '';
      // The recipe page is static and still shows the old wording until the
      // build lands, so say so rather than let it look broken.
      status.textContent = `Vistað! Breytingin fer í loftið eftir um 2 mínútur.${warnings}`;
      save.disabled = false;
      return;
    }

    const details = body.details?.length ? ` ${body.details.join('; ')}` : '';
    status.textContent = `${body.error ?? `Villa (${res.status}).`}${details}`;
    save.disabled = false;
  });
}

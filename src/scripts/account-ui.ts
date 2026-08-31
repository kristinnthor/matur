/**
 * The header's sign-in control. Loaded on every page, and deliberately quiet:
 * when accounts are not configured it renders nothing at all, so the site looks
 * exactly as it did before anyone thought about sign-in.
 */
import { config, mountSignIn, refresh, signOut, state } from './account';

const slot = document.querySelector<HTMLElement>('#account-slot');

if (slot) {
  const render = () => {
    // Lets CSS reveal things only a signed-in person can act on, such as the
    // "vantar mynd" marker on photo-less cards, without per-element scripting.
    document.documentElement.toggleAttribute('data-signed-in', state.signedIn);
    slot.replaceChildren();
    if (!state.enabled) return;

    if (state.signedIn) {
      const name = document.createElement('span');
      name.className = 'account-name muted';
      // First name only; the header is tight on a phone.
      name.textContent = (state.name ?? state.email ?? '').split(' ')[0] ?? '';

      const mine = document.createElement('a');
      mine.className = 'list-link';
      mine.href = '/uppskriftirnar-minar/';
      mine.textContent = 'Mínar';

      // Only useful signed in, so it stays out of a visitor's header entirely.
      const suggest = document.createElement('a');
      suggest.className = 'list-link';
      suggest.href = '/tillogur/';
      suggest.textContent = 'Tillögur';

      const out = document.createElement('button');
      out.type = 'button';
      out.className = 'account-signout';
      out.textContent = 'Út';
      out.addEventListener('click', () => void signOut());

      slot.append(suggest, mine, name, out);
      return;
    }

    const target = document.createElement('div');
    target.className = 'account-button';
    slot.append(target);
    void config().then(({ enabled, clientId }) => {
      if (enabled && clientId) mountSignIn(target, clientId).catch(() => target.remove());
    });
  };

  document.addEventListener('matur:account-changed', render);
  document.addEventListener('matur:account-error', (e) => {
    const detail = (e as CustomEvent<string>).detail;
    slot.replaceChildren(Object.assign(document.createElement('span'), {
      className: 'account-error',
      textContent: detail,
    }));
  });
  void refresh();
}

/**
 * The header's account control. Loaded on every page, and deliberately quiet:
 * when accounts are not configured it renders nothing at all, so the site looks
 * exactly as it did before anyone thought about sign-in.
 *
 * Signed in, the personal links live behind one button rather than sitting in
 * the header: four separate links overflowed a phone screen, and these are all
 * secondary to finding a recipe and the shopping list.
 */
import { config, mountSignIn, refresh, signOut, state } from './account';

const slot = document.querySelector<HTMLElement>('#account-slot');

if (slot) {
  const closeMenu = (menu: HTMLElement, button: HTMLButtonElement) => {
    menu.hidden = true;
    button.setAttribute('aria-expanded', 'false');
  };

  const buildMenu = (): HTMLElement => {
    const wrap = document.createElement('div');
    wrap.className = 'account-menu';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'account-btn';
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-haspopup', 'true');
    // First name only; a full name does not fit a phone header.
    const who = (state.name ?? state.email ?? '').trim().split(/\s+/)[0] || 'Ég';
    button.textContent = who;

    const menu = document.createElement('div');
    menu.className = 'account-pop';
    menu.hidden = true;

    const link = (href: string, text: string) => {
      const a = document.createElement('a');
      a.href = href;
      a.textContent = text;
      return a;
    };
    const out = document.createElement('button');
    out.type = 'button';
    out.textContent = 'Skrá út';
    out.addEventListener('click', () => void signOut());

    menu.append(
      link('/uppskriftirnar-minar/', 'Mínar uppskriftir'),
      link('/tillogur/', 'Tillögur'),
      out,
    );

    button.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = menu.hidden;
      menu.hidden = !open;
      button.setAttribute('aria-expanded', String(open));
    });
    // Anywhere else, or Escape, dismisses it.
    document.addEventListener('click', (e) => {
      if (!menu.hidden && !wrap.contains(e.target as Node)) closeMenu(menu, button);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !menu.hidden) {
        closeMenu(menu, button);
        button.focus();
      }
    });

    wrap.append(button, menu);
    return wrap;
  };

  const render = () => {
    // Lets CSS reveal things only a signed-in person can act on, such as the
    // "vantar mynd" marker on photo-less cards, without per-element scripting.
    document.documentElement.toggleAttribute('data-signed-in', state.signedIn);
    document.documentElement.toggleAttribute('data-admin', state.admin);
    slot.replaceChildren();
    if (!state.enabled) return;

    if (state.signedIn) {
      slot.append(buildMenu());
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

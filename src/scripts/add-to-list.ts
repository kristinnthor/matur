import { readList, writeList } from './list-store';

const btn = document.querySelector<HTMLButtonElement>('#add-to-list');
const servingsOut = document.querySelector<HTMLOutputElement>('#servings');

if (btn) {
  const slug = btn.dataset.slug!;

  const sync = () => {
    const onList = slug in readList();
    btn.textContent = onList ? 'Á listanum — fjarlægja' : 'Setja á innkaupalista';
    btn.classList.toggle('on-list', onList);
  };

  btn.addEventListener('click', () => {
    const list = readList();
    if (slug in list) {
      delete list[slug];
    } else {
      // Capture whatever the scaler currently shows.
      list[slug] = Number(servingsOut?.textContent) || Number(btn.dataset.servings) || 4;
    }
    writeList(list);
    sync();
  });

  sync();
}

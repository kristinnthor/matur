import { renderStepHtml } from '../lib/steps';
import { skammtar, type Ingredient } from '../lib/units';

const steps = Array.from(document.querySelectorAll<HTMLElement>('.step'));
const current = document.querySelector<HTMLElement>('#current');
let index = 0;

const show = (n: number) => {
  index = Math.min(Math.max(n, 0), steps.length - 1);
  steps.forEach((s, i) => { s.hidden = i !== index; });
  if (current) current.textContent = String(index + 1);
};

document.querySelector('#next')?.addEventListener('click', () => show(index + 1));
document.querySelector('#prev')?.addEventListener('click', () => show(index - 1));

document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight') show(index + 1);
  if (e.key === 'ArrowLeft') show(index - 1);
});

// Honor the servings chosen on the recipe page (issue #9): the scaler stores
// its choice per recipe; steps re-render with the scaled quantities inlined.
const cook = document.querySelector<HTMLElement>('.cook');
const servingsLabel = document.querySelector<HTMLElement>('#cook-servings');
if (cook) {
  const slug = cook.dataset.slug!;
  const base = Number(cook.dataset.base);
  let chosen = base;
  try {
    const stored = JSON.parse(localStorage.getItem('matur:servings') ?? '{}') as Record<string, number>;
    if (typeof stored[slug] === 'number' && stored[slug]! >= 1) chosen = stored[slug]!;
  } catch {
    // Storage unavailable — cook at the authored servings.
  }
  if (servingsLabel) servingsLabel.textContent = `${chosen} ${skammtar(chosen)}`;
  if (chosen !== base) {
    const dataEl = document.querySelector('#cook-ingredients');
    const ings: Ingredient[] = dataEl ? JSON.parse(dataEl.textContent ?? '[]') : [];
    const factor = chosen / base;
    for (const step of steps) {
      const template = step.dataset.template;
      const p = step.querySelector('p');
      // renderStepHtml escapes all source text; the only markup is its own span.
      if (template && p) p.innerHTML = renderStepHtml(template, ings, factor);
    }
  }
}

// Keep the screen awake while cooking. Unsupported browsers simply skip this.
let lock: unknown = null;

const acquire = async () => {
  try {
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: 'screen') => Promise<unknown> };
    };
    if (nav.wakeLock) lock = await nav.wakeLock.request('screen');
  } catch {
    // Denied or unsupported - cooking still works, the screen just sleeps.
  }
};

void acquire();

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && lock === null) void acquire();
});

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

/**
 * Touch-first crop control for photo uploads.
 *
 * A fixed 3:2 window; the photo pans and pinches behind it. The site renders
 * heroes at 3:2 and at 5:2 on wide screens, so the 5:2 band is drawn as a guide
 * — what falls outside it survives on a phone but is trimmed on a desktop.
 *
 * Panning by drag is unusable with a keyboard, so the frame is focusable and
 * answers the arrow keys, and zoom is a real range input rather than pinch-only.
 */
import {
  MAX_ZOOM,
  clampView,
  coverScale,
  initialView,
  panBy,
  viewToRect,
  zoomTo,
  type Size,
  type View,
} from '../lib/crop';

/** Cap the working copy: the output is 1600 wide, so this leaves zoom headroom
 * without holding a 12-megapixel bitmap in memory on a phone. */
const MAX_SOURCE = 2400;
const OUT_WIDTH = 1600;
const ASPECT = 3 / 2;
const KEY_STEP = 12;

export interface Cropper {
  /** Mount point — insert this where the preview used to be. */
  element: HTMLElement;
  /** Decode a file and reset the view to a centred cover crop. */
  load(file: File): Promise<void>;
  /** The cropped photo, ready to upload. */
  toBlob(): Promise<Blob>;
  hasImage(): boolean;
  destroy(): void;
}

async function decode(file: File): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() =>
    createImageBitmap(file),
  );
  const scale = Math.min(1, MAX_SOURCE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return canvas;
}

export function createCropper(): Cropper {
  const root = document.createElement('div');
  root.className = 'cropper';
  root.hidden = true;

  const frame = document.createElement('div');
  frame.className = 'crop-frame';
  frame.tabIndex = 0;
  frame.setAttribute('role', 'group');
  frame.setAttribute(
    'aria-label',
    'Veldu þann hluta myndarinnar sem á að sjást. Dragðu myndina til, eða notaðu örvatakkana.',
  );

  const guide = document.createElement('div');
  guide.className = 'crop-guide';
  guide.setAttribute('aria-hidden', 'true');

  const zoom = document.createElement('input');
  zoom.type = 'range';
  zoom.className = 'crop-zoom';
  zoom.min = '1';
  zoom.max = String(MAX_ZOOM);
  zoom.step = '0.01';
  zoom.value = '1';
  zoom.setAttribute('aria-label', 'Aðdráttur');

  const hint = document.createElement('p');
  hint.className = 'crop-hint muted';
  hint.textContent = 'Dragðu myndina til — svæðið innan strikanna sést á breiðum skjá.';

  root.append(frame, zoom, hint);

  let source: HTMLCanvasElement | null = null;
  let view: View = { scale: 1, x: 0, y: 0 };
  // The frame has no width until it is laid out and visible, and a hidden tab
  // never paints. Frame the photo when a real width first appears, not before.
  let needsFraming = false;
  const measured = () => frame.clientWidth > 0;

  const frameSize = (): Size => ({
    width: frame.clientWidth || 1,
    height: (frame.clientWidth || 1) / ASPECT,
  });
  const imageSize = (): Size =>
    source ? { width: source.width, height: source.height } : { width: 1, height: 1 };

  function paint(): void {
    if (!source) return;
    source.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
    const min = coverScale(imageSize(), frameSize());
    zoom.value = String(view.scale / min);
  }

  function setView(next: View): void {
    view = clampView(next, imageSize(), frameSize());
    paint();
  }

  /** Establish the framing once the frame has a real width; re-clamp after that. */
  function reframe(): void {
    if (!source || !measured()) return;
    if (needsFraming) {
      view = initialView(imageSize(), frameSize());
      needsFraming = false;
      paint();
      return;
    }
    setView(view);
  }

  // --- pointer: one finger pans, two pinch ---------------------------------
  const points = new Map<number, { x: number; y: number }>();
  let pinchStart: { dist: number; scale: number } | null = null;

  const centre = () => {
    const all = [...points.values()];
    const sum = all.reduce((a, p) => ({ x: a.x + p.x, y: a.y + p.y }), { x: 0, y: 0 });
    return { x: sum.x / all.length, y: sum.y / all.length };
  };
  const spread = () => {
    const [a, b] = [...points.values()];
    return Math.hypot(a!.x - b!.x, a!.y - b!.y);
  };
  const local = (e: PointerEvent) => {
    const box = frame.getBoundingClientRect();
    return { x: e.clientX - box.left, y: e.clientY - box.top };
  };

  function onDown(e: PointerEvent): void {
    if (!source) return;
    // Throws if the pointer is already gone; the drag still works without it.
    try {
      frame.setPointerCapture(e.pointerId);
    } catch {
      /* no capture, no problem */
    }
    points.set(e.pointerId, local(e));
    if (points.size === 2) pinchStart = { dist: spread(), scale: view.scale };
  }

  function onMove(e: PointerEvent): void {
    if (!source || !points.has(e.pointerId)) return;
    const prev = points.get(e.pointerId)!;
    const now = local(e);
    points.set(e.pointerId, now);

    if (points.size >= 2 && pinchStart) {
      const ratio = spread() / (pinchStart.dist || 1);
      setView(zoomTo(view, pinchStart.scale * ratio, centre(), imageSize(), frameSize()));
      return;
    }
    setView(panBy(view, now.x - prev.x, now.y - prev.y, imageSize(), frameSize()));
  }

  function onUp(e: PointerEvent): void {
    points.delete(e.pointerId);
    if (points.size < 2) pinchStart = null;
  }

  function onWheel(e: WheelEvent): void {
    if (!source) return;
    e.preventDefault();
    const box = frame.getBoundingClientRect();
    const focus = { x: e.clientX - box.left, y: e.clientY - box.top };
    setView(zoomTo(view, view.scale * (e.deltaY < 0 ? 1.12 : 1 / 1.12), focus, imageSize(), frameSize()));
  }

  function onKey(e: KeyboardEvent): void {
    if (!source) return;
    const step = e.shiftKey ? KEY_STEP * 4 : KEY_STEP;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const move = moves[e.key];
    if (!move) return;
    e.preventDefault();
    // Arrows move the visible window, so the image travels the other way.
    setView(panBy(view, -move[0], -move[1], imageSize(), frameSize()));
  }

  function onZoomInput(): void {
    if (!source) return;
    const size = frameSize();
    const min = coverScale(imageSize(), size);
    setView(zoomTo(view, min * Number(zoom.value), { x: size.width / 2, y: size.height / 2 }, imageSize(), size));
  }

  frame.addEventListener('pointerdown', onDown);
  frame.addEventListener('pointermove', onMove);
  frame.addEventListener('pointerup', onUp);
  frame.addEventListener('pointercancel', onUp);
  frame.addEventListener('wheel', onWheel, { passive: false });
  frame.addEventListener('keydown', onKey);
  zoom.addEventListener('input', onZoomInput);

  // The frame's pixel width drives every calculation, so react to it appearing
  // or changing — this is also what frames the photo when the dialog opens.
  const observer =
    typeof ResizeObserver === 'function' ? new ResizeObserver(() => reframe()) : null;
  observer?.observe(frame);

  return {
    element: root,

    async load(file: File) {
      const canvas = await decode(file);
      source?.remove();
      source = canvas;
      canvas.className = 'crop-img';
      frame.replaceChildren(canvas, guide);
      root.hidden = false;
      needsFraming = true;
      // Frame it now if the width is already known; otherwise the observer
      // does it the moment the frame is laid out.
      reframe();
    },

    hasImage: () => source !== null,

    async toBlob() {
      if (!source) throw new Error('no image loaded');
      // If the frame was never measured the photo was never framed by hand, so
      // fall back to the centred cover crop rather than cropping from garbage.
      const size = measured() ? frameSize() : { width: OUT_WIDTH, height: OUT_WIDTH / ASPECT };
      const current = measured() && !needsFraming ? view : initialView(imageSize(), size);
      const rect = viewToRect(current, size);
      const out = document.createElement('canvas');
      out.width = OUT_WIDTH;
      out.height = Math.round(OUT_WIDTH / ASPECT);
      out
        .getContext('2d')!
        .drawImage(source, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, out.width, out.height);
      return new Promise<Blob>((resolve, reject) =>
        out.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('encode failed'))),
          'image/jpeg',
          0.82,
        ),
      );
    },

    destroy() {
      observer?.disconnect();
      source = null;
      frame.replaceChildren();
      root.remove();
    },
  };
}

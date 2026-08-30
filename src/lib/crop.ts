/**
 * Crop geometry — pure, so the awkward parts (clamping, pinch-zoom focal
 * points) are unit-tested rather than debugged through a touchscreen.
 *
 * The frame is the fixed window the photo is cropped to. The view places the
 * image behind it: `scale` plus a translation in frame pixels, with the image's
 * top-left as the transform origin. The image must always cover the frame, so
 * there is never a bare corner in the result.
 */

export interface Size {
  width: number;
  height: number;
}

export interface View {
  scale: number;
  x: number;
  y: number;
}

export interface Rect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

/** Zooming further than this turns phone photos to mush. */
export const MAX_ZOOM = 4;

/** The smallest scale at which the image still covers the frame. */
export function coverScale(image: Size, frame: Size): number {
  if (image.width <= 0 || image.height <= 0) return 1;
  return Math.max(frame.width / image.width, frame.height / image.height);
}

/** Keep the frame covered: floor the scale, then pin the offsets to the edges. */
export function clampView(view: View, image: Size, frame: Size): View {
  const min = coverScale(image, frame);
  const scale = Math.min(Math.max(view.scale, min), min * MAX_ZOOM);
  const spanX = frame.width - image.width * scale;
  const spanY = frame.height - image.height * scale;
  // spanX/spanY are <= 0 once the image covers, so they are the lower bounds.
  return {
    scale,
    x: Math.min(0, Math.max(spanX, view.x)),
    y: Math.min(0, Math.max(spanY, view.y)),
  };
}

/** Centred cover — what `object-fit: cover` already does, so opening the
 * cropper and changing nothing reproduces the site's existing framing. */
export function initialView(image: Size, frame: Size): View {
  const scale = coverScale(image, frame);
  return clampView(
    {
      scale,
      x: (frame.width - image.width * scale) / 2,
      y: (frame.height - image.height * scale) / 2,
    },
    image,
    frame,
  );
}

/** Move the view by a drag delta in frame pixels. */
export function panBy(view: View, dx: number, dy: number, image: Size, frame: Size): View {
  return clampView({ scale: view.scale, x: view.x + dx, y: view.y + dy }, image, frame);
}

/**
 * Zoom to `nextScale` while holding the image point under `focus` still —
 * so a pinch grows the photo around the fingers, not around the corner.
 */
export function zoomTo(
  view: View,
  nextScale: number,
  focus: { x: number; y: number },
  image: Size,
  frame: Size,
): View {
  const clamped = clampView({ ...view, scale: nextScale }, image, frame);
  // Where the focal point sits in image coordinates, before the scale changes.
  const imageX = (focus.x - view.x) / view.scale;
  const imageY = (focus.y - view.y) / view.scale;
  return clampView(
    {
      scale: clamped.scale,
      x: focus.x - imageX * clamped.scale,
      y: focus.y - imageY * clamped.scale,
    },
    image,
    frame,
  );
}

/** The source rectangle, in image pixels, that the frame is showing. */
export function viewToRect(view: View, frame: Size): Rect {
  return {
    sx: -view.x / view.scale,
    sy: -view.y / view.scale,
    sw: frame.width / view.scale,
    sh: frame.height / view.scale,
  };
}

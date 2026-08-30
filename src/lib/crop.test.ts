import { describe, it, expect } from 'vitest';
import { MAX_ZOOM, clampView, coverScale, initialView, panBy, viewToRect, zoomTo } from './crop';

const frame = { width: 300, height: 200 }; // 3:2
const landscape = { width: 4000, height: 2000 }; // wider than the frame
const portrait = { width: 2000, height: 4000 }; // taller than the frame — the phone case

describe('coverScale', () => {
  it('fills by height when the image is wider than the frame', () => {
    expect(coverScale(landscape, frame)).toBeCloseTo(200 / 2000);
  });

  it('fills by width when the image is taller than the frame', () => {
    expect(coverScale(portrait, frame)).toBeCloseTo(300 / 2000);
  });
});

describe('initialView', () => {
  it('centres the image, matching object-fit: cover', () => {
    const v = initialView(portrait, frame);
    const rect = viewToRect(v, frame);
    // Full width of a portrait photo is used, and the kept band is centred.
    expect(rect.sx).toBeCloseTo(0);
    expect(rect.sw).toBeCloseTo(portrait.width);
    expect(rect.sy + rect.sh / 2).toBeCloseTo(portrait.height / 2);
  });

  it('leaves no uncovered area for either orientation', () => {
    for (const image of [landscape, portrait]) {
      const v = initialView(image, frame);
      expect(v.x).toBeLessThanOrEqual(0);
      expect(v.y).toBeLessThanOrEqual(0);
      expect(image.width * v.scale).toBeGreaterThanOrEqual(frame.width - 1e-9);
      expect(image.height * v.scale).toBeGreaterThanOrEqual(frame.height - 1e-9);
    }
  });
});

describe('clampView', () => {
  it('refuses to zoom out past cover', () => {
    const v = clampView({ scale: 0.0001, x: 0, y: 0 }, portrait, frame);
    expect(v.scale).toBeCloseTo(coverScale(portrait, frame));
  });

  it('caps zoom so a phone photo cannot be enlarged to mush', () => {
    const v = clampView({ scale: 999, x: 0, y: 0 }, portrait, frame);
    expect(v.scale).toBeCloseTo(coverScale(portrait, frame) * MAX_ZOOM);
  });

  it('pins the offsets so no edge pulls away from the frame', () => {
    const scale = coverScale(portrait, frame);
    const dragged = clampView({ scale, x: 500, y: 500 }, portrait, frame);
    expect(dragged.x).toBe(0);
    expect(dragged.y).toBe(0);

    const other = clampView({ scale, x: -99999, y: -99999 }, portrait, frame);
    expect(other.x).toBeCloseTo(frame.width - portrait.width * scale);
    expect(other.y).toBeCloseTo(frame.height - portrait.height * scale);
  });
});

describe('panBy', () => {
  it('moves the visible band and stops at the edge', () => {
    const start = initialView(portrait, frame);
    const up = panBy(start, 0, 200, portrait, frame);
    expect(viewToRect(up, frame).sy).toBeLessThan(viewToRect(start, frame).sy);

    // Dragging far past the top pins to the very top of the photo.
    const pinned = panBy(start, 0, 100000, portrait, frame);
    expect(viewToRect(pinned, frame).sy).toBeCloseTo(0);
  });
});

describe('zoomTo', () => {
  it('holds the point under the fingers still', () => {
    const start = initialView(portrait, frame);
    const focus = { x: 90, y: 140 };
    const before = {
      x: (focus.x - start.x) / start.scale,
      y: (focus.y - start.y) / start.scale,
    };
    const zoomed = zoomTo(start, start.scale * 2, focus, portrait, frame);
    const after = {
      x: (focus.x - zoomed.x) / zoomed.scale,
      y: (focus.y - zoomed.y) / zoomed.scale,
    };
    expect(after.x).toBeCloseTo(before.x, 4);
    expect(after.y).toBeCloseTo(before.y, 4);
  });

  it('still covers the frame after zooming against a corner', () => {
    const start = initialView(portrait, frame);
    const zoomed = zoomTo(start, start.scale * 3, { x: 0, y: 0 }, portrait, frame);
    expect(zoomed.x).toBeLessThanOrEqual(0);
    expect(zoomed.y).toBeLessThanOrEqual(0);
    expect(portrait.width * zoomed.scale).toBeGreaterThanOrEqual(frame.width - 1e-9);
    expect(portrait.height * zoomed.scale).toBeGreaterThanOrEqual(frame.height - 1e-9);
  });
});

describe('viewToRect', () => {
  it('reads back the whole image at cover scale for a 3:2 source', () => {
    const image = { width: 1500, height: 1000 };
    const rect = viewToRect(initialView(image, frame), frame);
    expect(rect.sx).toBeCloseTo(0);
    expect(rect.sy).toBeCloseTo(0);
    expect(rect.sw).toBeCloseTo(image.width);
    expect(rect.sh).toBeCloseTo(image.height);
  });

  it('never reports a rectangle outside the image', () => {
    const image = portrait;
    for (const v of [
      initialView(image, frame),
      panBy(initialView(image, frame), 9999, 9999, image, frame),
      zoomTo(initialView(image, frame), 99, { x: 300, y: 200 }, image, frame),
    ]) {
      const r = viewToRect(v, frame);
      expect(r.sx).toBeGreaterThanOrEqual(-1e-6);
      expect(r.sy).toBeGreaterThanOrEqual(-1e-6);
      expect(r.sx + r.sw).toBeLessThanOrEqual(image.width + 1e-6);
      expect(r.sy + r.sh).toBeLessThanOrEqual(image.height + 1e-6);
    }
  });
});

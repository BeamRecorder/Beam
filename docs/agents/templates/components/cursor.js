export const MACOS_CURSORS = Object.freeze({
  arrow: { url: new URL('../assets/cursors/default.svg', import.meta.url).href, hotspot: [10, 7] },
  pointer: { url: new URL('../assets/cursors/handpointing.svg', import.meta.url).href, hotspot: [12, 10] },
  text: { url: new URL('../assets/cursors/textcursor.svg', import.meta.url).href, hotspot: [16, 16] },
  grab: { url: new URL('../assets/cursors/handgrabbing.svg', import.meta.url).href, hotspot: [16, 16] },
});

/** The position wrapper owns the hotspot; only the inner glyph scales on click. */
export function createCursorTrack(gsap, root, { points, clicks = [], size = 48 }) {
  const glyph = root?.querySelector('[data-cursor-glyph]');
  const ring = root?.querySelector('[data-cursor-ring]');
  if (!glyph || !ring || !Number.isFinite(size) || size <= 0 || !points.length)
    throw new Error('Cursor requires its HTML template, positive size and motion points.');
  let previous = -1;
  for (const point of points) {
    if (
      !Number.isFinite(point.timeMs) ||
      point.timeMs < 0 ||
      point.timeMs <= previous ||
      !Number.isFinite(point.x) ||
      !Number.isFinite(point.y) ||
      !(point.kind in MACOS_CURSORS)
    )
      throw new Error('Cursor points need increasing times, finite coordinates and a known cursor.');
    previous = point.timeMs;
  }
  if (clicks.some((time) => !Number.isFinite(time) || time < 0)) throw new Error('Click times must be nonnegative.');
  glyph.style.width = glyph.style.height = `${size}px`;
  const ready = Promise.all(
    Object.values(MACOS_CURSORS).map((cursor) => {
      const image = root.ownerDocument.createElement('img');
      image.src = cursor.url;
      return image.decode();
    }),
  );
  const timeline = gsap.timeline({ paused: true });
  timeline.set(root, { x: points[0].x, y: points[0].y }, 0);
  timeline.set(glyph, { scale: 1, transformOrigin: '50% 50%' }, 0);
  timeline.set(ring, { opacity: 0, scale: 0.1 }, 0);
  points.slice(1).forEach((point, index) => {
    const start = points[index].timeMs;
    timeline.to(
      root,
      { x: point.x, y: point.y, duration: (point.timeMs - start) / 1000, ease: point.ease ?? 'power3.inOut' },
      start / 1000,
    );
  });
  for (const time of clicks) {
    timeline
      .to(glyph, { scale: 0.86, duration: 0.07 }, time / 1000)
      .to(glyph, { scale: 1, duration: 0.14, ease: 'power2.out' }, time / 1000 + 0.07)
      .fromTo(
        ring,
        { scale: 0.1, opacity: 0.5 },
        { scale: 1.3, opacity: 0, duration: 0.34, ease: 'power2.out' },
        time / 1000,
      );
  }
  const seek = (timeMs) => {
    if (!Number.isFinite(timeMs)) throw new Error('Cursor time must be finite.');
    const point = points.findLast((item) => item.timeMs <= timeMs) ?? points[0];
    const cursor = MACOS_CURSORS[point.kind];
    if (glyph.src !== cursor.url) glyph.src = cursor.url;
    glyph.style.left = `${(-cursor.hotspot[0] * size) / 32}px`;
    glyph.style.top = `${(-cursor.hotspot[1] * size) / 32}px`;
    timeline.time(Math.max(0, timeMs / 1000), false);
  };
  seek(0);
  return { ready, seek, dispose: () => timeline.kill() };
}

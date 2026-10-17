import { describe, expect, it } from 'vitest';
import { validateComposition } from '@beam/engine/commands/clip-composition-validation';
import { trimClip } from '@beam/engine/commands/trim-clip';
import { projectPerspectivePoint, unprojectPerspectivePoint } from '@beam/engine/zoom/perspective-projection';
import {
  BASE,
  ORIGINAL,
  SCREEN,
  compositionAt,
  snapshotAt,
  shapeClip,
  blurClip,
  CURSOR_URLS,
} from '../src/scene-model';
import {
  DURATION,
  EDIT_END,
  ENDING_START,
  INTRO_END,
  blurAt,
  blurPercentAt,
  ease,
  menuAt,
  modeAt,
  previewTimeAt,
  progress,
  shapeAt,
  transitionAt,
  trimAt,
  waypoints,
} from '../src/motion';
import { selectionAt } from '../src/selection';

describe('main page edit film', () => {
  it('retains the original ending records and font identity without mutating the source', () => {
    const before = JSON.stringify(ORIGINAL);
    expect(BASE.composition.clips).toEqual(ORIGINAL.composition.clips);
    const ending = BASE.composition.clips.filter((clip) => clip.timelineStartMs === ENDING_START * 1000);
    expect(ending).toHaveLength(2);
    expect(ending.map((clip) => clip.kind).sort()).toEqual(['image', 'shape']);
    for (let time = 0; time <= DURATION; time += 0.1) compositionAt(time);
    expect(JSON.stringify(ORIGINAL)).toBe(before);
    expect(BASE.cursor.events).toBe(ORIGINAL.cursor.events);
    expect(BASE.cursor.telemetry).toBe(ORIGINAL.cursor.telemetry);
  });
  it('contains 3.5 seconds of original footage, fifteen seconds of editing and the complete authored ending', () => {
    expect(INTRO_END).toBe(3.5);
    expect(EDIT_END - INTRO_END).toBe(15);
    expect(DURATION - EDIT_END).toBeCloseTo(ORIGINAL.duration - ENDING_START, 8);
  });
  it.each([0, 3.5, 4.7, 6.55, 7.1, 8.05, 8.5, 9.05, 10.8, 11.65, 13.8, 14.65, 15.3, 15.8, 17.5])(
    'produces a valid native composition at %s seconds',
    (time) => {
      expect(() => validateComposition(compositionAt(time))).not.toThrow();
    },
  );
  it('reaches the exact native trim command result without retiming the ending', () => {
    const result = compositionAt(9.2);
    const committed = trimClip(BASE.composition, SCREEN.id, 'end', SCREEN.timelineDurationMs - 1200);
    const screen = result.clips.find((clip) => clip.id === SCREEN.id)!;
    const expected = committed.clips.find((clip) => clip.id === SCREEN.id)!;
    expect({ ...screen, order: expected.order }).toEqual(expected);
    for (const ending of BASE.composition.clips.filter((clip) => clip.kind !== 'screen'))
      expect(result.clips.find((clip) => clip.id === ending.id)?.timelineStartMs).toBe(ending.timelineStartMs);
  });
  it('draws genuine editable shape and effect records only after their insertion gestures', () => {
    expect(compositionAt(10.79).clips.some((clip) => clip.id === 'film-rectangle')).toBe(false);
    expect(compositionAt(10.8).clips.some((clip) => clip.id === 'film-rectangle')).toBe(true);
    expect(compositionAt(13.79).clips.some((clip) => clip.kind === 'blur')).toBe(false);
    expect(compositionAt(14.65).clips.find((clip) => clip.kind === 'blur')).toEqual(blurClip(14.65));
    expect(shapeClip(11.65).fillEnabled).toBe(false);
    expect(shapeClip(11.65).borderWidth).toBeGreaterThan(0);
    expect(blurClip(15.3).mode).toBe('pixelated');
    expect(blurClip(15.8).mode).toBe('blur');
  });
  it('keeps the local media, fonts and cursor artwork portable', () => {
    expect(BASE.composition.assets.every((asset) => !asset.src?.startsWith('project-media:'))).toBe(true);
    expect(Object.values(BASE.fontSources!).every((url) => !url.startsWith('project-media:'))).toBe(true);
    expect(BASE.cursor.hoverSources?.every((source) => !source.src.startsWith('project-media:'))).toBe(true);
    for (const role of ['default', 'handpointing', 'resizewesteast', 'cross'])
      expect(CURSOR_URLS.get(role)).toBeTruthy();
    expect(BASE.cursorPack?.cursors.every((cursor) => !!cursor.url)).toBe(true);
  });
  it('applies the wallpaper and background blur at their authored click and drag', () => {
    expect(snapshotAt(4.69).background).toEqual(BASE.background);
    expect(snapshotAt(4.7).background).not.toEqual(BASE.background);
    expect(snapshotAt(5.85).blurPercent).toBe(5);
    expect(snapshotAt(6.55).blurPercent).toBe(34);
    expect(snapshotAt(6).cursorSettings.enabled).toBe(BASE.cursorSettings.enabled);
    expect(snapshotAt(8).cursorSettings.enabled).toBe(false);
  });
});

describe('authored motion', () => {
  it.each([
    [trimAt, 8.05, 9.05],
    [shapeAt, 10.8, 11.65],
    [blurAt, 13.8, 14.65],
  ] as const)('bounds a drag and keeps it monotonic across reversals', (sample, start, end) => {
    expect(sample(start - 1)).toBe(0);
    expect(sample(end + 1)).toBe(1);
    let previous = 0;
    for (let time = start; time <= end; time += 0.005) {
      const value = sample(time);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
    expect(sample((start + end) / 2)).toBeCloseTo(0.5, 8);
  });
  it('enters and leaves the editor continuously without clipping the ending', () => {
    for (const time of [0, 3.5, 18.5, DURATION]) expect(transitionAt(time)).toBe(0);
    for (const time of [4.3, 10, 17.85]) expect(transitionAt(time)).toBe(1);
    expect(transitionAt(3.9)).toBeCloseTo(0.5, 8);
    expect(transitionAt(18.175)).toBeCloseTo(0.5, 8);
  });
  it('has zero entry and exit velocity in the easing envelope', () => {
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
    expect(ease(0.5)).toBe(0.5);
    expect(ease(0.0001) / 0.0001).toBeLessThan(0.00001);
    expect((1 - ease(0.9999)) / 0.0001).toBeLessThan(0.00001);
    expect(progress(-1, 0, 1)).toBe(0);
    expect(progress(2, 0, 1)).toBe(1);
  });
  it('retains menu dwell, panel selection and the paused source clock', () => {
    expect(menuAt(9.6)).toBe('shape');
    expect(menuAt(13)).toBe('blur');
    expect(menuAt(15)).toBeNull();
    expect([5, 8, 12, 16].map(modeAt)).toEqual(['canvas', 'clip', 'shape', 'blur']);
    expect(previewTimeAt(6)).toBe(3.5);
    expect(previewTimeAt(12)).toBe(0.2);
    expect(previewTimeAt(17)).toBeCloseTo(0.6, 8);
    expect(previewTimeAt(20)).toBe(1.5);
    expect(blurPercentAt(5)).toBe(5);
    expect(blurPercentAt(7)).toBe(34);
    expect(waypoints.every((waypoint, index) => !index || waypoint.time > waypoints[index - 1]!.time)).toBe(true);
  });
});

describe('native selection projection', () => {
  const transform = { x: 0.2, y: 0.3, width: 0.4, height: 0.2 };
  it('matches the identity canvas and an authored zoom focus', () => {
    const result = selectionAt(transform, { focus: { cx: 0.5, cy: 0.5 }, scale: 1 }, 1000, 500);
    for (const [key, value] of Object.entries({ left: 200, top: 150, width: 400, height: 100 }))
      expect(Number.parseFloat(result.handleStyle[key as keyof typeof result.handleStyle])).toBeCloseTo(value, 8);
    const zoom = selectionAt(transform, { focus: { cx: 0.4, cy: 0.4 }, scale: 2 }, 1000, 500);
    expect(Number.parseFloat(zoom.handleStyle.width)).toBeCloseTo(800, 8);
  });
  it('projects a tilted selection through the same invertible engine mapping', () => {
    const camera = { focus: { cx: 0.5, cy: 0.5 }, scale: 1, tiltX: 12, tiltY: -8 };
    const result = selectionAt(transform, camera, 1920, 1080);
    const corner = result.perspectiveCorners[0];
    const absolute = {
      x: Number.parseFloat(result.handleStyle.left) + corner.x,
      y: Number.parseFloat(result.handleStyle.top) + corner.y,
    };
    expect(absolute).toEqual(
      projectPerspectivePoint({ x: 384, y: 324 }, { x: 0, y: 0, width: 1920, height: 1080 }, camera),
    );
    const restored = unprojectPerspectivePoint(absolute, { x: 0, y: 0, width: 1920, height: 1080 }, camera);
    expect(restored.x).toBeCloseTo(384, 7);
    expect(restored.y).toBeCloseTo(324, 7);
  });
  it('keeps corners inside their bounding box at fractional display sizes', () => {
    const result = selectionAt(transform, { focus: { cx: 0.3, cy: 0.4 }, scale: 1.25, tiltX: -4 }, 782.35, 440.071875);
    for (const point of result.perspectiveCorners) {
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.y).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThanOrEqual(Number.parseFloat(result.handleStyle.width));
      expect(point.y).toBeLessThanOrEqual(Number.parseFloat(result.handleStyle.height));
    }
  });
});

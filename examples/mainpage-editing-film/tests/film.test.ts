import { describe, expect, it } from 'vitest';
import { validateComposition } from '@beam/engine/commands/clip-composition-validation';
import { trimClip } from '@beam/engine/commands/trim-clip';
import { projectPerspectivePoint, unprojectPerspectivePoint } from '@beam/engine/zoom/perspective-projection';
import { cursorClickSpringScale } from '@beam/engine/cursor/cursor-click-spring';
import {
  BASE,
  ORIGINAL,
  SCREEN,
  compositionAt,
  snapshotAt,
  shapeClip,
  blurClip,
  CURSOR_URLS,
  WALLPAPERS,
} from '../src/scene-model';
import {
  DURATION,
  BLUR_START,
  BLUR_END,
  EDIT_END,
  ENDING_START,
  INTRO_END,
  OUTRO_START,
  SHAPE_START,
  SHAPE_END,
  TRIM_START,
  TRIM_END,
  BACKGROUND_BLUR_START,
  BACKGROUND_BLUR_END,
  BACKGROUND_CHANGES,
  CURSOR_SIZE,
  SCRUB_TIME,
  PIXELATED_TIME,
  NORMAL_BLUR_TIME,
  blurAt,
  blurPercentAt,
  ease,
  endingBlendAt,
  cursorOpacityAt,
  pressScaleAt,
  menuAt,
  modeAt,
  previewTimeAt,
  progress,
  shapeAt,
  transitionAt,
  travel,
  trimAt,
  waypoints,
  wallpaperAt,
} from '../src/motion';
import { selectionAt } from '../src/selection';
import { useBackgroundPresets } from '../src/offline-presets';

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
  it('retains the original opening and ending with enough time for calm editing gestures', () => {
    expect(INTRO_END).toBe(3.5);
    expect(EDIT_END - INTRO_END).toBeCloseTo(20.45, 8);
    expect(DURATION - EDIT_END).toBeCloseTo(ORIGINAL.duration - ENDING_START, 8);
  });
  it.each([
    0,
    3.5,
    5.8,
    7.3,
    BACKGROUND_BLUR_END,
    TRIM_START,
    11.3,
    TRIM_END,
    SHAPE_START,
    SHAPE_END,
    BLUR_START,
    BLUR_END,
    PIXELATED_TIME,
    NORMAL_BLUR_TIME,
    23,
  ])('produces a valid native composition at %s seconds', (time) => {
    expect(() => validateComposition(compositionAt(time))).not.toThrow();
  });
  it('reaches the exact native trim command result without retiming the ending', () => {
    const result = compositionAt(TRIM_END);
    const committed = trimClip(BASE.composition, SCREEN.id, 'end', SCREEN.timelineDurationMs - 1200);
    const screen = result.clips.find((clip) => clip.id === SCREEN.id)!;
    const expected = committed.clips.find((clip) => clip.id === SCREEN.id)!;
    expect({ ...screen, order: expected.order }).toEqual(expected);
    for (const ending of BASE.composition.clips.filter((clip) => clip.kind !== 'screen'))
      expect(result.clips.find((clip) => clip.id === ending.id)?.timelineStartMs).toBe(ending.timelineStartMs);
  });
  it('draws genuine editable shape and effect records only after their insertion gestures', () => {
    expect(compositionAt(SHAPE_START - 0.01).clips.some((clip) => clip.id === 'film-rectangle')).toBe(false);
    expect(compositionAt(SHAPE_START).clips.some((clip) => clip.id === 'film-rectangle')).toBe(true);
    expect(compositionAt(BLUR_START - 0.01).clips.some((clip) => clip.kind === 'blur')).toBe(false);
    expect(compositionAt(BLUR_END).clips.find((clip) => clip.kind === 'blur')).toEqual(blurClip(BLUR_END));
    expect(shapeClip(SHAPE_END).fillEnabled).toBe(true);
    expect(shapeClip(SHAPE_END).borderWidth).toBe(0);
    expect(shapeClip(SHAPE_END).opacityEnabled).toBe(false);
    expect(blurClip(PIXELATED_TIME).mode).toBe('pixelated');
    expect(blurClip(NORMAL_BLUR_TIME).mode).toBe('blur');
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
    expect(snapshotAt(5.79).background).toEqual(BASE.background);
    expect(snapshotAt(5.8).background).not.toEqual(BASE.background);
    expect(snapshotAt(BACKGROUND_BLUR_START).blurPercent).toBe(0);
    expect(snapshotAt(BACKGROUND_BLUR_END).blurPercent).toBe(65);
    expect(snapshotAt(4).cursorSettings.enabled).toBe(BASE.cursorSettings.enabled);
    expect(snapshotAt(8).cursorSettings.enabled).toBe(false);
  });
});

describe('authored motion', () => {
  it.each([
    [trimAt, TRIM_START, TRIM_END],
    [shapeAt, SHAPE_START, SHAPE_END],
    [blurAt, BLUR_START, BLUR_END],
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
    for (const time of [0, INTRO_END, EDIT_END, DURATION]) expect(transitionAt(time)).toBe(0);
    for (const time of [4.6, 10, OUTRO_START]) expect(transitionAt(time)).toBe(1);
    expect(transitionAt((INTRO_END + 4.6) / 2)).toBeCloseTo(0.5, 8);
    expect(transitionAt((OUTRO_START + EDIT_END) / 2)).toBeCloseTo(0.5, 8);
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
    expect(menuAt(13.2)).toBe('shape');
    expect(menuAt(17)).toBe('blur');
    expect(menuAt(20)).toBeNull();
    expect([5, 11, 16, 20].map(modeAt)).toEqual(['canvas', 'clip', 'shape', 'blur']);
    expect(previewTimeAt(4)).toBe(3.5);
    expect(previewTimeAt(12)).toBe(0.2);
    expect(previewTimeAt(21.85)).toBeCloseTo(0.6, 8);
    expect(previewTimeAt(25)).toBeCloseTo(1.4, 8);
    expect(blurPercentAt(5)).toBe(0);
    expect(blurPercentAt(10)).toBe(65);
    expect(waypoints.every((waypoint, index) => !index || waypoint.time > waypoints[index - 1]!.time)).toBe(true);
  });
});

describe('calmer cursor and ending handoff', () => {
  it('bounds travel and remains symmetric and monotonic, including the velocity ramp joins', () => {
    expect(travel(-1)).toBe(0);
    expect(travel(2)).toBe(1);
    let previous = 0;
    for (let value = 0; value <= 1; value += 0.001) {
      expect(travel(value)).toBeGreaterThanOrEqual(previous);
      expect(travel(value) + travel(1 - value)).toBeCloseTo(1, 10);
      previous = travel(value);
    }
  });
  it('limits peak travel speed below the former quintic easing', () => {
    const step = 0.0001;
    for (let value = 0; value < 1; value += step)
      expect((travel(value + step) - travel(value)) / step).toBeLessThanOrEqual(4 / 3 + 0.00001);
    expect((ease(0.5001) - ease(0.5)) / step).toBeGreaterThan(1.8);
  });
  it('has zero endpoint velocity and continuous velocity at both travel ramp joins', () => {
    const step = 0.00001;
    expect(travel(step) / step).toBeLessThan(0.000001);
    expect((1 - travel(1 - step)) / step).toBeLessThan(0.000001);
    for (const join of [0.25, 0.75])
      expect((travel(join) - travel(join - step)) / step).toBeCloseTo((travel(join + step) - travel(join)) / step, 6);
  });
  it('fades the cursor in, settles its clicks gently and removes it before the outro', () => {
    expect(cursorOpacityAt(0)).toBe(0);
    expect(cursorOpacityAt(4.5)).toBe(1);
    expect(cursorOpacityAt(OUTRO_START - 0.2)).toBeCloseTo(0.5, 8);
    expect(cursorOpacityAt(OUTRO_START)).toBe(0);
    expect(cursorOpacityAt(DURATION)).toBe(0);
  });
  it('uses the native Beam click spring, including its release overshoot', () => {
    const click = BACKGROUND_CHANGES[0]!.time;
    for (const age of [0, 0.03, 0.07, 0.15, 0.2, 0.3, 0.43])
      expect(pressScaleAt(click + age)).toBeCloseTo(cursorClickSpringScale(age, true, 65), 8);
    expect(pressScaleAt(click + 0.07)).toBeLessThan(0.85);
    expect(pressScaleAt(click + 0.18)).toBeGreaterThan(1.05);
    expect(pressScaleAt(0)).toBe(1);
    for (let time = INTRO_END; time <= EDIT_END; time += 0.005) {
      expect(pressScaleAt(time)).toBeGreaterThanOrEqual(0.8);
      expect(pressScaleAt(time)).toBeLessThanOrEqual(1.1);
    }
  });
  it('allocates at least 0.8 seconds to each long cursor journey', () => {
    for (const [start, end] of [
      [3.5, SCRUB_TIME],
      [SCRUB_TIME, BACKGROUND_CHANGES[0]!.time],
      [BACKGROUND_BLUR_END, TRIM_START],
      [TRIM_END, 13.05],
      [13.8, SHAPE_START],
      [SHAPE_END, 16.8],
      [17.6, BLUR_START],
      [BLUR_END, PIXELATED_TIME],
      [NORMAL_BLUR_TIME, 21.95],
    ])
      expect(end! - start!).toBeGreaterThanOrEqual(0.8 - 0.000001);
  });
  it('finishes the dissolve before resuming the unmodified ending clock', () => {
    expect(endingBlendAt(0)).toBe(0);
    expect(endingBlendAt(OUTRO_START)).toBe(0);
    expect(endingBlendAt(EDIT_END)).toBe(1);
    expect(endingBlendAt(DURATION)).toBe(1);
  });
  it('keeps the closing geometry and dissolve continuous at the final frame handoff', () => {
    const step = 1 / 60;
    expect(1 - endingBlendAt(EDIT_END - step)).toBeLessThan(0.0001);
    expect(transitionAt(EDIT_END - step)).toBeLessThan(0.0001);
    expect(transitionAt(EDIT_END + step)).toBe(0);
  });
});

describe('filled shape catalogue host', () => {
  it('exposes the native predicate contract while a colour preset is edited', () => {
    const presets = useBackgroundPresets(() => undefined);
    const color = presets.colorPresets.value[0]!;
    expect(presets.isEditing(color.id)).toBe(false);
    presets.editColor(color);
    expect(presets.isEditing(color.id)).toBe(true);
    expect(presets.isEditing('another-preset')).toBe(false);
  });
  it('clears the selected preset when its editor closes', () => {
    const presets = useBackgroundPresets(() => undefined);
    const color = presets.colorPresets.value[0]!;
    presets.editColor(color);
    presets.close();
    expect(presets.isEditing(color.id)).toBe(false);
  });
  it('does not mark any preset as edited while creating a new fill', () => {
    const presets = useBackgroundPresets(() => undefined);
    const color = presets.colorPresets.value[0]!;
    presets.editColor(color);
    presets.beginAdd();
    expect(presets.isEditing(color.id)).toBe(false);
    expect(presets.isEditing('')).toBe(false);
  });
});

describe('visible background changes and cursor clicks', () => {
  it('selects three distinct backgrounds at their clicks, including a detailed photo before blur', () => {
    expect(wallpaperAt(0)).toBe('golden');
    expect(wallpaperAt(5.799)).toBe('golden');
    expect(BACKGROUND_CHANGES.map((change) => wallpaperAt(change.time))).toEqual(['ventura', 'light', 'sunset']);
    for (const change of BACKGROUND_CHANGES) {
      const wallpaper = WALLPAPERS.find((entry) => entry.id === change.id)!;
      expect(snapshotAt(change.time).background).toEqual({ kind: 'image', src: wallpaper.url });
      expect(waypoints.find((point) => point.time === change.time)).toMatchObject({ pressed: true });
    }
    expect(wallpaperAt(DURATION)).toBe('sunset');
    expect(wallpaperAt(6)).toBe('ventura');
  });
  it('keeps the background sharp until its drag, pauses at 20% and finishes at a visible 65%', () => {
    expect(blurPercentAt(7.9)).toBe(0);
    expect(blurPercentAt(8.25)).toBeCloseTo(10, 8);
    for (const time of [8.5, 8.6, 8.7]) expect(blurPercentAt(time)).toBe(20);
    expect(blurPercentAt(9.05)).toBeCloseTo(42.5, 8);
    expect(blurPercentAt(9.4)).toBe(65);
    expect(blurPercentAt(DURATION)).toBe(65);
  });
  it('widens the preview before background selection and keeps the real slider aligned with its pointer', () => {
    expect(previewTimeAt(SCRUB_TIME - 0.001)).toBe(3.5);
    for (const change of BACKGROUND_CHANGES) expect(previewTimeAt(change.time)).toBe(0.2);
    for (const point of waypoints.filter((point) => point.target.includes('big-slider-input')))
      expect((point.x ?? 0) * 100).toBeCloseTo(blurPercentAt(point.time), 8);
    expect(CURSOR_SIZE / 44).toBeGreaterThan(1.45);
  });
  it('starts a new spring for every click, settles and remains deterministic across reverse seeks', () => {
    for (const point of waypoints.filter((point) => point.pressed)) {
      expect(pressScaleAt(point.time - 0.001)).toBeCloseTo(1, 8);
      expect(pressScaleAt(point.time)).toBe(1);
      expect(pressScaleAt(point.time + 0.07)).toBeLessThan(0.85);
      expect(pressScaleAt(point.time + 0.18)).toBeGreaterThan(1);
      expect(pressScaleAt(point.time + 0.43)).toBe(1);
    }
    const times = [5.87, 6.73, 0, 7.37, 14.67, 25];
    const first = times.map(pressScaleAt);
    times.toReversed().forEach(pressScaleAt);
    expect(times.map(pressScaleAt)).toEqual(first);
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

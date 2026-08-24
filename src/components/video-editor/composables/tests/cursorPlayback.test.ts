import { describe, expect, it } from 'vitest';
import {
  buttonEventsBetween,
  cursorAssetForState,
  cursorAutoHiddenAt,
  cursorAutoHideOpacityAt,
  cursorEventIndexFor,
  cursorStateAt,
} from '../cursorPlayback';
import type { CursorEvent, CursorShapeAsset } from '../../../../api/types/capture-api';

const second = (value: number) => value * 1_000_000_000;
const move = (time: number, x: number, y: number, visible = true, cursorId?: string): CursorEvent => ({
  event: 'move',
  sessionNs: second(time),
  ...(cursorId ? { cursorId } : {}),
  pixelX: 0,
  pixelY: 0,
  normalizedX: x,
  normalizedY: y,
  visible,
});
const button = (time: number, buttonId = 0, pressed = true): CursorEvent => ({
  event: 'button',
  sessionNs: second(time),
  button: buttonId,
  pressed,
  normalizedX: 0.5,
  normalizedY: 0.5,
});

describe('cursor playback', () => {
  it('returns no cursor before the first move, including negative playback time', () => {
    expect(cursorStateAt([move(1, 0.1, 0.2)], 0.5)).toBeNull();
    expect(cursorStateAt([move(1, 0.1, 0.2)], -4)).toBeNull();
  });

  it('uses the first recorded position at the exact start of the timeline', () => {
    expect(cursorStateAt([move(0.02, 0.1, 0.2)], 0)).toMatchObject({
      x: 0.1,
      y: 0.2,
      visible: true,
    });
  });

  it('smooths movement between recorded cursor positions', () => {
    const state = cursorStateAt([move(0, 0, 0), move(1, 1, 0)], 0.25);
    expect(state?.x).toBeCloseTo(0.15625);
  });

  it('interpolates the next move and applies shape and visibility events', () => {
    const events: CursorEvent[] = [
      {
        event: 'shape',
        sessionNs: second(0),
        shapeId: 'arrow',
        hotspot: { x: 3, y: 4 },
      },
      move(1, 0.2, 0.4),
      { event: 'button', sessionNs: second(1.1), button: 0, pressed: true, normalizedX: 0.2, normalizedY: 0.4 },
      { event: 'visibility', sessionNs: second(1.2), visible: false },
      move(3, 0.8, 0.6),
    ];
    expect(cursorStateAt(events, 2)).toEqual({
      x: 0.5,
      y: 0.5,
      visible: false,
      shapeId: 'arrow',
      cursorId: 'arrow',
      cursorKind: null,
      hotspot: { x: 3, y: 4 },
    });
  });

  it('uses initial shape data and keeps the latest move state after the final move', () => {
    expect(cursorStateAt([move(2, 0.7, 0.8, false)], 4, 'initial', { x: 1, y: 2 })).toEqual({
      x: 0.7,
      y: 0.8,
      visible: false,
      shapeId: 'initial',
      cursorId: 'initial',
      cursorKind: null,
      hotspot: { x: 1, y: 2 },
    });
  });

  it('uses the first future move and ignores future non-move state changes', () => {
    const events: CursorEvent[] = [
      move(1, 0, 0),
      {
        event: 'shape',
        sessionNs: second(2.5),
        shapeId: 'future',
        hotspot: { x: 9, y: 9 },
      },
      move(3, 0.5, 0.5),
      move(4, 1, 1),
      { event: 'button', sessionNs: second(5), button: 0, pressed: true, normalizedX: 1, normalizedY: 1 },
    ];
    expect(cursorStateAt(events, 2, 'initial')).toMatchObject({
      x: 0.25,
      y: 0.25,
      shapeId: 'initial',
    });
  });

  it('returns only pressed button events in the half-open playback interval', () => {
    const events: CursorEvent[] = [
      { event: 'button', sessionNs: second(1), button: 1, pressed: true, normalizedX: 0, normalizedY: 0 },
      { event: 'button', sessionNs: second(2), button: 1, pressed: false, normalizedX: 0, normalizedY: 0 },
      { event: 'button', sessionNs: second(3), button: 2, pressed: true, normalizedX: 1, normalizedY: 1 },
    ];
    expect(buttonEventsBetween(events, 1, 3)).toEqual([events[2]]);
    expect(buttonEventsBetween(events, 0, 3, 'right')).toEqual([events[2]]);
    expect(buttonEventsBetween(events, 0, 3, 'left')).toEqual([events[0]]);
    expect(buttonEventsBetween(events, 3, 1)).toEqual([]);
  });

  it('caches one temporal index per event list and invalidates it after an append', () => {
    const events: CursorEvent[] = [move(0, 0, 0), button(1), move(2, 1, 1)];
    const first = cursorEventIndexFor(events);

    expect(cursorEventIndexFor(events)).toBe(first);

    events.push(move(3, 0.25, 0.75));
    expect(cursorEventIndexFor(events)).not.toBe(first);
  });

  it('keeps indexed state and button queries equivalent to the public helpers', () => {
    const events: CursorEvent[] = [
      {
        event: 'shape',
        sessionNs: second(0),
        cursorId: 'default',
        cursorKind: 'default',
        hotspot: { x: 1, y: 2 },
      },
      move(0, 0, 0),
      button(1, 0),
      button(1, 0, false),
      button(2, 2),
      move(3, 1, 1),
    ];
    const index = cursorEventIndexFor(events);

    for (const time of [-1, 0, 0.5, 1, 1.5, 3, 4]) {
      expect(index.stateAt(time, 'initial', { x: 9, y: 8 })).toEqual(
        cursorStateAt(events, time, 'initial', { x: 9, y: 8 }),
      );
    }
    for (const [start, end, semanticButton] of [
      [0, 1, undefined],
      [1, 2, undefined],
      [0, 3, 'left'],
      [0, 3, 'right'],
      [3, 1, undefined],
    ] as const) {
      expect(index.buttonsBetween(start, end, semanticButton)).toEqual(
        buttonEventsBetween(events, start, end, semanticButton),
      );
    }
  });

  it('uses stable last-write semantics for identical timestamps without invalid interpolation', () => {
    const events: CursorEvent[] = [
      move(0, 0.1, 0.2, true, 'first'),
      {
        event: 'shape',
        sessionNs: second(0),
        cursorId: 'first',
        cursorKind: 'default',
        hotspot: { x: 1, y: 2 },
      },
      move(0, 0.4, 0.5, false, 'second'),
      {
        event: 'shape',
        sessionNs: second(0),
        cursorId: 'second',
        cursorKind: 'handpointing',
        hotspot: { x: 5, y: 6 },
      },
      move(1, 1, 1, true, 'third'),
    ];

    expect(cursorStateAt(events, 0)).toMatchObject({
      x: 0.4,
      y: 0.5,
      visible: false,
      cursorId: 'second',
      cursorKind: 'handpointing',
      hotspot: { x: 5, y: 6 },
    });
    const interpolated = cursorStateAt(events, 0.5);
    expect(interpolated?.x).toBeCloseTo(0.7, 5);
    expect(interpolated?.y).toBeCloseTo(0.75, 5);
    expect(Number.isFinite(interpolated?.x)).toBe(true);
    expect(Number.isFinite(interpolated?.y)).toBe(true);
  });

  it('remains correct when seeking backward and forward through a cached index', () => {
    const events: CursorEvent[] = [move(0, 0, 0), move(1, 0.5, 0.25), move(2, 1, 0.5)];
    const late = cursorStateAt(events, 2.5);
    const early = cursorStateAt(events, 0.5);
    const middle = cursorStateAt(events, 1.5);
    const lateAgain = cursorStateAt(events, 2.5);

    expect(early?.x).toBeCloseTo(0.25, 5);
    expect(early?.y).toBeCloseTo(0.125, 5);
    expect(middle?.x).toBeCloseTo(0.75, 5);
    expect(middle?.y).toBeCloseTo(0.375, 5);
    expect(late).toEqual(lateAgain);
    expect(late).toMatchObject({ x: 1, y: 0.5 });
  });

  it('preserves legacy non-finite time behavior', () => {
    const events: CursorEvent[] = [move(0, 0, 0), button(0.5), move(1, 1, 1)];
    expect(cursorStateAt(events, Number.NaN)).toMatchObject({ x: 1, y: 1 });
    expect(cursorStateAt(events, Number.POSITIVE_INFINITY)).toMatchObject({ x: 1, y: 1 });
    expect(cursorStateAt(events, Number.NEGATIVE_INFINITY)).toMatchObject({ x: 0, y: 0 });
    expect(buttonEventsBetween(events, Number.NaN, 1)).toEqual([]);
    expect(buttonEventsBetween(events, 0, Number.NaN)).toEqual([]);
  });

  it('handles long event lists while preserving the final state and button interval', () => {
    const moveCount = 5_000;
    const events: CursorEvent[] = Array.from({ length: moveCount }, (_, index) => {
      const progress = index / (moveCount - 1);
      return move(index / 30, progress, 1 - progress);
    });
    events.push(button(100, 2));

    const finalState = cursorStateAt(events, (moveCount - 1) / 30);
    expect(finalState).toMatchObject({ x: 1, y: 0, visible: true });
    expect(buttonEventsBetween(events, 99, 100)).toEqual([events.at(-1)]);
  });

  it('resolves shape assets only for known shape ids', () => {
    const asset: CursorShapeAsset = {
      src: 'cursor.png',
      hotspot: { x: 2, y: 5 },
    };
    expect(
      cursorAssetForState(
        {
          x: 0,
          y: 0,
          visible: true,
          cursorId: null,
          shapeId: 'arrow',
          cursorKind: null,
          hotspot: { x: 0, y: 0 },
        },
        { arrow: asset },
      ),
    ).toBe(asset);
    expect(
      cursorAssetForState(
        {
          x: 0,
          y: 0,
          visible: true,
          cursorId: null,
          shapeId: 'missing',
          cursorKind: null,
          hotspot: { x: 0, y: 0 },
        },
        {},
      ),
    ).toBeNull();
    expect(cursorAssetForState(null, { arrow: asset })).toBeNull();
  });

  it('keeps a semantic cursor kind without requiring a bitmap shape', () => {
    const events: CursorEvent[] = [
      {
        event: 'shape',
        sessionNs: 0,
        cursorId: 'win:arrow',
        cursorKind: 'default',
        nativeCursorId: 'win:arrow',
        hotspot: { x: 1, y: 2 },
      },
      move(1, 0.2, 0.3),
    ];
    expect(cursorStateAt(events, 1)).toMatchObject({
      cursorId: 'win:arrow',
      cursorKind: 'default',
      hotspot: { x: 1, y: 2 },
    });
  });

  it('keeps the cursor identity supplied by PipeWire move metadata', () => {
    const events: CursorEvent[] = [
      move(1, 0.2, 0.3, true, 'pipewire:stream:9'),
      move(2, 0.4, 0.5, true, 'pipewire:stream:9'),
    ];

    expect(cursorStateAt(events, 1.5)).toMatchObject({
      cursorId: 'pipewire:stream:9',
      shapeId: 'pipewire:stream:9',
    });
  });

  it('exposes custom cursors so the renderer can show an explicit fallback', () => {
    const events: CursorEvent[] = [
      {
        event: 'shape',
        sessionNs: 0,
        cursorId: 'x11:42',
        cursorKind: 'custom',
        nativeCursorId: 'x11:42',
        hotspot: { x: 0, y: 0 },
      },
      move(1, 0.5, 0.5),
    ];
    expect(cursorStateAt(events, 1)?.cursorKind).toBe('custom');
  });
});

describe('cursor auto-hide', () => {
  it('does not treat repeated identical move events as activity', () => {
    const events: CursorEvent[] = [move(0, 0.25, 0.5), move(1, 0.25, 0.5), move(2, 0.25, 0.5)];
    const settings = { enabled: true, delaySeconds: 2, fadeDurationMs: 0 };

    expect(cursorAutoHiddenAt(events, 1.99, settings)).toBe(false);
    expect(cursorAutoHiddenAt(events, 2, settings)).toBe(true);
  });

  it('resets the idle timer when the cursor position changes', () => {
    const events: CursorEvent[] = [move(0, 0.25, 0.5), move(1, 0.5, 0.5)];
    const settings = { enabled: true, delaySeconds: 2, fadeDurationMs: 0 };

    expect(cursorAutoHiddenAt(events, 2.99, settings)).toBe(false);
    expect(cursorAutoHiddenAt(events, 3, settings)).toBe(true);
  });

  it('resets the idle timer for a pressed click', () => {
    const events: CursorEvent[] = [move(0, 0.25, 0.5), button(1)];
    const settings = { enabled: true, delaySeconds: 2, fadeDurationMs: 0 };

    expect(cursorAutoHiddenAt(events, 2.99, settings)).toBe(false);
    expect(cursorAutoHiddenAt(events, 3, settings)).toBe(true);
  });

  it('resets the idle timer when visibility becomes true', () => {
    const events: CursorEvent[] = [
      move(0, 0.25, 0.5),
      { event: 'visibility', sessionNs: second(1), visible: false },
      { event: 'visibility', sessionNs: second(2), visible: true },
    ];
    const settings = { enabled: true, delaySeconds: 2, fadeDurationMs: 0 };

    expect(cursorAutoHiddenAt(events, 3.99, settings)).toBe(false);
    expect(cursorAutoHiddenAt(events, 4, settings)).toBe(true);
  });

  it('never hides the cursor when auto-hide is disabled', () => {
    expect(
      cursorAutoHiddenAt([move(0, 0.25, 0.5)], 100, { enabled: false, delaySeconds: 0.5, fadeDurationMs: 0 }),
    ).toBe(false);
  });

  it('hides exactly at the configured delay boundary', () => {
    const settings = { enabled: true, delaySeconds: 1.25, fadeDurationMs: 0 };
    const events = [move(0, 0.25, 0.5)];

    expect(cursorAutoHiddenAt(events, 1.25 - 1e-9, settings)).toBe(false);
    expect(cursorAutoHiddenAt(events, 1.25, settings)).toBe(true);
  });

  it('fades linearly from fully visible to hidden after the idle delay', () => {
    const events = [move(0, 0.25, 0.5)];
    const settings = { enabled: true, delaySeconds: 2, fadeDurationMs: 1_000 };

    expect(cursorAutoHideOpacityAt(events, 1.99, settings)).toBe(1);
    expect(cursorAutoHideOpacityAt(events, 2, settings)).toBe(1);
    expect(cursorAutoHideOpacityAt(events, 2.5, settings)).toBeCloseTo(0.5);
    expect(cursorAutoHideOpacityAt(events, 3, settings)).toBe(0);
    expect(cursorAutoHiddenAt(events, 2.5, settings)).toBe(false);
    expect(cursorAutoHiddenAt(events, 3, settings)).toBe(true);
  });

  it('fades back in from zero after a real movement follows a fully hidden period', () => {
    const events = [move(0, 0.25, 0.5), move(3, 0.75, 0.5)];
    const settings = { enabled: true, delaySeconds: 1, fadeDurationMs: 1_000 };

    expect(cursorAutoHideOpacityAt(events, 2, settings)).toBe(0);
    expect(cursorAutoHideOpacityAt(events, 3, settings)).toBe(0);
    expect(cursorAutoHideOpacityAt(events, 3.5, settings)).toBeCloseTo(0.5);
    expect(cursorAutoHideOpacityAt(events, 4, settings)).toBe(1);
  });

  it('keeps the same fade-in progression across additional movement events', () => {
    const events = [move(0, 0.25, 0.5), move(3, 0.5, 0.5), move(3.25, 0.75, 0.5)];
    const settings = { enabled: true, delaySeconds: 1, fadeDurationMs: 1_000 };

    expect(cursorAutoHideOpacityAt(events, 3.25, settings)).toBeCloseTo(0.25);
    expect(cursorAutoHideOpacityAt(events, 3.5, settings)).toBeCloseTo(0.5);
  });

  it('does not fade in the first cursor activity when it was never previously hidden', () => {
    const events = [move(3, 0.25, 0.5)];
    const settings = { enabled: true, delaySeconds: 1, fadeDurationMs: 1_000 };

    expect(cursorAutoHideOpacityAt(events, 3.01, settings)).toBe(1);
    expect(cursorAutoHideOpacityAt(events, 3.5, settings)).toBe(1);
  });

  it('returns to full opacity immediately when activity interrupts the fade-out', () => {
    const events = [move(0, 0.25, 0.5), move(1.5, 0.75, 0.5)];
    const settings = { enabled: true, delaySeconds: 1, fadeDurationMs: 1_000 };

    expect(cursorAutoHideOpacityAt(events, 1.25, settings)).toBeCloseTo(0.75);
    expect(cursorAutoHideOpacityAt(events, 1.5, settings)).toBe(1);
  });

  it('hides instantly when the fade duration is zero', () => {
    const events = [move(0, 0.25, 0.5)];
    const settings = { enabled: true, delaySeconds: 2, fadeDurationMs: 0 };

    expect(cursorAutoHideOpacityAt(events, 1.999, settings)).toBe(1);
    expect(cursorAutoHideOpacityAt(events, 2, settings)).toBe(0);
  });

  it('reappears instantly after a fully hidden period when the fade duration is zero', () => {
    const events = [move(0, 0.25, 0.5), move(3, 0.75, 0.5)];
    const settings = { enabled: true, delaySeconds: 1, fadeDurationMs: 0 };

    expect(cursorAutoHideOpacityAt(events, 2, settings)).toBe(0);
    expect(cursorAutoHideOpacityAt(events, 3, settings)).toBe(1);
  });
});

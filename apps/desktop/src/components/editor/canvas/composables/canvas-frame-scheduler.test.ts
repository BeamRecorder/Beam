import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCanvasFrameScheduler, type CanvasFrameScheduler } from './canvas-frame-scheduler';

let pendingFrames: Map<number, FrameRequestCallback>;
let nextFrameId: number;
let requestFrame: ReturnType<typeof vi.fn<(callback: FrameRequestCallback) => number>>;
let cancelFrame: ReturnType<typeof vi.fn<(id: number) => void>>;

const runNextFrame = () => {
  const next = pendingFrames.entries().next();
  if (next.done) throw new Error('Expected a pending animation frame');
  const [id, callback] = next.value;
  pendingFrames.delete(id);
  callback(performance.now());
};

beforeEach(() => {
  pendingFrames = new Map();
  nextFrameId = 0;
  requestFrame = vi.fn<(callback: FrameRequestCallback) => number>((callback) => {
    const id = ++nextFrameId;
    pendingFrames.set(id, callback);
    return id;
  });
  cancelFrame = vi.fn<(id: number) => void>((id) => {
    pendingFrames.delete(id);
  });
  vi.stubGlobal('requestAnimationFrame', requestFrame);
  vi.stubGlobal('cancelAnimationFrame', cancelFrame);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('createCanvasFrameScheduler', () => {
  it('does not schedule a hidden canvas while the DOM surface owns presentation', () => {
    const render = vi.fn();
    const scheduler = createCanvasFrameScheduler(
      render,
      () => true,
      () => false,
    );
    scheduler.requestRender();
    expect(pendingFrames).toHaveLength(0);
    expect(render).not.toHaveBeenCalled();
    scheduler.dispose();
  });
  it('cancels a queued canvas paint when presentation switches to HTML', () => {
    let enabled = true;
    const render = vi.fn();
    const scheduler = createCanvasFrameScheduler(
      render,
      () => true,
      () => enabled,
    );
    scheduler.requestRender();
    enabled = false;
    runNextFrame();
    expect(render).not.toHaveBeenCalled();
    expect(pendingFrames).toHaveLength(0);
    enabled = true;
    scheduler.requestRender();
    runNextFrame();
    expect(render).toHaveBeenCalledOnce();
    expect(pendingFrames).toHaveLength(1);
    scheduler.dispose();
  });
  it('does not retain redraw requests made by a render that disables presentation', () => {
    let enabled = true;
    const render = vi.fn(() => {
      enabled = false;
      scheduler.requestRender();
    });
    const scheduler = createCanvasFrameScheduler(
      render,
      () => true,
      () => enabled,
    );
    scheduler.requestRender();
    runNextFrame();
    expect(render).toHaveBeenCalledOnce();
    expect(pendingFrames).toHaveLength(0);
    scheduler.dispose();
  });
  it('coalesces repeated render requests before a frame', () => {
    const render = vi.fn();
    const scheduler = createCanvasFrameScheduler(render, () => false);

    scheduler.requestRender();
    scheduler.requestRender();
    scheduler.requestRender();

    expect(requestFrame).toHaveBeenCalledOnce();
    expect(pendingFrames).toHaveLength(1);

    runNextFrame();

    expect(render).toHaveBeenCalledOnce();
    expect(requestFrame).toHaveBeenCalledOnce();
    expect(pendingFrames).toHaveLength(0);
  });

  it('coalesces a request raised during render while continuing one frame at a time', () => {
    let scheduler!: CanvasFrameScheduler;
    const render = vi.fn(() => {
      scheduler.requestRender();
      scheduler.requestRender();
    });
    scheduler = createCanvasFrameScheduler(render, () => true);

    scheduler.requestRender();
    runNextFrame();

    expect(render).toHaveBeenCalledOnce();
    expect(requestFrame).toHaveBeenCalledTimes(2);
    expect(pendingFrames).toHaveLength(1);

    runNextFrame();

    expect(render).toHaveBeenCalledTimes(2);
    expect(requestFrame).toHaveBeenCalledTimes(3);
    expect(pendingFrames).toHaveLength(1);

    scheduler.dispose();
    expect(cancelFrame).toHaveBeenCalledOnce();
    expect(pendingFrames).toHaveLength(0);
  });

  it('disposes pending work and does not schedule a continuous frame when playback should stop', () => {
    const disposedRender = vi.fn();
    const disposedScheduler = createCanvasFrameScheduler(disposedRender, () => true);
    disposedScheduler.requestRender();
    disposedScheduler.dispose();

    expect(cancelFrame).toHaveBeenCalledWith(1);
    expect(disposedRender).not.toHaveBeenCalled();
    expect(pendingFrames).toHaveLength(0);
    disposedScheduler.requestRender();
    disposedScheduler.dispose();
    expect(requestFrame).toHaveBeenCalledOnce();
    expect(cancelFrame).toHaveBeenCalledOnce();

    const render = vi.fn();
    const scheduler = createCanvasFrameScheduler(render, () => false);
    scheduler.requestRender();
    runNextFrame();

    expect(render).toHaveBeenCalledOnce();
    expect(requestFrame).toHaveBeenCalledTimes(2);
    expect(pendingFrames).toHaveLength(0);
  });
});

it('caps experimental playback with the same cadence remainder as the reference Pixi ticker', () => {
  const render = vi.fn(),
    scheduler = createCanvasFrameScheduler(
      render,
      () => true,
      () => true,
      () => 60,
    );
  scheduler.requestRender();
  let referenceClock: number | null = null,
    expected = 0;
  for (let frame = 0; frame < 144; frame++) {
    const timestamp = (frame * 1000) / 144;
    const next = pendingFrames.entries().next().value!;
    pendingFrames.delete(next[0]);
    next[1](timestamp);
    if (referenceClock === null) {
      referenceClock = timestamp;
      expected++;
    } else {
      const delta = (timestamp - referenceClock) | 0;
      if (delta >= 1000 / 60) {
        referenceClock = timestamp - (delta % (1000 / 60));
        expected++;
      }
    }
  }
  expect(render).toHaveBeenCalledTimes(expected);
  expect(expected).toBeGreaterThan(55);
  expect(expected).toBeLessThanOrEqual(60);
  scheduler.dispose();
});
it('keeps uncapped standard playback and renders paused edits immediately after capped playback', () => {
  let playing = true;
  const render = vi.fn(),
    scheduler = createCanvasFrameScheduler(
      render,
      () => playing,
      () => true,
      () => (playing ? 60 : 0),
    );
  scheduler.requestRender();
  const paint = (time: number) => {
    const next = pendingFrames.entries().next().value!;
    pendingFrames.delete(next[0]);
    next[1](time);
  };
  paint(0);
  paint(7);
  expect(render).toHaveBeenCalledOnce();
  playing = false;
  paint(8);
  expect(render).toHaveBeenCalledTimes(2);
  expect(pendingFrames.size).toBe(0);
  scheduler.requestRender();
  paint(9);
  expect(render).toHaveBeenCalledTimes(3);
  scheduler.dispose();
});
it('releases a pending skipped frame on dispose instead of continuing to poll', () => {
  const render = vi.fn(),
    scheduler = createCanvasFrameScheduler(
      render,
      () => true,
      () => true,
      () => 60,
    );
  scheduler.requestRender();
  for (const time of [0, 7]) {
    const next = pendingFrames.entries().next().value!;
    pendingFrames.delete(next[0]);
    next[1](time);
  }
  scheduler.dispose();
  expect(pendingFrames.size).toBe(0);
  expect(render).toHaveBeenCalledOnce();
});

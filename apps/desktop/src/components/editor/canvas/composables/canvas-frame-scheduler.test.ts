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

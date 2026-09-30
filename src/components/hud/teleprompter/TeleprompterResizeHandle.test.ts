import { triggerPointer } from '../../../../tests/support/pointer';
import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TeleprompterResizeHandle from './TeleprompterResizeHandle.vue';
const resize = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('~/api/capture', () => ({ capture: { resizeTeleprompter: resize } }));
enableAutoUnmount(afterEach);
describe('teleprompter resize grip', () => {
  let frames: Map<number, FrameRequestCallback>;
  let nextFrame: number;
  const mountGrip = () => {
    const wrapper = mount(TeleprompterResizeHandle);
    Object.defineProperty(wrapper.get('button').element, 'setPointerCapture', { value: vi.fn() });
    return wrapper;
  };
  const runFrame = () => {
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((fn) => fn(0));
  };
  beforeEach(() => {
    resize.mockReset().mockResolvedValue(undefined);
    frames = new Map();
    nextFrame = 0;
    vi.stubGlobal('innerWidth', 640);
    vi.stubGlobal('innerHeight', 400);
    vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => {
      frames.set(++nextFrame, fn);
      return nextFrame;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  });
  afterEach(() => vi.unstubAllGlobals());
  it('coalesces drags into one frame and sends the final size on release', async () => {
    const wrapper = mountGrip();
    const grip = wrapper.get('button');
    await triggerPointer(grip, 'pointerdown', { button: 0, pointerId: 2, screenX: 50, screenY: 50 });
    await triggerPointer(grip, 'pointermove', { pointerId: 2, screenX: 60, screenY: 65 });
    await triggerPointer(grip, 'pointermove', { pointerId: 2, screenX: 80, screenY: 90 });
    expect(frames.size).toBe(1);
    expect(resize).not.toHaveBeenCalled();
    await triggerPointer(grip, 'pointerup', { pointerId: 2 });
    expect(resize).toHaveBeenCalledExactlyOnceWith({ width: 670, height: 440 });
    expect(frames.size).toBe(0);
  });
  it('ignores secondary buttons and foreign pointers and clamps minimum bounds', async () => {
    const wrapper = mountGrip();
    const grip = wrapper.get('button');
    await triggerPointer(grip, 'pointerdown', { button: 2, pointerId: 1 });
    await triggerPointer(grip, 'pointermove', { pointerId: 1, screenX: 20, screenY: 20 });
    expect(frames.size).toBe(0);
    await triggerPointer(grip, 'pointerdown', { button: 0, pointerId: 3, screenX: 0, screenY: 0 });
    await triggerPointer(grip, 'pointerdown', { button: 0, pointerId: 4, screenX: 100, screenY: 100 });
    await triggerPointer(grip, 'pointermove', { pointerId: 4 });
    await triggerPointer(grip, 'pointerup', { pointerId: 4 });
    expect(frames.size).toBe(0);
    await triggerPointer(grip, 'pointermove', { pointerId: 3, screenX: -1000, screenY: -1000 });
    runFrame();
    expect(resize).toHaveBeenCalledWith({ width: 240, height: 140 });
  });
  it.each(['pointercancel', 'lostpointercapture'])('discards pending resizing on %s', async (event) => {
    const wrapper = mountGrip();
    const grip = wrapper.get('button');
    await triggerPointer(grip, 'pointerdown', { button: 0, pointerId: 1, screenX: 0, screenY: 0 });
    await triggerPointer(grip, 'pointermove', { pointerId: 1, screenX: 1, screenY: 1 });
    await grip.trigger(event);
    runFrame();
    expect(resize).not.toHaveBeenCalled();
  });
  it('supports keyboard resizing and exposes errors while mounted', async () => {
    const wrapper = mountGrip();
    const grip = wrapper.get('button');
    for (const [key, shiftKey, expected] of [
      ['ArrowRight', false, { width: 648, height: 400 }],
      ['ArrowLeft', true, { width: 608, height: 400 }],
      ['ArrowDown', true, { width: 640, height: 432 }],
      ['ArrowUp', false, { width: 640, height: 392 }],
    ] as const) {
      await grip.trigger('keydown', { key, shiftKey });
      runFrame();
      expect(resize).toHaveBeenLastCalledWith(expected);
    }
    await grip.trigger('keydown', { key: 'Enter' });
    expect(frames.size).toBe(0);
    resize.mockRejectedValueOnce(new Error('Resize failed'));
    await grip.trigger('keydown', { key: 'ArrowRight' });
    runFrame();
    await Promise.resolve();
    expect(wrapper.emitted('error')).toEqual([['Error: Resize failed']]);
  });
  it('cancels pending frames and ignores in-flight errors after unmount', async () => {
    const wrapper = mountGrip();
    const grip = wrapper.get('button');
    let reject!: (error: Error) => void;
    resize.mockReturnValueOnce(
      new Promise((_resolve, fail) => {
        reject = fail;
      }),
    );
    await grip.trigger('keydown', { key: 'ArrowRight' });
    runFrame();
    await grip.trigger('keydown', { key: 'ArrowLeft' });
    wrapper.unmount();
    expect(frames.size).toBe(0);
    reject(new Error('Late error'));
    await Promise.resolve();
    expect(wrapper.emitted('error')).toBeUndefined();
  });
});

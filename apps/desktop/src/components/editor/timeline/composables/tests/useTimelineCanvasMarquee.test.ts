import { createTimelineFrameQueue } from '@beam/runtime/timeline/frame-queue';
import { enableAutoUnmount, mount } from '@vue/test-utils';
import { defineComponent, ref } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useTimelineCanvasMarquee } from '../useTimelineCanvasMarquee';
import type { TimelineCanvasLaneProps } from '../../timeline-canvas-types';
import type { TimelineCanvasMarquee } from '@beam/runtime/timeline/timeline-canvas-types';
import { visual, zoom } from '../../tests/TimelineTracks.test-support';

enableAutoUnmount(afterEach);
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
function setup(patch: Partial<TimelineCanvasLaneProps> = {}, measuredWidth = 200) {
  vi.useFakeTimers();
  const frames = new Map<number, FrameRequestCallback>();
  let next = 0;
  const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
    frames.set(++next, cb);
    return next;
  });
  const cancel = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
    frames.delete(id);
  });
  const ctx = { measureText: vi.fn(() => ({ width: measuredWidth })) };
  const get = vi
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: false })),
  );
  vi.spyOn(performance, 'now').mockReturnValue(1000);
  const draw = vi.fn();
  let read!: () => TimelineCanvasMarquee | undefined;
  const Component = defineComponent({
    props: ['items', 'width', 'durationMs', 'viewport', 'reduceMotion'],
    setup(props) {
      const surface = ref<HTMLCanvasElement | null>(null);
      read = useTimelineCanvasMarquee(
        surface,
        props as unknown as TimelineCanvasLaneProps,
        draw,
        () => surface.value?.getContext('2d') ?? null,
        createTimelineFrameQueue({ request: requestAnimationFrame, cancel: cancelAnimationFrame }),
      );
      return { surface };
    },
    template:
      '<div><canvas ref="surface" /><button data-timeline-clip-id="clip"><span class="nested" /></button><button data-timeline-zoom-id="zoom">Zoom</button><i class="empty" /></div>',
  });
  const wrapper = mount(Component, {
    props: {
      items: [
        {
          clip: visual({ id: 'clip', timelineDurationMs: 1000 }),
          selected: false,
        },
      ],
      width: 1000,
      durationMs: 10000,
      viewport: { left: 0, top: 0, width: 1000, height: 320 },
      ...patch,
    },
  });
  const tick = (time: number) => {
    const callbacks = [...frames.values()];
    frames.clear();
    callbacks.forEach((cb) => cb(time));
  };
  const enter = () => wrapper.get('.nested').trigger('pointerover');
  return { wrapper, read, draw, raf, cancel, frames, ctx, get, tick, enter };
}

describe('canvas lane hover marquee ownership', () => {
  it('owns no frame while idle and starts only after a hover delay for overflow text', async () => {
    const state = setup();
    expect(state.raf).not.toHaveBeenCalled();
    await state.enter();
    expect(state.read()).toEqual({ id: 'clip', offset: 0 });
    await vi.advanceTimersByTimeAsync(249);
    expect(state.raf).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(state.raf).toHaveBeenCalledOnce();
    state.tick(2500);
    expect(state.read()!.offset).toBeCloseTo(54);
    expect(state.draw).toHaveBeenCalledOnce();
    expect(state.frames.size).toBe(1);
  });
  it('moves back after the forward phase and stops when leaving the semantic item', async () => {
    const state = setup();
    await state.enter();
    await vi.advanceTimersByTimeAsync(250);
    state.tick(1000 + (116 / 36) * 1000 * 1.5);
    expect(state.read()!.offset).toBeCloseTo(58);
    state.wrapper.get('.nested').element.dispatchEvent(
      new MouseEvent('pointerout', {
        bubbles: true,
        relatedTarget: state.wrapper.get('.empty').element,
      }),
    );
    expect(state.read()).toBeUndefined();
    expect(state.frames.size).toBe(0);
    expect(state.draw).toHaveBeenCalledTimes(2);
  });
  it('keeps nested pointer movements inside the same item and avoids restarting its clock', async () => {
    const state = setup();
    await state.enter();
    state.wrapper.get('.nested').element.dispatchEvent(
      new MouseEvent('pointerout', {
        bubbles: true,
        relatedTarget: state.wrapper.get('button').element,
      }),
    );
    await state.wrapper.get('button').trigger('pointerover');
    await vi.advanceTimersByTimeAsync(250);
    expect(state.read()?.id).toBe('clip');
    expect(state.raf).toHaveBeenCalledOnce();
  });
  it.each([true, false])(
    'respects explicit or system reduced motion without measuring overflowing text',
    async (explicit) => {
      const state = setup({ reduceMotion: explicit });
      if (!explicit)
        vi.stubGlobal(
          'matchMedia',
          vi.fn(() => ({ matches: true })),
        );
      await state.enter();
      await vi.advanceTimersByTimeAsync(1000);
      expect(state.read()).toBeUndefined();
      expect(state.raf).not.toHaveBeenCalled();
      expect(state.get).not.toHaveBeenCalled();
    },
  );
  it('does not animate fitting text, unknown IDs or an unavailable context', async () => {
    const fitting = setup({}, 20);
    await fitting.enter();
    await vi.advanceTimersByTimeAsync(250);
    expect(fitting.raf).not.toHaveBeenCalled();
    fitting.wrapper.unmount();
    const missing = setup({ items: [] });
    await missing.enter();
    await vi.advanceTimersByTimeAsync(250);
    expect(missing.raf).not.toHaveBeenCalled();
    missing.wrapper.unmount();
    const unavailable = setup();
    unavailable.get.mockReturnValue(null);
    await unavailable.enter();
    await vi.advanceTimersByTimeAsync(250);
    expect(unavailable.raf).not.toHaveBeenCalled();
  });
  it('handles actual zoom labels and icon insets and cancels on pointerdown or disposal', async () => {
    const state = setup({
      items: [
        {
          zoom: zoom({ id: 'zoom', startMs: 0, endMs: 1000 }),
          label: 'Zoom title',
          labelInset: 15,
          selected: false,
        },
      ],
    });
    await state.wrapper.get('[data-timeline-zoom-id]').trigger('pointerover');
    await vi.advanceTimersByTimeAsync(250);
    expect(state.ctx.measureText).toHaveBeenCalledWith('Zoom title');
    state.tick(2500);
    expect(state.read()!.offset).toBeGreaterThan(0);
    await state.wrapper.get('button').trigger('pointerdown');
    expect(state.read()).toBeUndefined();
    expect(state.frames.size).toBe(0);
    await state.enter();
    state.wrapper.unmount();
    await vi.advanceTimersByTimeAsync(1000);
    expect(state.frames.size).toBe(0);
  });
  it('uses the minimum travel duration for a small overflow and ignores late cancelled callbacks', async () => {
    const state = setup({}, 100);
    await state.enter();
    await vi.advanceTimersByTimeAsync(250);
    state.tick(2500);
    expect(state.read()!.offset).toBeCloseTo(8);
    const late = [...state.frames.values()][0]!;
    state.wrapper.unmount();
    const count = state.draw.mock.calls.length;
    late(3500);
    expect(state.draw).toHaveBeenCalledTimes(count);
    expect(state.frames.size).toBe(0);
  });
  it('does not start animation for a transition zone or a pointer with no semantic target', async () => {
    const state = setup({
      items: [
        {
          transition: { preset: { kind: 'fade' }, durationMs: 200 },
          edge: 'entry',
          label: 'Entry',
          selected: false,
        },
      ],
    });
    state.wrapper.get('button').element.dataset.timelineClipId = 'canvas-entry';
    await state.wrapper.get('.empty').trigger('pointerover');
    expect(state.read()).toBeUndefined();
    await state.enter();
    await vi.advanceTimersByTimeAsync(250);
    expect(state.raf).not.toHaveBeenCalled();
  });
});

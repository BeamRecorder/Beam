import { defineComponent, h, nextTick, reactive, ref } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyComposition } from '@beam/engine/shared/composition-types';
import { createTimelineFrameQueue } from '@beam/runtime/timeline/frame-queue';
import { useTimelineViewport } from '../useTimelineViewport';
import type { TimelineTracksProps } from '../timeline-tracks-types';

vi.mock('../useCompositionAudioWaveforms', () => ({
  useCompositionAudioWaveforms: (composition: () => unknown, viewport: () => unknown, visible: () => unknown) => {
    composition();
    viewport();
    visible();
    return { slices: ref({}), errors: ref({}), status: ref({}) };
  },
}));
const frames = new Map<number, FrameRequestCallback>();
const wrappers: VueWrapper[] = [];
let sequence = 0;
const flush = (time = 1000) => {
  const batch = [...frames];
  frames.clear();
  for (const [, callback] of batch) callback(time);
};
beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++sequence, callback);
    return sequence;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 1000, 300));
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1000);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(300);
});
afterEach(() => {
  for (const wrapper of wrappers.splice(0)) if (wrapper.exists()) wrapper.unmount();
  frames.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const setup = (bound = true) => {
  const props = reactive<TimelineTracksProps>({
    currentTime: 0,
    duration: 10,
    isPlaying: false,
    zoomLevel: 100,
    zoomElements: [],
    selectedZoomId: null,
    composition: emptyComposition(),
    selectedClipId: null,
  });
  const duration = ref(10000);
  const emit = vi.fn<(event: string, ...values: unknown[]) => void>();
  let viewport!: ReturnType<typeof useTimelineViewport>;
  const queue = createTimelineFrameQueue({
    request: (callback) => requestAnimationFrame(callback),
    cancel: (id) => cancelAnimationFrame(id),
  });
  const wrapper = mount(
    defineComponent({
      setup() {
        viewport = useTimelineViewport(props, emit, duration, ref(null), ref(false), queue);
        return () =>
          bound
            ? h('div', { ref: viewport.tracksScrollRef }, [
                h('div', { ref: viewport.tracksViewportRef }, h('div', { ref: viewport.ticksAreaRef })),
              ])
            : h('div');
      },
    }),
  );
  wrappers.push(wrapper);
  flush();
  return { props, duration, viewport, wrapper, emit };
};

describe('viewport lifecycle and cached geometry invalidation', () => {
  it('stays usable before geometry is mounted and cancels queued measurements on disposal', async () => {
    const { viewport, props, wrapper } = setup(false);
    expect(viewport.timeAt(200)).toBe(0);
    expect(viewport.centeredStartAt(200, 20000)).toBe(0);
    viewport.updateAutoScroll(200);
    viewport.onScroll();
    flush();
    props.isPlaying = true;
    props.currentTime = 8;
    await nextTick();
    viewport.onScroll();
    expect(frames.size).toBeGreaterThan(0);
    wrapper.unmount();
    expect(frames.size).toBe(0);
  });

  it('handles empty or invalid project durations and keeps minute ruler labels correct', async () => {
    const { viewport, duration, props } = setup();
    props.duration = 0;
    duration.value = NaN;
    await nextTick();
    flush();
    expect(viewport.tracksWidthStyle.value.width).not.toContain('NaN');
    expect(viewport.formatRulerLabel(61)).toBe('1:01');
    expect(viewport.rulerSeconds.value.length).toBeGreaterThan(0);
    duration.value = 0;
    expect(() => viewport.centeredStartAt(500, 1000)).toThrow('Invalid timeline viewport');
    duration.value = 10000;
    expect(viewport.centeredStartAt(500, 1000)).toBe(4500);
  });

  it('coalesces a CSS UI-scale change and a pending zoom layout into one geometry measurement', async () => {
    const { viewport, props } = setup();
    const bounds = vi.mocked(HTMLElement.prototype.getBoundingClientRect);
    bounds.mockClear();
    viewport.onScroll();
    props.zoomLevel = 200;
    document.documentElement.style.setProperty('--ui-scale-timeline', '1.25');
    await nextTick();
    await Promise.resolve();
    expect(frames.size).toBe(1);
    flush();
    expect(bounds).toHaveBeenCalledTimes(2);
    document.documentElement.style.removeProperty('--ui-scale-timeline');
  });

  it('cancels edge scrolling when the pointer returns to the middle and handles missing frame timestamps', () => {
    const { viewport } = setup();
    viewport.updateAutoScroll(999, () => {});
    flush(undefined as unknown as number);
    viewport.updateAutoScroll(500);
    expect(frames.size).toBe(0);
    viewport.stopAutoScroll();
  });

  it('ignores ordinary wheel input and zero zoom deltas even without mounted media', async () => {
    const { viewport, emit, wrapper } = setup(false);
    viewport.handleWheel(new WheelEvent('wheel', { deltaY: 10 }));
    expect(frames.size).toBe(0);
    viewport.handleWheel(new WheelEvent('wheel', { ctrlKey: true, deltaY: 0, cancelable: true }));
    flush();
    await nextTick();
    expect(emit).not.toHaveBeenCalled();
    wrapper.unmount();
    expect(frames.size).toBe(0);
  });
});

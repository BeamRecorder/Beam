import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, reactive, ref } from 'vue';
import { useTimelineVirtualization, useVirtualTimelineItems } from '../useTimelineVirtualization';
import { videoClip } from '@beam/runtime/playback/tests/media-playback-engine.fixtures';
import type { TimelineVirtualRow } from '../timeline-virtualization-types';
import type { ZoomElement } from '@beam/engine/zoom/zoom-types';

afterEach(() => vi.restoreAllMocks());

const createHarness = (initial: TimelineVirtualRow[] = []) => {
  const rows = ref(initial),
    scroll = ref<HTMLDivElement | null>(null),
    width = ref(1000);
  const viewport = reactive({ top: 0, left: 0, width: 100, height: 100 });
  let state!: ReturnType<typeof useTimelineVirtualization>;
  const wrapper = mount(
    defineComponent({
      setup() {
        state = useTimelineVirtualization({
          rows: () => rows.value,
          scroll,
          width,
          durationMs: ref(10000),
          viewport,
        });
        return () =>
          h('div', { ref: scroll, onPointerdown: state.captureInteraction }, [
            h(
              'button',
              {
                'data-timeline-row-id': 'late',
                'data-timeline-clip-id': 'clip',
              },
              'clip',
            ),
            h(
              'button',
              {
                'data-timeline-row-id': 'late',
                'data-timeline-zoom-id': 'zoom',
              },
              'zoom',
            ),
          ]);
      },
    }),
  );
  return { wrapper, state, rows, scroll, width, viewport };
};

describe('timeline virtualization ownership and edge windows', () => {
  it('retains clip window identity across playback reads and panning with unchanged membership', () => {
    const clips = [
      videoClip('near', 'asset-1', { timelineDurationMs: 1000 }),
      videoClip('late', 'asset-1', { timelineStartMs: 5000, timelineDurationMs: 1000 }),
    ];
    const { wrapper, state, viewport } = createHarness();
    const first = state.visibleClips(clips);
    expect(first.map((clip) => clip.id)).toEqual(['near']);
    expect(state.visibleClips(clips)).toBe(first);
    viewport.top = 500;
    viewport.left = 100;
    expect(state.visibleClips(clips)).toBe(first);
    viewport.left = 600;
    expect(state.visibleClips(clips).map((clip) => clip.id)).toEqual(['late']);
    expect(state.visibleClips(clips)).not.toBe(first);
    const edited = [{ ...clips[1]!, name: 'Changed' }];
    expect(state.visibleClips(edited)).toEqual(edited);
    expect(state.visibleClips(edited)[0]).toBe(edited[0]);
    wrapper.unmount();
  });
  it('retains zoom window identity until membership changes and accepts replacement documents', () => {
    const zoom: ZoomElement = {
      id: 'zoom',
      sessionId: 'session',
      startMs: 0,
      endMs: 1000,
      focus: { cx: 0.5, cy: 0.5 },
      depth: 2,
      mode: 'manual',
    };
    const zooms = [zoom];
    const { wrapper, state, viewport } = createHarness();
    const first = state.visibleZooms(zooms);
    viewport.left = 100;
    expect(state.visibleZooms(zooms)).toBe(first);
    viewport.left = 600;
    expect(state.visibleZooms(zooms)).toEqual([]);
    const replacement = [{ ...zoom, startMs: 5000, endMs: 6000 }];
    expect(state.visibleZooms(replacement)).toEqual(replacement);
    expect(state.visibleZooms(replacement)).toBe(state.visibleZooms(replacement));
    wrapper.unmount();
  });
  it('retains visible focused clips exactly once and ignores pins absent from another lane', () => {
    const clips = [videoClip('clip', 'asset-1', { timelineDurationMs: 1000 })];
    const { wrapper, state } = createHarness([{ id: 'late', kind: 'visual', clips }]);
    const first = state.visibleClips(clips);
    const button = wrapper.get('[data-timeline-clip-id]').element;
    button.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    button.dispatchEvent(new PointerEvent('pointerdown', { button: 0, bubbles: true }));
    expect(state.visibleClips(clips)).toBe(first);
    expect(state.visibleClips([])).toEqual([]);
    window.dispatchEvent(new Event('pointercancel'));
    expect(state.visibleClips(clips)).toBe(first);
    expect(state.selectionTargets()).toHaveLength(1);
    wrapper.unmount();
  });
  it('uses complete clip and zoom geometry for selection while visible windows stay bounded', () => {
    const zoom: ZoomElement = {
      id: 'zoom',
      sessionId: 'session',
      startMs: 5000,
      endMs: 6000,
      focus: { cx: 0.5, cy: 0.5 },
      depth: 2,
      mode: 'manual',
    };
    const clip = videoClip('clip', 'asset-1', { timelineDurationMs: 1000 });
    const { wrapper, state } = createHarness([
      { id: 'visual', kind: 'visual', clips: [clip] },
      { id: 'effect', kind: 'effect', clips: [], zooms: [zoom] },
    ]);
    expect(state.visibleZooms([zoom])).toEqual([]);
    const targets = state.selectionTargets();
    expect(targets.map((target) => target.id)).toEqual(['clip', 'zoom']);
    expect(targets[0]).toMatchObject({ x: 80, y: 2, width: 100 });
    expect(targets[1]).toMatchObject({ x: 580, y: 48, width: 100, height: 36 });
    wrapper.unmount();
  });
  it('handles an empty model, missing row styles and the first unmeasured horizontal viewport', () => {
    const { wrapper, state, width, viewport } = createHarness();
    expect(state.rows.value).toEqual([]);
    expect(state.stackStyle.value.height).toBe('0px');
    expect(state.rowStyle('missing')).toBeUndefined();
    const late = videoClip('clip', 'asset-1', { timelineStartMs: 5000 });
    width.value = 0;
    expect(state.timeRange.value).toEqual({ start: -1, end: -1 });
    expect(state.visibleClips([late])).toEqual([]);
    width.value = 1000;
    viewport.width = 0;
    expect(state.timeRange.value).toEqual({ start: -1, end: -1 });
    wrapper.unmount();
  });
  it('pins offscreen clips and zooms during capture, then releases them on pointer completion', () => {
    const clip = videoClip('clip', 'asset-1', { timelineStartMs: 5000 });
    const zoom: ZoomElement = {
      id: 'zoom',
      sessionId: 'session',
      startMs: 5000,
      endMs: 6000,
      focus: { cx: 0.5, cy: 0.5 },
      depth: 2,
      mode: 'manual',
    };
    const { wrapper, state } = createHarness([{ id: 'late', kind: 'effect', clips: [clip], zooms: [zoom] }]);
    const clips = [clip],
      zooms = [zoom];
    expect(state.visibleClips(clips)).toEqual([]);
    const button = wrapper.get('[data-timeline-clip-id]').element;
    button.dispatchEvent(new PointerEvent('pointerdown', { button: 0, bubbles: true }));
    expect(state.visibleClips(clips).map((c) => c.id)).toEqual(['clip']);
    window.dispatchEvent(new Event('pointerup'));
    expect(state.visibleClips(clips)).toEqual([]);
    wrapper
      .get('[data-timeline-zoom-id]')
      .element.dispatchEvent(new PointerEvent('pointerdown', { button: 0, bubbles: true }));
    expect(state.visibleZooms(zooms).map((z) => z.id)).toEqual(['zoom']);
    window.dispatchEvent(new Event('blur'));
    expect(state.visibleZooms(zooms)).toEqual([]);
    button.dispatchEvent(new PointerEvent('pointerdown', { button: 1, bubbles: true }));
    expect(state.visibleClips(clips)).toEqual([]);
    wrapper.unmount();
  });
  it('retains an offscreen focused zoom, clears non-lane focus, and cleans up scroll listeners', () => {
    const zoom: ZoomElement = {
      id: 'zoom',
      sessionId: 'session',
      startMs: 5000,
      endMs: 6000,
      focus: { cx: 0.5, cy: 0.5 },
      depth: 2,
      mode: 'manual',
    };
    const { wrapper, state, scroll } = createHarness([{ id: 'late', kind: 'effect', clips: [], zooms: [zoom] }]);
    const button = wrapper.get('[data-timeline-zoom-id]').element;
    button.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    expect(state.visibleZooms([zoom]).map((z) => z.id)).toEqual(['zoom']);
    button.dispatchEvent(
      new FocusEvent('focusout', {
        bubbles: true,
        relatedTarget: document.body,
      }),
    );
    expect(state.visibleZooms([zoom])).toEqual([]);
    scroll.value!.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    expect(state.visibleZooms([zoom])).toEqual([]);
    const remove = vi.spyOn(scroll.value!, 'removeEventListener');
    wrapper.unmount();
    expect(remove).toHaveBeenCalledWith('focusin', expect.any(Function));
    expect(remove).toHaveBeenCalledWith('focusout', expect.any(Function));
  });
  it('keeps standalone category consumers usable without a parent-provided viewport', () => {
    let visible!: ReturnType<typeof useVirtualTimelineItems<{ id: string }>>;
    const wrapper = mount(
      defineComponent({
        setup() {
          visible = useVirtualTimelineItems(
            () => [{ id: 'one' }, { id: 'two' }],
            (item) => item.id,
          );
          return () => h('div');
        },
      }),
    );
    expect(visible.value.map((item) => item.id)).toEqual(['one', 'two']);
    wrapper.unmount();
  });
  it('releases the focused item when focus moves to a row control without a clip', () => {
    const clip = videoClip('clip', 'asset-1', { timelineStartMs: 5000 });
    const clips = [clip];
    const { wrapper, state, scroll } = createHarness([{ id: 'late', kind: 'visual', clips }]);
    wrapper.get('[data-timeline-clip-id]').element.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    expect(state.visibleClips(clips)).toEqual(clips);
    const control = document.createElement('button');
    control.dataset.timelineRowId = 'late';
    scroll.value!.append(control);
    control.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    expect(state.visibleClips(clips)).toEqual([]);
    wrapper.unmount();
  });
});

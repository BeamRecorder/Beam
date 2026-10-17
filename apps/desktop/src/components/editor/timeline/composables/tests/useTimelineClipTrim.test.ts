import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, effectScope, h, nextTick, onScopeDispose, ref } from 'vue';
import { mount } from '@vue/test-utils';
import { createBrowserTimelineFrameQueue } from '@beam/runtime/timeline/browser-frame-queue';
import { useTimelineSurface } from '../useTimelineSurface';
import TimelineCanvasLane from '../../TimelineCanvasLane.vue';
import TimelineSurfaceCanvas from '../../TimelineSurfaceCanvas.vue';
import { useTimelineClipTrim } from '../useTimelineClipTrim';
import type { TimelineClipTrimOptions } from '../timeline-clip-trim-types';
import type { ClipComposition, VisualClip } from '@beam/engine/shared/composition-types';
import { COMPOSITION_SCHEMA_VERSION } from '@beam/engine/shared/composition-types';
import { createDefaultClipAppearance } from '@beam/engine/shared/composition-defaults';

const scopes: ReturnType<typeof effectScope>[] = [];
const paint = vi.hoisted(() => vi.fn());
vi.mock('@beam/runtime/timeline/timeline-canvas-paint', () => ({ paintTimelineCanvas: paint }));
afterEach(() => {
  scopes.splice(0).forEach((scope) => scope.stop());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  paint.mockClear();
});
function setup(snapping = false) {
  const clip: VisualClip = {
    id: 'video',
    kind: 'video',
    name: 'Video',
    assetId: 'asset',
    timelineStartMs: 1000,
    timelineDurationMs: 2000,
    sourceInMs: 1000,
    sourceDurationMs: 2000,
    playbackRate: 1,
    transitions: { entry: null, exit: null },
    enabled: true,
    order: 0,
    trackId: 'video-track',
    transform: { x: 0, y: 0, width: 1, height: 1 },
    appearance: createDefaultClipAppearance('video'),
    isMirrored: false,
    isMirroredY: false,
  };
  const composition: ClipComposition = {
    schemaVersion: COMPOSITION_SCHEMA_VERSION,
    keyboardCaptionSessions: [],
    clips: [clip],
    assets: [
      {
        id: 'asset',
        kind: 'video',
        name: 'Video',
        src: 'video.mp4',
        fileName: 'video.mp4',
        origin: 'project',
        durationMs: 5000,
        width: 1920,
        height: 1080,
      },
    ],
  };
  const options: TimelineClipTrimOptions = {
    props: {
      composition,
      duration: 5,
      currentTime: 2,
      isPlaying: false,
      zoomLevel: 100,
      zoomElements: [],
      selectedZoomId: null,
      selectedClipId: clip.id,
      isSnappingEnabled: snapping,
    },
    emit: vi.fn(),
    tracksScrollRef: ref(null),
    displayedPlayheadTime: ref(2),
    activeSnapTimeMs: ref(null),
    previewDurationMs: ref(null),
    clipPreview: ref({}),
    activeTrimState: ref(null),
    linkedIdsFor: () => [clip.id],
    clearLinkedPreview: (ids) => {
      const preview = { ...options.clipPreview.value };
      ids.forEach((id) => delete preview[id]);
      options.clipPreview.value = preview;
    },
    resolveMsPerPx: () => ({ baseDurationMs: 5000, width: 500, msPerPx: 10, visualScale: 1 }),
    updateAutoScroll: vi.fn(),
    stopAutoScroll: vi.fn(),
  };
  const scope = effectScope();
  scopes.push(scope);
  const trim = scope.run(() => useTimelineClipTrim(options))!;
  const event = (type: string, x: number, button = 0) =>
    Object.assign(new Event(type), { clientX: x, button }) as PointerEvent;
  const begin = (edge: 'start' | 'end' = 'end', button = 0) =>
    trim.beginClipTrim(event('pointerdown', 300, button), clip, edge);
  const move = (x: number) => window.dispatchEvent(event('pointermove', x));
  const finish = (type = 'pointerup') => window.dispatchEvent(event(type, 300));
  return { clip, options, scope, begin, move, finish, trim, event };
}

describe('useTimelineClipTrim', () => {
  it.each([60, 120, 144, 240])('paints current trim geometry on the first shared frame at %i Hz', async (hz) => {
    const state = setup();
    const frames = new Map<number, FrameRequestCallback>();
    let sequence = 0;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.set(++sequence, callback);
      return sequence;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      frames.delete(id);
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      setTransform() {},
      clearRect() {},
      save() {},
      restore() {},
      translate() {},
      beginPath() {},
      rect() {},
      clip() {},
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(500);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(32);
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(500);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      right: 500,
      top: 0,
      bottom: 32,
      width: 500,
      height: 32,
    } as DOMRect);
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    vi.stubGlobal(
      'MutationObserver',
      class {
        observe() {}
        disconnect() {}
      },
    );
    const Host = defineComponent({
      setup() {
        const scroll = ref<HTMLDivElement | null>(null);
        const queue = createBrowserTimelineFrameQueue();
        onScopeDispose(queue.dispose);
        useTimelineSurface(scroll, queue);
        return () =>
          h('div', { ref: scroll }, [
            h(TimelineSurfaceCanvas),
            h(TimelineCanvasLane, {
              items: [
                {
                  clip: {
                    ...state.clip,
                    timelineDurationMs: state.options.clipPreview.value.video?.durationMs ?? 2000,
                  },
                  label: 'Video',
                  selected: true,
                },
              ],
              durationMs: 5000,
              width: 500,
              viewport: { left: 0, top: 0, width: 500, height: 32 },
            }),
          ]);
      },
    });
    const wrapper = mount(Host);
    const flushFrame = (time: number) => {
      const batch = [...frames];
      for (const [id, callback] of batch) if (frames.delete(id)) callback(time);
    };
    try {
      flushFrame(0);
      paint.mockClear();
      state.begin();
      state.move(320);
      await nextTick();
      expect(frames.size).toBe(1);
      flushFrame(1000 / hz);
      expect(paint).toHaveBeenCalledOnce();
      expect(paint.mock.calls[0]?.[1][0].clip.timelineDurationMs).toBe(2200);
      expect(frames.size).toBe(0);
      state.move(340);
      state.move(350);
      await nextTick();
      flushFrame(2000 / hz);
      expect(paint).toHaveBeenCalledTimes(2);
      expect(paint.mock.calls[1]?.[1][0].clip.timelineDurationMs).toBe(2500);
      state.finish();
    } finally {
      wrapper.unmount();
    }
  });

  it.each(['start', 'end'] as const)(
    'publishes the latest %s geometry synchronously without requesting an extra frame',
    async (edge) => {
      const state = setup();
      const raf = vi.spyOn(window, 'requestAnimationFrame');
      state.begin(edge);
      for (const x of [310, 315, 320]) state.move(x);
      expect(state.options.clipPreview.value.video).toEqual(
        edge === 'start' ? { startMs: 1200, durationMs: 1800 } : { startMs: 1000, durationMs: 2200 },
      );
      expect(raf).not.toHaveBeenCalled();
      await nextTick();
      expect(state.options.updateAutoScroll).toHaveBeenCalledOnce();
      expect(state.options.updateAutoScroll).toHaveBeenCalledWith(320, expect.any(Function));
      state.finish();
      expect(state.options.emit).toHaveBeenLastCalledWith('trim:clip', {
        id: 'video',
        edge,
        timeMs: edge === 'start' ? 1200 : 3200,
      });
      expect(state.clip.timelineDurationMs).toBe(2000);
    },
  );

  it('deduplicates previews at a source limit while keeping limit feedback current', () => {
    const state = setup();
    state.begin();
    state.move(500);
    expect(state.options.activeTrimState.value?.atLimit).toBe(true);
    const emit = vi.mocked(state.options.emit);
    expect(emit.mock.calls).toHaveLength(1);
    state.move(600);
    expect(emit.mock.calls).toHaveLength(1);
    state.move(499);
    expect(state.options.activeTrimState.value?.atLimit).toBe(false);
    expect(state.options.clipPreview.value.video?.durationMs).toBe(3990);
    state.finish();
  });

  it.each(['start', 'end'] as const)(
    'snaps the %s handle to the playhead and respects the minimum duration',
    (edge) => {
      const state = setup(true);
      state.begin(edge);
      state.move(edge === 'start' ? 398 : 202);
      expect(state.options.activeSnapTimeMs.value).toBe(2000);
      expect(state.options.activeTrimState.value?.durationMs).toBe(1000);
      state.move(edge === 'start' ? 1000 : -1000);
      expect(state.options.activeTrimState.value?.durationMs).toBe(40);
      state.finish();
    },
  );

  it('clamps to viewport edges and follows accumulated autoscroll without another pointer event', async () => {
    const state = setup();
    const scroll = document.createElement('div');
    vi.spyOn(scroll, 'getBoundingClientRect').mockReturnValue({ left: 100, right: 500, width: 400 } as DOMRect);
    state.options.tracksScrollRef.value = scroll;
    state.begin();
    state.move(800);
    expect(state.options.clipPreview.value.video?.durationMs).toBe(4000);
    await nextTick();
    const onScroll = vi.mocked(state.options.updateAutoScroll).mock.calls.at(-1)?.[1];
    onScroll?.(-100);
    expect(state.options.clipPreview.value.video?.durationMs).toBe(3000);
    state.finish();
  });

  it('handles a viewport without measurable width', () => {
    const state = setup();
    state.options.tracksScrollRef.value = document.createElement('div');
    state.begin();
    state.move(310);
    expect(state.options.clipPreview.value.video?.durationMs).toBe(2100);
    state.finish();
  });

  it.each(['pointercancel', 'dispose', 'replace'] as const)(
    'releases all preview ownership on %s without committing',
    async (reason) => {
      const state = setup();
      state.begin();
      state.move(310);
      if (reason === 'dispose') state.scope.stop();
      else if (reason === 'replace') state.begin('start');
      else state.finish(reason);
      await nextTick();
      expect(state.options.clipPreview.value).toEqual({});
      expect(state.options.previewDurationMs.value).toBeNull();
      expect(state.options.emit).not.toHaveBeenCalledWith('trim:clip', expect.anything());
      if (reason === 'replace') state.finish('pointercancel');
      expect(state.options.activeTrimState.value).toBeNull();
      const count = vi.mocked(state.options.emit).mock.calls.length;
      state.move(400);
      state.finish();
      expect(vi.mocked(state.options.emit).mock.calls).toHaveLength(count);
    },
  );

  it.each(['click', 'round-trip'] as const)('does not commit a %s with unchanged timing', (mode) => {
    const state = setup();
    state.begin();
    if (mode === 'round-trip') {
      state.move(350);
      state.move(300);
    }
    state.finish();
    expect(state.options.emit).not.toHaveBeenCalledWith('trim:clip', expect.anything());
  });

  it('rejects secondary buttons and locked clips before owning the gesture', () => {
    const state = setup();
    state.begin('end', 2);
    state.clip.locked = true;
    state.begin();
    state.move(400);
    state.finish();
    expect(state.options.emit).not.toHaveBeenCalled();
    expect(state.options.activeTrimState.value).toBeNull();
  });
});

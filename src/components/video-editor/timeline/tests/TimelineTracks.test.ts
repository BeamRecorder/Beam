import { defineComponent } from 'vue';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ZoomElement } from '../../zoom/zoom-types';
import type { AudioClip, CaptionClip, ClipComposition, MediaAsset, VisualClip } from '~/media/shared/composition-types';
import type { MediaError } from '~/media/shared/media-types';
import TimelineTracks from '../TimelineTracks.vue';
import { createDefaultCaptionStyle, createDefaultClipAppearance } from '~/media/shared/composition-defaults';
import { DEFAULT_OUTPUT_CANVAS } from '../../canvas/output-canvas';
import { useTimelineClipboard } from '../composables/useTimelineClipboard';
import { clipTrimBounds } from '../../composition/engine/trim-clip';

const waveformTestState = vi.hoisted(() => ({
  viewport: null as null | (() => { startSeconds: number; endSeconds: number; pixelsPerSecond: number }),
}));

vi.mock('../composables/useCompositionAudioWaveforms', () => ({
  useCompositionAudioWaveforms: (
    _composition: unknown,
    viewport: () => { startSeconds: number; endSeconds: number; pixelsPerSecond: number },
  ) => {
    waveformTestState.viewport = viewport;
    return {
      slices: {
        'system-audio': { bars: [4, 12, 20], leftPercent: 0, widthPercent: 100 },
        'microphone-audio': undefined,
        'imported-audio': undefined,
      },
      status: {
        'system-audio': 'ready',
        'microphone-audio': 'loading',
        'imported-audio': 'error',
      },
      errors: {
        'imported-audio': {
          kind: 'decode-failure',
          sourceId: 'imported-asset',
          message: 'The waveform could not be decoded.',
        } satisfies MediaError,
      },
    };
  },
}));

const TimelineClipStub = defineComponent({
  name: 'TimelineClip',
  props: {
    clip: { type: Object, required: true },
    duration: { type: Number, required: true },
    selected: { type: Boolean, default: false },
    trimState: { type: Object, default: null },
    thumbnailSlots: { type: Array, default: () => [] },
    waveformBars: { type: Array, default: undefined },
    waveformLeftPercent: { type: Number, default: 0 },
    waveformWidthPercent: { type: Number, default: 100 },
    waveformStatus: { type: String, default: undefined },
    waveformError: { type: Object, default: undefined },
    deferThumbnailRequests: { type: Boolean, default: false },
    pasteHighlight: { type: Boolean, default: false },
  },
  emits: ['select', 'move', 'trim', 'contextmenu'],
  template: `
    <button
      type="button"
      class="timeline-clip"
      :class="{ selected, disabled: !clip.enabled, 'paste-arrival': pasteHighlight }"
      @click.stop="$emit('select')"
      @contextmenu.prevent="$emit('contextmenu', $event)"
      @pointerdown="$emit('move', $event)"
    >
      <span class="clip-label-text">{{ clip.name }}</span>
      <span class="waveform-state" :data-status="waveformStatus">{{ waveformError?.message }}</span>
      <span class="trim-handle start" @pointerdown.stop="$emit('trim', { event: $event, edge: 'start' })">
        <span v-if="trimState?.edge === 'start'" class="trim-side-badge">trim</span>
      </span>
      <span class="trim-handle end" @pointerdown.stop="$emit('trim', { event: $event, edge: 'end' })">
        <span v-if="trimState?.edge === 'end'" class="trim-side-badge">trim</span>
      </span>
    </button>
  `,
});

class TestResizeObserver {
  readonly observe = vi.fn();
  readonly disconnect = vi.fn();
  constructor(_callback: ResizeObserverCallback) {}
}

const asset = (id: string, kind: MediaAsset['kind']): MediaAsset => ({
  id,
  kind,
  name: id,
  fileName: `${id}.${kind === 'video' ? 'mp4' : kind === 'image' ? 'png' : 'wav'}`,
  durationMs: 10_000,
  width: kind === 'audio' ? null : 1280,
  height: kind === 'audio' ? null : 720,
  src: `/media/${id}`,
  origin: 'project',
});

const visual = (overrides: Partial<VisualClip>): VisualClip => ({
  id: 'visual',
  kind: 'screen',
  name: 'Screen capture',
  assetId: 'screen-asset',
  timelineStartMs: 0,
  timelineDurationMs: 4_000,
  sourceInMs: 0,
  sourceDurationMs: 4_000,
  playbackRate: 1,
  enabled: true,
  order: 0,
  trackId: 'screen-track',
  transform: { x: 0, y: 0, width: 1, height: 1 },
  appearance: createDefaultClipAppearance('screen'),
  isMirrored: false,
  isMirroredY: false,
  ...overrides,
});

const importedAudio = (overrides: Partial<AudioClip> = {}): AudioClip => ({
  id: 'imported-audio-fragment',
  kind: 'audio',
  role: 'imported',
  name: 'Imported audio',
  assetId: 'imported-asset',
  timelineStartMs: 0,
  timelineDurationMs: 2_000,
  sourceInMs: 0,
  sourceDurationMs: 2_000,
  playbackRate: 1,
  enabled: true,
  order: 6,
  volume: 80,
  ...overrides,
});

const keyboardCaption = (): CaptionClip => ({
  id: 'keyboard-caption',
  kind: 'caption',
  name: 'Keyboard shortcut',
  timelineStartMs: 0,
  timelineDurationMs: 1_000,
  sourceInMs: 0,
  sourceDurationMs: 1_000,
  playbackRate: 1,
  enabled: true,
  order: 4,
  caption: {
    type: 'keyboard',
    steps: [{ offsetMs: 0, modifiers: ['control'], key: 'k' }],
    followCursor: true,
    recordedPlatform: 'linux',
    sourceSessionId: 'session-1',
    style: { ...createDefaultCaptionStyle(28), shadowDirection: 'bottom-right' },
  },
});

const composition = (extraClips: ClipComposition['clips'] = []): ClipComposition => ({
  schemaVersion: 6,
  keyboardCaptionSessions: [],
  assets: [
    asset('screen-asset', 'video'),
    asset('webcam-asset', 'video'),
    asset('image-asset', 'image'),
    asset('system-asset', 'audio'),
    asset('microphone-asset', 'audio'),
    asset('imported-asset', 'audio'),
  ],
  clips: [
    visual({ id: 'screen-clip', order: 2, groupId: 'linked', trackId: 'screen-track', name: 'Main screen' }),
    visual({
      id: 'webcam-clip',
      kind: 'webcam',
      order: 1,
      groupId: 'linked',
      trackId: 'webcam-track',
      assetId: 'webcam-asset',
      name: 'Camera',
    }),
    visual({
      id: 'image-clip',
      kind: 'image',
      order: 0,
      trackId: 'image-track',
      assetId: 'image-asset',
      name: 'Poster',
      enabled: false,
    }),
    {
      id: 'caption-clip',
      kind: 'caption',
      name: 'Welcome',
      timelineStartMs: 5_000,
      timelineDurationMs: 2_000,
      sourceInMs: 0,
      sourceDurationMs: 2_000,
      playbackRate: 1,
      enabled: true,
      order: 3,
      isAiGenerated: true,
      caption: {
        type: 'text',
        sentences: [],
        style: {
          ...createDefaultCaptionStyle(32),
          color: '#ffffff',
          shadowColor: '#000000',
          shadowBlur: 2,
          placement: 'bottom',
        },
      },
    },
    {
      id: 'system-audio',
      kind: 'audio',
      role: 'system',
      name: 'System',
      assetId: 'system-asset',
      timelineStartMs: 0,
      timelineDurationMs: 4_000,
      sourceInMs: 0,
      sourceDurationMs: 4_000,
      playbackRate: 1,
      enabled: true,
      order: 4,
      volume: 100,
    },
    {
      id: 'microphone-audio',
      kind: 'audio',
      role: 'microphone',
      name: 'Mic',
      assetId: 'microphone-asset',
      timelineStartMs: 0,
      timelineDurationMs: 4_000,
      sourceInMs: 0,
      sourceDurationMs: 4_000,
      playbackRate: 1,
      enabled: false,
      order: 5,
      volume: 0,
    },
    {
      id: 'imported-audio',
      kind: 'audio',
      role: 'imported',
      name: 'Music',
      assetId: 'imported-asset',
      timelineStartMs: 2_000,
      timelineDurationMs: 3_000,
      sourceInMs: 0,
      sourceDurationMs: 3_000,
      playbackRate: 1.25,
      enabled: true,
      order: 6,
      volume: 80,
    },
    ...extraClips,
  ],
});

const cameraTrackComposition = (): ClipComposition => {
  const base = composition();
  return {
    ...base,
    clips: [
      visual({
        id: 'camera-left',
        kind: 'webcam',
        name: 'Camera left segment',
        trackId: 'camera-track',
        timelineStartMs: 0,
        timelineDurationMs: 2_000,
        sourceDurationMs: 2_000,
        order: 1,
        groupId: 'camera-left-group',
        assetId: 'webcam-asset',
      }),
      visual({
        id: 'camera-right',
        kind: 'webcam',
        name: 'Camera right segment',
        trackId: 'camera-track',
        timelineStartMs: 4_000,
        timelineDurationMs: 2_000,
        sourceInMs: 2_000,
        sourceDurationMs: 2_000,
        order: 1,
        groupId: 'camera-right-group',
        assetId: 'webcam-asset',
      }),
      ...base.clips.filter((clip) => clip.id !== 'webcam-clip'),
    ],
  };
};

const zoom = (overrides: Partial<ZoomElement> = {}): ZoomElement => ({
  id: 'zoom-1',
  sessionId: 'session',
  startMs: 2_000,
  endMs: 3_500,
  focus: { cx: 0.5, cy: 0.5 },
  depth: 6,
  mode: 'manual',
  ...overrides,
});

let wrapper: VueWrapper | undefined;
const originalResizeObserver = globalThis.ResizeObserver;
const originalElementFromPoint = (document as Document & { elementFromPoint?: typeof document.elementFromPoint })
  .elementFromPoint;

const mountTracks = async (overrides: Record<string, unknown> = {}) => {
  wrapper = mount(TimelineTracks, {
    props: {
      currentTime: 2,
      duration: 10,
      isPlaying: false,
      zoomLevel: 120,
      exportProgress: {
        stage: 'encoding',
        overallProgress: 0.25,
        completedImages: 25,
        totalImages: 100,
        audioProgress: null,
        currentTimeMs: 2_500,
        totalTimeMs: 10_000,
      },
      zoomElements: [zoom()],
      selectedZoomId: 'zoom-1',
      composition: composition(),
      selectedClipId: 'screen-clip',
      projectId: 'project-a',
      ...overrides,
    },
    global: { stubs: { TimelineClip: TimelineClipStub } },
  });
  const ticks = wrapper.get('.ruler-ticks-area').element;
  vi.spyOn(ticks, 'getBoundingClientRect').mockReturnValue({
    left: 120,
    top: 0,
    width: 1_000,
    height: 28,
    right: 1_120,
    bottom: 28,
  } as DOMRect);
  Object.defineProperty(ticks, 'clientWidth', { configurable: true, value: 1_000 });
  const scroll = wrapper.get('.timeline-tracks-container').element;
  Object.defineProperty(scroll, 'clientWidth', { configurable: true, value: 1_000 });
  await flushPromises();
  return wrapper;
};

const setPlaybackViewportGeometry = (mounted: VueWrapper) => {
  const ticks = mounted.get('.ruler-ticks-area').element;
  vi.mocked(ticks.getBoundingClientRect).mockReturnValue({
    left: 120,
    top: 0,
    width: 2_000,
    height: 28,
    right: 2_120,
    bottom: 28,
  } as DOMRect);
  const scroll = mounted.get('.timeline-tracks-container').element;
  vi.spyOn(scroll, 'getBoundingClientRect').mockReturnValue({
    left: 120,
    top: 0,
    width: 500,
    height: 200,
    right: 620,
    bottom: 200,
  } as DOMRect);
  Object.defineProperty(scroll, 'clientWidth', { configurable: true, value: 500 });
  Object.defineProperty(scroll, 'scrollWidth', { configurable: true, value: 2_000 });
  scroll.scrollLeft = 0;
  return scroll;
};

const setScrubViewportGeometry = (mounted: VueWrapper) => {
  const scroll = setPlaybackViewportGeometry(mounted);
  const ticks = mounted.get('.ruler-ticks-area').element;
  vi.mocked(ticks.getBoundingClientRect).mockImplementation(() => {
    const left = 120 - scroll.scrollLeft;
    return {
      left,
      top: 0,
      width: 2_000,
      height: 28,
      right: left + 2_000,
      bottom: 28,
    } as DOMRect;
  });
  return scroll;
};

const queueAnimationFrames = () => {
  const pendingFrames = new Map<number, FrameRequestCallback>();
  let nextFrameId = 0;
  vi.mocked(window.requestAnimationFrame).mockImplementation((callback) => {
    const id = ++nextFrameId;
    pendingFrames.set(id, callback);
    return id;
  });
  vi.mocked(window.cancelAnimationFrame).mockImplementation((id) => {
    pendingFrames.delete(id);
  });
  const flushNextFrame = () => {
    const next = pendingFrames.entries().next();
    if (next.done) throw new Error('Expected a queued animation frame.');
    const [id, callback] = next.value;
    pendingFrames.delete(id);
    callback(0);
  };
  return { pendingFrames, flushNextFrame };
};

const pointerEvent = (type: string, clientX: number, clientY = 10) => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    clientX: { value: clientX },
    clientY: { value: clientY },
    target: { value: document.body },
  });
  return event;
};

const contextMenuButton = (label: string): HTMLButtonElement | undefined =>
  Array.from(document.body.querySelectorAll<HTMLButtonElement>('.context-menu-item')).find((element) =>
    element.textContent?.includes(label),
  );

beforeEach(() => {
  vi.clearAllMocks();
  useTimelineClipboard().clearClipboard();
  globalThis.ResizeObserver = TestResizeObserver as unknown as typeof ResizeObserver;
  let nextRafId = 1;
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    const id = nextRafId++;
    queueMicrotask(() => callback(performance.now()));
    return id;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  if (originalResizeObserver) globalThis.ResizeObserver = originalResizeObserver;
  else delete (globalThis as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver;
  if (originalElementFromPoint) document.elementFromPoint = originalElementFromPoint;
  else delete (document as { elementFromPoint?: typeof document.elementFromPoint }).elementFromPoint;
  vi.restoreAllMocks();
});

describe('TimelineTracks', () => {
  it('scrolls the playhead into view when playback crosses the right boundary', async () => {
    const mounted = await mountTracks({ isPlaying: true });
    const scroll = setPlaybackViewportGeometry(mounted!);

    await mounted!.setProps({ currentTime: 8 });

    expect(scroll.scrollLeft).toBeGreaterThan(0);
  });

  it('does not move the timeline when a paused playhead crosses the right boundary', async () => {
    const mounted = await mountTracks({ isPlaying: false });
    const scroll = setPlaybackViewportGeometry(mounted!);

    await mounted!.setProps({ currentTime: 8 });

    expect(scroll.scrollLeft).toBe(0);
  });

  it('keeps scrubbing at the right edge and advances time across animation frames without pointer movement', async () => {
    const mounted = await mountTracks();
    const scroll = setScrubViewportGeometry(mounted!);
    const { flushNextFrame } = queueAnimationFrames();

    await mounted!.get('.ruler-ticks-area').trigger('pointerdown', { clientX: 615 });
    flushNextFrame();
    flushNextFrame();
    const firstScrollLeft = scroll.scrollLeft;
    flushNextFrame();
    const firstTime = mounted!.emitted('update:currentTime')?.at(-1)?.[0] as number;
    flushNextFrame();
    flushNextFrame();
    const secondTime = mounted!.emitted('update:currentTime')?.at(-1)?.[0] as number;

    expect(scroll.scrollLeft).toBeGreaterThan(firstScrollLeft);
    expect(secondTime).toBeGreaterThan(firstTime);

    window.dispatchEvent(pointerEvent('pointerup', 615));
  });

  it('scrubs backward while held at the left edge', async () => {
    const mounted = await mountTracks();
    const scroll = setScrubViewportGeometry(mounted!);
    scroll.scrollLeft = 400;
    const { flushNextFrame } = queueAnimationFrames();

    await mounted!.get('.ruler-ticks-area').trigger('pointerdown', { clientX: 125 });
    flushNextFrame();
    flushNextFrame();
    const firstScrollLeft = scroll.scrollLeft;
    flushNextFrame();
    flushNextFrame();

    expect(scroll.scrollLeft).toBeLessThan(firstScrollLeft);

    window.dispatchEvent(pointerEvent('pointercancel', 125));
  });

  it.each(['pointerup', 'pointercancel'] as const)('stops edge scrubbing after %s', async (endEvent) => {
    const mounted = await mountTracks();
    const scroll = setScrubViewportGeometry(mounted!);
    const { pendingFrames, flushNextFrame } = queueAnimationFrames();

    await mounted!.get('.ruler-ticks-area').trigger('pointerdown', { clientX: 615 });
    flushNextFrame();
    flushNextFrame();
    const stoppedScrollLeft = scroll.scrollLeft;
    window.dispatchEvent(pointerEvent(endEvent, 615));
    const emittedAtStop = mounted!.emitted('update:currentTime')?.length ?? 0;

    expect(pendingFrames).toHaveLength(0);
    expect(scroll.scrollLeft).toBe(stoppedScrollLeft);
    expect(mounted!.emitted('update:currentTime')).toHaveLength(emittedAtStop);
  });

  it('does not auto-scroll while scrubbing in the center of the viewport', async () => {
    const mounted = await mountTracks();
    const scroll = setScrubViewportGeometry(mounted!);
    const { pendingFrames, flushNextFrame } = queueAnimationFrames();

    await mounted!.get('.ruler-ticks-area').trigger('pointerdown', { clientX: 370 });
    flushNextFrame();
    window.dispatchEvent(pointerEvent('pointermove', 370));

    expect(scroll.scrollLeft).toBe(0);
    expect(pendingFrames).toHaveLength(1);
    flushNextFrame();
    expect(scroll.scrollLeft).toBe(0);

    window.dispatchEvent(pointerEvent('pointerup', 370));
  });

  it('virtualizes thumbnail requests to the viewport with two seconds of overscan and preserves the range on zoom', async () => {
    const mounted = await mountTracks();
    const scroll = mounted!.get('.timeline-tracks-container').element;
    vi.spyOn(scroll, 'getBoundingClientRect').mockReturnValue({
      left: 520,
      top: 0,
      width: 400,
      height: 200,
      right: 920,
      bottom: 200,
    } as DOMRect);
    scroll.dispatchEvent(new Event('scroll'));
    await flushPromises();

    const screen = mounted!
      .findAllComponents(TimelineClipStub)
      .find((component) => (component.props('clip') as VisualClip).id === 'screen-clip');
    if (!screen) throw new Error('Expected the screen timeline clip stub to be mounted.');
    expect(screen?.props('thumbnailSlots')).toEqual([
      { timelineSeconds: 2, durationSeconds: 1 },
      { timelineSeconds: 3, durationSeconds: 1 },
      { timelineSeconds: 4, durationSeconds: 1 },
      { timelineSeconds: 5, durationSeconds: 1 },
      { timelineSeconds: 6, durationSeconds: 1 },
      { timelineSeconds: 7, durationSeconds: 1 },
      { timelineSeconds: 8, durationSeconds: 1 },
      { timelineSeconds: 9, durationSeconds: 1 },
    ]);

    await mounted!.setProps({ zoomLevel: 240 });
    expect(mounted!.get('.timeline-viewport').attributes('style')).toContain('width: calc(240% + 230px)');
    const thumbnailSlots = screen.props('thumbnailSlots') as
      Array<{ timelineSeconds: number; durationSeconds: number }> | undefined;
    if (!thumbnailSlots) throw new Error('Expected thumbnail slots after viewport zoom.');
    expect(thumbnailSlots).toHaveLength(8);
    expect(thumbnailSlots[0]!).toEqual({ timelineSeconds: 2, durationSeconds: 1 });
  });

  it('renders ordered visual/audio/caption tracks and scrubs, zooms, selects, and toggles them', async () => {
    const mounted = await mountTracks();
    expect(mounted!.findAll('.tracks-stack .visual-track')).toHaveLength(3);
    expect(mounted!.find('.ruler-export-progress-bar').attributes('style')).toContain('25%');
    expect(mounted!.find('.cursor-zoom-indicator').text()).toContain('5.00×');
    expect(mounted!.findAll('.tracks-stack > .audio-track')).toHaveLength(3);
    expect(mounted!.findAll('.tracks-stack > .audio-track')[1]!.classes()).toContain('disabled');

    await mounted!.get('.ruler-ticks-area').trigger('pointerdown', { clientX: 620 });
    window.dispatchEvent(pointerEvent('pointermove', 720));
    window.dispatchEvent(pointerEvent('pointerup', 820));
    expect(mounted!.emitted('update:currentTime')).toBeTruthy();

    const tracksContainer = mounted!.get('.timeline-tracks-container').element;
    const pendingFrames = new Map<number, FrameRequestCallback>();
    let nextFrameId = 0;
    vi.mocked(window.requestAnimationFrame).mockImplementation((callback) => {
      const id = ++nextFrameId;
      pendingFrames.set(id, callback);
      return id;
    });
    const flushAnimationFrames = () => {
      const frames = [...pendingFrames.values()];
      pendingFrames.clear();
      frames.forEach((callback) => callback(0));
    };

    const emittedBeforeWheel = mounted!.emitted('update:zoomLevel')?.length ?? 0;
    tracksContainer.dispatchEvent(new WheelEvent('wheel', { ctrlKey: false, deltaY: -100, bubbles: true }));
    expect(mounted!.emitted('update:zoomLevel')?.length ?? 0).toBe(emittedBeforeWheel);
    tracksContainer.dispatchEvent(new WheelEvent('wheel', { ctrlKey: true, deltaY: -100, bubbles: true }));
    tracksContainer.dispatchEvent(new WheelEvent('wheel', { ctrlKey: true, deltaY: -100, bubbles: true }));
    expect(mounted!.emitted('update:zoomLevel')?.length ?? 0).toBe(emittedBeforeWheel);
    expect(pendingFrames).toHaveLength(1);
    flushAnimationFrames();
    expect(mounted!.emitted('update:zoomLevel')).toContainEqual([170]);

    await mounted!.setProps({ zoomLevel: 3_190 });
    flushAnimationFrames();
    tracksContainer.dispatchEvent(new WheelEvent('wheel', { ctrlKey: true, deltaY: -100, bubbles: true }));
    tracksContainer.dispatchEvent(new WheelEvent('wheel', { ctrlKey: true, deltaY: -100, bubbles: true }));
    expect(mounted!.emitted('update:zoomLevel')).toHaveLength(emittedBeforeWheel + 1);
    expect(pendingFrames).toHaveLength(1);
    flushAnimationFrames();
    expect(mounted!.emitted('update:zoomLevel')).toContainEqual([3_200]);
    await mounted!.get('.sidebar-tracks-stack .visual-track .track-info').trigger('click');
    expect(mounted!.emitted('toggle:clip')).toContainEqual(['image-clip']);

    expect(mounted!.find('.audio-track-actions').exists()).toBe(false);

    const clip = mounted!.findAll('.visual-track .timeline-clip')[2]!;
    await clip.trigger('click');
    expect(mounted!.emitted('select:clip')).toContainEqual(['screen-clip']);
    await mounted!.get('.cursor-zoom-indicator:not(.preview-ghost)').trigger('click');
    expect(mounted!.emitted('select:zoom')).toContainEqual(['zoom-1']);
  });

  it('renders contiguous imported audio fragments from one asset in a single lane', async () => {
    const base = composition();
    const mounted = await mountTracks({
      composition: {
        ...base,
        clips: [
          ...base.clips.filter((clip) => clip.id !== 'imported-audio'),
          importedAudio({ id: 'audio-left', timelineStartMs: 0, sourceDurationMs: 2_000 }),
          importedAudio({ id: 'audio-right', timelineStartMs: 2_000, sourceInMs: 2_000, sourceDurationMs: 2_000 }),
        ],
      },
    });

    const importedRows = mounted!
      .findAll('.tracks-stack > .audio-track')
      .filter((row) => row.findAll('.timeline-clip').some((clip) => clip.text().includes('Imported audio')));
    expect(importedRows).toHaveLength(1);
    expect(importedRows[0]!.findAll('.timeline-clip')).toHaveLength(2);
  });

  it('keeps imported audio clips from different assets on separate lanes', async () => {
    const base = composition();
    const mounted = await mountTracks({
      composition: {
        ...base,
        assets: [...base.assets, asset('imported-asset-2', 'audio')],
        clips: [
          ...base.clips.filter((clip) => clip.id !== 'imported-audio'),
          importedAudio({ id: 'audio-one', assetId: 'imported-asset' }),
          importedAudio({ id: 'audio-two', assetId: 'imported-asset-2' }),
        ],
      },
    });

    const importedRows = mounted!
      .findAll('.tracks-stack > .audio-track')
      .filter((row) => row.findAll('.timeline-clip').some((clip) => clip.text().includes('Imported audio')));
    expect(importedRows).toHaveLength(2);
    expect(importedRows.every((row) => row.findAll('.timeline-clip').length === 1)).toBe(true);
  });

  it('only renders the Canvas transition track when at least one global transition exists', async () => {
    const mounted = await mountTracks();
    expect(mounted!.find('.canvas-sidebar-row').exists()).toBe(false);
    expect(mounted!.find('.canvas-track-row').exists()).toBe(false);
  });

  it('renders both Canvas transition edges and opens the corresponding edge from the timeline', async () => {
    const mounted = await mountTracks({
      canvas: {
        ...DEFAULT_OUTPUT_CANVAS,
        transitions: {
          entry: { preset: { kind: 'fade' }, durationMs: 200 },
          exit: { preset: { kind: 'blur' }, durationMs: 300 },
        },
      },
    });

    expect(mounted!.find('.canvas-sidebar-row').exists()).toBe(true);
    expect(mounted!.findAll('.canvas-transition-zone')).toHaveLength(2);
    expect(mounted!.get('.canvas-transition-zone.entry').attributes('aria-label')).toContain('fade');
    expect(mounted!.get('.canvas-transition-zone.exit').attributes('aria-label')).toContain('blur');

    await mounted!.get('.canvas-transition-zone.entry').trigger('click');
    await mounted!.get('.canvas-transition-zone.exit').trigger('click');
    expect(mounted!.emitted('open:canvas-transition')).toEqual([['entry'], ['exit']]);
  });

  it('relays an intermediate Canvas transition preview and commits only on pointerup', async () => {
    const mounted = await mountTracks({
      duration: 1,
      canvas: {
        ...DEFAULT_OUTPUT_CANVAS,
        transitions: {
          entry: { preset: { kind: 'fade' }, durationMs: 200 },
          exit: { preset: { kind: 'blur' }, durationMs: 300 },
        },
      },
    });
    const track = mounted!.get('.canvas-track-content').element;
    vi.spyOn(track, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      top: 0,
      width: 1_000,
      height: 40,
      right: 1_100,
      bottom: 40,
    } as DOMRect);

    mounted!
      .get('.canvas-transition-zone.entry .duration-handle.end')
      .element.dispatchEvent(pointerEvent('pointerdown', 300));
    window.dispatchEvent(pointerEvent('pointermove', 700));

    expect(mounted!.emitted('preview:canvas')?.[0]?.[0]).toEqual(
      expect.objectContaining({
        transitions: {
          entry: { preset: { kind: 'fade' }, durationMs: 600 },
          exit: { preset: { kind: 'blur' }, durationMs: 300 },
        },
      }),
    );
    expect(mounted!.emitted('update:canvas')).toBeUndefined();

    window.dispatchEvent(pointerEvent('pointerup', 700));
    expect(mounted!.emitted('preview:canvas')).toContainEqual([null]);
    expect(mounted!.emitted('update:canvas')?.[0]?.[0]).toEqual(
      expect.objectContaining({
        transitions: {
          entry: { preset: { kind: 'fade' }, durationMs: 600 },
          exit: { preset: { kind: 'blur' }, durationMs: 300 },
        },
      }),
    );
  });

  it('renders split segments from one track in one visual row while preserving separate tracks', async () => {
    const segmented = composition();
    segmented.clips = segmented.clips.flatMap((clip) => {
      if (clip.id !== 'screen-clip') return [clip];
      return [
        visual({
          ...(clip as VisualClip),
          id: 'screen-left',
          name: 'Main screen (left)',
          timelineDurationMs: 1_000,
          sourceDurationMs: 1_000,
          trackId: 'screen-track',
        }),
        visual({
          ...(clip as VisualClip),
          id: 'screen-right',
          name: 'Main screen (right)',
          timelineStartMs: 1_000,
          timelineDurationMs: 3_000,
          sourceInMs: 1_000,
          sourceDurationMs: 3_000,
          trackId: 'screen-track',
        }),
      ];
    });

    const mounted = await mountTracks({ composition: segmented });
    const rows = mounted!.findAll('.tracks-stack .visual-tracks-group > .visual-track');
    expect(rows).toHaveLength(3);
    expect(rows.filter((row) => row.findAll('.timeline-clip').length === 2)).toHaveLength(1);
    const segmentedRow = rows.find((row) => row.findAll('.timeline-clip').length === 2)!;
    expect(segmentedRow.text()).toContain('Main screen (left)');
    expect(segmentedRow.text()).toContain('Main screen (right)');
    expect(rows.filter((row) => row.findAll('.timeline-clip').length === 1)).toHaveLength(2);

    const sidebarRows = mounted!.findAll('.sidebar-tracks-stack .visual-track');
    expect(sidebarRows).toHaveLength(3);
    await sidebarRows[0]!.get('.track-info').trigger('click');
    expect(mounted!.emitted('toggle:clip')).toHaveLength(1);
  });

  it('selects the webcam segment at the playhead from its track header, then falls back to the nearest segment', async () => {
    const mounted = await mountTracks({ composition: cameraTrackComposition(), currentTime: 1 });
    const cameraHeader = mounted!.get('[data-track-id="camera-track"] .track-info');

    await cameraHeader.trigger('click');
    expect(mounted!.emitted('select:clip')).toContainEqual(['camera-left']);
    expect(mounted!.emitted('toggle:clip') ?? []).toHaveLength(0);

    await mounted!.setProps({ currentTime: 6.5 });
    await cameraHeader.trigger('click');
    expect(mounted!.emitted('select:clip')).toContainEqual(['camera-right']);
  });

  it('keeps non-camera track headers on their existing toggle behavior', async () => {
    const mounted = await mountTracks();
    const imageHeader = mounted!.get('[data-track-id="image-track"] .track-info');

    await imageHeader.trigger('click');
    expect(mounted!.emitted('toggle:clip')).toContainEqual(['image-clip']);
    expect(mounted!.emitted('select:clip') ?? []).toHaveLength(0);
  });

  it('keeps the keyboard track above text, uses Lucide icons, and reserves manual additions for text', async () => {
    const mounted = await mountTracks({ composition: composition([keyboardCaption()]) });
    const rows = mounted!.findAll('.tracks-stack > .track-row');
    const keyboardIndex = rows.findIndex((row) => row.classes().includes('keyboard-caption-track'));
    const textIndex = rows.findIndex((row) => row.classes().includes('text-caption-track'));

    expect(keyboardIndex).toBeGreaterThanOrEqual(0);
    expect(keyboardIndex).toBeLessThan(textIndex);
    expect(mounted!.get('.keyboard-caption-track .track-icon').classes()).toEqual(
      expect.arrayContaining(['lucide', 'lucide-keyboard']),
    );
    expect(mounted!.get('.text-caption-track .track-icon').classes()).toEqual(
      expect.arrayContaining(['lucide', 'lucide-type']),
    );

    await mounted!.get('.keyboard-caption-track .track-content').trigger('click', { clientX: 950 });
    expect(mounted!.emitted('add:caption') ?? []).toHaveLength(0);
    await mounted!.get('.text-caption-track .track-content').trigger('click', { clientX: 950 });
    expect(mounted!.emitted('add:caption')).toContainEqual([7_300]);
  });

  it('does not render a keyboard track when the composition has no keyboard caption', async () => {
    const mounted = await mountTracks();
    expect(mounted!.find('.keyboard-caption-track').exists()).toBe(false);
    expect(mounted!.find('.text-caption-track').exists()).toBe(true);
  });

  it('forwards per-clip waveform slices, loading status, and real errors to TimelineClip', async () => {
    const mounted = await mountTracks();
    const clips = mounted!.findAllComponents(TimelineClipStub);
    const system = clips.find((component) => component.props('clip').id === 'system-audio');
    const microphone = clips.find((component) => component.props('clip').id === 'microphone-audio');
    const imported = clips.find((component) => component.props('clip').id === 'imported-audio');
    if (!system || !microphone || !imported) throw new Error('Expected all audio timeline clip stubs.');

    expect(system.props('waveformBars')).toEqual([4, 12, 20]);
    expect(system.props('waveformStatus')).toBe('ready');
    expect(system.props('waveformLeftPercent')).toBe(0);
    expect(system.props('waveformWidthPercent')).toBe(100);

    expect(microphone.props('waveformBars')).toBeUndefined();
    expect(microphone.props('waveformStatus')).toBe('loading');
    expect(microphone.props('waveformError')).toBeUndefined();

    expect(imported.props('waveformBars')).toBeUndefined();
    expect(imported.props('waveformStatus')).toBe('error');
    expect(imported.props('waveformError')).toEqual({
      kind: 'decode-failure',
      sourceId: 'imported-asset',
      message: 'The waveform could not be decoded.',
    });
  });

  it('highlights the recently pasted clip, zoom, and caption only for the matching item', async () => {
    const mounted = await mountTracks({
      recentPaste: { type: 'clip', id: 'screen-clip', timestamp: 1 },
    });
    const screen = mounted!
      .findAllComponents(TimelineClipStub)
      .find((component) => (component.props('clip') as VisualClip).id === 'screen-clip');
    if (!screen) throw new Error('Expected the screen timeline clip stub.');
    expect(screen.props('pasteHighlight')).toBe(true);
    expect(screen.get('.timeline-clip').classes()).toContain('paste-arrival');

    await mounted!.setProps({ recentPaste: { type: 'zoom', id: 'zoom-1', timestamp: 2 } });
    expect(screen.props('pasteHighlight')).toBe(false);
    expect(mounted!.get('.cursor-zoom-indicator:not(.preview-ghost)').classes()).toContain('paste-arrival');

    await mounted!.setProps({ recentPaste: { type: 'clip', id: 'caption-clip', timestamp: 3 } });
    expect(mounted!.get('.text-caption-track .annotation-indicator:not(.preview-ghost)').classes()).toContain(
      'paste-arrival',
    );
    expect(mounted!.get('.cursor-zoom-indicator:not(.preview-ghost)').classes()).not.toContain('paste-arrival');
  });

  it('previews and adds zooms/captions only in available gaps', async () => {
    const mounted = await mountTracks();
    const cursor = mounted!.get('.cursor-content');
    const annotation = mounted!.get('.annotation-content');

    await cursor.trigger('mousemove', { clientX: 900 });
    expect(mounted!.find('.cursor-zoom-indicator.preview-ghost').exists()).toBe(true);
    await cursor.trigger('click', { clientX: 900 });
    expect(mounted!.emitted('add:zoom')).toContainEqual([7_200]);
    await cursor.trigger('mouseleave');
    expect(mounted!.find('.cursor-zoom-indicator.preview-ghost').exists()).toBe(false);

    await cursor.trigger('mousemove', { clientX: 300 });
    expect(mounted!.find('.cursor-zoom-indicator.preview-ghost').exists()).toBe(false);
    await cursor.trigger('click', { clientX: 300 });
    expect(mounted!.emitted('add:zoom')).toHaveLength(1);

    await annotation.trigger('mousemove', { clientX: 600 });
    expect(mounted!.find('.annotation-indicator.preview-ghost').exists()).toBe(false);
    await annotation.trigger('click', { clientX: 600 });
    expect(mounted!.emitted('add:caption') ?? []).toHaveLength(0);
    await annotation.trigger('mousemove', { clientX: 950 });
    expect(mounted!.find('.annotation-indicator.preview-ghost').exists()).toBe(true);
    await annotation.trigger('click', { clientX: 950 });
    expect(mounted!.emitted('add:caption')).toContainEqual([7_300]);
    await annotation.trigger('mouseleave');
  });

  it('uses the configured zoom duration when centering the hover ghost', async () => {
    const mounted = await mountTracks({ newZoomDurationMs: 5_000, zoomElements: [] });
    const cursor = mounted!.get('.cursor-content');

    await cursor.trigger('mousemove', { clientX: 700 });

    const ghost = mounted!.get('.cursor-zoom-indicator.preview-ghost');
    expect((ghost.element as HTMLElement).style.left).toBe('33%');
    expect((ghost.element as HTMLElement).style.width).toBe('50%');
  });

  it('uses the configured zoom duration when checking hover collisions', async () => {
    const mounted = await mountTracks({ newZoomDurationMs: 5_000 });
    const cursor = mounted!.get('.cursor-content');

    await cursor.trigger('mousemove', { clientX: 700 });
    expect(mounted!.find('.cursor-zoom-indicator.preview-ghost').exists()).toBe(false);
    await cursor.trigger('click', { clientX: 700 });
    expect(mounted!.emitted('add:zoom') ?? []).toHaveLength(0);
  });

  it('emits the centered start for the configured zoom duration', async () => {
    const mounted = await mountTracks({ newZoomDurationMs: 5_000, zoomElements: [] });
    const cursor = mounted!.get('.cursor-content');

    await cursor.trigger('click', { clientX: 700 });

    expect(mounted!.emitted('add:zoom')).toContainEqual([3_300]);
  });

  it('moves and trims linked clips and zooms with clamped timeline bounds', async () => {
    const mounted = await mountTracks();
    const clips = mounted!.findAll('.visual-track .timeline-clip');
    await clips[2]!.trigger('pointerdown', { clientX: 120 });
    window.dispatchEvent(pointerEvent('pointermove', 500));
    window.dispatchEvent(pointerEvent('pointerup', 500));
    expect(mounted!.emitted('move:clip')).toContainEqual([expect.objectContaining({ id: 'screen-clip' })]);

    await clips[2]!.find('.trim-handle.start').trigger('pointerdown', { clientX: 200 });
    window.dispatchEvent(pointerEvent('pointermove', 250));
    window.dispatchEvent(pointerEvent('pointerup', 250));
    expect(mounted!.emitted('trim:clip')).toContainEqual([
      expect.objectContaining({ id: 'screen-clip', edge: 'start' }),
    ]);
    await clips[2]!.find('.trim-handle.end').trigger('pointerdown', { clientX: 700 });
    window.dispatchEvent(pointerEvent('pointermove', 900));
    window.dispatchEvent(pointerEvent('pointerup', 900));
    expect(mounted!.emitted('trim:clip')).toContainEqual([expect.objectContaining({ id: 'screen-clip', edge: 'end' })]);

    const zoomButton = mounted!.get('.cursor-zoom-indicator:not(.preview-ghost)');
    await zoomButton.trigger('pointerdown', { clientX: 400 });
    window.dispatchEvent(pointerEvent('pointermove', 650));
    window.dispatchEvent(pointerEvent('pointerup', 650));
    expect(mounted!.emitted('move:zoom')).toContainEqual([expect.objectContaining({ id: 'zoom-1' })]);
    await zoomButton.trigger('pointerdown', { clientX: 400 });
    await zoomButton.find('.trim-handle.start').trigger('pointerdown', { clientX: 400 });
    window.dispatchEvent(pointerEvent('pointermove', 100));
    window.dispatchEvent(pointerEvent('pointerup', 100));
    expect(mounted!.emitted('trim:zoom')).toContainEqual([expect.objectContaining({ id: 'zoom-1', edge: 'start' })]);
    await zoomButton.find('.trim-handle.end').trigger('pointerdown', { clientX: 400 });
    window.dispatchEvent(pointerEvent('pointermove', 900));
    window.dispatchEvent(pointerEvent('pointerup', 900));
    expect(mounted!.emitted('trim:zoom')).toContainEqual([expect.objectContaining({ id: 'zoom-1', edge: 'end' })]);
  });

  it('keeps move and trim edits as local clip previews until pointerup commits them', async () => {
    const mounted = await mountTracks();
    const screenClip = mounted!
      .findAllComponents(TimelineClipStub)
      .find((component) => (component.props('clip') as VisualClip).id === 'screen-clip');
    if (!screenClip) throw new Error('Expected the screen timeline clip stub.');

    const originalStart = (screenClip.props('clip') as VisualClip).timelineStartMs;
    await screenClip.trigger('pointerdown', { clientX: 120 });
    window.dispatchEvent(pointerEvent('pointermove', 500));
    await flushPromises();
    expect((screenClip.props('clip') as VisualClip).timelineStartMs).toBeGreaterThan(originalStart);
    expect(mounted!.emitted('preview:composition')).toContainEqual([
      expect.objectContaining({ clips: expect.any(Array) }),
    ]);
    expect(mounted!.emitted('move:clip') ?? []).toHaveLength(0);

    window.dispatchEvent(pointerEvent('pointerup', 500));
    expect(mounted!.emitted('preview:composition')?.at(-1)).toEqual([null]);
    expect(mounted!.emitted('move:clip')).toContainEqual([expect.objectContaining({ id: 'screen-clip' })]);

    const originalDuration = (screenClip.props('clip') as VisualClip).timelineDurationMs;
    await screenClip.find('.trim-handle.end').trigger('pointerdown', { clientX: 500 });
    window.dispatchEvent(pointerEvent('pointermove', 900));
    await flushPromises();
    expect((screenClip.props('clip') as VisualClip).timelineDurationMs).toBeGreaterThan(originalDuration);
    expect(mounted!.emitted('preview:composition')).toContainEqual([
      expect.objectContaining({ clips: expect.any(Array) }),
    ]);
    expect(mounted!.emitted('trim:clip') ?? []).toHaveLength(0);

    window.dispatchEvent(pointerEvent('pointerup', 900));
    expect(mounted!.emitted('preview:composition')?.at(-1)).toEqual([null]);
    expect(mounted!.emitted('trim:clip')).toContainEqual([expect.objectContaining({ id: 'screen-clip', edge: 'end' })]);
  });

  it('grows the timeline proportionally and keeps auto-scrolling while extending a hold at the edge', async () => {
    const hold = visual({
      id: 'hold-clip',
      kind: 'video',
      name: 'Hold segment',
      trackId: 'hold-track',
      timelineStartMs: 4_000,
      timelineDurationMs: 1_000,
      sourceInMs: 2_000,
      sourceDurationMs: 1_000,
      freezeFrameSourceMs: 2_000,
      order: 0,
    });
    const following = visual({
      id: 'following-clip',
      kind: 'video',
      name: 'Following segment',
      trackId: 'hold-track',
      timelineStartMs: 5_000,
      timelineDurationMs: 1_000,
      sourceInMs: 3_000,
      sourceDurationMs: 1_000,
      order: 0,
    });
    const holdComposition: ClipComposition = {
      ...composition(),
      clips: [hold, following],
    };
    const mounted = await mountTracks({
      composition: holdComposition,
      duration: 5,
      selectedClipId: hold.id,
      isSnappingEnabled: false,
    });
    const scroll = setScrubViewportGeometry(mounted!);
    scroll.dispatchEvent(new Event('scroll'));
    await flushPromises();
    const { pendingFrames, flushNextFrame } = queueAnimationFrames();
    const viewport = mounted!.get('.timeline-viewport').element as HTMLElement;
    const initialWaveformViewport = waveformTestState.viewport?.();
    if (!initialWaveformViewport) throw new Error('Expected the waveform viewport probe.');
    expect(viewport.style.width).toBe('calc(120% + 230px)');
    expect(viewport.style.minWidth).toBe('calc(100% + 230px)');

    const holdClip = mounted!
      .findAllComponents(TimelineClipStub)
      .find((component) => (component.props('clip') as VisualClip).id === hold.id);
    if (!holdClip) throw new Error('Expected the hold timeline clip stub.');
    const initialThumbnailSlots = holdClip.props('thumbnailSlots');
    expect(holdClip.props('deferThumbnailRequests')).toBe(false);

    await holdClip.find('.trim-handle.end').trigger('pointerdown', { clientX: 220 });
    window.dispatchEvent(pointerEvent('pointermove', 900));
    flushNextFrame();
    await flushPromises();

    const preview = mounted!.emitted('preview:composition')?.at(-1)?.[0] as ClipComposition | undefined;
    expect(preview?.clips.find((clip) => clip.id === hold.id)).toMatchObject({
      timelineStartMs: 4_000,
      timelineDurationMs: 2_000,
      sourceInMs: 2_000,
      freezeFrameSourceMs: 2_000,
    });
    expect(preview?.clips.find((clip) => clip.id === following.id)).toMatchObject({ timelineStartMs: 6_000 });
    expect(holdClip.props('duration')).toBe(7);
    expect(viewport.style.width).toBe('calc(168% + 230px)');
    expect(viewport.style.minWidth).toBe('calc(140% + 230px)');
    expect(viewport.classList).toContain('is-trimming');
    expect(holdClip.props('thumbnailSlots')).toBe(initialThumbnailSlots);
    expect(holdClip.props('deferThumbnailRequests')).toBe(true);
    expect(waveformTestState.viewport?.()).toBe(initialWaveformViewport);
    expect(pendingFrames).toHaveLength(1);

    const firstScrollLeft = scroll.scrollLeft;
    flushNextFrame();
    await flushPromises();
    const secondScrollLeft = scroll.scrollLeft;
    const previewAfterFirstScroll = mounted!.emitted('preview:composition')?.at(-1)?.[0] as ClipComposition | undefined;
    expect(previewAfterFirstScroll?.clips.find((clip) => clip.id === hold.id)?.timelineDurationMs).toBeGreaterThan(
      2_000,
    );
    flushNextFrame();
    await flushPromises();
    const thirdScrollLeft = scroll.scrollLeft;

    expect(secondScrollLeft).toBeGreaterThan(firstScrollLeft);
    expect(thirdScrollLeft).toBeGreaterThan(secondScrollLeft);
    expect(holdClip.props('thumbnailSlots')).toBe(initialThumbnailSlots);
    expect(holdClip.props('deferThumbnailRequests')).toBe(true);
    expect(waveformTestState.viewport?.()).toBe(initialWaveformViewport);
    expect(pendingFrames).toHaveLength(1);
    window.dispatchEvent(pointerEvent('pointerup', 900));
    await flushPromises();

    const stoppedScrollLeft = scroll.scrollLeft;
    expect(viewport.classList).not.toContain('is-trimming');
    expect(holdClip.props('deferThumbnailRequests')).toBe(false);
    expect(waveformTestState.viewport?.()).not.toBe(initialWaveformViewport);
    expect(pendingFrames).toHaveLength(0);
    await flushPromises();
    expect(scroll.scrollLeft).toBe(stoppedScrollLeft);
  });

  it('keeps the timeline scale stable so a shortening hold follows the pointer', async () => {
    const hold = visual({
      id: 'shorten-hold',
      kind: 'video',
      name: 'Hold segment',
      trackId: 'shorten-hold-track',
      timelineStartMs: 5_000,
      timelineDurationMs: 3_000,
      sourceInMs: 2_000,
      sourceDurationMs: 3_000,
      freezeFrameSourceMs: 2_000,
      order: 0,
    });
    const mounted = await mountTracks({
      composition: { ...composition(), clips: [hold] },
      duration: 8,
      selectedClipId: hold.id,
      isSnappingEnabled: false,
    });
    const scroll = setScrubViewportGeometry(mounted!);
    scroll.dispatchEvent(new Event('scroll'));
    await flushPromises();
    scroll.scrollLeft = 500;
    const { pendingFrames, flushNextFrame } = queueAnimationFrames();
    const viewport = mounted!.get('.timeline-viewport').element as HTMLElement;
    expect(viewport.style.width).toBe('calc(120% + 230px)');
    expect(viewport.style.minWidth).toBe('calc(100% + 230px)');
    expect(mounted!.findAll('.marker-label').at(-1)?.text()).toBe('8s');

    const holdClip = mounted!
      .findAllComponents(TimelineClipStub)
      .find((component) => (component.props('clip') as VisualClip).id === hold.id);
    if (!holdClip) throw new Error('Expected the hold timeline clip stub.');

    await holdClip.find('.trim-handle.end').trigger('pointerdown', { clientX: 620 });
    window.dispatchEvent(pointerEvent('pointermove', 120));
    flushNextFrame();
    await flushPromises();

    const preview = mounted!.emitted('preview:composition')?.at(-1)?.[0] as ClipComposition | undefined;
    expect(preview?.clips.find((clip) => clip.id === hold.id)).toMatchObject({
      timelineStartMs: 5_000,
      timelineDurationMs: 1_000,
      sourceInMs: 2_000,
      freezeFrameSourceMs: 2_000,
    });
    expect(holdClip.props('duration')).toBe(8);
    expect(viewport.style.width).toBe('calc(120% + 230px)');
    expect(viewport.style.minWidth).toBe('calc(100% + 230px)');
    expect(mounted!.findAll('.marker-label').at(-1)?.text()).toBe('8s');
    expect(viewport.classList).toContain('is-trimming');
    expect(pendingFrames).toHaveLength(1);

    const firstScrollLeft = scroll.scrollLeft;
    flushNextFrame();
    await flushPromises();
    expect(scroll.scrollLeft).toBeLessThan(firstScrollLeft);
    expect(mounted!.emitted('preview:composition')?.at(-1)?.[0]).toMatchObject({
      clips: expect.arrayContaining([expect.objectContaining({ id: hold.id, timelineDurationMs: expect.any(Number) })]),
    });

    window.dispatchEvent(pointerEvent('pointerup', 120));
    await flushPromises();
    const stoppedScrollLeft = scroll.scrollLeft;
    expect(viewport.classList).not.toContain('is-trimming');
    expect(pendingFrames).toHaveLength(0);
    await flushPromises();
    expect(scroll.scrollLeft).toBe(stoppedScrollLeft);
  });

  it('keeps the last hold trim preview bounded when viewport shrink clamps scrollLeft', async () => {
    const hold = visual({
      id: 'clamped-hold',
      kind: 'video',
      name: 'Last hold segment',
      trackId: 'clamped-hold-track',
      timelineStartMs: 5_000,
      timelineDurationMs: 3_000,
      sourceInMs: 2_000,
      sourceDurationMs: 3_000,
      freezeFrameSourceMs: 2_000,
      order: 0,
    });
    const mounted = await mountTracks({
      composition: { ...composition(), clips: [hold] },
      duration: 8,
      selectedClipId: hold.id,
      isSnappingEnabled: false,
    });
    const scroll = setScrubViewportGeometry(mounted!);
    scroll.dispatchEvent(new Event('scroll'));
    await flushPromises();
    let browserScrollLeft = 500;
    Object.defineProperty(scroll, 'scrollLeft', {
      configurable: true,
      get: () => browserScrollLeft,
      set: (value: number) => {
        browserScrollLeft = Math.max(0, value);
      },
    });
    scroll.scrollLeft = browserScrollLeft;
    const { pendingFrames, flushNextFrame } = queueAnimationFrames();
    const viewport = mounted!.get('.timeline-viewport').element as HTMLElement;
    const holdClip = mounted!
      .findAllComponents(TimelineClipStub)
      .find((component) => (component.props('clip') as VisualClip).id === hold.id);
    if (!holdClip) throw new Error('Expected the hold timeline clip stub.');

    await holdClip.find('.trim-handle.end').trigger('pointerdown', { clientX: 620 });
    window.dispatchEvent(pointerEvent('pointermove', 120));
    flushNextFrame();
    await flushPromises();

    const previewBeforeClamp = mounted!.emitted('preview:composition')?.at(-1)?.[0] as ClipComposition | undefined;
    const holdBeforeClamp = previewBeforeClamp?.clips.find((clip) => clip.id === hold.id);
    if (!holdBeforeClamp) throw new Error('Expected the initial last-hold trim preview.');
    const previewEventCount = mounted!.emitted('preview:composition')?.length ?? 0;
    expect(holdBeforeClamp.timelineStartMs + holdBeforeClamp.timelineDurationMs).toBe(6_000);
    expect(holdClip.props('duration')).toBe(8);

    // Browser scroll containers clamp scrollLeft when the just-shortened viewport shrinks.
    scroll.scrollLeft = 0;
    scroll.dispatchEvent(new Event('scroll'));
    while (pendingFrames.size > 0) {
      flushNextFrame();
      await flushPromises();
    }

    const previewAfterClamp = mounted!.emitted('preview:composition')?.at(-1)?.[0] as ClipComposition | undefined;
    const holdAfterClamp = previewAfterClamp?.clips.find((clip) => clip.id === hold.id);
    expect(holdAfterClamp).toMatchObject({ timelineStartMs: 5_000, timelineDurationMs: 1_000 });
    expect(mounted!.emitted('preview:composition')).toHaveLength(previewEventCount);
    expect(holdClip.props('duration')).toBe(8);
    expect(viewport.style.width).toBe('calc(120% + 230px)');
    expect(viewport.style.minWidth).toBe('calc(100% + 230px)');

    window.dispatchEvent(pointerEvent('pointerup', 120));
    await flushPromises();
    expect(pendingFrames).toHaveLength(0);
  });

  it('clamps a grouped video trim preview to the shortest source bound without snapping back on pointerup', async () => {
    const groupedComposition: ClipComposition = {
      schemaVersion: 6,
      keyboardCaptionSessions: [],
      assets: [
        { ...asset('long-video', 'video'), durationMs: 8_000 },
        { ...asset('short-video', 'video'), durationMs: 3_000 },
      ],
      clips: [
        visual({
          id: 'grouped-video',
          kind: 'video',
          name: 'Grouped video',
          assetId: 'long-video',
          timelineDurationMs: 2_000,
          sourceDurationMs: 2_000,
          groupId: 'source-group',
          trackId: 'video-track',
        }),
        visual({
          id: 'grouped-short',
          kind: 'webcam',
          name: 'Grouped short source',
          assetId: 'short-video',
          timelineDurationMs: 2_000,
          sourceDurationMs: 2_000,
          groupId: 'source-group',
          trackId: 'webcam-track',
        }),
      ],
    };
    const mounted = await mountTracks({
      composition: groupedComposition,
      selectedClipId: 'grouped-video',
      isSnappingEnabled: false,
    });
    const bounds = clipTrimBounds(groupedComposition, 'grouped-video', 'end');
    expect(bounds.maxMs).toBe(3_000);
    const videoClip = mounted!
      .findAllComponents(TimelineClipStub)
      .find((component) => (component.props('clip') as VisualClip).id === 'grouped-video');
    if (!videoClip) throw new Error('Expected the grouped video timeline clip stub.');

    await videoClip.find('.trim-handle.end').trigger('pointerdown', { clientX: 200 });
    window.dispatchEvent(pointerEvent('pointermove', 600));
    await flushPromises();

    const previews = mounted!.emitted('preview:composition') ?? [];
    const preview = previews.at(-1)?.[0] as ClipComposition | undefined;
    const previewClip = preview?.clips.find((clip) => clip.id === 'grouped-video');
    if (!previewClip) throw new Error('Expected a grouped video trim preview.');
    expect(previewClip.timelineStartMs + previewClip.timelineDurationMs).toBe(bounds.maxMs);
    expect(preview?.clips.find((clip) => clip.id === 'grouped-short')).toMatchObject({
      timelineStartMs: 0,
      timelineDurationMs: bounds.maxMs,
    });
    expect(mounted!.emitted('trim:clip') ?? []).toHaveLength(0);

    window.dispatchEvent(pointerEvent('pointerup', 600));

    const trimEvents = mounted!.emitted('trim:clip') ?? [];
    expect(trimEvents.at(-1)?.[0]).toEqual({ id: 'grouped-video', edge: 'end', timeMs: bounds.maxMs });
  });

  it('releases the zoom trim preview when the trim ends so later props control the indicator', async () => {
    const mounted = await mountTracks();
    const zoomButton = mounted!.get('.cursor-zoom-indicator:not(.preview-ghost)');

    await zoomButton.find('.trim-handle.start').trigger('pointerdown', { clientX: 400 });
    window.dispatchEvent(pointerEvent('pointermove', 100));
    window.dispatchEvent(pointerEvent('pointerup', 100));

    await mounted!.setProps({ zoomElements: [zoom({ startMs: 7_000, endMs: 8_500 })] });
    const updatedZoom = mounted!.get('.cursor-zoom-indicator:not(.preview-ghost)');
    expect(updatedZoom.attributes('style')).toContain('left: 70%');
    expect(updatedZoom.attributes('style')).toContain('width: 15%');
  });

  it('cleans a clip move preview and does not emit a move on pointercancel', async () => {
    const mounted = await mountTracks();
    const screenClip = mounted!
      .findAllComponents(TimelineClipStub)
      .find((component) => (component.props('clip') as VisualClip).id === 'screen-clip');
    if (!screenClip) throw new Error('Expected the screen timeline clip stub.');

    await screenClip.trigger('pointerdown', { clientX: 120 });
    window.dispatchEvent(pointerEvent('pointermove', 500));
    await flushPromises();
    expect((screenClip.props('clip') as VisualClip).timelineStartMs).toBeGreaterThan(0);
    window.dispatchEvent(pointerEvent('pointercancel', 500));
    await flushPromises();
    expect(mounted!.emitted('move:clip') ?? []).toHaveLength(0);
    expect(mounted!.emitted('preview:composition')?.at(-1)).toEqual([null]);
    expect((screenClip.props('clip') as VisualClip).timelineStartMs).toBe(0);

    const nextComposition = composition();
    nextComposition.clips = nextComposition.clips.map((clip) =>
      clip.id === 'screen-clip' ? { ...clip, timelineStartMs: 7_000 } : clip,
    );
    await mounted!.setProps({ composition: nextComposition });
    const updatedScreenClip = mounted!
      .findAllComponents(TimelineClipStub)
      .find((component) => (component.props('clip') as VisualClip).id === 'screen-clip');
    expect((updatedScreenClip?.props('clip') as VisualClip).timelineStartMs).toBe(7_000);
  });

  it('cleans a clip trim preview and does not emit a trim on pointercancel', async () => {
    const mounted = await mountTracks();
    const screenClip = mounted!
      .findAllComponents(TimelineClipStub)
      .find((component) => (component.props('clip') as VisualClip).id === 'screen-clip');
    if (!screenClip) throw new Error('Expected the screen timeline clip stub.');

    await screenClip.find('.trim-handle.start').trigger('pointerdown', { clientX: 200 });
    window.dispatchEvent(pointerEvent('pointermove', 250));
    await flushPromises();
    expect((screenClip.props('clip') as VisualClip).timelineStartMs).toBeGreaterThan(0);
    window.dispatchEvent(pointerEvent('pointercancel', 250));
    await flushPromises();
    expect(mounted!.emitted('trim:clip') ?? []).toHaveLength(0);
    expect(mounted!.emitted('preview:composition')?.at(-1)).toEqual([null]);
    expect((screenClip.props('clip') as VisualClip).timelineStartMs).toBe(0);

    const nextComposition = composition();
    nextComposition.clips = nextComposition.clips.map((clip) =>
      clip.id === 'screen-clip' ? { ...clip, timelineStartMs: 6_500, timelineDurationMs: 2_500 } : clip,
    );
    await mounted!.setProps({ composition: nextComposition });
    const updatedScreenClip = mounted!
      .findAllComponents(TimelineClipStub)
      .find((component) => (component.props('clip') as VisualClip).id === 'screen-clip');
    const updatedClip = updatedScreenClip?.props('clip') as VisualClip | undefined;
    expect(updatedClip?.timelineStartMs).toBe(6_500);
    expect(updatedClip?.timelineDurationMs).toBe(2_500);
  });

  it('cleans zoom move and trim previews on pointercancel without emitting either edit', async () => {
    const mounted = await mountTracks();
    const zoomButton = mounted!.get('.cursor-zoom-indicator:not(.preview-ghost)');

    await zoomButton.trigger('pointerdown', { clientX: 400 });
    window.dispatchEvent(pointerEvent('pointermove', 650));
    window.dispatchEvent(pointerEvent('pointercancel', 650));
    expect(mounted!.emitted('move:zoom') ?? []).toHaveLength(0);

    await mounted!.setProps({ zoomElements: [zoom({ startMs: 6_000, endMs: 7_500 })] });
    const updatedZoomButton = mounted!.get('.cursor-zoom-indicator:not(.preview-ghost)');
    await updatedZoomButton.find('.trim-handle.end').trigger('pointerdown', { clientX: 700 });
    window.dispatchEvent(pointerEvent('pointermove', 900));
    window.dispatchEvent(pointerEvent('pointercancel', 900));
    expect(mounted!.emitted('trim:zoom') ?? []).toHaveLength(0);

    await mounted!.setProps({ zoomElements: [zoom({ startMs: 8_000, endMs: 9_500 })] });
    const finalZoomButton = mounted!.get('.cursor-zoom-indicator:not(.preview-ghost)');
    expect(finalZoomButton.attributes('style')).toContain('left: 80%');
    expect(finalZoomButton.attributes('style')).toContain('width: 15%');
  });

  it('reorders visual clips and cancels a reorder without changing the composition', async () => {
    const mounted = await mountTracks();
    const rows = mounted!.findAll('.sidebar-tracks-stack .visual-track');
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: vi.fn().mockReturnValue(rows[2]!.element),
    });
    await rows[0]!.get('.track-drag-handle').trigger('pointerdown', { clientX: 10, clientY: 10 });
    window.dispatchEvent(pointerEvent('pointermove', 30, 100));
    window.dispatchEvent(pointerEvent('pointerup', 30, 100));
    expect(mounted!.emitted('reorder:clip')).toContainEqual([{ id: 'image-clip', targetIndex: 2 }]);

    await rows[1]!.get('.track-drag-handle').trigger('pointerdown', { clientX: 10, clientY: 10 });
    window.dispatchEvent(pointerEvent('pointercancel', 10, 10));
    expect(mounted!.emitted('reorder:clip')).toHaveLength(1);
    await mounted!.findAll('.sidebar-tracks-stack .audio-track')[1]!.get('.track-info').trigger('click');
  });

  it('marks every audio timeline row when audio is excluded from export', async () => {
    const mounted = await mountTracks({ includeAudioInExport: false });
    const indicators = mounted!.findAll('.export-audio-disabled');
    const sidebarStatuses = mounted!.findAll('.export-disabled-status');

    expect(indicators).toHaveLength(3);
    expect(indicators.every((indicator) => indicator.text() === 'Audio disabled from export')).toBe(true);
    expect(sidebarStatuses).toHaveLength(3);
    expect(mounted!.findAll('.audio-track.disabled')).toHaveLength(6);

    await mounted!.setProps({ includeAudioInExport: true });
    expect(mounted!.find('.export-audio-disabled').exists()).toBe(false);
    expect(mounted!.find('.export-disabled-status').exists()).toBe(false);
  });

  it('reorders visual tracks when dragging directly anywhere on the sidebar track-info button', async () => {
    const mounted = await mountTracks();
    const rows = mounted!.findAll('.sidebar-tracks-stack .visual-track');
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: vi.fn().mockReturnValue(rows[1]!.element),
    });
    // Drag on the .track-info button directly without aiming at grip
    await rows[0]!.get('.track-info').trigger('pointerdown', { clientX: 10, clientY: 10 });
    window.dispatchEvent(pointerEvent('pointermove', 30, 80));
    window.dispatchEvent(pointerEvent('pointerup', 30, 80));
    expect(mounted!.emitted('reorder:clip')).toContainEqual([{ id: 'image-clip', targetIndex: 1 }]);
  });

  it('reorders visual tracks when moving a visual clip vertically across tracks in the timeline', async () => {
    const mounted = await mountTracks();
    const timelineRows = mounted!.findAll('.tracks-stack .visual-track');
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: vi.fn().mockReturnValue(timelineRows[1]!.element),
    });
    const clipEl = timelineRows[0]!.get('.timeline-clip');
    await clipEl.trigger('pointerdown', { clientX: 50, clientY: 50 });
    window.dispatchEvent(pointerEvent('pointermove', 50, 120));
    window.dispatchEvent(pointerEvent('pointerup', 50, 120));
    expect(mounted!.emitted('reorder:clip')).toContainEqual([{ id: 'image-clip', targetIndex: 1 }]);
  });

  it('opens context menu on right click, pastes at the playhead, and handles delete', async () => {
    const mounted = await mountTracks();
    const clipEl = mounted!.find('.tracks-stack .timeline-clip');
    expect(clipEl.exists()).toBe(true);

    await clipEl.trigger('contextmenu', { clientX: 200, clientY: 300 });
    await flushPromises();

    expect(mounted!.emitted('select:clip')).toContainEqual(['image-clip']);

    const menuItems = document.body.querySelectorAll('.context-menu-item');
    expect(menuItems.length).toBeGreaterThanOrEqual(3);
    const itemTexts = Array.from(menuItems).map((el) => el.textContent?.trim());
    expect(itemTexts.some((text) => text?.includes('Copy'))).toBe(true);
    expect(itemTexts.some((text) => text?.includes('Paste'))).toBe(true);
    expect(itemTexts.some((text) => text?.includes('Delete'))).toBe(true);

    expect(contextMenuButton('Paste')?.disabled).toBe(true);

    contextMenuButton('Copy')?.click();
    await flushPromises();
    expect(mounted!.emitted('clipboard:copied')).toHaveLength(1);

    const cursorTrack = mounted!.find('.tracks-stack .cursor-track');
    await cursorTrack.trigger('contextmenu', { clientX: 999, clientY: 350 });
    await flushPromises();

    const pasteBtn = contextMenuButton('Paste');
    expect(pasteBtn?.disabled).toBe(false);
    pasteBtn?.click();
    await flushPromises();

    const pastePayload = mounted!.emitted('paste:item')?.at(-1)?.[0] as
      { item: { type: string; clip?: { id: string } }; timeMs: number; target?: { category: string } } | undefined;
    expect(pastePayload?.timeMs).toBe(2_000);
    expect(pastePayload?.item).toEqual(expect.objectContaining({ type: 'clip' }));
    expect(pastePayload?.item.clip?.id).toBe('image-clip');
    expect(pastePayload?.target?.category).toBe('zoom');

    await clipEl.trigger('contextmenu', { clientX: 250, clientY: 350 });
    await flushPromises();
    contextMenuButton('Delete')?.click();
    await flushPromises();

    expect(mounted!.emitted('delete:clips')).toContainEqual([['image-clip']]);
  });

  it('allows cross-category pasting from the context menu', async () => {
    const mounted = await mountTracks();
    const clipEl = mounted!.find('.tracks-stack .timeline-clip');
    const zoomButton = mounted!.find('.cursor-zoom-indicator:not(.preview-ghost)');

    expect(zoomButton.exists()).toBe(true);

    await clipEl.trigger('contextmenu', { clientX: 100, clientY: 100 });
    await flushPromises();
    contextMenuButton('Copy')?.click();
    await flushPromises();

    const captionTrack = mounted!.find('.tracks-stack .text-caption-track');
    await captionTrack.trigger('contextmenu', { clientX: 300, clientY: 300 });
    await flushPromises();
    let pasteBtn = contextMenuButton('Paste');
    expect(pasteBtn?.disabled).toBe(false);
    pasteBtn?.click();
    await flushPromises();
    let pastePayload = mounted!.emitted('paste:item')?.at(-1)?.[0] as
      { item: { type: string }; target?: { category: string } } | undefined;
    expect(pastePayload?.item.type).toBe('clip');
    expect(pastePayload?.target?.category).toBe('caption');

    await zoomButton.trigger('contextmenu', { clientX: 150, clientY: 150 });
    await flushPromises();
    expect(mounted!.emitted('select:zoom')).toContainEqual(['zoom-1']);

    contextMenuButton('Copy')?.click();
    await flushPromises();

    const visualTrack = mounted!.find('.tracks-stack .visual-track[data-track-id="screen-track"]');
    await visualTrack.trigger('contextmenu', { clientX: 100, clientY: 100 });
    await flushPromises();
    pasteBtn = contextMenuButton('Paste');
    expect(pasteBtn?.disabled).toBe(false);
    pasteBtn?.click();
    await flushPromises();
    pastePayload = mounted!.emitted('paste:item')?.at(-1)?.[0] as
      { item: { type: string }; target?: { category: string; trackId?: string | null } } | undefined;
    expect(pastePayload?.item.type).toBe('zoom');
    expect(pastePayload?.target).toEqual({ category: 'visual', trackId: 'screen-track' });

    await zoomButton.trigger('contextmenu', { clientX: 150, clientY: 150 });
    await flushPromises();
    contextMenuButton('Delete')?.click();
    await flushPromises();

    expect(mounted!.emitted('delete:zoom')).toContainEqual(['zoom-1']);
  });

  it('supports Ctrl/Cmd copy and paste, ignores editable fields, and reports an empty clipboard', async () => {
    const mounted = await mountTracks({ selectedZoomId: null });
    const dispatchShortcut = (key: string, modifiers: Pick<KeyboardEventInit, 'ctrlKey' | 'metaKey'>) => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...modifiers }));
    };

    dispatchShortcut('c', { ctrlKey: true });
    expect(mounted!.emitted('clipboard:copied')).toHaveLength(1);
    dispatchShortcut('c', { metaKey: true });
    expect(mounted!.emitted('clipboard:copied')).toHaveLength(2);
    await mounted!.setProps({ currentTime: 6 });
    dispatchShortcut('v', { metaKey: true });
    await flushPromises();

    let pastePayload = mounted!.emitted('paste:item')?.at(-1)?.[0] as
      { item: { type: string; clip?: { id: string } }; timeMs: number } | undefined;
    expect(pastePayload?.timeMs).toBe(6_000);
    expect(pastePayload?.item).toEqual(expect.objectContaining({ type: 'clip' }));
    expect(pastePayload?.item.clip?.id).toBe('screen-clip');

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    const pasteCountBeforeEditableShortcuts = mounted!.emitted('paste:item')?.length ?? 0;
    dispatchShortcut('c', { ctrlKey: true });
    dispatchShortcut('v', { ctrlKey: true });
    await flushPromises();
    expect(mounted!.emitted('paste:item')?.length ?? 0).toBe(pasteCountBeforeEditableShortcuts);
    input.remove();

    useTimelineClipboard().clearClipboard();
    dispatchShortcut('v', { ctrlKey: true });
    await flushPromises();
    expect(mounted!.emitted('paste:error')).toContainEqual(['Copy a timeline item before pasting.']);
  });

  it('displays real-time caption text, triggers throbber on edit, and supports hover marquee', async () => {
    const initialComp = composition();
    const targetCaption = initialComp.clips.find((c) => c.id === 'caption-clip') as CaptionClip;
    targetCaption.caption = {
      type: 'text',
      sentences: [{ id: 's1', text: 'Live transcribed subtitle', startMs: 1_000, endMs: 4_000, words: [] }],
      style: createDefaultCaptionStyle(),
    };

    const mounted = await mountTracks({
      composition: initialComp,
    });

    const captionLabel = mounted!.find('.text-caption-track .caption-label-text');
    expect(captionLabel.exists()).toBe(true);
    expect(captionLabel.text()).toBe('Live transcribed subtitle');

    // Update caption text (e.g. while editing in properties panel)
    const updatedComp = composition();
    const updatedCaption = updatedComp.clips.find((c) => c.id === 'caption-clip') as CaptionClip;
    updatedCaption.caption = {
      type: 'text',
      sentences: [{ id: 's1', text: 'Updated subtitle text', startMs: 1_000, endMs: 4_000, words: [] }],
      style: createDefaultCaptionStyle(),
    };

    await mounted!.setProps({ composition: updatedComp });
    await flushPromises();

    // Throbber is displayed while commit is in progress
    const throbber = mounted!.find('.text-caption-track .editor-loading-throbber');
    expect(throbber.exists()).toBe(true);

    // Wait 70ms to complete the edit debounce
    await new Promise((resolve) => setTimeout(resolve, 70));
    await flushPromises();

    // Throbber disappears and updated text is shown
    expect(mounted!.find('.text-caption-track .editor-loading-throbber').exists()).toBe(false);
    expect(mounted!.find('.text-caption-track .caption-label-text').text()).toBe('Updated subtitle text');

    // Hover marquee triggers
    const indicator = mounted!.find('.text-caption-track .annotation-indicator');
    await indicator.trigger('pointerenter');
    await indicator.trigger('pointerleave');
  });
});

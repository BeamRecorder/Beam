import { defineComponent } from 'vue';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, vi } from 'vitest';
import type { ZoomElement } from '../../zoom/zoom-types';
import {
  COMPOSITION_SCHEMA_VERSION,
  type AudioClip,
  type CaptionClip,
  type ClipComposition,
  type MediaAsset,
  type VisualClip,
} from '~/media/shared/composition-types';
import type { MediaError } from '~/media/shared/media-types';
import TimelineTracks from '../TimelineTracks.vue';
import { createDefaultCaptionStyle, createDefaultClipAppearance } from '~/media/shared/composition-defaults';
import { useTimelineClipboard } from '../composables/useTimelineClipboard';
import { timelineClipStyle } from '../timeline-clip-geometry';

const waveformTestState = vi.hoisted(() => ({
  viewport: null as
    | null
    | (() => {
        startSeconds: number;
        endSeconds: number;
        pixelsPerSecond: number;
      }),
}));

export const getWaveformTestState = () => waveformTestState;

vi.mock('../composables/useCompositionAudioWaveforms', () => ({
  useCompositionAudioWaveforms: (
    _composition: unknown,
    viewport: () => {
      startSeconds: number;
      endSeconds: number;
      pixelsPerSecond: number;
    },
  ) => {
    waveformTestState.viewport = viewport;
    return {
      slices: {
        'system-audio': {
          bars: [4, 12, 20],
          leftPercent: 0,
          widthPercent: 100,
        },
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

export const TimelineClipStub = defineComponent({
  name: 'TimelineClip',
  setup() {
    return { timelineClipStyle };
  },
  props: {
    clip: { type: Object, required: true },
    duration: { type: Number, required: true },
    selected: { type: Boolean, default: false },
    trimState: { type: Object, default: null },
    timelineWidthPx: { type: Number, default: 0 },
    thumbnailSlots: { type: Array, default: () => [] },
    waveformBars: { type: Array, default: undefined },
    waveformLeftPercent: { type: Number, default: 0 },
    waveformWidthPercent: { type: Number, default: 100 },
    waveformStatus: { type: String, default: undefined },
    waveformError: { type: Object, default: undefined },
    deferThumbnailRequests: { type: Boolean, default: false },
    deferWaveformDraw: { type: Boolean, default: false },
    pasteHighlight: { type: Boolean, default: false },
  },
  emits: ['select', 'move', 'trim', 'contextmenu'],
  template: `
    <button
      type="button"
      class="timeline-clip"
      :class="{ selected, disabled: !clip.enabled, 'paste-arrival': pasteHighlight }"
      @click.stop="$emit('select', $event)"
      @contextmenu.prevent="$emit('contextmenu', $event)"
      :style="timelineClipStyle(clip, duration, timelineWidthPx)"
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

export class TestResizeObserver {
  readonly observe = vi.fn();
  readonly disconnect = vi.fn();
  constructor(_callback: ResizeObserverCallback) {}
}

export const asset = (id: string, kind: MediaAsset['kind']): MediaAsset => ({
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

export const visual = (overrides: Partial<VisualClip>): VisualClip => ({
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

export const importedAudio = (overrides: Partial<AudioClip> = {}): AudioClip => ({
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

export const keyboardCaption = (): CaptionClip => ({
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
    style: {
      ...createDefaultCaptionStyle(28),
      shadowDirection: 'bottom-right',
    },
  },
});

export const composition = (extraClips: ClipComposition['clips'] = []): ClipComposition => ({
  schemaVersion: COMPOSITION_SCHEMA_VERSION,
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
    visual({
      id: 'screen-clip',
      order: 2,
      groupId: 'linked',
      trackId: 'screen-track',
      name: 'Main screen',
    }),
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

export const cameraTrackComposition = (): ClipComposition => {
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

export const zoom = (overrides: Partial<ZoomElement> = {}): ZoomElement => ({
  id: 'zoom-1',
  sessionId: 'session',
  startMs: 2_000,
  endMs: 3_500,
  focus: { cx: 0.5, cy: 0.5 },
  depth: 6,
  mode: 'manual',
  ...overrides,
});

export let wrapper: VueWrapper | undefined;
const originalResizeObserver = globalThis.ResizeObserver;
const originalElementFromPoint = (document as Document & { elementFromPoint?: typeof document.elementFromPoint })
  .elementFromPoint;

export const mountTracks = async (overrides: Record<string, unknown> = {}) => {
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
  Object.defineProperty(ticks, 'clientWidth', {
    configurable: true,
    value: 1_000,
  });
  const scroll = wrapper.get('.timeline-tracks-container').element;
  Object.defineProperty(scroll, 'clientWidth', {
    configurable: true,
    value: 1_000,
  });
  await flushPromises();
  return wrapper;
};

export const setPlaybackViewportGeometry = (mounted: VueWrapper) => {
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
  Object.defineProperty(scroll, 'clientWidth', {
    configurable: true,
    value: 500,
  });
  Object.defineProperty(scroll, 'scrollWidth', {
    configurable: true,
    value: 2_000,
  });
  scroll.scrollLeft = 0;
  return scroll;
};

export const setScrubViewportGeometry = (mounted: VueWrapper) => {
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

export const queueAnimationFrames = () => {
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
  const flushAllFrames = () => {
    for (let flushed = 0; pendingFrames.size > 0; flushed += 1) {
      if (flushed >= 100) throw new Error('Expected animation frames to settle.');
      flushNextFrame();
    }
  };
  return { pendingFrames, flushNextFrame, flushAllFrames };
};

export const pointerEvent = (type: string, clientX: number, clientY = 10) => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    clientX: { value: clientX },
    clientY: { value: clientY },
    target: { value: document.body },
  });
  return event;
};

export const contextMenuButton = (label: string): HTMLButtonElement | undefined =>
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

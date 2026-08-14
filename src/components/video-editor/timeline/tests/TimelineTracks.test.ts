import { defineComponent } from 'vue';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ZoomElement } from '../../zoom/zoom-types';
import type { ClipComposition, MediaAsset, VisualClip } from '~/media/shared/composition-types';
import type { MediaError } from '~/media/shared/media-types';
import TimelineTracks from '../TimelineTracks.vue';
import { createDefaultCaptionStyle, createDefaultClipAppearance } from '~/media/shared/composition-defaults';

vi.mock('../composables/useCompositionAudioWaveforms', () => ({
  useCompositionAudioWaveforms: () => ({
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
  }),
}));

const TimelineClipStub = defineComponent({
  name: 'TimelineClip',
  props: {
    clip: { type: Object, required: true },
    selected: { type: Boolean, default: false },
    trimState: { type: Object, default: null },
    thumbnailSlots: { type: Array, default: () => [] },
    waveformBars: { type: Array, default: undefined },
    waveformLeftPercent: { type: Number, default: 0 },
    waveformWidthPercent: { type: Number, default: 100 },
    waveformStatus: { type: String, default: undefined },
    waveformError: { type: Object, default: undefined },
  },
  emits: ['select', 'move', 'trim'],
  template: `
    <button
      type="button"
      class="timeline-clip"
      :class="{ selected, disabled: !clip.enabled }"
      @click.stop="$emit('select')"
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
  transform: { x: 0, y: 0, width: 1, height: 1 },
  appearance: createDefaultClipAppearance('screen'),
  isMirrored: false,
  isMirroredY: false,
  ...overrides,
});

const composition = (): ClipComposition => ({
  schemaVersion: 2,
  assets: [
    asset('screen-asset', 'video'),
    asset('webcam-asset', 'video'),
    asset('image-asset', 'image'),
    asset('system-asset', 'audio'),
    asset('microphone-asset', 'audio'),
    asset('imported-asset', 'audio'),
  ],
  clips: [
    visual({ id: 'screen-clip', order: 2, groupId: 'linked', name: 'Main screen' }),
    visual({ id: 'webcam-clip', kind: 'webcam', order: 1, groupId: 'linked', assetId: 'webcam-asset', name: 'Camera' }),
    visual({ id: 'image-clip', kind: 'image', order: 0, assetId: 'image-asset', name: 'Poster', enabled: false }),
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
  ],
});

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
      zoomLevel: 120,
      exportProgress: {
        stage: 'encoding',
        completed: 25,
        total: 100,
        currentTimeMs: 2_500,
        totalTimeMs: 10_000,
      },
      zoomElements: [zoom()],
      selectedZoomId: 'zoom-1',
      composition: composition(),
      selectedClipId: 'screen-clip',
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

const pointerEvent = (type: string, clientX: number, clientY = 10) => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    clientX: { value: clientX },
    clientY: { value: clientY },
    target: { value: document.body },
  });
  return event;
};

beforeEach(() => {
  vi.clearAllMocks();
  globalThis.ResizeObserver = TestResizeObserver as unknown as typeof ResizeObserver;
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    callback(performance.now());
    return 1;
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
    expect(mounted!.findAll('.visual-track')).toHaveLength(3);
    expect(mounted!.find('.ruler-export-progress-bar').attributes('style')).toContain('25%');
    expect(mounted!.find('.cursor-zoom-indicator').text()).toContain('5.00×');
    expect(mounted!.findAll('.audio-track')).toHaveLength(3);
    expect(mounted!.findAll('.audio-track')[1]!.classes()).toContain('disabled');

    await mounted!.get('.ruler-ticks-area').trigger('pointerdown', { clientX: 620 });
    window.dispatchEvent(pointerEvent('pointermove', 720));
    window.dispatchEvent(pointerEvent('pointerup', 820));
    expect(mounted!.emitted('update:currentTime')).toBeTruthy();

    const tracksContainer = mounted!.get('.timeline-tracks-container').element;
    const emittedBeforeWheel = mounted!.emitted('update:zoomLevel')?.length ?? 0;
    tracksContainer.dispatchEvent(new WheelEvent('wheel', { ctrlKey: false, deltaY: -100, bubbles: true }));
    expect(mounted!.emitted('update:zoomLevel')?.length ?? 0).toBe(emittedBeforeWheel);
    tracksContainer.dispatchEvent(new WheelEvent('wheel', { ctrlKey: true, deltaY: -100, bubbles: true }));
    expect(mounted!.emitted('update:zoomLevel')).toContainEqual([145]);
    await mounted!.setProps({ zoomLevel: 3_190 });
    tracksContainer.dispatchEvent(new WheelEvent('wheel', { ctrlKey: true, deltaY: -100, bubbles: true }));
    expect(mounted!.emitted('update:zoomLevel')).toContainEqual([3_200]);
    await mounted!.get('.visual-track .track-info').trigger('click');
    expect(mounted!.emitted('toggle:clip')).toContainEqual(['image-clip']);
    await mounted!.get('.audio-track .track-info').trigger('click');
    expect(mounted!.emitted('toggle:clip')).toContainEqual(['system-audio']);
    await mounted!.findAll('.audio-track')[1]!.get('.track-info').trigger('click');
    expect(mounted!.emitted('toggle:clip')).toContainEqual(['microphone-audio']);

    const clip = mounted!.findAll('.visual-track .timeline-clip')[2]!;
    await clip.trigger('click');
    expect(mounted!.emitted('select:clip')).toContainEqual(['screen-clip']);
    await mounted!.get('.cursor-zoom-indicator:not(.preview-ghost)').trigger('click');
    expect(mounted!.emitted('select:zoom')).toContainEqual(['zoom-1']);
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

  it('reorders visual clips and cancels a reorder without changing the composition', async () => {
    const mounted = await mountTracks();
    const rows = mounted!.findAll('.visual-track');
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
    await mounted!.findAll('.audio-track')[1]!.get('.track-info').trigger('click');
  });
});

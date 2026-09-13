import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, nextTick, reactive, type Ref } from 'vue';
import TimelineClip from '../TimelineClip.vue';
import { createElementText } from '~/media/shared/element-text';
import type { Clip, ColorClip, MediaAsset, ShapeClip } from '~/media/shared/composition-types';
import type { MediaError } from '~/media/shared/media-types';

const thumbnailState = vi.hoisted(() => ({
  thumbnails: {} as Record<number, string>,
  thumbnailsRef: null as unknown as Ref<Record<number, string>>,
  requestVisibleFrames: vi.fn(),
}));

vi.mock('../waveform/useThumbnails', () => ({
  useThumbnails: () => ({
    thumbnails: thumbnailState.thumbnailsRef,
    requestVisibleFrames: thumbnailState.requestVisibleFrames,
  }),
}));

const Skeleton = { template: '<div class="skeleton-stub" />' };
const ShapeTimelinePreviewStub = {
  name: 'ShapeTimelinePreview',
  props: ['clip', 'canvas'],
  template: '<span class="shape-preview-stub" />',
};
const BlickWaveformCanvas = {
  name: 'BlickWaveformCanvas',
  props: ['bars', 'bands', 'leftPercent', 'widthPercent', 'sourceDurationSeconds', 'loadingSegments', 'deferDraw'],
  template: `
    <div class="blick-waveform">
      <canvas
        class="blick-waveform-canvas"
        :style="{ left: (leftPercent ?? 0) + '%', width: (widthPercent ?? 100) + '%' }"
      />
      <span
        v-for="(segment, index) in loadingSegments"
        :key="index"
        class="waveform-segment-loading"
        :style="{
          left: ((leftPercent ?? 0) + (segment.leftPercent * (widthPercent ?? 100)) / 100) + '%',
          width: ((segment.widthPercent * (widthPercent ?? 100)) / 100) + '%',
        }"
      />
    </div>
  `,
};

const asset = (kind: MediaAsset['kind'], src = `/media/${kind}`): MediaAsset => ({
  id: `${kind}-asset`,
  kind,
  name: kind,
  fileName: null,
  durationMs: 10_000,
  width: kind === 'audio' ? null : 1280,
  height: kind === 'audio' ? null : 720,
  src,
  origin: 'project',
});

const clip = (overrides: Partial<Clip> = {}): Clip =>
  ({
    id: 'clip-1',
    kind: 'video',
    name: 'A very long recording title',
    timelineStartMs: 1_000,
    timelineDurationMs: 2_000,
    sourceInMs: 0,
    sourceDurationMs: 2_000,
    playbackRate: 1.25,
    enabled: true,
    order: 0,
    assetId: 'video-asset',
    transform: { x: 0, y: 0, width: 1, height: 1 },
    ...overrides,
  }) as Clip;

const colorLayerClip = (fill: ColorClip['fill'] = { kind: 'color', color: '#111827' }): ColorClip =>
  ({
    ...clip(),
    id: 'color-clip',
    kind: 'color',
    name: 'Color board',
    timelineDurationMs: 3_000,
    sourceDurationMs: 3_000,
    assetId: '',
    fill,
  }) as ColorClip;

const shapeLayerClip = (overrides: Partial<ShapeClip> = {}): ShapeClip =>
  ({
    ...clip(),
    id: 'shape-clip',
    trackId: 'shape-track',
    kind: 'shape',
    name: 'Arrow',
    assetId: '',
    family: 'arrow',
    preset: 'arrow',
    fillColor: '#ff5a1f',
    borderColor: '#ffffff',
    borderWidth: 2,
    cornerRadius: 16,
    arrowThickness: 36,
    arrowHeadSize: 38,
    rotation: 180,
    opacityEnabled: true,
    opacity: 70,
    backdropBlur: 40,
    shadowEnabled: false,
    shadowColor: '#000000',
    shadowBlur: 20,
    shadowDirection: 'bottom-right',
    ...overrides,
  }) as ShapeClip;

const baseProps = {
  clip: clip(),
  asset: asset('video', '/video.mp4'),
  duration: 10,
  thumbnailSlots: [
    { timelineSeconds: 0, durationSeconds: 1 },
    { timelineSeconds: 1, durationSeconds: 1 },
    { timelineSeconds: 2, durationSeconds: 1 },
    { timelineSeconds: 3, durationSeconds: 1 },
  ],
  selected: true,
};

beforeEach(() => {
  thumbnailState.thumbnails = reactive<Record<number, string>>({ 0: '/thumb-0.png' });
  thumbnailState.thumbnailsRef = computed(() => thumbnailState.thumbnails);
  thumbnailState.requestVisibleFrames.mockClear();
  vi.useFakeTimers();
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    const callCount = (window.requestAnimationFrame as ReturnType<typeof vi.fn>).mock.calls.length;
    if (callCount === 1) callback(100);
    return 1;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('TimelineClip', () => {
  it('forwards canvas settings to the shape preview and labels text clips by content', async () => {
    const canvas = { width: 1_280, height: 720 };
    const textClip = shapeLayerClip({
      family: 'text',
      preset: 'text',
      text: createElementText('  Release notes  '),
    });
    const wrapper = mount(TimelineClip, {
      props: { ...baseProps, clip: textClip, asset: null, canvas },
      global: { stubs: { Skeleton, BlickWaveformCanvas, ShapeTimelinePreview: ShapeTimelinePreviewStub } },
    });

    expect(wrapper.get('.timeline-clip').classes()).toContain('kind-shape');
    expect(wrapper.findComponent(ShapeTimelinePreviewStub).props('clip')).toEqual(textClip);
    expect(wrapper.findComponent(ShapeTimelinePreviewStub).props('canvas')).toEqual(canvas);
    expect(wrapper.get('.clip-label-text').text()).toBe('Release notes');

    await wrapper.setProps({
      clip: shapeLayerClip({
        family: 'text',
        preset: 'text',
        name: 'Text fallback',
        text: createElementText('  \n '),
      }),
    });
    expect(wrapper.get('.clip-label-text').text()).toBe('Text fallback');
    wrapper.unmount();
  });

  it('keeps the disabled state stable while a video clip is toggled', async () => {
    const wrapper = mount(TimelineClip, {
      props: baseProps,
      global: { stubs: { Skeleton, BlickWaveformCanvas } },
    });

    expect(wrapper.get('.timeline-clip').classes()).not.toContain('disabled');
    await wrapper.setProps({ clip: clip({ enabled: false }) });
    expect(wrapper.get('.timeline-clip').classes()).toContain('disabled');
    await wrapper.setProps({ clip: clip({ enabled: true }) });
    expect(wrapper.get('.timeline-clip').classes()).not.toContain('disabled');
  });

  it('renders transition indicators proportional to each edge duration', () => {
    const wrapper = mount(TimelineClip, {
      props: {
        ...baseProps,
        clip: clip({
          timelineDurationMs: 1_000,
          transitions: {
            entry: { preset: { kind: 'fade' }, durationMs: 200 },
            exit: { preset: { kind: 'blur' }, durationMs: 300 },
          },
        }),
      },
      global: { stubs: { Skeleton, BlickWaveformCanvas } },
    });

    const entry = wrapper.get('.transition-zone.entry');
    const exit = wrapper.get('.transition-zone.exit');
    expect(wrapper.findAll('.transition-zone')).toHaveLength(2);
    expect(entry.attributes('aria-hidden')).toBe('true');
    expect(exit.attributes('aria-hidden')).toBe('true');
    expect(entry.attributes('style')).toContain('width: 20%');
    expect(exit.attributes('style')).toContain('width: 30%');
  });

  it('renders distinct easing curves for each edge and updates the path when easing power changes', async () => {
    const wrapper = mount(TimelineClip, {
      props: {
        ...baseProps,
        clip: clip({
          timelineDurationMs: 1_000,
          transitions: {
            entry: { preset: { kind: 'fade' }, durationMs: 200, easingPower: 1 },
            exit: { preset: { kind: 'fade' }, durationMs: 300, easingPower: 5 },
          },
        }),
      },
      global: { stubs: { Skeleton, BlickWaveformCanvas } },
    });

    const entryPath = wrapper.get('.transition-zone.entry svg.timeline-transition-curve path.curve-line');
    const exitPath = wrapper.get('.transition-zone.exit svg.timeline-transition-curve path.curve-line');
    const hatchedArea = wrapper.get('.transition-zone.entry svg.timeline-transition-curve path.curve-hatched-area');
    const entryD = entryPath.attributes('d');
    const exitD = exitPath.attributes('d');
    expect(entryD).toBeTruthy();
    expect(exitD).toBeTruthy();
    expect(hatchedArea.attributes('d')).toBeTruthy();
    expect(hatchedArea.attributes('fill')).toContain('transition-hatch-');
    expect(entryD).not.toBe(exitD);

    await wrapper.setProps({
      clip: clip({
        timelineDurationMs: 1_000,
        transitions: {
          entry: { preset: { kind: 'fade' }, durationMs: 200, easingPower: 5 },
          exit: { preset: { kind: 'fade' }, durationMs: 300, easingPower: 5 },
        },
      }),
    });
    expect(entryPath.attributes('d')).not.toBe(entryD);
  });

  it('marks a newly pasted clip with the arrival highlight and clears it when the prop is removed', async () => {
    const wrapper = mount(TimelineClip, {
      props: { ...baseProps, pasteHighlight: true },
      global: { stubs: { Skeleton, BlickWaveformCanvas } },
    });

    expect(wrapper.get('.timeline-clip').attributes('data-paste-highlight')).toBe('true');

    await wrapper.setProps({ pasteHighlight: false });
    expect(wrapper.get('.timeline-clip').attributes('data-paste-highlight')).toBeUndefined();
  });

  it('renders video frames, speed and trim state, then emits clip interactions', async () => {
    const wrapper = mount(TimelineClip, {
      attachTo: document.body,
      props: { ...baseProps, trimState: { edge: 'start', durationMs: 1_250 } },
      global: { stubs: { Skeleton, BlickWaveformCanvas } },
    });

    expect(wrapper.get('.timeline-clip').classes()).toEqual(expect.arrayContaining(['selected', 'kind-video']));
    expect(wrapper.get('.timeline-clip').attributes('style')).toContain('left: 0px');
    expect(wrapper.get('.timeline-clip').attributes('style')).toContain('transform: translate3d(50%, 0, 0)');
    expect(wrapper.get('.timeline-clip').attributes('style')).toContain('width: 20%');
    expect(wrapper.get('.speed-badge').text()).toBe('1.25×');
    expect(wrapper.get('.trim-side-badge').text()).toBe('01.2s');
    expect(wrapper.findAll('.thumbnail-frame')).toHaveLength(2);
    expect(wrapper.findAll('.thumbnail-img')).toHaveLength(2);
    expect(wrapper.findAll('.thumbnail-img')[0]?.attributes('src')).toBe('/thumb-0.png');
    expect(wrapper.findAll('.thumbnail-img')[1]?.attributes('src')).toBe('/thumb-0.png');
    expect(wrapper.findAll('.thumbnail-loading-overlay')).toHaveLength(1);
    expect(wrapper.find('.skeleton-stub').exists()).toBe(false);
    expect(thumbnailState.requestVisibleFrames).toHaveBeenCalledWith([0, 1.25]);
    expect(wrapper.findAll('.thumbnail-frame')[0]?.attributes('style')).toContain('width: 50%');
    expect(wrapper.findAll('.thumbnail-frame')[1]?.attributes('style')).toContain('width: 50%');

    await wrapper.get('.timeline-clip').trigger('click');
    await wrapper.get('.timeline-clip').trigger('pointerdown');
    await wrapper.get('.trim-handle.end').trigger('pointerdown');
    expect(wrapper.emitted('select')).toHaveLength(1);
    expect(wrapper.emitted('move')).toHaveLength(1);
    expect(wrapper.emitted('trim')?.[0]?.[0]).toEqual(expect.objectContaining({ edge: 'end' }));
  });

  it('renders at-limit red styling when trimming reaches the source limit', async () => {
    const wrapper = mount(TimelineClip, {
      attachTo: document.body,
      props: { ...baseProps, trimState: { edge: 'end', durationMs: 2_000, atLimit: true } },
      global: { stubs: { Skeleton, BlickWaveformCanvas } },
    });
    expect(wrapper.get('.timeline-clip').classes()).toContain('trim-at-limit');
    expect(wrapper.get('.trim-handle.end').classes()).toContain('at-limit');
    expect(wrapper.get('.trim-side-badge').classes()).toContain('at-limit');
  });

  it('renders solid and radial color layers without media thumbnails', async () => {
    const wrapper = mount(TimelineClip, {
      props: {
        ...baseProps,
        clip: colorLayerClip(),
        asset: null,
        thumbnailSlots: [],
      },
      global: { stubs: { Skeleton, BlickWaveformCanvas } },
    });

    expect(wrapper.get('.timeline-clip').classes()).toEqual(expect.arrayContaining(['kind-color', 'selected']));
    expect(wrapper.find('.color-preview').attributes('style')).toContain('background: rgb(17, 24, 39)');
    expect(wrapper.findAll('.thumbnail-frame')).toHaveLength(0);
    expect(wrapper.find('.waveform').exists()).toBe(false);

    await wrapper.setProps({
      clip: colorLayerClip({
        kind: 'gradient',
        gradient: {
          type: 'radial',
          angle: 0,
          stops: [
            { id: 'inner', position: 0, color: '#000000', alpha: 1 },
            { id: 'outer', position: 1, color: '#ffffff', alpha: 0.5 },
          ],
        },
      }),
    });

    expect(wrapper.find('.color-preview').attributes('style')).toContain('radial-gradient(circle');
    wrapper.unmount();
  });

  it('requests only frames in the virtualized viewport and refreshes after a zoom-derived range changes', async () => {
    const wrapper = mount(TimelineClip, {
      props: { ...baseProps },
      global: { stubs: { Skeleton, BlickWaveformCanvas } },
    });
    expect(thumbnailState.requestVisibleFrames).toHaveBeenCalledWith([0, 1.25]);

    thumbnailState.requestVisibleFrames.mockClear();
    await wrapper.setProps({
      thumbnailSlots: [
        { timelineSeconds: 2, durationSeconds: 1 },
        { timelineSeconds: 3, durationSeconds: 1 },
      ],
    });

    expect(thumbnailState.requestVisibleFrames).toHaveBeenCalledWith([1.25]);
  });

  it('refreshes visible frames after asset identity and clip timeline geometry changes', async () => {
    const wrapper = mount(TimelineClip, {
      props: { ...baseProps },
      global: { stubs: { Skeleton, BlickWaveformCanvas } },
    });

    thumbnailState.requestVisibleFrames.mockClear();
    await wrapper.setProps({ asset: { ...asset('video', '/video.mp4'), id: 'video-asset-replaced' } });
    expect(thumbnailState.requestVisibleFrames).toHaveBeenCalledWith([0, 1.25]);

    thumbnailState.requestVisibleFrames.mockClear();
    await wrapper.setProps({ clip: clip({ timelineStartMs: 2_000 }) });
    expect(thumbnailState.requestVisibleFrames).toHaveBeenCalledWith([0, 1.25]);

    thumbnailState.requestVisibleFrames.mockClear();
    await wrapper.setProps({ clip: clip({ timelineStartMs: 2_000, timelineDurationMs: 1_000 }) });
    expect(thumbnailState.requestVisibleFrames).toHaveBeenCalledWith([0]);
    expect(wrapper.findAll('.thumbnail-frame')).toHaveLength(1);
  });

  it('keeps the nearest cached thumbnail under a dark loading overlay, then crossfades to the exact source', async () => {
    thumbnailState.thumbnails[1] = '/thumb-nearest.png';
    thumbnailState.thumbnails[2] = '/thumb-farther.png';
    const wrapper = mount(TimelineClip, {
      props: {
        ...baseProps,
        clip: clip({
          timelineStartMs: 0,
          timelineDurationMs: 1_000,
          sourceInMs: 1_250,
          sourceDurationMs: 1_000,
        }),
        thumbnailSlots: [{ timelineSeconds: 0, durationSeconds: 1 }],
      },
      global: {
        stubs: {
          Transition: { template: '<div class="thumbnail-crossfade"><slot /></div>' },
        },
      },
    });

    expect(thumbnailState.requestVisibleFrames).toHaveBeenCalledWith([1.25]);
    expect(wrapper.find('.thumbnail-img').attributes('src')).toBe('/thumb-nearest.png');
    const overlay = wrapper.find('.thumbnail-loading-overlay');
    expect(overlay.exists()).toBe(true);
    expect(getComputedStyle(overlay.element).backgroundColor).toMatch(/^rgba\(0, 0, 0,/);
    expect(wrapper.find('.skeleton').exists()).toBe(false);
    thumbnailState.thumbnails[1.25] = '/thumb-exact.png';
    await nextTick();

    expect(wrapper.find('.thumbnail-img').attributes('src')).toBe('/thumb-exact.png');
    expect(wrapper.find('.thumbnail-loading-overlay').exists()).toBe(false);
    wrapper.unmount();
  });

  it('renders a loading slot without an image when no cached thumbnail can be selected', () => {
    thumbnailState.thumbnails = reactive<Record<number, string>>({});
    thumbnailState.thumbnailsRef = computed(() => thumbnailState.thumbnails);
    const wrapper = mount(TimelineClip, {
      props: { ...baseProps },
      global: { stubs: { Skeleton, BlickWaveformCanvas } },
    });

    expect(wrapper.find('.thumbnail-img').exists()).toBe(false);
    expect(wrapper.find('.thumbnail-loading-overlay').exists()).toBe(true);
  });

  it('restarts deferred thumbnail requests when the clip is no longer moving', async () => {
    const wrapper = mount(TimelineClip, {
      props: { ...baseProps, deferThumbnailRequests: true },
      global: { stubs: { Skeleton, BlickWaveformCanvas } },
    });
    expect(thumbnailState.requestVisibleFrames).not.toHaveBeenCalled();

    await wrapper.setProps({ deferThumbnailRequests: false });

    expect(thumbnailState.requestVisibleFrames).toHaveBeenCalledWith([0, 1.25]);
  });

  it('uses translate3d positioning when the timeline width is provided', () => {
    const wrapper = mount(TimelineClip, {
      props: { ...baseProps, timelineWidthPx: 2_000 },
      global: { stubs: { Skeleton, BlickWaveformCanvas } },
    });

    const style = wrapper.get('.timeline-clip').attributes('style') ?? '';
    expect(style).toMatch(/transform:\s*translate3d\(200px,\s*0(?:px)?,\s*0(?:px)?\)/);
    expect(style).toMatch(/(?:^|;)\s*left:\s*0px/);
    expect(style).not.toMatch(/left:\s*10%/);
  });

  it('renders audio waveforms, a dark loading state, and an explicit unavailable error', async () => {
    const waveformBars = [4, 10];
    const waveformBands = new Float32Array(waveformBars.length * 4);
    const waveformLoadingSegments = [{ leftPercent: 25, widthPercent: 10 }];
    const audio = mount(TimelineClip, {
      props: {
        ...baseProps,
        clip: clip({
          kind: 'audio',
          assetId: 'audio-asset',
          name: 'Audio',
          playbackRate: 1,
          enabled: false,
        }),
        asset: asset('audio'),
        waveformBars,
        waveformBands,
        waveformSourceDurationSeconds: 2.5,
        waveformStatus: 'ready',
        waveformLeftPercent: 20,
        waveformWidthPercent: 60,
        waveformLoadingSegments,
        deferWaveformDraw: true,
        selected: false,
      },
      global: { stubs: { Skeleton, BlickWaveformCanvas } },
    });
    expect(audio.get('.timeline-clip').classes()).toEqual(expect.arrayContaining(['kind-audio', 'disabled']));
    const waveform = audio.findComponent(BlickWaveformCanvas);
    expect(waveform.exists()).toBe(true);
    expect(waveform.props()).toMatchObject({
      bars: waveformBars,
      bands: waveformBands,
      sourceDurationSeconds: 2.5,
      loadingSegments: waveformLoadingSegments,
      deferDraw: true,
    });
    expect(waveform.props('leftPercent')).toBe(20);
    expect(waveform.props('widthPercent')).toBe(60);
    expect(audio.get('.waveform-slice').attributes('style')).toBeUndefined();
    expect(audio.find('.waveform-slice > .blick-waveform').exists()).toBe(true);
    expect(thumbnailState.requestVisibleFrames).toHaveBeenCalledWith([]);

    await audio.setProps({ deferWaveformDraw: false, waveformSourceDurationSeconds: 2.75 });
    expect(waveform.props('deferDraw')).toBe(false);
    expect(waveform.props('sourceDurationSeconds')).toBe(2.75);

    const loading = mount(TimelineClip, {
      props: {
        ...baseProps,
        clip: clip({ kind: 'audio', assetId: 'audio-asset' }),
        asset: asset('audio'),
        waveformStatus: 'loading',
      },
      global: { stubs: { Skeleton, BlickWaveformCanvas } },
    });
    expect(loading.find('.waveform-loading').exists()).toBe(true);
    expect(loading.find('.skeleton-stub').exists()).toBe(false);
    expect(loading.find('.waveform-unavailable').exists()).toBe(false);

    const error: MediaError = {
      kind: 'decode-failure',
      sourceId: 'audio-asset',
      message: 'The waveform could not be decoded.',
    };
    const unavailable = mount(TimelineClip, {
      props: {
        ...baseProps,
        clip: clip({ kind: 'audio', assetId: 'audio-asset' }),
        asset: asset('audio'),
        waveformStatus: 'error',
        waveformError: error,
      },
      global: { stubs: { Skeleton, BlickWaveformCanvas } },
    });
    expect(unavailable.find('.waveform-unavailable').exists()).toBe(true);
    expect(unavailable.find('.waveform-unavailable').attributes('title')).toBe(error.message);
    expect(unavailable.find('.waveform-loading').exists()).toBe(false);

    const image = mount(TimelineClip, {
      props: {
        ...baseProps,
        clip: clip({ kind: 'image', assetId: 'image-asset' }),
        asset: asset('image', '/poster.png'),
      },
      global: { stubs: { Skeleton, BlickWaveformCanvas } },
    });
    const imagePreview = image.get('.image-preview');
    expect(imagePreview.attributes('style')).toContain('background-image: url("/poster.png")');
    audio.unmount();
    loading.unmount();
    unavailable.unmount();
    image.unmount();
  });

  it('renders only pending waveform segments as localized dark overlays while refined bars arrive', async () => {
    const waveformBars = [10, 20, 30, 40, 50, 60];
    const waveformBands = new Float32Array(waveformBars.length * 4);
    const loadingSegments = [
      { leftPercent: 0, widthPercent: 33.333 },
      { leftPercent: 66.667, widthPercent: 33.333 },
    ];
    const audio = mount(TimelineClip, {
      props: {
        ...baseProps,
        clip: clip({ kind: 'audio', assetId: 'audio-asset', name: 'Segmented audio' }),
        asset: asset('audio'),
        waveformBars,
        waveformBands,
        waveformSourceDurationSeconds: 3,
        waveformStatus: 'loading',
        waveformLeftPercent: 0,
        waveformWidthPercent: 100,
        waveformLoadingSegments: loadingSegments,
        deferWaveformDraw: true,
      },
      global: { stubs: { Skeleton, BlickWaveformCanvas } },
    });

    const waveform = audio.findComponent(BlickWaveformCanvas);
    expect(waveform.props()).toMatchObject({
      bars: waveformBars,
      bands: waveformBands,
      sourceDurationSeconds: 3,
      loadingSegments,
      deferDraw: true,
    });
    const pending = audio.findAll('.waveform-segment-loading');
    expect(pending).toHaveLength(2);
    expect(pending[0]?.attributes('style')).toContain('left: 0%');
    expect(pending[0]?.attributes('style')).toContain('width: 33.333%');
    expect(pending[1]?.attributes('style')).toContain('left: 66.667%');
    expect(pending[1]?.attributes('style')).toContain('width: 33.333%');
    expect(getComputedStyle(pending[0]!.element).backgroundColor).toMatch(/^rgba\(0, 0, 0,/);
    expect(audio.find('.waveform-loading').exists()).toBe(false);
    expect(audio.find('.skeleton-stub').exists()).toBe(false);

    await audio.setProps({ waveformLoadingSegments: [] });
    expect(audio.findAll('.waveform-segment-loading')).toHaveLength(0);
    expect(waveform.props('loadingSegments')).toEqual([]);
    expect(waveform.exists()).toBe(true);
    audio.unmount();
  });

  it('marquees an overflowing label and stops it on leave and unmount', async () => {
    const wrapper = mount(TimelineClip, {
      props: baseProps,
      global: { stubs: { Skeleton, BlickWaveformCanvas } },
    });
    const label = wrapper.get('.clip-label-text').element as HTMLElement;
    Object.defineProperty(label, 'scrollWidth', {
      configurable: true,
      value: 200,
    });
    Object.defineProperty(label, 'clientWidth', {
      configurable: true,
      value: 80,
    });

    await wrapper.get('.timeline-clip').trigger('pointerenter');
    vi.advanceTimersByTime(300);
    expect(window.requestAnimationFrame).toHaveBeenCalled();
    expect(label.style.transform).toContain('translateX');

    await wrapper.get('.timeline-clip').trigger('pointerleave');
    expect(label.style.transform).toBe('');
    wrapper.unmount();
    expect(window.cancelAnimationFrame).toHaveBeenCalled();
  });
});

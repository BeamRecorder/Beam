import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick, reactive } from 'vue';
import TimelineClip from '../TimelineClip.vue';
import type { Clip, MediaAsset } from '~/media/shared/composition-types';
import type { MediaError } from '~/media/shared/media-types';

const thumbnailState = vi.hoisted(() => ({
  thumbnails: {} as Record<number, string>,
  requestVisibleFrames: vi.fn(),
}));

vi.mock('../waveform/useThumbnails', () => ({
  useThumbnails: () => thumbnailState,
}));

const Skeleton = { template: '<div class="skeleton-stub" />' };
const WaveformCanvas = { name: 'WaveformCanvas', template: '<canvas class="waveform-canvas" />' };

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
  it('keeps the disabled state stable while a video clip is toggled', async () => {
    const wrapper = mount(TimelineClip, {
      props: baseProps,
      global: { stubs: { Skeleton, WaveformCanvas } },
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
      global: { stubs: { Skeleton, WaveformCanvas } },
    });

    const entry = wrapper.get('.transition-zone.entry');
    const exit = wrapper.get('.transition-zone.exit');
    expect(entry.attributes('aria-hidden')).toBe('true');
    expect(exit.attributes('aria-hidden')).toBe('true');
    expect(entry.attributes('style')).toContain('width: 20%');
    expect(exit.attributes('style')).toContain('width: 30%');
  });

  it('marks a newly pasted clip with the arrival highlight and clears it when the prop is removed', async () => {
    const wrapper = mount(TimelineClip, {
      props: { ...baseProps, pasteHighlight: true },
      global: { stubs: { Skeleton, WaveformCanvas } },
    });

    expect(wrapper.get('.timeline-clip').attributes('data-paste-highlight')).toBe('true');

    await wrapper.setProps({ pasteHighlight: false });
    expect(wrapper.get('.timeline-clip').attributes('data-paste-highlight')).toBeUndefined();
  });

  it('renders video frames, speed and trim state, then emits clip interactions', async () => {
    const wrapper = mount(TimelineClip, {
      attachTo: document.body,
      props: { ...baseProps, trimState: { edge: 'start', durationMs: 1_250 } },
      global: { stubs: { Skeleton, WaveformCanvas } },
    });

    expect(wrapper.get('.timeline-clip').classes()).toEqual(expect.arrayContaining(['selected', 'kind-video']));
    expect(wrapper.get('.timeline-clip').attributes('style')).toContain('left: 10%');
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
      global: { stubs: { Skeleton, WaveformCanvas } },
    });
    expect(wrapper.get('.timeline-clip').classes()).toContain('trim-at-limit');
    expect(wrapper.get('.trim-handle.end').classes()).toContain('at-limit');
    expect(wrapper.get('.trim-side-badge').classes()).toContain('at-limit');
  });

  it('requests only frames in the virtualized viewport and refreshes after a zoom-derived range changes', async () => {
    const wrapper = mount(TimelineClip, {
      props: { ...baseProps },
      global: { stubs: { Skeleton, WaveformCanvas } },
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

  it('keeps the nearest cached thumbnail under a dark loading overlay, then crossfades to the exact source', async () => {
    thumbnailState.thumbnails[1] = '/thumb-nearest.png';
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

  it('restarts deferred thumbnail requests when the clip is no longer moving', async () => {
    const wrapper = mount(TimelineClip, {
      props: { ...baseProps, deferThumbnailRequests: true },
      global: { stubs: { Skeleton, WaveformCanvas } },
    });
    expect(thumbnailState.requestVisibleFrames).not.toHaveBeenCalled();

    await wrapper.setProps({ deferThumbnailRequests: false });

    expect(thumbnailState.requestVisibleFrames).toHaveBeenCalledWith([0, 1.25]);
  });

  it('renders audio waveforms, a dark loading state, and an explicit unavailable error', async () => {
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
        waveformBars: [4, 10],
        waveformStatus: 'ready',
        waveformLeftPercent: 20,
        waveformWidthPercent: 60,
        selected: false,
      },
      global: { stubs: { Skeleton, WaveformCanvas } },
    });
    expect(audio.get('.timeline-clip').classes()).toEqual(expect.arrayContaining(['kind-audio', 'disabled']));
    expect(audio.findAll('.waveform-slice > .waveform-canvas')).toHaveLength(1);
    expect(audio.get('.waveform-slice').attributes('style')).toContain('left: 20%');
    expect(audio.get('.waveform-slice').attributes('style')).toContain('width: 60%');
    expect(thumbnailState.requestVisibleFrames).toHaveBeenCalledWith([]);

    const loading = mount(TimelineClip, {
      props: {
        ...baseProps,
        clip: clip({ kind: 'audio', assetId: 'audio-asset' }),
        asset: asset('audio'),
        waveformStatus: 'loading',
      },
      global: { stubs: { Skeleton, WaveformCanvas } },
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
      global: { stubs: { Skeleton, WaveformCanvas } },
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
      global: { stubs: { Skeleton, WaveformCanvas } },
    });
    expect(image.get('.image-preview').attributes('src')).toBe('/poster.png');
    audio.unmount();
    loading.unmount();
    unavailable.unmount();
    image.unmount();
  });

  it('renders only pending waveform segments as localized dark overlays while refined bars arrive', async () => {
    const audio = mount(TimelineClip, {
      props: {
        ...baseProps,
        clip: clip({ kind: 'audio', assetId: 'audio-asset', name: 'Segmented audio' }),
        asset: asset('audio'),
        waveformBars: [10, 20, 30, 40, 50, 60],
        waveformStatus: 'loading',
        waveformLeftPercent: 0,
        waveformWidthPercent: 100,
        waveformLoadingSegments: [
          { leftPercent: 0, widthPercent: 33.333 },
          { leftPercent: 66.667, widthPercent: 33.333 },
        ],
      },
      global: { stubs: { Skeleton, WaveformCanvas } },
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
    expect(audio.findAll('.waveform-slice > .waveform-canvas')).toHaveLength(1);
    audio.unmount();
  });

  it('marquees an overflowing label and stops it on leave and unmount', async () => {
    const wrapper = mount(TimelineClip, {
      props: baseProps,
      global: { stubs: { Skeleton, WaveformCanvas } },
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

import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TimelineClip from '../TimelineClip.vue';
import type { Clip, MediaAsset } from '~/media/shared/composition-types';

const thumbnailState = vi.hoisted(() => ({
  thumbnails: { 0: '/thumb-0.png' } as Record<number, string>,
  requestVisibleFrames: vi.fn(),
}));

vi.mock('../waveform/useThumbnails', () => ({
  useThumbnails: () => thumbnailState,
}));

const Skeleton = { template: '<div class="skeleton-stub" />' };

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
  it('renders video frames, speed and trim state, then emits clip interactions', async () => {
    const wrapper = mount(TimelineClip, {
      attachTo: document.body,
      props: { ...baseProps, trimState: { edge: 'start', durationMs: 1_250 } },
      global: { stubs: { Skeleton } },
    });

    expect(wrapper.get('.timeline-clip').classes()).toEqual(expect.arrayContaining(['selected', 'kind-video']));
    expect(wrapper.get('.timeline-clip').attributes('style')).toContain('left: 10%');
    expect(wrapper.get('.timeline-clip').attributes('style')).toContain('width: 20%');
    expect(wrapper.get('.speed-badge').text()).toBe('1.25×');
    expect(wrapper.get('.trim-side-badge').text()).toBe('01.2s');
    expect(wrapper.findAll('.thumbnail-frame')).toHaveLength(2);
    expect(wrapper.find('.thumbnail-img').attributes('src')).toBe('/thumb-0.png');
    expect(wrapper.find('.skeleton-stub').exists()).toBe(true);
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

  it('requests only frames in the virtualized viewport and refreshes after a zoom-derived range changes', async () => {
    const wrapper = mount(TimelineClip, {
      props: { ...baseProps },
      global: { stubs: { Skeleton } },
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

  it('restarts deferred thumbnail requests when the clip is no longer moving', async () => {
    const wrapper = mount(TimelineClip, {
      props: { ...baseProps, deferThumbnailRequests: true },
      global: { stubs: { Skeleton } },
    });
    expect(thumbnailState.requestVisibleFrames).not.toHaveBeenCalled();

    await wrapper.setProps({ deferThumbnailRequests: false });

    expect(thumbnailState.requestVisibleFrames).toHaveBeenCalledWith([0, 1.25]);
  });

  it('renders audio waveforms, image previews and unavailable waveform labels', async () => {
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
        selected: false,
      },
      global: { stubs: { Skeleton } },
    });
    expect(audio.get('.timeline-clip').classes()).toEqual(expect.arrayContaining(['kind-audio', 'disabled']));
    expect(audio.findAll('.waveform > span')).toHaveLength(2);
    expect(thumbnailState.requestVisibleFrames).toHaveBeenCalledWith([]);

    const unavailable = mount(TimelineClip, {
      props: {
        ...baseProps,
        clip: clip({ kind: 'audio', assetId: 'audio-asset' }),
        asset: asset('audio'),
        waveformBars: [],
      },
      global: { stubs: { Skeleton } },
    });
    expect(unavailable.find('.waveform-unavailable').exists()).toBe(true);

    const image = mount(TimelineClip, {
      props: {
        ...baseProps,
        clip: clip({ kind: 'image', assetId: 'image-asset' }),
        asset: asset('image', '/poster.png'),
      },
      global: { stubs: { Skeleton } },
    });
    expect(image.get('.image-preview').attributes('src')).toBe('/poster.png');
    audio.unmount();
    unavailable.unmount();
    image.unmount();
  });

  it('marquees an overflowing label and stops it on leave and unmount', async () => {
    const wrapper = mount(TimelineClip, {
      props: baseProps,
      global: { stubs: { Skeleton } },
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

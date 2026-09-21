import { ref } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { i18n } from '~/i18n';
import { createDefaultClipAppearance } from '~/media/shared/composition-defaults';
import type { AudioClip, MediaAsset, VisualClip } from '~/media/shared/composition-types';
import LinkedClipPreviewPlayer from '../LinkedClipPreviewPlayer.vue';

const waveformState = {
  bars: ref<number[]>([]),
  bands: ref(new Float32Array(0)),
  loadingSegments: ref<{ leftPercent: number; widthPercent: number }[]>([]),
  sourceDurationSeconds: ref(2),
  status: ref<'idle' | 'loading' | 'ready' | 'error'>('idle'),
};

vi.mock('../useLinkedClipPreviewWaveform', () => ({ useLinkedClipPreviewWaveform: () => waveformState }));

const videoClip: VisualClip = {
  id: 'video-clip',
  kind: 'video',
  name: 'Interview',
  assetId: 'video-asset',
  timelineStartMs: 0,
  timelineDurationMs: 4_000,
  sourceInMs: 2_000,
  sourceDurationMs: 4_000,
  playbackRate: 1.5,
  enabled: true,
  order: 0,
  transform: { x: 0, y: 0, width: 1, height: 1 },
  appearance: createDefaultClipAppearance('video'),
  isMirrored: false,
  isMirroredY: false,
};

const audioClip: AudioClip = {
  id: 'audio-clip',
  kind: 'audio',
  name: 'Interview audio',
  assetId: 'video-asset',
  role: 'imported',
  timelineStartMs: 0,
  timelineDurationMs: 2_000,
  sourceInMs: 4_000,
  sourceDurationMs: 2_000,
  playbackRate: 1,
  enabled: true,
  order: 1,
  volume: 100,
};

const longAudioClip: AudioClip = {
  ...audioClip,
  id: 'long-audio-clip',
  name: 'Long interview audio',
  timelineDurationMs: 30_000,
  sourceDurationMs: 30_000,
};

const videoAsset: MediaAsset = {
  id: 'video-asset',
  kind: 'video',
  name: 'Interview source',
  fileName: 'interview.webm',
  durationMs: 20_000,
  width: 1_920,
  height: 1_080,
  src: 'project-media://asset/interview.webm',
  origin: 'project',
};

const imageAsset: MediaAsset = {
  ...videoAsset,
  id: 'image-asset',
  kind: 'image',
  fileName: 'poster.png',
  src: 'project-media://asset/poster.png',
};

const mountPlayer = (clip: VisualClip | AudioClip, asset?: MediaAsset) =>
  mount(LinkedClipPreviewPlayer, {
    props: { clip, asset },
    global: {
      plugins: [i18n],
      stubs: { BlickWaveformCanvas: { name: 'BlickWaveformCanvas', template: '<div />' } },
    },
  });

const mockMedia = (media: HTMLMediaElement) => {
  let currentTime = 0;
  let playbackRate = 1;
  let muted = true;
  let volume = 0;
  Object.defineProperties(media, {
    currentTime: {
      configurable: true,
      get: () => currentTime,
      set: (value: number) => {
        currentTime = value;
      },
    },
    playbackRate: {
      configurable: true,
      get: () => playbackRate,
      set: (value: number) => {
        playbackRate = value;
      },
    },
    muted: {
      configurable: true,
      get: () => muted,
      set: (value: boolean) => {
        muted = value;
      },
    },
    volume: {
      configurable: true,
      get: () => volume,
      set: (value: number) => {
        volume = value;
      },
    },
    duration: { configurable: true, value: 20 },
  });
  const play = vi.fn().mockResolvedValue(undefined);
  const pause = vi.fn();
  Object.defineProperties(media, {
    play: { configurable: true, value: play },
    pause: { configurable: true, value: pause },
  });
  return { play, pause };
};

describe('LinkedClipPreviewPlayer', () => {
  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    waveformState.bars.value = [];
    waveformState.bands.value = new Float32Array(0);
    waveformState.loadingSegments.value = [];
    waveformState.sourceDurationSeconds.value = 2;
    waveformState.status.value = 'idle';
  });

  afterEach(() => vi.restoreAllMocks());

  it('keeps playback disabled until metadata loads, then applies the clip trim and rate', async () => {
    const wrapper = mountPlayer(videoClip, videoAsset);
    const video = wrapper.get<HTMLVideoElement>('.linked-preview-video').element;
    mockMedia(video);

    expect(wrapper.get<HTMLButtonElement>('.preview-play-button').element.disabled).toBe(true);
    expect(wrapper.get<HTMLInputElement>('.preview-progress input').element.disabled).toBe(true);

    await wrapper.get('.linked-preview-video').trigger('loadedmetadata');

    expect(video.currentTime).toBe(2);
    expect(video.playbackRate).toBe(1.5);
    expect(video.muted).toBe(false);
    expect(video.volume).toBe(1);
    expect(wrapper.get<HTMLButtonElement>('.preview-play-button').element.disabled).toBe(false);
    expect(wrapper.get<HTMLInputElement>('.preview-progress input').element.disabled).toBe(false);
  });

  it('plays an audio clip backed by a video asset with sound, only after the user clicks play', async () => {
    const wrapper = mountPlayer(audioClip, videoAsset);
    expect(wrapper.find('.linked-preview-video').exists()).toBe(false);
    const audio = wrapper.get<HTMLAudioElement>('.linked-preview-audio').element;
    const { play } = mockMedia(audio);
    expect(audio.getAttribute('src')).toBe(videoAsset.src);
    expect(play).not.toHaveBeenCalled();

    await wrapper.get('.linked-preview-audio').trigger('loadedmetadata');
    await wrapper.get('.preview-play-button').trigger('click');

    expect(play).toHaveBeenCalledOnce();
    expect(audio.muted).toBe(false);
    expect(audio.currentTime).toBe(4);
  });

  it('seeks relative to the clip range and stops at the trimmed end', async () => {
    const wrapper = mountPlayer(audioClip, videoAsset);
    const audio = wrapper.get<HTMLAudioElement>('.linked-preview-audio').element;
    const { pause } = mockMedia(audio);
    await wrapper.get('.linked-preview-audio').trigger('loadedmetadata');

    await wrapper.get('.preview-progress input').setValue('1.2');
    expect(audio.currentTime).toBeCloseTo(5.2);

    audio.currentTime = 6;
    await wrapper.get('.linked-preview-audio').trigger('timeupdate');
    expect(pause).toHaveBeenCalledOnce();
    expect(audio.currentTime).toBe(4);
    expect(wrapper.get('.preview-time').text()).toBe('0:00 / 0:02');
  });

  it('shows the actual Blick waveform twice and advances the played layer with media time', async () => {
    waveformState.bars.value = [12, 28, 18];
    waveformState.bands.value = new Float32Array(12).fill(0.5);
    waveformState.status.value = 'ready';
    const wrapper = mountPlayer(audioClip, videoAsset);
    const audio = wrapper.get<HTMLAudioElement>('.linked-preview-audio').element;
    mockMedia(audio);

    expect(wrapper.findAll('.waveform-layer')).toHaveLength(2);
    expect(wrapper.get('.waveform-played').attributes('style')).toContain('inset(0 100% 0 0)');
    await wrapper.get('.linked-preview-audio').trigger('loadedmetadata');
    audio.currentTime = 5;
    await wrapper.get('.linked-preview-audio').trigger('timeupdate');

    expect(wrapper.get('.waveform-progress-fill').attributes('style')).toContain('width: 50%');
    expect(wrapper.get('.waveform-played').attributes('style')).toContain('inset(0 50% 0 0)');
    expect(wrapper.get('.waveform-playhead').attributes('style')).toContain('left: 50%');
    expect(wrapper.get('.preview-time').text()).toBe('0:01 / 0:02');
  });

  it('seeks the same trimmed audio source by clicking the waveform without starting playback', async () => {
    const wrapper = mountPlayer(audioClip, videoAsset);
    const audio = wrapper.get<HTMLAudioElement>('.linked-preview-audio').element;
    const { play } = mockMedia(audio);
    await wrapper.get('.linked-preview-audio').trigger('loadedmetadata');
    const surface = wrapper.get<HTMLElement>('.audio-waveform-surface');
    vi.spyOn(surface.element, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      width: 200,
    } as DOMRect);

    await surface.trigger('pointerdown', { clientX: 250 });

    expect(audio.currentTime).toBeCloseTo(5.5);
    expect(wrapper.get('.waveform-playhead').attributes('style')).toContain('left: 75%');
    expect(play).not.toHaveBeenCalled();
  });

  it('zooms long waveforms to a twenty-second viewport and scrolls with playback', async () => {
    waveformState.bars.value = [12, 28, 18];
    waveformState.bands.value = new Float32Array(12).fill(0.5);
    waveformState.sourceDurationSeconds.value = 30;
    waveformState.status.value = 'ready';
    const wrapper = mountPlayer(longAudioClip, videoAsset);
    const audio = wrapper.get<HTMLAudioElement>('.linked-preview-audio').element;
    mockMedia(audio);
    await wrapper.get('.linked-preview-audio').trigger('loadedmetadata');

    const viewport = wrapper.get('.audio-waveform-surface');
    const content = wrapper.get('.waveform-track');
    expect(content.attributes('style')).toContain('width: 150%');
    expect(content.attributes('style')).toContain('transform: translate3d(-0%, 0, 0)');
    expect(viewport.findAll('.waveform-layer')).toHaveLength(2);

    audio.currentTime = 10;
    await wrapper.get('.linked-preview-audio').trigger('timeupdate');

    // At 20% of the clip, the 1.5x waveform has not reached the centered
    // playback window yet, so no horizontal translation is needed.
    expect(content.attributes('style')).toContain('transform: translate3d(-0%, 0, 0)');
    // The playhead remains track-relative; the viewport is still at its start.
    expect(wrapper.get('.waveform-playhead').attributes('style')).toContain('left: 20%');
    expect(wrapper.get('.waveform-progress-fill').attributes('style')).toContain('width: 20%');

    audio.currentTime = 33.5;
    await wrapper.get('.linked-preview-audio').trigger('timeupdate');

    // Once the viewport reaches the clip's end, scrolling is clamped and
    // the playhead is allowed to travel to the right edge.
    expect(content.attributes('style')).toContain('transform: translate3d(-33.333333333333336%, 0, 0)');
    expect(wrapper.get('.waveform-playhead').attributes('style')).toContain('left: 98.33333333333333%');
  });

  it('maps a click in the scrolled viewport to the absolute trimmed source time', async () => {
    waveformState.bars.value = [12, 28, 18];
    waveformState.sourceDurationSeconds.value = 30;
    waveformState.status.value = 'ready';
    const wrapper = mountPlayer(longAudioClip, videoAsset);
    const audio = wrapper.get<HTMLAudioElement>('.linked-preview-audio').element;
    mockMedia(audio);
    await wrapper.get('.linked-preview-audio').trigger('loadedmetadata');
    audio.currentTime = 16;
    await wrapper.get('.linked-preview-audio').trigger('timeupdate');

    const surface = wrapper.get<HTMLElement>('.audio-waveform-surface');
    vi.spyOn(surface.element, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      width: 200,
    } as DOMRect);

    // 20% into the viewport + 20% scroll offset = 40% of the zoomed
    // waveform, i.e. twelve seconds into the 30-second clip.
    await surface.trigger('pointerdown', { clientX: 140 });

    expect(audio.currentTime).toBeCloseTo(12);
    expect(wrapper.get('.waveform-playhead').attributes('style')).toContain('left: 26.666666666666668%');
  });

  it('does not zoom short waveforms', async () => {
    waveformState.bars.value = [12, 28, 18];
    waveformState.sourceDurationSeconds.value = 2;
    waveformState.status.value = 'ready';
    const wrapper = mountPlayer(audioClip, videoAsset);
    const audio = wrapper.get<HTMLAudioElement>('.linked-preview-audio').element;
    mockMedia(audio);
    await wrapper.get('.linked-preview-audio').trigger('loadedmetadata');

    const content = wrapper.get('.waveform-track');
    expect(content.attributes('style')).toContain('width: 100%');
    expect(content.attributes('style')).toContain('transform: translate3d(-0%, 0, 0)');
    audio.currentTime = 5;
    await wrapper.get('.linked-preview-audio').trigger('timeupdate');
    expect(wrapper.get('.waveform-playhead').attributes('style')).toContain('left: 50%');
  });

  it('caps the horizontal zoom for a long song', () => {
    const wrapper = mountPlayer(
      { ...longAudioClip, timelineDurationMs: 180_000, sourceDurationMs: 180_000 },
      videoAsset,
    );

    expect(wrapper.get('.waveform-track').attributes('style')).toContain('width: 400%');
  });

  it('keeps waveform progress moving between media timeupdate events while playing', async () => {
    let frameCallback: FrameRequestCallback | undefined;
    const requestFrame = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frameCallback = callback;
      return 17;
    });
    const cancelFrame = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    const wrapper = mountPlayer(audioClip, videoAsset);
    const audio = wrapper.get<HTMLAudioElement>('.linked-preview-audio').element;
    mockMedia(audio);
    Object.defineProperty(audio, 'paused', { configurable: true, get: () => false });
    await wrapper.get('.linked-preview-audio').trigger('loadedmetadata');

    await wrapper.get('.linked-preview-audio').trigger('play');
    expect(requestFrame).toHaveBeenCalledOnce();
    audio.currentTime = 5.5;
    frameCallback?.(performance.now());
    await wrapper.vm.$nextTick();
    expect(wrapper.get('.preview-time').text()).toBe('0:01 / 0:02');
    expect(wrapper.get('.waveform-playhead').attributes('style')).toContain('left: 75%');

    await wrapper.get('.linked-preview-audio').trigger('pause');
    expect(cancelFrame).toHaveBeenCalledWith(17);
  });

  it('keeps audio playback available when waveform decoding fails', async () => {
    waveformState.status.value = 'error';
    const wrapper = mountPlayer(audioClip, videoAsset);
    const audio = wrapper.get<HTMLAudioElement>('.linked-preview-audio').element;
    const { play } = mockMedia(audio);
    await wrapper.get('.linked-preview-audio').trigger('loadedmetadata');

    expect(wrapper.get('.waveform-unavailable').text().length).toBeGreaterThan(0);
    expect(wrapper.get<HTMLButtonElement>('.preview-play-button').element.disabled).toBe(false);
    await wrapper.get('.preview-play-button').trigger('click');
    expect(play).toHaveBeenCalledOnce();
  });

  it('surfaces a playback rejection instead of leaving the player silently stopped', async () => {
    const wrapper = mountPlayer(audioClip, videoAsset);
    const audio = wrapper.get<HTMLAudioElement>('.linked-preview-audio').element;
    const { play } = mockMedia(audio);
    play.mockRejectedValue(new DOMException('Unsupported source', 'NotSupportedError'));
    await wrapper.get('.linked-preview-audio').trigger('loadedmetadata');

    await wrapper.get('.preview-play-button').trigger('click');
    await flushPromises();

    expect(wrapper.get('.preview-error').text().length).toBeGreaterThan(0);
    expect(wrapper.get<HTMLButtonElement>('.preview-play-button').element.disabled).toBe(true);
  });

  it('keeps the same preview stage and inactive controls for an image', () => {
    const imageClip: VisualClip = {
      ...videoClip,
      id: 'image-clip',
      kind: 'image',
      assetId: imageAsset.id,
      appearance: createDefaultClipAppearance('image'),
    };
    const wrapper = mountPlayer(imageClip, imageAsset);

    expect(wrapper.get('.linked-preview-image').attributes('src')).toBe(imageAsset.src);
    expect(wrapper.find('.preview-stage').exists()).toBe(true);
    expect(wrapper.get('.preview-controls').classes()).toContain('is-inactive');
    expect(wrapper.get<HTMLButtonElement>('.preview-play-button').element.disabled).toBe(true);
    expect(wrapper.get<HTMLInputElement>('.preview-progress input').element.disabled).toBe(true);
    expect(wrapper.find('.preview-error').exists()).toBe(false);
  });

  it('preserves stage geometry and explains when there is no playable asset', () => {
    const wrapper = mountPlayer(audioClip);

    expect(wrapper.find('.linked-preview-audio').exists()).toBe(false);
    expect(wrapper.find('.preview-stage').exists()).toBe(true);
    expect(wrapper.get('.preview-controls').classes()).toContain('is-inactive');
    expect(wrapper.get<HTMLButtonElement>('.preview-play-button').element.disabled).toBe(true);
    expect(wrapper.get<HTMLInputElement>('.preview-progress input').element.disabled).toBe(true);
    expect(wrapper.get('.preview-error').text().length).toBeGreaterThan(0);
  });
});

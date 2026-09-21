import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { i18n } from '~/i18n';
import type { AudioClip, Clip, MediaAsset, VisualClip } from '~/media/shared/composition-types';
import { createDefaultClipAppearance } from '~/media/shared/composition-defaults';
import LinkedClipsDeleteDialog from '../LinkedClipsDeleteDialog.vue';

const Dialog = {
  props: { isOpen: Boolean, title: { type: String, default: '' } },
  emits: ['close'],
  template: `
    <div v-if="isOpen" class="dialog-stub" role="dialog" aria-modal="true">
      <h2>{{ title }}</h2>
      <slot />
      <button class="dialog-close" type="button" @click="$emit('close')">Close</button>
    </div>
  `,
};

const Button = {
  inheritAttrs: true,
  props: {
    block: Boolean,
    icon: { type: null, default: null },
    size: String,
    tooltip: String,
    tooltipVariant: String,
    variant: String,
  },
  emits: ['click'],
  template: '<button v-bind="$attrs" type="button" @click="$emit(\'click\')"><slot /></button>',
};

const linkedVideo: VisualClip = {
  id: 'video-clip',
  kind: 'video',
  name: 'Interview.mp4',
  assetId: 'video-asset',
  timelineStartMs: 0,
  timelineDurationMs: 4_000,
  sourceInMs: 0,
  sourceDurationMs: 4_000,
  playbackRate: 1,
  enabled: true,
  order: 0,
  groupId: 'imported-group',
  transform: { x: 0, y: 0, width: 1, height: 1 },
  appearance: createDefaultClipAppearance('video'),
  isMirrored: false,
  isMirroredY: false,
};

const linkedAudio: AudioClip = {
  id: 'audio-clip',
  kind: 'audio',
  name: 'Interview audio',
  assetId: 'audio-asset',
  role: 'imported',
  timelineStartMs: 0,
  timelineDurationMs: 4_000,
  sourceInMs: 0,
  sourceDurationMs: 4_000,
  playbackRate: 1,
  enabled: true,
  order: 1,
  groupId: 'imported-group',
  volume: 100,
};

const linkedImage: VisualClip = {
  ...linkedVideo,
  id: 'image-clip',
  kind: 'image',
  name: 'Storyboard.png',
  assetId: 'image-asset',
  appearance: createDefaultClipAppearance('image'),
};

const previewVideoAsset: MediaAsset = {
  id: 'video-asset',
  kind: 'video',
  name: 'Interview source',
  fileName: 'interview-source.mp4',
  durationMs: 20_000,
  width: 1_920,
  height: 1_080,
  src: 'project-media://video-asset',
  origin: 'project',
};

const previewImageAsset: MediaAsset = {
  id: 'image-asset',
  kind: 'image',
  name: 'Storyboard source',
  fileName: 'storyboard.png',
  durationMs: 5_000,
  width: 1_920,
  height: 1_080,
  src: 'project-media://image-asset',
  origin: 'project',
};

const previewAudioAsset: MediaAsset = {
  id: 'audio-asset',
  kind: 'audio',
  name: 'Microphone source',
  fileName: 'microphone-02.wav',
  durationMs: 20_000,
  width: null,
  height: null,
  src: 'project-media://audio-asset',
  origin: 'session',
  sessionId: 'recording-session',
  sessionPath: 'microphone-02.wav',
};

const stubs = { Dialog, Button };

const mountDialog = (clips: readonly Clip[] = [linkedVideo, linkedAudio], assets: readonly MediaAsset[] = []) =>
  mount(LinkedClipsDeleteDialog, {
    props: { isOpen: true, clips: [...clips], assets: [...assets] },
    global: { plugins: [i18n], stubs },
  });

describe('LinkedClipsDeleteDialog', () => {
  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('lists every linked clip and deletes one item without closing the dialog', async () => {
    const wrapper = mountDialog();

    expect(wrapper.find('[role="dialog"]').exists()).toBe(true);
    expect(wrapper.findAll('.linked-clip-row')).toHaveLength(2);
    expect(wrapper.findAll('.clip-name').map((node) => node.text())).toEqual([linkedVideo.name, linkedAudio.name]);

    await wrapper.get('.delete-one-button').trigger('click');

    expect(wrapper.emitted('delete')).toEqual([[[linkedVideo.id]]]);
    expect(wrapper.emitted('close')).toBeUndefined();
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true);

    // The parent removes the item after handling the event; the dialog itself
    // remains mounted so another linked clip can be deleted or the user can
    // close it explicitly.
    await wrapper.setProps({ clips: [linkedAudio] });
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true);
    expect(wrapper.findAll('.linked-clip-row')).toHaveLength(1);
  });

  it('emits all linked ids from the delete-all action', async () => {
    const wrapper = mountDialog();

    await wrapper.get('.delete-all-button').trigger('click');

    expect(wrapper.emitted('delete')).toEqual([[[linkedVideo.id, linkedAudio.id]]]);
    expect(wrapper.emitted('close')).toBeUndefined();
  });

  it('renders asset-backed previews with source filenames and clip time ranges', async () => {
    const videoClip: VisualClip = {
      ...linkedVideo,
      sourceInMs: 2_000,
      sourceDurationMs: 4_000,
    };
    const imageClip: VisualClip = {
      ...linkedImage,
      sourceInMs: 1_000,
      sourceDurationMs: 1_500,
    };
    const audioClip: AudioClip = {
      ...linkedAudio,
      sourceInMs: 3_000,
      sourceDurationMs: 2_000,
    };
    const wrapper = mountDialog(
      [videoClip, imageClip, audioClip],
      [previewVideoAsset, previewImageAsset, previewAudioAsset],
    );

    const video = wrapper.get('.linked-preview-video');
    expect(video.attributes('src')).toBe(previewVideoAsset.src);
    expect(video.attributes('preload')).toBe('metadata');

    await wrapper.findAll('.select-preview-button')[1]!.trigger('click');
    const image = wrapper.get('.linked-preview-image');
    expect(image.attributes('src')).toBe(previewImageAsset.src);
    expect(image.attributes('alt')).toBe(imageClip.name);

    await wrapper.findAll('.select-preview-button')[2]!.trigger('click');
    const audio = wrapper.get('.linked-preview-audio');
    expect(audio.attributes('src')).toBe(previewAudioAsset.src);
    expect(audio.attributes('preload')).toBe('metadata');

    expect(wrapper.findAll('.clip-source').map((node) => node.text())).toEqual([
      'interview-source.mp4 · 0:02–0:06',
      'storyboard.png · 0:01–0:02',
      'microphone-02.wav · 0:03–0:05',
    ]);
  });

  it('uses an audible audio player for an audio clip backed by a video asset', async () => {
    const videoBackedAudio: AudioClip = {
      ...linkedAudio,
      assetId: previewVideoAsset.id,
      sourceInMs: 2_000,
      sourceDurationMs: 3_000,
    };
    const wrapper = mountDialog([linkedVideo, videoBackedAudio], [previewVideoAsset]);

    await wrapper.findAll('.select-preview-button')[1]!.trigger('click');

    const audio = wrapper.get<HTMLAudioElement>('.linked-preview-audio').element;
    expect(audio.getAttribute('src')).toBe(previewVideoAsset.src);
    expect(wrapper.find('.linked-preview-video').exists()).toBe(false);
    expect(audio.muted).toBe(false);
  });

  it('plays only after an explicit click, with the clip trim and playback rate', async () => {
    const videoBackedAudio: AudioClip = {
      ...linkedAudio,
      assetId: previewVideoAsset.id,
      sourceInMs: 4_000,
      sourceDurationMs: 2_500,
      playbackRate: 0.75,
    };
    const wrapper = mountDialog([videoBackedAudio], [previewVideoAsset]);
    const audio = wrapper.get<HTMLAudioElement>('.linked-preview-audio').element;
    const play = vi.fn().mockResolvedValue(undefined);
    const pause = vi.fn();
    Object.defineProperty(audio, 'play', { configurable: true, value: play });
    Object.defineProperty(audio, 'pause', { configurable: true, value: pause });

    expect(play).not.toHaveBeenCalled();
    await wrapper.get('.linked-preview-audio').trigger('loadedmetadata');
    expect(audio.currentTime).toBe(4);
    expect(audio.playbackRate).toBe(0.75);

    await wrapper.get('.preview-play-button').trigger('click');
    expect(play).toHaveBeenCalledOnce();
    expect(audio.muted).toBe(false);

    audio.currentTime = 6.5;
    await wrapper.get('.linked-preview-audio').trigger('timeupdate');
    expect(pause).toHaveBeenCalled();
    expect(audio.currentTime).toBe(4);
  });

  it('pauses the prior preview when selecting another linked clip', async () => {
    const wrapper = mountDialog([linkedVideo, linkedAudio], [previewVideoAsset, previewAudioAsset]);
    const video = wrapper.get<HTMLVideoElement>('.linked-preview-video').element;
    const pause = vi.fn();
    Object.defineProperty(video, 'pause', { configurable: true, value: pause });

    await wrapper.findAll('.select-preview-button')[1]!.trigger('click');

    expect(pause).toHaveBeenCalled();
    expect(wrapper.get('.linked-preview-audio').attributes('src')).toBe(previewAudioAsset.src);
    expect(wrapper.find('.linked-preview-video').exists()).toBe(false);
  });

  it('shows a visible error when the selected media cannot be played', async () => {
    const wrapper = mountDialog([linkedAudio], [previewAudioAsset]);

    await wrapper.get('.linked-preview-audio').trigger('error');

    expect(wrapper.get('.preview-error').text().length).toBeGreaterThan(0);
  });

  it('reports a rejected playback request instead of silently failing', async () => {
    const wrapper = mountDialog([linkedAudio], [previewAudioAsset]);
    const audio = wrapper.get<HTMLAudioElement>('.linked-preview-audio').element;
    Object.defineProperty(audio, 'play', {
      configurable: true,
      value: vi.fn().mockRejectedValue(new DOMException('Unsupported source', 'NotSupportedError')),
    });

    await wrapper.get('.linked-preview-audio').trigger('loadedmetadata');
    await wrapper.get('.preview-play-button').trigger('click');
    await flushPromises();

    expect(wrapper.get('.preview-error').text().length).toBeGreaterThan(0);
  });

  it('seeks previews to the source start and resets them when playback reaches the source end', async () => {
    const videoClip: VisualClip = {
      ...linkedVideo,
      sourceInMs: 2_000,
      sourceDurationMs: 3_000,
      playbackRate: 1.5,
    };
    const audioClip: AudioClip = {
      ...linkedAudio,
      sourceInMs: 4_000,
      sourceDurationMs: 2_500,
      playbackRate: 0.75,
    };
    const wrapper = mountDialog([videoClip, audioClip], [previewVideoAsset, previewAudioAsset]);

    const video = wrapper.get<HTMLVideoElement>('.linked-preview-video').element;
    const mediaState = (media: HTMLMediaElement) => {
      let currentTime = 0;
      let playbackRate = 1;
      Object.defineProperty(media, 'currentTime', {
        configurable: true,
        get: () => currentTime,
        set: (value: number) => {
          currentTime = value;
        },
      });
      Object.defineProperty(media, 'playbackRate', {
        configurable: true,
        get: () => playbackRate,
        set: (value: number) => {
          playbackRate = value;
        },
      });
      const pause = vi.fn();
      Object.defineProperty(media, 'pause', { configurable: true, value: pause });
      return {
        pause,
        get currentTime() {
          return currentTime;
        },
        set currentTime(value: number) {
          currentTime = value;
        },
        get playbackRate() {
          return playbackRate;
        },
      };
    };

    const videoState = mediaState(video);

    await wrapper.get('.linked-preview-video').trigger('loadedmetadata');
    expect(videoState.currentTime).toBe(2);
    expect(videoState.playbackRate).toBe(1.5);

    videoState.currentTime = 1;
    await wrapper.get('.linked-preview-video').trigger('timeupdate');
    expect(videoState.currentTime).toBe(2);
    expect(videoState.pause).not.toHaveBeenCalled();

    videoState.currentTime = 5;
    await wrapper.get('.linked-preview-video').trigger('timeupdate');
    expect(videoState.pause).toHaveBeenCalledOnce();
    expect(videoState.currentTime).toBe(2);

    await wrapper.findAll('.select-preview-button')[1]!.trigger('click');
    const audio = wrapper.get<HTMLAudioElement>('.linked-preview-audio').element;
    const audioState = mediaState(audio);
    await wrapper.get('.linked-preview-audio').trigger('loadedmetadata');
    expect(audioState.currentTime).toBe(4);
    expect(audioState.playbackRate).toBe(0.75);

    audioState.currentTime = 6.5;
    await wrapper.get('.linked-preview-audio').trigger('timeupdate');
    expect(audioState.pause).toHaveBeenCalledOnce();
    expect(audioState.currentTime).toBe(4);
  });

  it('forwards an explicit close without deleting anything', async () => {
    const wrapper = mountDialog();

    await wrapper.get('.dialog-close').trigger('click');

    expect(wrapper.emitted('close')).toEqual([[]]);
    expect(wrapper.emitted('delete')).toBeUndefined();
  });

  it('keeps a stable preview above a list of ten selectable linked clips', async () => {
    const clips = Array.from({ length: 10 }, (_, index): AudioClip => ({
      ...linkedAudio,
      id: `microphone-${index + 1}`,
      name: `Microphone ${index + 1}`,
    }));
    const wrapper = mountDialog(clips);

    expect(wrapper.find('.preview-slot').exists()).toBe(true);
    expect(wrapper.findAll('.linked-clip-row')).toHaveLength(10);
    expect(wrapper.findAll('.select-preview-button')).toHaveLength(10);
    expect(wrapper.get('.linked-clip-row.selected .clip-name').text()).toBe('Microphone 1');

    await wrapper.findAll('.select-preview-button')[9]!.trigger('click');

    expect(wrapper.find('.preview-slot').exists()).toBe(true);
    expect(wrapper.get('.linked-clip-row.selected .clip-name').text()).toBe('Microphone 10');
    expect(wrapper.findAll('.preview-name').some((name) => name.text() === 'Microphone 10')).toBe(true);
    await wrapper.findAll('.delete-one-button')[9]!.trigger('click');
    expect(wrapper.emitted('delete')).toEqual([[[clips[9]!.id]]]);
  });

  it('shows completion immediately and closes after the 900ms completion animation', async () => {
    vi.useFakeTimers();
    const wrapper = mountDialog();

    await wrapper.setProps({ clips: [] });

    expect(wrapper.find('.linked-clip-list').exists()).toBe(false);
    expect(wrapper.find('[role="status"]').exists()).toBe(true);
    expect(wrapper.find('.completion-check').exists()).toBe(true);
    expect(wrapper.find('.delete-all-button').exists()).toBe(false);
    expect(wrapper.find('.delete-one-button').exists()).toBe(false);
    expect(wrapper.emitted('close')).toBeUndefined();

    await vi.advanceTimersByTimeAsync(899);
    expect(wrapper.emitted('close')).toBeUndefined();

    await vi.advanceTimersByTimeAsync(1);
    expect(wrapper.emitted('close')).toEqual([[]]);
  });
});

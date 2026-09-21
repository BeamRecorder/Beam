import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AudioClip, MediaAsset, VisualClip } from '~/media/shared/composition-types';
import { createDefaultClipAppearance } from '~/media/shared/composition-defaults';
import LinkedClipThumbnail from '../LinkedClipThumbnail.vue';

const videoAsset: MediaAsset = {
  id: 'recording',
  kind: 'video',
  name: 'Recording',
  fileName: 'recording.webm',
  durationMs: 10_000,
  width: 1_920,
  height: 1_080,
  src: 'project-media://recording',
  origin: 'project',
};
const imageAsset: MediaAsset = {
  ...videoAsset,
  id: 'still',
  kind: 'image',
  fileName: 'still.png',
  src: 'project-media://still',
};
const videoClip: VisualClip = {
  id: 'video',
  kind: 'video',
  name: 'Recording',
  assetId: videoAsset.id,
  timelineStartMs: 0,
  timelineDurationMs: 2_000,
  sourceInMs: 1_000,
  sourceDurationMs: 2_000,
  playbackRate: 1,
  enabled: true,
  order: 0,
  transform: { x: 0, y: 0, width: 1, height: 1 },
  appearance: createDefaultClipAppearance('video'),
  isMirrored: false,
  isMirroredY: false,
};
const imageClip: VisualClip = {
  ...videoClip,
  id: 'image',
  kind: 'image',
  assetId: imageAsset.id,
  appearance: createDefaultClipAppearance('image'),
};
const audioClip: AudioClip = {
  id: 'audio',
  kind: 'audio',
  name: 'Recording microphone',
  assetId: videoAsset.id,
  role: 'microphone',
  timelineStartMs: 0,
  timelineDurationMs: 2_000,
  sourceInMs: 1_000,
  sourceDurationMs: 2_000,
  playbackRate: 1,
  enabled: true,
  order: 1,
  volume: 100,
};

describe('LinkedClipThumbnail', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows a real imported image with its type icon overlaid transparently', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const requestPoster = vi.fn();
    const wrapper = mount(LinkedClipThumbnail, {
      props: { clip: imageClip, asset: imageAsset, requestPoster },
    });

    expect(wrapper.get('.clip-thumbnail').classes()).toContain('has-poster');
    expect(wrapper.get('.thumbnail-image').attributes('src')).toBe(imageAsset.src);
    expect(wrapper.get('.thumbnail-image').attributes('alt')).toBe('');
    expect(wrapper.find('.thumbnail-icon svg').exists()).toBe(true);
    expect(requestPoster).toHaveBeenCalledOnce();
  });

  it('shows a decoded video poster with its video icon on top', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const requestPoster = vi.fn();
    const wrapper = mount(LinkedClipThumbnail, {
      props: { clip: videoClip, asset: videoAsset, posterUrl: 'blob:video-frame', requestPoster },
    });

    expect(wrapper.get('.thumbnail-image').attributes('src')).toBe('blob:video-frame');
    expect(wrapper.get('.clip-thumbnail').classes()).toContain('has-poster');
    expect(wrapper.get('.thumbnail-icon svg').classes()).toContain('lucide-film');
    expect(requestPoster).toHaveBeenCalledWith(videoClip, videoAsset);
  });

  it('uses the shared video frame behind an audio icon for a video-backed microphone clip', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const wrapper = mount(LinkedClipThumbnail, {
      props: {
        clip: audioClip,
        asset: videoAsset,
        posterUrl: 'blob:recording-frame',
        requestPoster: vi.fn(),
      },
    });

    expect(wrapper.get('.thumbnail-image').attributes('src')).toBe('blob:recording-frame');
    expect(wrapper.get('.thumbnail-icon svg').classes()).toContain('lucide-volume-2');
  });

  it('requests expensive posters only after its row is visible', async () => {
    let notify: IntersectionObserverCallback | undefined;
    const observe = vi.fn();
    const disconnect = vi.fn();
    class Observer {
      constructor(callback: IntersectionObserverCallback) {
        notify = callback;
      }
      observe = observe;
      disconnect = disconnect;
    }
    vi.stubGlobal('IntersectionObserver', Observer);
    const requestPoster = vi.fn();
    const wrapper = mount(LinkedClipThumbnail, {
      props: { clip: videoClip, asset: videoAsset, requestPoster },
    });

    expect(observe).toHaveBeenCalledOnce();
    expect(requestPoster).not.toHaveBeenCalled();
    notify?.([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver);
    expect(requestPoster).not.toHaveBeenCalled();

    notify?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    expect(requestPoster).toHaveBeenCalledOnce();
    expect(disconnect).toHaveBeenCalledOnce();

    await wrapper.setProps({ clip: { ...videoClip, sourceInMs: 2_000 } });
    expect(requestPoster).toHaveBeenCalledTimes(2);
  });

  it('keeps an honest icon-only state when no visual preview exists', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const wrapper = mount(LinkedClipThumbnail, {
      props: { clip: audioClip, requestPoster: vi.fn() },
    });

    expect(wrapper.find('.thumbnail-image').exists()).toBe(false);
    expect(wrapper.get('.clip-thumbnail').classes()).not.toContain('has-poster');
    expect(wrapper.get('.thumbnail-icon svg').classes()).toContain('lucide-volume-2');
  });
});

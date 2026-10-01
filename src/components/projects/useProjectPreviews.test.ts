import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CaptureProject } from '~/api/types/capture-api';
const media = vi.hoisted(() => ({ generate: vi.fn(), cache: {} as Record<string, string> }));
vi.mock('../hud/useProjectThumbnailGenerator', () => ({
  useProjectThumbnailGenerator: () => ({ generateThumbnail: media.generate, thumbnailCache: media.cache }),
}));
import { useProjectPreviews } from './useProjectPreviews';
const project = (id: string, previewSrc = `video://${id}`, thumbnailSrc: string | null = null) =>
  ({
    id,
    previewSrc,
    thumbnailSrc,
  }) as CaptureProject;
const deferred = () => {
  let resolve!: (value: string | null) => void;
  const promise = new Promise<string | null>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
};
const create = (initial: CaptureProject[]) => {
  const visible = ref(initial);
  const container = ref<HTMLElement | null>(null);
  let preview!: ReturnType<typeof useProjectPreviews>;
  const wrapper = mount(
    defineComponent({
      setup() {
        preview = useProjectPreviews(container, visible);
        return () => null;
      },
    }),
  );
  return { visible, wrapper, preview, container };
};
beforeEach(() => {
  vi.clearAllMocks();
  for (const id of Object.keys(media.cache)) delete media.cache[id];
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
const mouseEvent = (target: HTMLElement | null) => ({ currentTarget: target }) as MouseEvent;

describe('visible project thumbnail scheduling', () => {
  it('retries failed visible thumbnails on an explicit refresh', async () => {
    media.generate.mockResolvedValue(null);
    const { preview, wrapper } = create([project('one')]);
    await flushPromises();
    preview.retryVisibleThumbnails();
    await flushPromises();
    expect(media.generate).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });
  it('does not duplicate an active decoder when refresh retries are requested', async () => {
    const first = deferred();
    media.generate.mockReturnValueOnce(first.promise).mockResolvedValue(null);
    const { preview, wrapper } = create([project('one')]);
    preview.retryVisibleThumbnails();
    expect(media.generate).toHaveBeenCalledOnce();
    media.cache.one = 'saved';
    first.resolve('saved');
    await flushPromises();
    expect(media.generate).toHaveBeenCalledOnce();
    wrapper.unmount();
  });
  it('does not decode after a refresh retry on an already disposed picker', async () => {
    const { preview, wrapper } = create([]);
    wrapper.unmount();
    preview.retryVisibleThumbnails();
    await flushPromises();
    expect(media.generate).not.toHaveBeenCalled();
  });
  it('skips saved, cached and unavailable previews without loading a decoder', async () => {
    media.cache.cached = 'thumbnail://cached';
    const { wrapper } = create([
      project('saved', 'video://saved', 'thumbnail://saved'),
      project('cached'),
      project('empty', ''),
    ]);
    await flushPromises();
    expect(media.generate).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  it('decodes at most two previews and drops queued projects that scroll out of view', async () => {
    const first = deferred();
    const second = deferred();
    media.generate
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
      .mockResolvedValue('thumbnail');
    const { visible, wrapper } = create([project('one'), project('two'), project('three')]);
    expect(media.generate).toHaveBeenCalledTimes(2);
    visible.value = [project('four')];
    await flushPromises();
    expect(media.generate).toHaveBeenCalledTimes(2);
    first.resolve('thumbnail');
    await flushPromises();
    expect(media.generate.mock.calls.map(([id]) => id)).toEqual(['one', 'two', 'four']);
    second.resolve(null);
    wrapper.unmount();
  });
  it('does not loop on failed sources but permits a changed source', async () => {
    media.generate.mockResolvedValue(null);
    const { visible, wrapper } = create([project('one'), project('two')]);
    await flushPromises();
    visible.value = [project('one')];
    await flushPromises();
    expect(media.generate).toHaveBeenCalledTimes(2);
    visible.value = [project('one', 'video://new')];
    await flushPromises();
    expect(media.generate).toHaveBeenLastCalledWith('one', 'video://new');
    wrapper.unmount();
  });
  it('does not start another decoder when its picker unmounts during media work', async () => {
    const first = deferred();
    media.generate.mockReturnValue(first.promise);
    const { wrapper } = create([project('one'), project('two'), project('three')]);
    wrapper.unmount();
    first.resolve(null);
    await flushPromises();
    expect(media.generate).toHaveBeenCalledTimes(2);
  });

  it('allows a fast second thumbnail to finish while the first is stalled', async () => {
    const first = deferred();
    media.generate.mockReturnValueOnce(first.promise).mockResolvedValue(null);
    const { wrapper, visible, preview } = create([project('one'), project('two'), project('three')]);
    await flushPromises();
    expect(media.generate.mock.calls.map(([id]) => id)).toEqual(['one', 'two', 'three']);
    preview.handleProjectMouseEnter(project('two'), mouseEvent(null));
    visible.value = [];
    await flushPromises();
    expect(preview.hoveredProjectId.value).toBeNull();
    first.resolve(null);
    await flushPromises();
    expect(media.generate).toHaveBeenCalledTimes(3);
    wrapper.unmount();
  });

  it('does not start queued work or delayed hover playback while hidden', async () => {
    const first = deferred();
    media.generate.mockReturnValue(first.promise);
    const { visible, wrapper, preview } = create([project('one'), project('two'), project('three')]);
    const video = document.createElement('video');
    video.play = vi.fn().mockResolvedValue(undefined);
    preview.handleProjectMouseEnter(project('one'), mouseEvent(video));
    visible.value = [];
    await flushPromises();
    first.resolve(null);
    await flushPromises();
    expect(media.generate).toHaveBeenCalledTimes(2);
    expect(video.play).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});

describe('project video preview lifecycle', () => {
  it('plays the pointed video, reports progress and rewinds on leave', async () => {
    const { preview, wrapper } = create([]);
    const video = document.createElement('video');
    video.load = vi.fn();
    video.play = vi.fn().mockResolvedValue(undefined);
    video.pause = vi.fn();
    Object.defineProperty(video, 'duration', { configurable: true, value: 2 });
    video.currentTime = 1;
    preview.handleProjectMouseEnter(project('one'), mouseEvent(video));
    await flushPromises();
    expect(video.load).toHaveBeenCalledOnce();
    expect(video.play).toHaveBeenCalledOnce();
    expect(preview.hoveredProjectId.value).toBe('one');
    preview.handleVideoTimeUpdate('one', mouseEvent(video));
    expect(preview.videoProgress.value.one).toEqual({ current: 1, total: 2 });
    preview.isVideoLoaded.value.one = true;
    preview.handleProjectMouseLeave(project('one'), mouseEvent(video));
    expect(video.pause).toHaveBeenCalledOnce();
    expect(video.currentTime).toBe(0.1);
    expect(preview.isVideoLoaded.value.one).toBe(false);
    expect(preview.hoveredProjectId.value).toBeNull();
    wrapper.unmount();
  });
  it('handles an already loaded nested video and interrupted autoplay', async () => {
    const { preview, wrapper } = create([]);
    const card = document.createElement('div');
    const video = document.createElement('video');
    card.append(video);
    Object.defineProperty(video, 'readyState', { value: 4 });
    Object.defineProperty(video, 'duration', { value: Number.NaN });
    video.load = vi.fn();
    video.play = vi.fn().mockRejectedValue(new Error('interrupted'));
    video.pause = vi.fn();
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    preview.handleProjectMouseEnter(project('one', ''), mouseEvent(card));
    await flushPromises();
    expect(video.load).not.toHaveBeenCalled();
    expect(debug).toHaveBeenCalledOnce();
    preview.handleVideoTimeUpdate('one', mouseEvent(video));
    expect(preview.videoProgress.value.one?.total).toBe(1);
    preview.handleProjectMouseLeave(project('one'), mouseEvent(card));
    expect(video.currentTime).toBe(0);
    wrapper.unmount();
  });
  it('ignores absent targets and media methods without creating progress', async () => {
    const { preview, wrapper } = create([]);
    const card = document.createElement('div');
    preview.handleVideoTimeUpdate('missing', mouseEvent(null));
    for (const target of [null, card]) {
      preview.handleProjectMouseEnter(project('one'), mouseEvent(target));
      await flushPromises();
      preview.handleProjectMouseLeave(project('one'), mouseEvent(target));
    }
    const video = document.createElement('video');
    Object.defineProperty(video, 'play', { value: undefined });
    Object.defineProperty(video, 'pause', { value: undefined });
    preview.handleProjectMouseEnter(project('one'), mouseEvent(video));
    await flushPromises();
    preview.handleProjectMouseLeave(project('one'), mouseEvent(video));
    expect(preview.videoProgress.value.missing).toBeUndefined();
    wrapper.unmount();
  });
  it('suppresses hover playback while scrolling and extends the quiet interval', async () => {
    vi.useFakeTimers();
    const { preview, wrapper } = create([]);
    preview.handleProjectMouseEnter(project('one', ''), mouseEvent(null));
    preview.handleScroll();
    expect(preview.hoveredProjectId.value).toBeNull();
    await vi.advanceTimersByTimeAsync(100);
    preview.handleScroll();
    preview.handleProjectMouseEnter(project('two'), mouseEvent(null));
    expect(preview.hoveredProjectId.value).toBeNull();
    await vi.advanceTimersByTimeAsync(149);
    expect(preview.isScrolling.value).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(preview.isScrolling.value).toBe(false);
    wrapper.unmount();
  });
  it('clears pending scroll work and releases attached videos on unmount', () => {
    vi.useFakeTimers();
    const { preview, wrapper, container } = create([]);
    const element = document.createElement('div');
    const video = document.createElement('video');
    video.setAttribute('src', 'preview.mp4');
    video.load = vi.fn();
    video.pause = vi.fn();
    element.append(video);
    container.value = element;
    preview.handleScroll();
    wrapper.unmount();
    expect(video.pause).toHaveBeenCalledOnce();
    expect(video.load).toHaveBeenCalledOnce();
    expect(video.hasAttribute('src')).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});

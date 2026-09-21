import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, nextTick, ref, type Ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AudioClip, MediaAsset, VisualClip } from '~/media/shared/composition-types';
import { createDefaultClipAppearance } from '~/media/shared/composition-defaults';
import { useLinkedClipPosters } from './linked-clip-posters';

const runtime = vi.hoisted(() => ({ decodeVideoPoster: vi.fn() }));
vi.mock('~/media/playback', () => ({ decodeVideoPoster: runtime.decodeVideoPoster }));

const videoAsset: MediaAsset = {
  id: 'recording',
  kind: 'video',
  name: 'Recording',
  fileName: 'recording.webm',
  durationMs: 30_000,
  width: 1_920,
  height: 1_080,
  src: 'project-media://recording',
  origin: 'project',
};
const audioAsset: MediaAsset = {
  ...videoAsset,
  id: 'microphone',
  kind: 'audio',
  src: 'project-media://microphone',
  width: null,
  height: null,
};
const videoClip: VisualClip = {
  id: 'visual',
  kind: 'video',
  name: 'Recording',
  assetId: videoAsset.id,
  timelineStartMs: 0,
  timelineDurationMs: 5_000,
  sourceInMs: 4_000,
  sourceDurationMs: 5_000,
  playbackRate: 1,
  enabled: true,
  order: 0,
  transform: { x: 0, y: 0, width: 1, height: 1 },
  appearance: createDefaultClipAppearance('video'),
  isMirrored: false,
  isMirroredY: false,
};
const audioClip: AudioClip = {
  id: 'audio',
  kind: 'audio',
  name: 'Recording audio',
  assetId: videoAsset.id,
  role: 'imported',
  timelineStartMs: 0,
  timelineDurationMs: 3_000,
  sourceInMs: 8_000,
  sourceDurationMs: 3_000,
  playbackRate: 1,
  enabled: true,
  order: 1,
  volume: 100,
};
const frame = () => ({ bitmap: {} as ImageBitmap, close: vi.fn() });

describe('useLinkedClipPosters', () => {
  let isOpen: Ref<boolean>;
  let posters: ReturnType<typeof useLinkedClipPosters>;
  let wrapper: ReturnType<typeof mount>;
  const createObjectURL = vi.fn<(blob: Blob | MediaSource) => string>();
  const revokeObjectURL = vi.fn<(url: string) => void>();

  beforeEach(() => {
    vi.clearAllMocks();
    isOpen = ref(true);
    createObjectURL.mockImplementation(() => `blob:linked-poster-${createObjectURL.mock.calls.length}`);
    vi.spyOn(URL, 'createObjectURL').mockImplementation(createObjectURL);
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(revokeObjectURL);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => callback(new Blob(['poster'])));
    runtime.decodeVideoPoster.mockResolvedValue(frame());
    wrapper = mount(
      defineComponent({
        setup() {
          posters = useLinkedClipPosters(isOpen);
          return () => null;
        },
      }),
    );
  });

  afterEach(() => {
    wrapper.unmount();
    vi.restoreAllMocks();
  });

  it('serializes video and video-backed audio posters, and caches each clip source position', async () => {
    let resolveFirst!: (value: ReturnType<typeof frame>) => void;
    runtime.decodeVideoPoster
      .mockReturnValueOnce(
        new Promise<ReturnType<typeof frame>>((resolve) => {
          resolveFirst = resolve;
        }),
      )
      .mockResolvedValueOnce(frame());

    posters.requestPoster(videoClip, videoAsset);
    posters.requestPoster(audioClip, videoAsset);
    posters.requestPoster(videoClip, videoAsset);
    await flushPromises();

    expect(runtime.decodeVideoPoster).toHaveBeenCalledTimes(1);
    expect(runtime.decodeVideoPoster).toHaveBeenNthCalledWith(1, expect.objectContaining({ assetId: videoAsset.id }), {
      timestampSeconds: 4.25,
      width: 160,
      height: 90,
      fit: 'cover',
    });
    expect(posters.posterUrl(videoClip, videoAsset)).toBeUndefined();

    const firstFrame = frame();
    resolveFirst(firstFrame);
    await flushPromises();

    expect(firstFrame.close).toHaveBeenCalledOnce();
    expect(runtime.decodeVideoPoster).toHaveBeenCalledTimes(2);
    expect(runtime.decodeVideoPoster).toHaveBeenNthCalledWith(2, expect.objectContaining({ assetId: videoAsset.id }), {
      timestampSeconds: 8.25,
      width: 160,
      height: 90,
      fit: 'cover',
    });
    expect(posters.posterUrl(videoClip, videoAsset)).toBe('blob:linked-poster-1');
    expect(posters.posterUrl(audioClip, videoAsset)).toBe('blob:linked-poster-2');

    posters.requestPoster(videoClip, videoAsset);
    await flushPromises();
    expect(runtime.decodeVideoPoster).toHaveBeenCalledTimes(2);
  });

  it('does not request unsupported audio assets or any poster while closed', async () => {
    posters.requestPoster(audioClip, audioAsset);
    isOpen.value = false;
    await nextTick();
    posters.requestPoster(videoClip, videoAsset);
    await flushPromises();

    expect(runtime.decodeVideoPoster).not.toHaveBeenCalled();
    expect(posters.posterUrl(audioClip, audioAsset)).toBeUndefined();
  });

  it('revokes cached poster URLs when the dialog closes and reloads them on reopening', async () => {
    posters.requestPoster(videoClip, videoAsset);
    await flushPromises();
    expect(posters.posterUrl(videoClip, videoAsset)).toBe('blob:linked-poster-1');

    isOpen.value = false;
    await nextTick();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:linked-poster-1');
    expect(posters.posterUrl(videoClip, videoAsset)).toBeUndefined();

    isOpen.value = true;
    await nextTick();
    posters.requestPoster(videoClip, videoAsset);
    await flushPromises();
    expect(runtime.decodeVideoPoster).toHaveBeenCalledTimes(2);
    expect(posters.posterUrl(videoClip, videoAsset)).toBe('blob:linked-poster-2');
  });

  it('discards an in-flight frame from a closed dialog and releases its bitmap', async () => {
    let resolveFrame!: (value: ReturnType<typeof frame>) => void;
    runtime.decodeVideoPoster.mockReturnValueOnce(
      new Promise<ReturnType<typeof frame>>((resolve) => {
        resolveFrame = resolve;
      }),
    );
    posters.requestPoster(videoClip, videoAsset);
    await flushPromises();

    isOpen.value = false;
    await nextTick();
    const staleFrame = frame();
    resolveFrame(staleFrame);
    await flushPromises();

    expect(staleFrame.close).toHaveBeenCalledOnce();
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(posters.posterUrl(videoClip, videoAsset)).toBeUndefined();
  });

  it('keeps failed decodes from retrying until the dialog closes', async () => {
    runtime.decodeVideoPoster.mockRejectedValueOnce(new Error('Codec unavailable')).mockResolvedValueOnce(frame());
    posters.requestPoster(videoClip, videoAsset);
    await flushPromises();
    posters.requestPoster(videoClip, videoAsset);
    await flushPromises();
    expect(runtime.decodeVideoPoster).toHaveBeenCalledOnce();

    isOpen.value = false;
    await nextTick();
    isOpen.value = true;
    await nextTick();
    posters.requestPoster(videoClip, videoAsset);
    await flushPromises();
    expect(runtime.decodeVideoPoster).toHaveBeenCalledTimes(2);
    expect(posters.posterUrl(videoClip, videoAsset)).toBe('blob:linked-poster-1');
  });
});

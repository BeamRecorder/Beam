import { defineComponent, h, nextTick, ref } from 'vue';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCompositionAudioWaveforms } from '../useCompositionAudioWaveforms';
import type { ClipComposition } from '~/media/shared/composition-types';
import type { MediaSourceDescriptor } from '~/media/shared/media-types';
import { MediaInputError } from '~/media/shared/media-types';

const { extractWaveformPeaks } = vi.hoisted(() => ({
  extractWaveformPeaks: vi.fn(),
}));

vi.mock('~/media/playback', () => ({ extractWaveformPeaks }));

const composition = (volume = 100, source = 'https://media.test/sound.mp4'): ClipComposition => ({
  schemaVersion: 1,
  assets: [
    {
      id: 'audio',
      kind: 'audio',
      name: 'Sound',
      fileName: 'sound.mp4',
      durationMs: 2_000,
      width: null,
      height: null,
      src: source,
      origin: 'project',
    },
  ],
  clips: [
    {
      id: 'clip',
      kind: 'audio',
      name: 'Sound',
      assetId: 'audio',
      role: 'imported',
      timelineStartMs: 0,
      timelineDurationMs: 1_000,
      sourceInMs: 250,
      sourceDurationMs: 1_000,
      playbackRate: 1,
      enabled: true,
      order: 0,
      volume,
    },
  ],
});

let wrapper: VueWrapper | undefined;
let state!: ReturnType<typeof useCompositionAudioWaveforms>;

const mountComposable = (value = composition()) => {
  const compositionRef = ref(value);
  const Harness = defineComponent({
    setup() {
      state = useCompositionAudioWaveforms(
        () => compositionRef.value,
        () => 2,
      );
      return () => h('div');
    },
  });
  wrapper = mount(Harness);
  return compositionRef;
};

afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  extractWaveformPeaks.mockReset();
  vi.restoreAllMocks();
});

describe('useCompositionAudioWaveforms', () => {
  it('requests bounded source peaks and applies volume gain to rendered bars', async () => {
    extractWaveformPeaks.mockResolvedValue(new Float32Array([0, 0.2, 0, 0.8]));
    const compositionRef = mountComposable();
    await flushPromises();

    expect(extractWaveformPeaks).toHaveBeenCalledWith(
      expect.objectContaining<Partial<MediaSourceDescriptor>>({
        assetId: 'audio',
        kind: 'audio',
        url: 'https://media.test/sound.mp4',
      }),
      0.25,
      1.25,
      450,
    );
    expect(state.bars.value.clip).toEqual([10, 38]);

    const clip = compositionRef.value.clips[0];
    if (clip.kind !== 'audio') throw new Error('audio fixture missing');
    clip.volume = 0;
    await nextTick();
    expect(state.bars.value.clip).toEqual([0, 0]);
    clip.volume = 50;
    await nextTick();
    expect(state.bars.value.clip).toEqual([5, 19]);
  });

  it('keeps only the latest generation when a source changes during extraction', async () => {
    const first = Promise.resolve(new Float32Array([0, 0.1, 0, 0.1]));
    const second = Promise.resolve(new Float32Array([0, 0.4, 0, 0.4]));
    extractWaveformPeaks.mockReturnValueOnce(first).mockReturnValueOnce(second);
    const compositionRef = mountComposable(composition(100, 'https://media.test/first.mp4'));
    compositionRef.value = composition(100, 'https://media.test/second.mp4');
    await flushPromises();

    expect(extractWaveformPeaks).toHaveBeenCalledTimes(2);
    expect(state.bars.value.clip).toEqual([38, 38]);
    expect(state.errors.value).toEqual({});
  });

  it('returns empty bars and exposes the explicit MediaInputError detail', async () => {
    const error = new MediaInputError({
      kind: 'unsupported-codec',
      sourceId: 'audio',
      track: 'audio',
      codec: 'aac-unsupported',
      message: 'The waveform audio codec is unsupported.',
    });
    extractWaveformPeaks.mockRejectedValue(error);
    mountComposable();
    await flushPromises();

    expect(state.bars.value.clip).toEqual([]);
    expect(state.errors.value.clip).toEqual(error.detail);
  });

  it('normalizes an unexpected extraction error to a decode-failure MediaError', async () => {
    extractWaveformPeaks.mockRejectedValue(new Error('unexpected decoder failure'));
    mountComposable();
    await flushPromises();

    expect(state.bars.value.clip).toEqual([]);
    expect(state.errors.value.clip).toEqual({
      kind: 'decode-failure',
      sourceId: 'audio',
      message: 'The waveform could not be decoded.',
    });
  });

  it('keeps empty compositions inert and ignores clips without a source', async () => {
    mountComposable({ schemaVersion: 1, assets: [], clips: [] });
    await flushPromises();
    expect(state.bars.value).toEqual({});
    expect(extractWaveformPeaks).not.toHaveBeenCalled();
  });

  it('does not publish a result after the composable is unmounted', async () => {
    let resolve!: (peaks: Float32Array) => void;
    extractWaveformPeaks.mockReturnValue(new Promise<Float32Array>((r) => (resolve = r)));
    mountComposable();
    wrapper?.unmount();
    resolve(new Float32Array([0, 0.8]));
    await flushPromises();

    expect(state.bars.value).toEqual({});
  });
});

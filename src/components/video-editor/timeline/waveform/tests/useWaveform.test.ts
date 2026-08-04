import { defineComponent, h, nextTick } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWaveform } from '../useWaveform';

class FakeWorker {
  static instances: FakeWorker[] = [];
  static shouldThrow = false;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();

  constructor() {
    if (FakeWorker.shouldThrow) throw new Error('worker unavailable');
    FakeWorker.instances.push(this);
  }
}

let wrapper!: VueWrapper;
let state!: ReturnType<typeof useWaveform>;

const mountComposable = () => {
  const Harness = defineComponent({
    setup() {
      state = useWaveform();
      return () => h('div');
    },
  });
  wrapper = mount(Harness);
};

const wav = (format: 1 | 3, bits: 16 | 32, samples: number[], sampleRate = 8) => {
  const bytesPerSample = bits / 8;
  const dataLength = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);
  view.setUint32(12, 0x666d7420, false);
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint16(32, bits, true);
  view.setUint32(36, 0x64617461, false);
  view.setUint32(40, dataLength, true);
  samples.forEach((sample, index) => {
    if (format === 3) view.setFloat32(44 + index * bytesPerSample, sample, true);
    else view.setInt16(44 + index * bytesPerSample, sample, true);
  });
  return buffer;
};

beforeEach(() => {
  FakeWorker.instances = [];
  FakeWorker.shouldThrow = false;
  vi.stubGlobal('Worker', FakeWorker);
  mountComposable();
});

afterEach(() => {
  wrapper?.unmount();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useWaveform', () => {
  it('handles empty input and sends non-empty audio to a worker', () => {
    const empty = new Float32Array();
    state.generateWaveform(empty, 4);
    expect(state.isProcessing.value).toBe(false);
    expect(state.peaks.value).toBeNull();

    const samples = new Float32Array([-1, 0.5, 0, 1]);
    state.generateWaveform(samples, 2);
    const worker = FakeWorker.instances[0];
    expect(state.isProcessing.value).toBe(true);
    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'process', audioData: samples, targetPoints: 2 }, [
      samples.buffer,
    ]);
    worker.onmessage?.({
      data: { type: 'progress', progress: 50, peaks: new Float32Array([-1, 0.5]) },
    } as MessageEvent);
    expect(state.progress.value).toBe(50);
    worker.onmessage?.({ data: { type: 'done', peaks: new Float32Array([-1, 1, 0, 1]) } } as MessageEvent);
    expect(state.progress.value).toBe(100);
    expect(state.isProcessing.value).toBe(false);
    expect(state.peaks.value).toEqual(new Float32Array([-1, 1, 0, 1]));
    expect(worker.terminate).toHaveBeenCalled();
  });

  it('surfaces worker errors, initialization failures, and supports cancellation', () => {
    state.generateWaveform(new Float32Array([1]), 1);
    const worker = FakeWorker.instances[0];
    worker.onmessage?.({ data: { type: 'error', message: 'bad samples' } } as MessageEvent);
    expect(state.error.value).toBe('bad samples');
    expect(state.isProcessing.value).toBe(false);

    FakeWorker.shouldThrow = true;
    state.generateWaveform(new Float32Array([1]), 1);
    expect(state.error.value).toBe('worker unavailable');
    expect(state.isProcessing.value).toBe(false);

    FakeWorker.shouldThrow = false;
    state.generateWaveform(new Float32Array([1]), 1);
    const nextWorker = FakeWorker.instances.at(-1)!;
    nextWorker.onerror?.({ message: 'runtime failed' } as ErrorEvent);
    expect(state.error.value).toBe('runtime failed');
    state.cancel();
    expect(nextWorker.terminate).toHaveBeenCalled();
  });

  it('converts PCM, float WAV, unsupported formats, and audio buffers', async () => {
    state.generateWaveformFromWav(wav(1, 16, [-16_384, 16_384, 0, 32_767]), 0, 0.5, 2);
    let worker = FakeWorker.instances[0];
    const pcmAudio = worker.postMessage.mock.calls[0][0].audioData as Float32Array;
    expect([...pcmAudio]).toEqual([-0.5, 0.5, 0, 0.999969482421875]);

    worker.onmessage?.({ data: { type: 'done', peaks: new Float32Array([-0.5, 1]) } } as MessageEvent);
    state.generateWaveformFromWav(wav(3, 32, [-0.25, 0.75]), 0, 1, 2);
    worker = FakeWorker.instances[1];
    expect([...worker.postMessage.mock.calls[0][0].audioData]).toEqual([-0.25, 0.75]);

    worker.onmessage?.({ data: { type: 'done', peaks: new Float32Array([0, 0]) } } as MessageEvent);
    state.generateWaveformFromWav(wav(2 as 1, 24 as 16, [0]), 0, 1, 2);
    worker = FakeWorker.instances[2];
    expect([...worker.postMessage.mock.calls[0][0].audioData]).toEqual([0]);

    const channels = [new Float32Array([1, 0]), new Float32Array([0, 1])];
    const audioBuffer = {
      sampleRate: 2,
      length: 2,
      numberOfChannels: 2,
      getChannelData: (channel: number) => channels[channel],
    } as unknown as AudioBuffer;
    state.generateWaveformFromAudioBuffer(audioBuffer, -1, 1, 2);
    expect(FakeWorker.instances[3].postMessage).toHaveBeenCalled();
    await nextTick();
  });

  it('stores malformed WAV errors and terminates the worker at unmount', () => {
    const malformed = new ArrayBuffer(24);
    const malformedView = new DataView(malformed);
    malformedView.setUint32(12, 0x666d7420, false);
    malformedView.setUint32(16, 16, true);
    state.generateWaveformFromWav(malformed, 0, 1);
    expect(state.error.value).toContain('Offset is outside the bounds');
    state.generateWaveform(new Float32Array([1]));
    const worker = FakeWorker.instances[0];
    wrapper.unmount();
    expect(worker.terminate).toHaveBeenCalled();
  });
});

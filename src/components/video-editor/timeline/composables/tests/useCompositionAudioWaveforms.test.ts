import { defineComponent, h, nextTick, ref } from "vue";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCompositionAudioWaveforms } from "../useCompositionAudioWaveforms";
import type { ClipComposition } from "../../../composition/composition-types";

const { primaryTrack, decodeAudioData, sinkBuffers, workers } = vi.hoisted(() => ({
  primaryTrack: vi.fn(),
  decodeAudioData: vi.fn(),
  sinkBuffers: vi.fn(),
  workers: [] as FakeWorker[],
}));

vi.mock("mediabunny", () => ({
  ALL_FORMATS: [],
  BlobSource: class BlobSource { constructor(...args: unknown[]) { void args; } },
  Input: class Input {
    getPrimaryAudioTrack = primaryTrack;
    dispose = vi.fn();
  },
  AudioBufferSink: class AudioBufferSink {
    constructor(...args: unknown[]) { void args; }
    buffers = sinkBuffers;
  },
}));

const buffer = (values = [0, .2, .4, .8, 0, .1, .3, .7]): AudioBuffer => ({
  sampleRate: 10, length: values.length / 2, numberOfChannels: 2,
  getChannelData: vi.fn(() => Float32Array.from(values)),
} as unknown as AudioBuffer);

const composition = (volume = 100): ClipComposition => ({
  schemaVersion: 1,
  assets: [{ id: "audio", kind: "audio", name: "Sound", fileName: "sound.wav", durationMs: 2_000, width: null, height: null, src: "sound.wav", origin: "project" }],
  clips: [{ id: "clip", kind: "audio", name: "Sound", assetId: "audio", role: "imported", timelineStartMs: 0, timelineDurationMs: 1_000, sourceInMs: 0, sourceDurationMs: 1_000, playbackRate: 1, enabled: true, order: 0, volume }],
});

class FakeOfflineAudioContext {
  decodeAudioData = decodeAudioData;
  constructor(...args: unknown[]) { void args; }
}

class FakeWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  terminate = vi.fn();
  constructor() { workers.push(this); }
  postMessage = vi.fn(() => queueMicrotask(() => this.onmessage?.({ data: { type: "done", peaks: new Float32Array([0, .2, 0, .8]) } } as MessageEvent)));
}

let wrapper: VueWrapper | undefined;
let state!: ReturnType<typeof useCompositionAudioWaveforms>;

const mountComposable = (value = composition()) => {
  const compositionRef = ref(value);
  const Harness = defineComponent({
    setup() {
      state = useCompositionAudioWaveforms(() => compositionRef.value, () => 2);
      return () => h("div");
    },
  });
  wrapper = mount(Harness);
  return compositionRef;
};

beforeEach(() => {
  workers.length = 0;
  vi.stubGlobal("Worker", FakeWorker);
  vi.stubGlobal("OfflineAudioContext", FakeOfflineAudioContext);
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(new ArrayBuffer(16), { status: 200 }));
  decodeAudioData.mockResolvedValue(buffer());
  primaryTrack.mockResolvedValue({ canDecode: vi.fn().mockResolvedValue(true) });
  sinkBuffers.mockImplementation(async function* () { yield { buffer: buffer(), timestamp: 0, duration: 1 }; });
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("useCompositionAudioWaveforms", () => {
  it("decodes audio, processes worker peaks, and applies volume gain", async () => {
    const compositionRef = mountComposable();
    await flushPromises();
    await nextTick();
    expect(state.bars.value.clip).toEqual([10, 38]);
    expect(decodeAudioData).toHaveBeenCalled();

    const clip = compositionRef.value.clips[0];
    if (clip.kind !== "audio") throw new Error("audio fixture missing");
    clip.volume = 0;
    await nextTick();
    expect(state.bars.value.clip).toEqual([0, 0]);
    clip.volume = 50;
    await nextTick();
    expect(state.bars.value.clip).toEqual([5, 19]);
  });

  it("falls back to mediabunny buffers when Web Audio decoding fails", async () => {
    decodeAudioData.mockRejectedValueOnce(new Error("unsupported codec"));
    vi.mocked(fetch).mockImplementation(() => Promise.resolve(new Response(new ArrayBuffer(16), { status: 200 })));
    mountComposable();
    await flushPromises();
    await nextTick();
    expect(primaryTrack).toHaveBeenCalled();
    expect(sinkBuffers).toHaveBeenCalledWith(0, 1);
    expect(state.bars.value.clip).toEqual([10, 38]);
  });

  it("returns empty bars for undecodable or missing sources and terminates workers", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    primaryTrack.mockResolvedValueOnce(null);
    decodeAudioData.mockRejectedValueOnce(new Error("unsupported codec"));
    vi.mocked(fetch).mockImplementation(() => Promise.resolve(new Response(new ArrayBuffer(16), { status: 200 })));
    mountComposable();
    await flushPromises();
    expect(state.bars.value.clip).toEqual([]);
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining("Unable to calculate waveform"), expect.anything());

    wrapper?.unmount();
    wrapper = undefined;
  });

  it("keeps empty compositions inert", async () => {
    mountComposable({ schemaVersion: 1, assets: [], clips: [] });
    await flushPromises();
    expect(state.bars.value).toEqual({});
  });
});

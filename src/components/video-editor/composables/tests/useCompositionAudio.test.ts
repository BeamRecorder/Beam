import { effectScope, nextTick, ref } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCompositionAudio } from "../useCompositionAudio";
import type { ClipComposition } from "../../composition/composition-types";

const starts: Array<{ when: number; offset: number; duration?: number }> = [];

class FakeGain {
  gain = { value: 1, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn() };
  connect = vi.fn();
  disconnect = vi.fn();
}

class FakeSource {
  buffer: AudioBuffer | null = null;
  playbackRate = { value: 1 };
  onended: (() => void) | null = null;
  connect = vi.fn();
  disconnect = vi.fn();
  stop = vi.fn();
  start(when: number, offset: number, duration?: number) { starts.push({ when, offset, duration }); }
}

class FakeAudioContext {
  currentTime = 4;
  state: AudioContextState = "running";
  destination = {} as AudioDestinationNode;
  createGain = () => new FakeGain() as unknown as GainNode;
  createBufferSource = () => new FakeSource() as unknown as AudioBufferSourceNode;
  decodeAudioData = vi.fn(async () => ({ duration: 12 } as AudioBuffer));
  resume = vi.fn(async () => undefined);
  close = vi.fn(async () => undefined);
}

const composition = (): ClipComposition => ({
  schemaVersion: 1,
  assets: [{ id: "sound", kind: "audio", name: "Sound", fileName: "sound.webm", durationMs: 12_000, width: null, height: null, src: "project-media://asset/sound.webm", origin: "project" }],
  clips: [{ id: "clip", kind: "audio", name: "Sound", assetId: "sound", role: "imported", timelineStartMs: 1_000, timelineDurationMs: 4_000, sourceInMs: 0, sourceDurationMs: 4_000, playbackRate: 1, enabled: true, order: 0, volume: 100 }],
});

const settle = async () => { await nextTick(); await Promise.resolve(); await Promise.resolve(); await nextTick(); };

describe("useCompositionAudio", () => {
  afterEach(() => { vi.unstubAllGlobals(); starts.length = 0; });

  it("starts a preloaded clip when playback naturally crosses its start", async () => {
    vi.stubGlobal("AudioContext", FakeAudioContext);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new ArrayBuffer(8), { status: 200 })));
    const scope = effectScope();
    const currentTime = ref(0);
    const isPlaying = ref(false);
    scope.run(() => useCompositionAudio({ composition: ref(composition()), currentTime, isPlaying, volume: ref(100) }));
    await settle();

    isPlaying.value = true;
    await settle();
    expect(starts).toEqual([]);

    currentTime.value = 1;
    await settle();
    expect(starts).toHaveLength(1);
    expect(starts[0]).toMatchObject({ when: 4, offset: 0, duration: 4 });
    scope.stop();
  });
});

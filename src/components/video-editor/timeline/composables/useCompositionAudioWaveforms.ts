import { computed, onUnmounted, ref, watch } from "vue";
import { ALL_FORMATS, AudioBufferSink, BlobSource, Input } from "mediabunny";
import { isAudioClip, type ClipComposition } from "../../composition/composition-types";

const MAX_BAR_HEIGHT = 22;

const pointCountFor = (timelineDurationMs: number, totalDurationSeconds: number) =>
  Math.max(24, Math.min(1_200, Math.round(900 * (timelineDurationMs / 1_000) / Math.max(1, totalDurationSeconds))));

const monoSliceFromAudioBuffer = (
  buffer: AudioBuffer,
  sourceInMs: number,
  sourceDurationMs: number,
) => {
  const start = Math.max(0, Math.floor(sourceInMs / 1_000 * buffer.sampleRate));
  const end = Math.min(
    buffer.length,
    Math.ceil((sourceInMs + sourceDurationMs) / 1_000 * buffer.sampleRate),
  );
  const samples = new Float32Array(Math.max(0, end - start));
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const source = buffer.getChannelData(channel).subarray(start, end);
    for (let index = 0; index < samples.length; index += 1) {
      samples[index] += source[index] / buffer.numberOfChannels;
    }
  }
  return samples;
};

const monoSliceFromMedia = async (
  src: string,
  sourceInMs: number,
  sourceDurationMs: number,
) => {
  const response = await fetch(src);
  if (!response.ok) throw new Error("Unable to read audio media");
  const input = new Input({ source: new BlobSource(await response.blob()), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track || !(await track.canDecode())) throw new Error("Audio cannot be decoded");
    const startSeconds = sourceInMs / 1_000;
    const endSeconds = (sourceInMs + sourceDurationMs) / 1_000;
    const chunks: Float32Array[] = [];
    let totalLength = 0;
    const sink = new AudioBufferSink(track);
    for await (const sample of sink.buffers(startSeconds, endSeconds)) {
      const buffer = sample.buffer;
      const sliceStart = Math.max(startSeconds, sample.timestamp);
      const sliceEnd = Math.min(endSeconds, sample.timestamp + sample.duration);
      const first = Math.max(0, Math.floor((sliceStart - sample.timestamp) * buffer.sampleRate));
      const last = Math.min(buffer.length, Math.ceil((sliceEnd - sample.timestamp) * buffer.sampleRate));
      if (last <= first) continue;
      const chunk = new Float32Array(last - first);
      for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
        const values = buffer.getChannelData(channel).subarray(first, last);
        for (let index = 0; index < chunk.length; index += 1) {
          chunk[index] += values[index] / buffer.numberOfChannels;
        }
      }
      chunks.push(chunk);
      totalLength += chunk.length;
    }
    const samples = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      samples.set(chunk, offset);
      offset += chunk.length;
    }
    return samples;
  } finally {
    input.dispose();
  }
};

const decodeSamples = async (src: string, sourceInMs: number, sourceDurationMs: number) => {
  try {
    const response = await fetch(src);
    if (!response.ok) throw new Error("Unable to read audio media");
    const context = new OfflineAudioContext(1, 1, 44_100);
    const buffer = await context.decodeAudioData(await response.arrayBuffer());
    return monoSliceFromAudioBuffer(buffer, sourceInMs, sourceDurationMs);
  } catch {
    return monoSliceFromMedia(src, sourceInMs, sourceDurationMs);
  }
};

const barsFromPeaks = (peaks: Float32Array) => {
  const count = Math.floor(peaks.length / 2);
  if (count <= 0) return [];
  const amplitudes = new Float32Array(count);
  let maximum = 0.0001;
  for (let index = 0; index < count; index += 1) {
    const amplitude = Math.max(0, peaks[index * 2 + 1] - peaks[index * 2]);
    amplitudes[index] = amplitude;
    maximum = Math.max(maximum, amplitude);
  }
  const scale = maximum > 0.01 ? MAX_BAR_HEIGHT / maximum : MAX_BAR_HEIGHT * 5;
  return Array.from(amplitudes, (amplitude) =>
    Math.max(2, Math.min(MAX_BAR_HEIGHT, Math.round(amplitude * scale))),
  );
};

export function useCompositionAudioWaveforms(
  composition: () => ClipComposition,
  timelineDurationSeconds: () => number,
) {
  const rawBars = ref<Record<string, number[]>>({});
  const workers = new Set<Worker>();
  let generation = 0;

  const bars = computed<Record<string, number[]>>(() => {
    const volumes = new Map(
      composition().clips
        .filter(isAudioClip)
        .map((clip) => [clip.id, Math.max(0, Math.min(2, clip.volume / 100))]),
    );
    return Object.fromEntries(
      Object.entries(rawBars.value).map(([clipId, heights]) => {
        const gain = volumes.get(clipId) ?? 1;
        return [
          clipId,
          heights.map((height) => gain <= 0
            ? 0
            : Math.max(1, Math.min(MAX_BAR_HEIGHT, Math.round(height * gain))),
          ),
        ];
      }),
    );
  });

  const stopWorkers = () => {
    for (const worker of workers) worker.terminate();
    workers.clear();
  };

  const processSamples = (samples: Float32Array, targetPoints: number) => new Promise<Float32Array>((resolve, reject) => {
    if (!samples.length) return resolve(new Float32Array());
    const worker = new Worker(new URL("../waveform/waveform.worker.ts", import.meta.url), { type: "module" });
    workers.add(worker);
    const finish = () => {
      workers.delete(worker);
      worker.terminate();
    };
    worker.onmessage = (event: MessageEvent) => {
      if (event.data?.type === "done") {
        const peaks = event.data.peaks instanceof Float32Array
          ? event.data.peaks
          : new Float32Array(event.data.peaks ?? []);
        finish();
        resolve(peaks);
      } else if (event.data?.type === "error") {
        finish();
        reject(new Error(event.data.message || "Waveform worker failed"));
      }
    };
    worker.onerror = (event) => {
      finish();
      reject(new Error(event.message || "Waveform worker failed"));
    };
    worker.postMessage({ type: "process", audioData: samples, targetPoints }, [samples.buffer]);
  });

  const sources = computed(() => {
    const assets = new Map(composition().assets.map((asset) => [asset.id, asset]));
    return composition().clips.flatMap((clip) => {
      if (!isAudioClip(clip)) return [];
      const asset = assets.get(clip.assetId);
      if (!asset?.src) return [];
      return [{
        id: clip.id,
        src: asset.src,
        sourceInMs: clip.sourceInMs,
        sourceDurationMs: clip.sourceDurationMs,
        timelineDurationMs: clip.timelineDurationMs,
      }];
    });
  });

  watch(sources, async (clips) => {
    const currentGeneration = ++generation;
    stopWorkers();
    const next: Record<string, number[]> = {};
    await Promise.all(clips.map(async (clip) => {
      try {
        const samples = await decodeSamples(clip.src, clip.sourceInMs, clip.sourceDurationMs);
        if (currentGeneration !== generation) return;
        const peaks = await processSamples(
          samples,
          pointCountFor(clip.timelineDurationMs, timelineDurationSeconds()),
        );
        next[clip.id] = barsFromPeaks(peaks);
      } catch (error) {
        console.error(`Unable to calculate waveform for clip ${clip.id}:`, error);
        next[clip.id] = [];
      }
    }));
    if (currentGeneration === generation) rawBars.value = next;
  }, { immediate: true });

  onUnmounted(() => {
    generation += 1;
    stopWorkers();
  });

  return { bars };
}

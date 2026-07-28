import { computed, ref, watch } from "vue";
import { ALL_FORMATS, AudioBufferSink, BlobSource, Input } from "mediabunny";
import { isAudioClip, type ClipComposition } from "../../composition/composition-types";

const barCountFor = (timelineDurationMs: number, totalDurationSeconds: number) =>
  Math.max(12, Math.round(180 * (timelineDurationMs / 1_000) / Math.max(1, totalDurationSeconds)));

const barsFromAudioBuffer = (
  buffer: AudioBuffer,
  sourceInMs: number,
  sourceDurationMs: number,
  count: number,
) => {
  const startSample = Math.max(0, Math.floor(sourceInMs / 1_000 * buffer.sampleRate));
  const endSample = Math.min(
    buffer.length,
    Math.ceil((sourceInMs + sourceDurationMs) / 1_000 * buffer.sampleRate),
  );
  const sampleCount = Math.max(1, endSample - startSample);

  return Array.from({ length: Math.max(1, count) }, (_, index) => {
    const start = startSample + Math.floor(index * sampleCount / count);
    const end = Math.max(start + 1, startSample + Math.floor((index + 1) * sampleCount / count));
    let peak = 0;
    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
      const data = buffer.getChannelData(channel);
      for (let sample = start; sample < Math.min(end, data.length); sample += 1) {
        peak = Math.max(peak, Math.abs(data[sample] ?? 0));
      }
    }
    return Math.max(2, Math.round(peak * 22));
  });
};

const barsFromMedia = async (
  src: string,
  sourceInMs: number,
  sourceDurationMs: number,
  count: number,
) => {
  const response = await fetch(src);
  if (!response.ok) throw new Error("Unable to read audio media");
  const input = new Input({ source: new BlobSource(await response.blob()), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track || !(await track.canDecode())) throw new Error("Audio cannot be decoded");
    const startSeconds = sourceInMs / 1_000;
    const durationSeconds = Math.max(0.001, sourceDurationMs / 1_000);
    const peaks = new Float32Array(count);
    const sink = new AudioBufferSink(track);
    for await (const sample of sink.buffers(startSeconds, startSeconds + durationSeconds)) {
      const relativeStart = Math.max(0, sample.timestamp - startSeconds);
      const relativeEnd = Math.min(durationSeconds, relativeStart + sample.duration);
      const first = Math.max(0, Math.floor(relativeStart / durationSeconds * count));
      const last = Math.min(count - 1, Math.floor(relativeEnd / durationSeconds * count));
      let peak = 0;
      for (let channel = 0; channel < sample.buffer.numberOfChannels; channel += 1) {
        const values = sample.buffer.getChannelData(channel);
        for (let index = 0; index < values.length; index += 1) {
          peak = Math.max(peak, Math.abs(values[index] ?? 0));
        }
      }
      for (let index = first; index <= last; index += 1) peaks[index] = Math.max(peaks[index], peak);
    }
    return Array.from(peaks, (peak) => Math.max(2, Math.round(peak * 22)));
  } finally {
    input.dispose();
  }
};

export function useCompositionAudioWaveforms(
  composition: () => ClipComposition,
  timelineDurationSeconds: () => number,
) {
  const bars = ref<Record<string, number[]>>({});
  let generation = 0;

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
    const next: Record<string, number[]> = {};
    await Promise.all(clips.map(async (clip) => {
      const count = barCountFor(clip.timelineDurationMs, timelineDurationSeconds());
      try {
        const response = await fetch(clip.src);
        if (!response.ok) return;
        const context = new OfflineAudioContext(1, 1, 44_100);
        const buffer = await context.decodeAudioData(await response.arrayBuffer());
        next[clip.id] = barsFromAudioBuffer(
          buffer,
          clip.sourceInMs,
          clip.sourceDurationMs,
          count,
        );
      } catch {
        try {
          next[clip.id] = await barsFromMedia(
            clip.src,
            clip.sourceInMs,
            clip.sourceDurationMs,
            count,
          );
        } catch {
          next[clip.id] = [];
        }
      }
    }));
    if (currentGeneration === generation) bars.value = next;
  }, { immediate: true });

  return { bars };
}

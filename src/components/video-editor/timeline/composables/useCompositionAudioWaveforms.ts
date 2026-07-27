import { computed, ref, watch } from 'vue'
import { ALL_FORMATS, AudioBufferSink, BlobSource, Input } from 'mediabunny'
import type { MediaCompositionLayer, ProjectComposition } from '../../composition/composition-types'

const barsFor = (buffer: AudioBuffer, startSeconds: number, durationSeconds: number, count: number) => {
  const startSample = Math.max(0, Math.floor(startSeconds * buffer.sampleRate))
  const endSample = Math.min(buffer.length, Math.ceil((startSeconds + durationSeconds) * buffer.sampleRate))
  return Array.from({ length: Math.max(1, count) }, (_, index) => {
  const start = startSample + Math.floor(index * (endSample - startSample) / count)
  const end = Math.max(start + 1, startSample + Math.floor((index + 1) * (endSample - startSample) / count))
  let peak = 0
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel)
    for (let sample = start; sample < end; sample += 1) peak = Math.max(peak, Math.abs(data[sample] ?? 0))
  }
  return Math.max(2, Math.round(peak * 22))
})
}

const barsFromMedia = async (src: string, startSeconds: number, durationSeconds: number, count: number) => {
  const response = await fetch(src)
  if (!response.ok) throw new Error('Unable to read audio media')
  const input = new Input({ source: new BlobSource(await response.blob()), formats: ALL_FORMATS })
  try {
    const track = await input.getPrimaryAudioTrack()
    if (!track || !(await track.canDecode())) throw new Error('Audio cannot be decoded')
    const peaks = new Float32Array(count)
    const sink = new AudioBufferSink(track)
    for await (const sample of sink.buffers(startSeconds, startSeconds + durationSeconds)) {
      const relativeStart = Math.max(0, sample.timestamp - startSeconds)
      const relativeEnd = Math.min(durationSeconds, relativeStart + sample.duration)
      const first = Math.max(0, Math.floor(relativeStart / durationSeconds * count))
      const last = Math.min(count - 1, Math.floor(relativeEnd / durationSeconds * count))
      let peak = 0
      for (let channel = 0; channel < sample.buffer.numberOfChannels; channel += 1) {
        const values = sample.buffer.getChannelData(channel)
        for (let index = 0; index < values.length; index += 1) peak = Math.max(peak, Math.abs(values[index] ?? 0))
      }
      for (let index = first; index <= last; index += 1) peaks[index] = Math.max(peaks[index], peak)
    }
    return Array.from(peaks, (peak) => Math.max(2, Math.round(peak * 22)))
  } finally { input.dispose() }
}

export function useCompositionAudioWaveforms(composition: () => ProjectComposition, timelineDuration: () => number) {
  const bars = ref<Record<string, number[]>>({})
  const sources = computed(() => {
    const assets = new Map(composition().media.map((asset) => [asset.id, asset.src]))
    return composition().layers.filter((layer): layer is MediaCompositionLayer & { kind: 'audio' } => layer.kind === 'audio').flatMap((layer) => {
      const src = assets.get(layer.assetId)
      return src ? [{ id: layer.id, src, sourceOffsetSeconds: (layer.sourceOffsetMs ?? 0) / 1000, timelineDurationSeconds: (layer.endMs - layer.startMs) / 1000 }] : []
    })
  })
  watch(sources, async (layers) => {
    const next: Record<string, number[]> = {}
    await Promise.all(layers.map(async ({ id, src, sourceOffsetSeconds, timelineDurationSeconds }) => {
      try {
        const response = await fetch(src)
        if (!response.ok) return
        const context = new OfflineAudioContext(1, 1, 44_100)
        const points = Math.max(12, Math.round(180 * timelineDurationSeconds / Math.max(1, timelineDuration())))
        next[id] = barsFor(await context.decodeAudioData(await response.arrayBuffer()), sourceOffsetSeconds, timelineDurationSeconds, points)
      } catch {
        try { next[id] = await barsFromMedia(src, sourceOffsetSeconds, timelineDurationSeconds, Math.max(12, Math.round(180 * timelineDurationSeconds / Math.max(1, timelineDuration())))) }
        catch { next[id] = [] }
      }
    }))
    bars.value = next
  }, { immediate: true })
  return { bars }
}

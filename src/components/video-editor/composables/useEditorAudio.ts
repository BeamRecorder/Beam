import { computed, onBeforeUnmount, watch, type Ref } from 'vue'
import type { ProjectEditorData, SessionTrackAsset } from '../../../api/types/capture-api'
import { sessionSegmentAtTimeline, timelineToSourceMs } from '../composition/base-video-ranges'
import type { ProjectComposition } from '../composition/composition-types'

type AudioLayer = { id: string; src: string; startSeconds: number; asset: SessionTrackAsset }

export function editorAudioLayers(editorData: ProjectEditorData | null | undefined, systemAudioEnabled: boolean, microphoneEnabled: boolean): AudioLayer[] {
  return (editorData?.tracks ?? []).flatMap((track) => {
    const enabled = track.kind === 'system-audio' ? systemAudioEnabled : track.kind === 'microphone' ? microphoneEnabled : false
    if (!enabled || track.status === 'failed') return []
    return track.assets.flatMap((asset) => asset.exists && asset.complete && asset.src ? [{ id: `${track.trackId}:${asset.path}`, src: asset.src, startSeconds: Math.max(0, asset.startNs / 1_000_000_000), asset }] : [])
  })
}

export function useEditorAudio(input: {
  editorData: Ref<ProjectEditorData | null | undefined>
  currentTime: Ref<number>
  isPlaying: Ref<boolean>
  volume: Ref<number>
  systemAudioEnabled: Ref<boolean>
  microphoneEnabled: Ref<boolean>
  composition?: Ref<ProjectComposition>
}) {
  const media = new Map<string, HTMLAudioElement>()
  const layers = computed(() => editorAudioLayers(input.editorData.value, input.systemAudioEnabled.value, input.microphoneEnabled.value))

  const stop = (element: HTMLAudioElement) => { element.pause(); element.removeAttribute('src'); element.load() }
  const reconcile = () => {
    const active = new Set(layers.value.map((layer) => layer.id))
    for (const [id, element] of media) if (!active.has(id)) { stop(element); media.delete(id) }
    for (const layer of layers.value) if (!media.has(layer.id)) {
      const element = new Audio(layer.src)
      element.preload = 'auto'
      media.set(layer.id, element)
    }
  }

  const synchronize = () => {
    reconcile()
    for (const layer of layers.value) {
      const element = media.get(layer.id)
      if (!element) continue
      element.volume = Math.max(0, Math.min(1, input.volume.value / 100))
      const sourceDurationMs = Math.max(0, Math.round((input.editorData.value?.manifest.durationNs ?? 0) / 1_000_000))
      const currentComposition = input.composition?.value ?? { media: [], layers: [] }
      element.playbackRate = sessionSegmentAtTimeline(currentComposition, input.currentTime.value * 1000, sourceDurationMs)?.playbackRate ?? 1
      const sourceMs = timelineToSourceMs(currentComposition, input.currentTime.value * 1000, sourceDurationMs)
      const localTime = sourceMs === null ? -1 : sourceMs / 1000 - layer.startSeconds
      const active = input.isPlaying.value && localTime >= 0 && (!Number.isFinite(element.duration) || localTime < element.duration)
      if (!active) { element.pause(); continue }
      if (Math.abs(element.currentTime - localTime) > 0.12) element.currentTime = localTime
      void element.play().catch(() => undefined)
    }
  }

  watch([layers, input.currentTime, input.isPlaying, input.volume, input.composition ?? computed(() => undefined)], synchronize, { immediate: true, deep: true })
  onBeforeUnmount(() => { for (const element of media.values()) stop(element); media.clear() })
  return { layers }
}

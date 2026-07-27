import { computed, onBeforeUnmount, watch, type Ref } from 'vue'
import { activeLayersAt, type MediaCompositionLayer, type ProjectComposition } from '../composition/composition-types'

export function useCompositionAudio(input: {
  composition: Ref<ProjectComposition>
  currentTime: Ref<number>
  isPlaying: Ref<boolean>
  volume: Ref<number>
}) {
  const elements = new Map<string, HTMLAudioElement>()
  const audioLayers = computed(() => input.composition.value.layers.filter((layer): layer is MediaCompositionLayer & { kind: 'audio' } => layer.kind === 'audio' && layer.enabled))

  const dispose = (element: HTMLAudioElement) => { element.pause(); element.removeAttribute('src'); element.load() }
  const reconcile = () => {
    const assets = new Map(input.composition.value.media.map((asset) => [asset.id, asset]))
    const activeIds = new Set(audioLayers.value.map((layer) => layer.id))
    for (const [id, element] of elements) if (!activeIds.has(id)) { dispose(element); elements.delete(id) }
    for (const layer of audioLayers.value) {
      const asset = assets.get(layer.assetId)
      if (!asset?.src || elements.has(layer.id)) continue
      const element = new Audio(asset.src)
      element.preload = 'auto'
      elements.set(layer.id, element)
    }
  }

  const synchronize = () => {
    reconcile()
    const timeMs = input.currentTime.value * 1000
    const active = new Set(activeLayersAt(input.composition.value, timeMs).filter((layer) => layer.kind === 'audio').map((layer) => layer.id))
    for (const layer of audioLayers.value) {
      const element = elements.get(layer.id)
      if (!element) continue
      if (!input.isPlaying.value || !active.has(layer.id)) { element.pause(); continue }
      const rate = layer.playbackRate ?? 1
      const sourceTime = ((timeMs - layer.startMs) * rate + (layer.sourceOffsetMs ?? 0)) / 1000
      if (sourceTime < 0 || (Number.isFinite(element.duration) && sourceTime >= element.duration)) { element.pause(); continue }
      element.volume = Math.max(0, Math.min(1, input.volume.value / 100))
      element.playbackRate = rate
      if (Math.abs(element.currentTime - sourceTime) > .12) element.currentTime = sourceTime
      void element.play().catch(() => undefined)
    }
  }

  watch([audioLayers, input.currentTime, input.isPlaying, input.volume], synchronize, { immediate: true, deep: true })
  onBeforeUnmount(() => { for (const element of elements.values()) dispose(element); elements.clear() })
  return { audioLayers }
}

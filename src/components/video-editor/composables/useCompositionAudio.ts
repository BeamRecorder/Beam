import { computed, onBeforeUnmount, watch, type Ref } from 'vue'
import { activeClipsAt, sourceTimeAt } from '../composition/engine/clip-engine'
import { isAudioClip, type AudioClip, type ClipComposition, type MediaAsset } from '../composition/composition-types'

const SEEK_TOLERANCE_SECONDS = 0.08
const FADE_SECONDS = 0.012

type ScheduledSource = { source: AudioBufferSourceNode; gain: GainNode }
type PlaybackAnchor = { timelineSeconds: number; contextSeconds: number; signature: string }

const audioAssetSignature = (asset: MediaAsset) => `${asset.id}:${asset.src}`

/**
 * Preview audio owns one Web Audio clock. HTMLMediaElement seeks are deliberately
 * not used here: they are asynchronous per element and cannot restart a mix at
 * one exact timeline position.
 */
export function useCompositionAudio(input: {
  composition: Ref<ClipComposition>
  currentTime: Ref<number>
  isPlaying: Ref<boolean>
  volume: Ref<number>
}) {
  const audioClips = computed(() => input.composition.value.clips.filter(isAudioClip))
  const buffers = new Map<string, { source: string; buffer: AudioBuffer }>()
  const loading = new Map<string, Promise<AudioBuffer | null>>()
  const scheduled = new Set<ScheduledSource>()
  let context: AudioContext | null = null
  let masterGain: GainNode | null = null
  let anchor: PlaybackAnchor | null = null
  let generation = 0

  const ensureContext = () => {
    if (context) return context
    context = new AudioContext()
    masterGain = context.createGain()
    masterGain.gain.value = Math.max(0, Math.min(1, input.volume.value / 100))
    masterGain.connect(context.destination)
    return context
  }

  const assetFor = (clip: AudioClip) =>
    input.composition.value.assets.find((asset) => asset.id === clip.assetId) ?? null

  const loadAsset = (asset: MediaAsset) => {
    const cached = buffers.get(asset.id)
    if (cached?.source === asset.src) return Promise.resolve(cached.buffer)
    const pending = loading.get(asset.id)
    if (pending) return pending
    const task = (async () => {
      try {
        const response = await fetch(asset.src)
        if (!response.ok) throw new Error(`Unable to read audio asset: ${asset.name}`)
        const buffer = await ensureContext().decodeAudioData(await response.arrayBuffer())
        buffers.set(asset.id, { source: asset.src, buffer })
        return buffer
      } catch (error) {
        console.error(`Unable to preload audio asset ${asset.name}:`, error)
        return null
      } finally {
        loading.delete(asset.id)
      }
    })()
    loading.set(asset.id, task)
    return task
  }

  const preload = () => {
    // Imported video can have a linked audio clip. Preload by clip reference,
    // not by MediaAsset.kind, so its sound is ready at the clip boundary too.
    const assetIds = new Set(audioClips.value.map((clip) => clip.assetId))
    const audioAssets = input.composition.value.assets.filter((asset) => assetIds.has(asset.id) && Boolean(asset.src))
    const valid = new Set(audioAssets.map((asset) => asset.id))
    for (const id of buffers.keys()) if (!valid.has(id)) buffers.delete(id)
    for (const asset of audioAssets) void loadAsset(asset)
  }

  const stopScheduled = () => {
    const now = context?.currentTime ?? 0
    for (const item of scheduled) {
      try {
        item.gain.gain.cancelScheduledValues(now)
        item.gain.gain.setValueAtTime(item.gain.gain.value, now)
        item.gain.gain.linearRampToValueAtTime(0, now + FADE_SECONDS)
        item.source.stop(now + FADE_SECONDS)
      } catch {
        // A source may already have ended or been stopped by a newer seek.
      }
      item.source.disconnect()
      item.gain.disconnect()
    }
    scheduled.clear()
    anchor = null
  }

  const mixSignature = () =>
    [
      input.volume.value,
      ...audioClips.value.map(
        (clip) =>
          `${clip.id}:${clip.assetId}:${clip.timelineStartMs}:${clip.timelineDurationMs}:${clip.sourceInMs}:${clip.sourceDurationMs}:${clip.playbackRate}:${clip.enabled}:${clip.volume}`,
      ),
      // Crossing a clip edge changes the mix even though the composition itself
      // did not change. This makes playback start/stop exactly at that boundary.
      `active:${activeClipsAt(input.composition.value, input.currentTime.value * 1_000)
        .filter(isAudioClip)
        .map((clip) => clip.id)
        .join(',')}`,
    ].join('|')

  const startAt = async (timelineSeconds: number, requestedSignature = mixSignature()) => {
    const request = ++generation
    stopScheduled()
    const currentContext = ensureContext()
    if (currentContext.state === 'suspended') await currentContext.resume()
    if (!input.isPlaying.value || request !== generation) return
    const timelineMs = timelineSeconds * 1_000
    const clips = activeClipsAt(input.composition.value, timelineMs).filter(isAudioClip)
    const assets = clips.map(assetFor).filter((asset): asset is MediaAsset => Boolean(asset?.src))
    await Promise.all(assets.map(loadAsset))
    if (!input.isPlaying.value || request !== generation || requestedSignature !== mixSignature()) return

    // Decoding is asynchronous. Start at the latest timeline position after it
    // completes so the first playback is not audibly behind the playhead.
    const effectiveTimelineSeconds = input.currentTime.value
    const effectiveTimelineMs = effectiveTimelineSeconds * 1_000
    const effectiveClips = activeClipsAt(input.composition.value, effectiveTimelineMs).filter(isAudioClip)
    const now = currentContext.currentTime
    masterGain?.gain.setTargetAtTime(Math.max(0, Math.min(1, input.volume.value / 100)), now, 0.004)
    for (const clip of effectiveClips) {
      const asset = assetFor(clip)
      const buffer = asset ? buffers.get(asset.id)?.buffer : null
      const sourceMs = sourceTimeAt(clip, effectiveTimelineMs)
      if (!buffer || sourceMs === null) continue
      const offset = sourceMs / 1_000
      if (offset >= buffer.duration) continue
      const source = currentContext.createBufferSource()
      const gain = currentContext.createGain()
      const level = Math.max(0, Math.min(2, clip.volume / 100))
      source.buffer = buffer
      source.playbackRate.value = clip.playbackRate
      gain.gain.setValueAtTime(0, now)
      gain.gain.linearRampToValueAtTime(level, now + FADE_SECONDS)
      source.connect(gain)
      gain.connect(masterGain!)
      const clipRemaining = clip.sourceDurationMs / 1_000 - (offset - clip.sourceInMs / 1_000)
      const remaining = Math.min(buffer.duration - offset, clipRemaining)
      if (remaining <= 0) continue
      const item = { source, gain }
      scheduled.add(item)
      source.onended = () => scheduled.delete(item)
      source.start(now, offset, remaining)
    }
    anchor = { timelineSeconds: effectiveTimelineSeconds, contextSeconds: now, signature: requestedSignature }
  }

  const synchronize = () => {
    preload()
    if (!input.isPlaying.value) {
      generation += 1
      stopScheduled()
      return
    }
    const signature = mixSignature()
    if (!anchor || anchor.signature !== signature) {
      void startAt(input.currentTime.value, signature)
      return
    }
    const expected = anchor.timelineSeconds + (ensureContext().currentTime - anchor.contextSeconds)
    if (Math.abs(input.currentTime.value - expected) > SEEK_TOLERANCE_SECONDS)
      void startAt(input.currentTime.value, signature)
  }

  watch(
    () =>
      input.composition.value.assets
        .filter((asset) => audioClips.value.some((clip) => clip.assetId === asset.id))
        .map(audioAssetSignature)
        .join('|'),
    preload,
    { immediate: true },
  )
  watch([input.currentTime, input.isPlaying, input.volume, audioClips], synchronize, {
    immediate: true,
    deep: true,
    flush: 'post',
  })
  onBeforeUnmount(() => {
    generation += 1
    stopScheduled()
    masterGain?.disconnect()
    void context?.close()
    context = null
    masterGain = null
    buffers.clear()
    loading.clear()
  })

  return { audioClips }
}

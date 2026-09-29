import { createEffect, createMemo, createSignal, onCleanup } from 'solid-js'
import type { BeamApi } from './beamApi'
import type { AudioLevels, AudioPreviewRequest } from './beamTypes'

const silent = (): AudioLevels => ({ microphone: null, systemAudio: null })

/** Polls actual native packets only while visible, releasing previews before capture. */
export function useAudioMeters(api: BeamApi, source: () => AudioPreviewRequest | 'recording' | null) {
  const [levels, setLevels] = createSignal<AudioLevels>(silent())
  const [error, setError] = createSignal('')
  const selection = createMemo(source, undefined, { equals: (previous, next) => previous === next
    || (!!previous && !!next && previous !== 'recording' && next !== 'recording'
      && previous.microphoneId === next.microphoneId && previous.systemAudioId === next.systemAudioId) })
  createEffect(() => {
    const request = selection()
    setLevels(silent()); setError('')
    if (!request) return
    const activeRequest = request
    let disposed = false, reading = false
    let timer: ReturnType<typeof setInterval> | undefined
    const seen = { microphone: { timestamp: -1, at: 0 }, systemAudio: { timestamp: -1, at: 0 } }
    async function refresh() {
      if (reading || disposed) return
      reading = true
      try {
        const value = activeRequest === 'recording' ? await api.audioLevels() : await api.audioPreview(activeRequest)
        if (disposed) return
        const now = Date.now()
        for (const key of ['microphone', 'systemAudio'] as const) {
          if (value[key]?.timestampNs !== seen[key].timestamp) {
            seen[key] = { timestamp: value[key]?.timestampNs ?? -1, at: now }
          } else if (now - seen[key].at > 120) value[key] = null
        }
        setLevels(value)
      } catch (cause) {
        if (!disposed) { setLevels(silent()); setError(String(cause)); clearInterval(timer) }
      } finally { reading = false }
    }
    void refresh()
    timer = setInterval(() => void refresh(), 33)
    onCleanup(() => {
      disposed = true; clearInterval(timer)
      if (activeRequest !== 'recording') void api.audioPreview({ microphoneId: null, systemAudioId: null }).catch(console.error)
    })
  })
  return { levels, error }
}

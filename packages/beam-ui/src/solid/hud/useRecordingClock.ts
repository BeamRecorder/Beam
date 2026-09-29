import { createEffect, createMemo, createSignal, onCleanup } from 'solid-js'
import type { BeamApi } from '../shared/beamApi'

/** Reads the engine's pause-aware duration; window layout never resets the clock. */
export function useRecordingClock(api: Pick<BeamApi, 'status'>, visible: () => boolean) {
  const active = createMemo(visible)
  const [elapsed, setElapsed] = createSignal(0)
  const [error, setError] = createSignal('')
  createEffect(() => {
    if (!active()) return
    let disposed = false, reading = false
    async function refresh(): Promise<void> {
      if (reading || disposed) return
      reading = true
      try {
        const status = await api.status()
        if (disposed) return
        const duration = status.manifest?.durationNs
        if (duration === undefined || !Number.isFinite(duration) || duration < 0)
          throw new Error('The recording clock has no valid session duration.')
        setElapsed(duration / 1_000_000)
        setError('')
      } catch (cause) {
        if (!disposed) setError(String(cause))
      } finally { reading = false }
    }
    void refresh()
    const timer = setInterval(() => void refresh(), 250)
    onCleanup(() => { disposed = true; clearInterval(timer) })
  })
  return { elapsed, error }
}

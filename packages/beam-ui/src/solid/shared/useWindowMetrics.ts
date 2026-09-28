import { createSignal, onCleanup, onMount } from 'solid-js'
import type { BeamApi } from './beamApi'

/** Updates responsive layout from native resize events without an idle timer. */
export function useWindowMetrics(api: BeamApi, initial: { width: number; height: number }) {
  const [metrics, setMetrics] = createSignal({ ...initial, visible: false, pixelScale: 1 })
  let reading = false
  let pending = false
  let disposed = false
  onCleanup(() => { disposed = true })
  async function refresh(): Promise<void> {
    if (reading) { pending = true; return }
    reading = true
    try {
      do {
        pending = false
        const info = await api.windowInfo()
        if (!disposed) setMetrics({ width: info.width / info.uiZoomFactor, height: info.height / info.uiZoomFactor,
          visible: info.visible !== false, pixelScale: info.scaleFactor * info.uiZoomFactor })
      } while (pending && !disposed)
    } catch (cause) { if (!disposed) console.error(cause)
    } finally { reading = false }
  }
  onMount(() => {
    void refresh()
    onCleanup(api.onEvent(event => {
      if (event.type === 'windowResized' && event.physicalWidth !== undefined && event.physicalHeight !== undefined) {
        setMetrics(current => ({ ...current, width: event.physicalWidth! / current.pixelScale, height: event.physicalHeight! / current.pixelScale }))
      } else if (event.type === 'windowResized' || event.type === 'windowVisibility') void refresh()
    }))
  })
  return metrics
}

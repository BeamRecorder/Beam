import { createSignal, onCleanup, onMount } from 'solid-js'
import type { BeamApi } from './beamApi'

/** Updates responsive layout from native resize events without an idle timer. */
export function useWindowMetrics(api: Pick<BeamApi, 'window' | 'windowInfo' | 'onEvent'>, initial: { width: number; height: number }) {
  const [metrics, setMetrics] = createSignal({ ...initial, visible: false, pixelScale: 1 })
  let reading = false
  let pending = false
  let disposed = false
  let revision = 0
  let visible: boolean | undefined
  onCleanup(() => { disposed = true })
  async function refresh(): Promise<void> {
    if (reading) { pending = true; return }
    reading = true
    try {
      do {
        pending = false
        const readingRevision = revision
        const info = await api.windowInfo()
        if (readingRevision !== revision) { pending = true; continue }
        if (!disposed) setMetrics({ width: info.width / info.uiZoomFactor, height: info.height / info.uiZoomFactor,
          visible: visible ?? (info.visible !== false), pixelScale: info.scaleFactor * info.uiZoomFactor })
      } while (pending && !disposed)
    } catch (cause) { if (!disposed && !String(cause).includes('Application service session closed')) console.error(String(cause))
    } finally { reading = false }
  }
  onMount(() => {
    onCleanup(api.onEvent(event => {
      if (!('window' in event) || (event.window && event.window !== api.window)) return
      if (event.type === 'windowResized' || event.type === 'windowVisibility') revision++
      if (event.type === 'windowVisibility' && event.visible !== undefined) {
        visible = event.visible
        setMetrics(current => ({ ...current, visible: event.visible! }))
      } else if (event.type === 'windowResized' && event.physicalWidth !== undefined && event.physicalHeight !== undefined) {
        setMetrics(current => ({ ...current, width: event.physicalWidth! / current.pixelScale, height: event.physicalHeight! / current.pixelScale }))
      } else if (event.type === 'windowResized' || event.type === 'windowVisibility') void refresh()
    }))
    void refresh()
  })
  return metrics
}

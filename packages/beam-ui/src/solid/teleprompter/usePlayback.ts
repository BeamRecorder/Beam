import { createSignal, onCleanup } from 'solid-js'
import type { BeamApi } from '../shared/beamApi'
import type { TeleprompterDocument } from './teleprompterTypes'

/** Animates the measured reader content in the native compositor without JS frame ticks. */
export function usePlayback(api: BeamApi, document: () => TeleprompterDocument) {
  const [playing, setPlaying] = createSignal(false)
  const [offset, setOffset] = createSignal(0)
  const [duration, setDuration] = createSignal(0)
  const [error, setError] = createSignal('')
  let current = 0, started = 0, maximum = 0, revision = 0
  let endTimer: ReturnType<typeof setTimeout> | undefined
  let startTimer: ReturnType<typeof setTimeout> | undefined
  const clearTimers = () => { if (endTimer) clearTimeout(endTimer); if (startTimer) clearTimeout(startTimer) }
  const pause = () => {
    revision++; clearTimers()
    if (playing()) current = Math.min(maximum, current + (Date.now() - started) / 1000 * document().scrollSpeed)
    setPlaying(false); setDuration(0); setOffset(current)
  }
  const reset = () => { pause(); current = 0; setOffset(0) }
  async function play(): Promise<void> {
    if (playing()) { pause(); return }
    const token = ++revision
    try {
      const [content, viewport] = await Promise.all([api.measure('teleprompterContent'), api.measure('teleprompterViewport')])
      if (token !== revision) return
      maximum = Math.max(0, content.height - viewport.height + 32)
      if (maximum <= 0) return
      if (current >= maximum) current = 0
      setDuration(0); setOffset(current)
      startTimer = setTimeout(() => {
        if (token !== revision) return
        const milliseconds = (maximum - current) / document().scrollSpeed * 1000
        started = Date.now(); setPlaying(true); setDuration(milliseconds); setOffset(maximum)
        endTimer = setTimeout(() => { current = maximum; setPlaying(false); setDuration(0) }, milliseconds)
      }, 40)
    } catch (cause) { setError(String(cause)) }
  }
  onCleanup(() => { revision++; clearTimers() })
  return { playing, offset, duration, error, play, pause, reset }
}

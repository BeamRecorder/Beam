import { batch, createEffect, createSignal, onCleanup, onMount, untrack } from 'solid-js'
import type { BeamApi } from '../shared/beamApi'
import type { TeleprompterDocument } from './teleprompterTypes'
import { measuredReaderProgress } from './playbackLayout'
import type { ReaderProgress } from './playbackTypes'

/** Animates the measured reader content in the native compositor without JS frame ticks. */
export function usePlayback(api: BeamApi, document: () => TeleprompterDocument, enabled: () => boolean = () => true) {
  const [playing, setPlaying] = createSignal(false)
  const [pending, setPending] = createSignal(false)
  const [offset, setOffset] = createSignal(0)
  const [duration, setDuration] = createSignal(0)
  const [error, setError] = createSignal('')
  let current = 0, started = 0, maximum = 0, revision = 0
  let activeSpeed = document().scrollSpeed
  let previous = document(), wasEnabled = enabled()
  let visible: boolean | null = null
  let disposed = false, needsMeasurement = true
  let preparing: Promise<void> | undefined
  let endTimer: ReturnType<typeof setTimeout> | undefined
  let commitTimer: ReturnType<typeof setTimeout> | undefined
  let settleCommit: (() => void) | undefined

  const available = () => !disposed && enabled() && visible !== false
  const currentRevision = (token: number) => token === revision && !disposed
  const canPrepare = (token: number) => currentRevision(token) && available()
  const clearTimers = () => {
    clearTimeout(endTimer); endTimer = undefined
    clearTimeout(commitTimer); commitTimer = undefined
    settleCommit?.(); settleCommit = undefined
  }

  function pause(): void {
    if (playing()) current = Math.min(maximum, current + Math.max(0, Date.now() - started) / 1000 * activeSpeed)
    revision++
    clearTimers()
    batch(() => { setPlaying(false); setPending(false); setDuration(0); setOffset(current) })
  }

  function reset(): void {
    pause()
    current = 0
    setOffset(0)
  }

  // The paused transform must reach the retained native tree before a new target.
  function waitForCommit(): Promise<void> {
    return new Promise(resolve => {
      settleCommit = resolve
      commitTimer = setTimeout(() => {
        commitTimer = undefined
        settleCommit = undefined
        resolve()
      }, 40)
    })
  }

  function animate(token: number): void {
    if (token !== revision || !available()) return
    const speed = document().scrollSpeed
    if (!Number.isFinite(speed) || speed < 5 || speed > 200) throw new Error('Invalid teleprompter speed')
    setPending(false)
    if (current >= maximum) return
    const milliseconds = Math.max(1, Math.min(60_000, (maximum - current) / speed * 1000))
    const target = Math.min(maximum, current + speed * milliseconds / 1000)
    activeSpeed = speed
    started = Date.now()
    batch(() => { setPlaying(true); setDuration(milliseconds); setOffset(target) })
    endTimer = setTimeout(() => {
      if (token !== revision || disposed) return
      endTimer = undefined
      current = target
      if (current < maximum) animate(token)
      else batch(() => { setPlaying(false); setDuration(0) })
    }, milliseconds)
  }

  async function prepare(token: number, resume: boolean, measure: boolean, replayAtEnd: boolean): Promise<void> {
    const previous = { current, maximum }
    try {
      await waitForCommit()
      if (!canPrepare(token)) return
      if (measure) await measureReader(token, previous, resume, replayAtEnd)
      if (!canPrepare(token)) return
      if (resume) animate(token)
    } catch (cause) {
      if (!currentRevision(token)) return
      pause()
      setError(String(cause))
    }
  }

  async function measureReader(token: number, previous: ReaderProgress, resume: boolean, replayAtEnd: boolean): Promise<void> {
    const [content, viewport, window] = await Promise.all([
      api.measure('teleprompterContent'), api.measure('teleprompterViewport'), api.windowInfo(),
    ])
    if (!currentRevision(token)) return
    visible = window.visible
    if (!available()) { pause(); return }
    const progress = measuredReaderProgress(content, viewport, previous, replayAtEnd)
    current = progress.current
    maximum = progress.maximum
    needsMeasurement = false
    setOffset(current)
    if (resume && current !== previous.current) await waitForCommit()
  }

  function schedule(resume: boolean, measure: boolean, replayAtEnd: boolean): Promise<void> {
    pause()
    if (!available()) return Promise.resolve()
    const token = revision
    setError('')
    setPending(resume)
    const work = prepare(token, resume, measure || needsMeasurement, replayAtEnd)
    preparing = work
    void work.finally(() => { if (preparing === work) preparing = undefined })
    return work
  }

  /** Starts after the reader's native layout is mounted; repeated starts are harmless. */
  function start(): Promise<void> {
    if (playing()) return Promise.resolve()
    if (pending()) return preparing ?? Promise.resolve()
    return schedule(true, true, true)
  }

  async function play(): Promise<void> {
    if (playing() || pending()) { pause(); return }
    await start()
  }

  /** Re-measures changed font/viewport metrics while preserving reading progress. */
  function refresh(): Promise<void> {
    needsMeasurement = true
    return schedule(playing() || pending(), true, false)
  }

  createEffect(() => {
    const value = document(), active = enabled()
    const geometryChanged = value.fontSize !== previous.fontSize || value.lineHeight !== previous.lineHeight
      || value.text !== previous.text || value.textAlign !== previous.textAlign
    const speedChanged = value.scrollSpeed !== previous.scrollSpeed
    const readerChanged = active !== wasEnabled
    previous = value; wasEnabled = active
    untrack(() => {
      if (geometryChanged || readerChanged) needsMeasurement = true
      if (!active) { pause(); return }
      if (geometryChanged && (playing() || pending() || current > 0)) void refresh()
      else if (speedChanged && (playing() || pending())) void schedule(true, false, false)
    })
  })
  onMount(() => onCleanup(api.onEvent(event => {
    if (event.type !== 'windowVisibility' && event.type !== 'windowResized') return
    if (event.window && event.window !== 'teleprompter') return
    if (event.type === 'windowVisibility' && typeof event.visible === 'boolean') {
      visible = event.visible
      if (!visible) pause()
    } else if (event.type === 'windowResized') {
      needsMeasurement = true
      pause()
    }
  })))
  onCleanup(() => { disposed = true; revision++; clearTimers() })
  return { playing, pending, offset, duration, error, play, start, pause, reset, refresh }
}

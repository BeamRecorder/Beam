import { createSignal, onCleanup } from 'solid-js'
import type { BeamApi } from '../shared/beamApi'
import type { BeamPreferences, CaptureRequest, RecordingStatus } from '../shared/beamTypes'

/** Owns the countdown while the Rust engine prepares asynchronously. */
export function useCaptureSession(api: BeamApi, preferences: () => BeamPreferences) {
  const [stage, setStage] = createSignal<'hud' | 'countdown' | 'recording'>('hud')
  const [busy, setBusy] = createSignal(false)
  const [paused, setPaused] = createSignal(false)
  const [error, setError] = createSignal('')
  let projectId: string | null = null
  let pending: { canceled: boolean; preparing: Promise<RecordingStatus>; finishCountdown: () => void } | undefined
  let timer: ReturnType<typeof setInterval> | undefined
  onCleanup(() => { if (timer) clearInterval(timer) })
  const report = (cause: unknown) => setError(String(cause))

  async function center(window: 'countdown' | 'recorder', width: number, height: number): Promise<void> {
    const monitors = await api.monitors()
    const monitor = monitors.find(item => item.primary) ?? monitors[0]
    if (monitor) await api.windowPosition(monitor.x + (monitor.width - width * monitor.scaleFactor) / 2,
      monitor.y + (monitor.height - height * monitor.scaleFactor) / 2, window)
  }
  async function restore(): Promise<void> {
    setStage('hud')
    await api.hideWindow('countdown').catch(console.error)
    await api.hideWindow('recorder').catch(console.error)
    await api.showWindow()
  }
  function clearCountdown(): void { if (timer) clearInterval(timer); timer = undefined }
  async function record(request: CaptureRequest): Promise<void> {
    if (busy() || stage() !== 'hud') return
    setBusy(true); setError(''); setStage('countdown')
    let finishCountdown = () => {}
    const elapsed = new Promise<void>(resolve => { finishCountdown = resolve })
    const run = { canceled: false, preparing: api.prepare(request), finishCountdown }
    pending = run
    const prepared = run.preparing.then(status => ({ status }), cause => ({ cause }))
    try {
      // Complete the native portal picker before putting a countdown over it.
      if (request.sourceId?.startsWith('portal:')) {
        const result = await prepared
        if ('cause' in result) throw result.cause
        if (run.canceled) return
      }
      await api.ensureWindow('countdown')
      await center('countdown', 220, 220)
      let remaining = preferences().countdownSeconds
      await api.updateUiState({ remaining, busy: false })
      await api.hideWindow()
      if (run.canceled) return
      await api.showWindow('countdown')
      void api.ensureWindow('recorder').catch(console.error)
      timer = setInterval(() => {
        remaining = Math.max(0, remaining - 1)
        void api.updateUiState({ remaining, busy: remaining === 0 }).catch(report)
        if (remaining === 0) { clearCountdown(); finishCountdown() }
      }, 1000)
      const result = await prepared
      if ('cause' in result) throw result.cause
      if (run.canceled) return
      projectId = result.status.projectId ?? null
      await elapsed
      if (run.canceled) return
      await api.hideWindow('countdown')
      await new Promise(resolve => setTimeout(resolve, 80))
      if (run.canceled) return
      await api.start()
      if (run.canceled) return
      setPaused(false); setStage('recording')
      await api.updateUiState({ paused: false, busy: false })
      await api.ensureWindow('recorder')
      await center('recorder', 210, 54)
      await api.showWindow('recorder')
    } catch (cause) {
      if (!run.canceled) {
        setError(String(cause))
        const result = await prepared
        if ('status' in result) await api.cancel().catch(console.error)
        await restore().catch(report)
      }
    } finally {
      clearCountdown()
      if (pending === run && !run.canceled) { pending = undefined; setBusy(false) }
    }
  }
  async function cancelCountdown(): Promise<void> {
    const run = pending
    if (!run || run.canceled) return
    run.canceled = true; clearCountdown(); run.finishCountdown()
    await restore().catch(report)
    try { await run.preparing; await api.cancel() }
    catch (cause) { setError(String(cause)) }
    finally { if (pending === run) pending = undefined; setBusy(false); await api.updateUiState({ busy: false }).catch(report) }
  }
  async function togglePause(): Promise<void> {
    if (busy() || stage() !== 'recording') return
    setBusy(true)
    try {
      await api.updateUiState({ busy: true })
      if (paused()) await api.resume(); else await api.pause()
      setPaused(!paused()); await api.updateUiState({ paused: paused() })
    } catch (cause) { setError(String(cause)) }
    finally { setBusy(false); await api.updateUiState({ busy: false }).catch(report) }
  }
  async function finish(discard: boolean): Promise<void> {
    if (busy() || stage() !== 'recording') return
    setBusy(true)
    try {
      await api.updateUiState({ busy: true })
      const result = discard ? await api.cancel() : await api.stop()
      await restore()
      const project = result.projectId ?? projectId
      if (!discard && project) await api.openEditor(project, 'video')
    } catch (cause) { setError(String(cause)); await restore().catch(report) }
    finally { setBusy(false); await api.updateUiState({ busy: false }).catch(report) }
  }
  return { stage, busy, error, record, cancelCountdown, togglePause, stop: () => finish(false), discard: () => finish(true) }
}

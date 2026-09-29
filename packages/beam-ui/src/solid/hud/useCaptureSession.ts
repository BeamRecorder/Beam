import { createSignal, onCleanup } from 'solid-js'
import type { BeamApi } from '../shared/beamApi'
import type { BeamPreferences, CaptureRequest } from '../shared/beamTypes'
import { monitorForWindow, windowPosition } from '../shared/windowPlacement'
import type { CaptureOperation, CaptureRun } from './captureSessionTypes'

/** Owns the countdown while the Rust engine prepares asynchronously. */
export function useCaptureSession(api: BeamApi, preferences: () => BeamPreferences) {
  const [stage, setStage] = createSignal<'hud' | 'countdown' | 'recording'>('hud')
  const [busy, setBusy] = createSignal(false)
  const [paused, setPaused] = createSignal(false)
  const [error, setError] = createSignal('')
  let projectId: string | null = null
  let pending: CaptureRun | undefined
  let disposed = false
  let regionCapture = false
  let editorOpening = false
  let editorOpeningCanceled = false
  onCleanup(() => {
    disposed = true
    if (!pending || pending.canceled) return
    const run = pending
    run.canceled = true; clearCountdown(run); run.finishCountdown()
    void cancelPrepared(run).catch(console.error)
  })
  const active = (run: CaptureRun) => !disposed && !run.canceled && pending === run
  const canRecord = () => !disposed && !busy() && stage() === 'hud'
  const report = (cause: unknown) => setError(String(cause))

  async function place(run: CaptureRun, window: 'countdown' | 'recorder', width: number, height: number, request: CaptureRequest): Promise<void> {
    const monitors = await api.monitors()
    if (!active(run)) return
    const monitor = request.sourceMode === 'display' ? monitors.find(item => item.primary) ?? monitors[0]
      : monitorForWindow(monitors, await api.windowInfo(request.sourceMode === 'region' ? 'region' : 'main'))
    if (!monitor || !active(run)) return
    const saved = (await api.preferences()).windowPositions?.[window]
    if (!active(run)) return
    await api.windowSize(width, height, window)
    if (!active(run)) return
    const info = await api.windowInfo(window)
    if (!active(run)) return
    const position = windowPosition(monitors, monitor, width, height, saved, window === 'recorder',
      info.capabilities.backend === 'x11' ? info.scaleFactor : undefined)
    await api.windowPosition(position.x, position.y, window)
    if (active(run)) await api.windowLevel('top', window)
  }
  async function restore(showLauncher = true): Promise<void> {
    setStage('hud')
    await api.hideWindow('countdown').catch(console.error)
    await api.hideWindow('recorder').catch(console.error)
    if (regionCapture) {
      regionCapture = false
      await api.cancelRegion().catch(console.error)
    }
    if (showLauncher) await api.showWindow()
  }
  function clearCountdown(run: CaptureRun): void {
    clearInterval(run.timer); run.timer = undefined
  }

  function createRun(request: CaptureRequest): CaptureRun {
    let finishCountdown = () => {}
    const elapsed = new Promise<void>(resolve => { finishCountdown = resolve })
    const preparing = Promise.resolve().then(() => api.prepare(request))
    return { canceled: false, preparing, prepared: preparing.then(status => ({ status }), cause => ({ cause })),
      elapsed, finishCountdown }
  }

  /** Check ownership on both sides of every native async operation. */
  async function operations(run: CaptureRun, steps: readonly CaptureOperation[]): Promise<boolean> {
    for (const step of steps) {
      if (!active(run)) return false
      const operation = step()
      run.operation = operation
      try { await operation }
      finally { run.operation = undefined }
      if (!active(run)) return false
    }
    return true
  }

  async function authorizeSource(run: CaptureRun, request: CaptureRequest): Promise<boolean> {
    if (request.sourceId?.startsWith('portal:')) {
      const result = await run.prepared
      if ('cause' in result) throw result.cause
    }
    return active(run)
  }

  async function showCountdown(run: CaptureRun, request: CaptureRequest): Promise<boolean> {
    const current = preferences()
    const visible = await operations(run, [
      () => api.ensureWindow('countdown'),
      () => place(run, 'countdown', 560, 284, request),
      () => api.updateUiState({ remaining: current.countdownSeconds, busy: false,
        shortcut: current.shortcuts['hud.startStopRecording'] ?? 'Alt+Shift+R',
        pauseShortcut: current.shortcuts['hud.playPause'] ?? 'Alt+Shift+P',
        microphoneEnabled: !!request.microphoneId, systemAudioEnabled: !!request.systemAudioId, cameraEnabled: !!request.cameraId }),
      () => api.hideWindow(),
      () => api.showWindow('countdown'),
      () => api.windowLevel('top', 'countdown'),
      () => api.focusWindow('countdown'),
    ])
    if (!visible) return false
    void api.ensureWindow('recorder').catch(console.error)
    startCountdown(run, current.countdownSeconds)
    return true
  }

  function startCountdown(run: CaptureRun, remaining: number): void {
    if (remaining === 0) { run.finishCountdown(); return }
    run.timer = setInterval(() => {
      if (!active(run)) { clearCountdown(run); return }
      remaining = Math.max(0, remaining - 1)
      void api.updateUiState({ remaining, busy: remaining === 0 }).catch(report)
      if (remaining === 0) { clearCountdown(run); run.finishCountdown() }
    }, 1000)
  }

  async function startRecording(run: CaptureRun, request: CaptureRequest): Promise<void> {
    const started = await operations(run, [
      () => api.hideWindow('countdown'),
      () => new Promise(resolve => setTimeout(resolve, 80)),
      () => api.start(),
    ])
    if (!started) return
    setPaused(false); setStage('recording')
    await operations(run, [
      () => api.updateUiState({ paused: false, busy: false }),
      () => api.ensureWindow('recorder'),
      () => place(run, 'recorder', 240, 54, request),
      () => api.showWindow('recorder'),
      () => api.windowLevel('top', 'recorder'),
      () => api.focusWindow('recorder'),
    ])
  }

  async function recover(run: CaptureRun, cause: unknown): Promise<void> {
    if (!active(run)) return
    setError(String(cause))
    const result = await run.prepared
    if ('status' in result) await api.cancel().catch(console.error)
    if (active(run)) await restore().catch(report)
  }

  async function record(request: CaptureRequest): Promise<void> {
    if (!canRecord()) return
    setBusy(true); setError(''); setStage('countdown'); projectId = null
    regionCapture = request.sourceMode === 'region'
    const run = createRun(request)
    pending = run
    try {
      if (!await authorizeSource(run, request)) return
      if (!await showCountdown(run, request)) return
      const result = await run.prepared
      if ('cause' in result) throw result.cause
      if (!active(run)) return
      projectId = result.status.projectId ?? null
      await run.elapsed
      await startRecording(run, request)
    } catch (cause) { await recover(run, cause) }
    finally { completePreparation(run) }
  }

  function completePreparation(run: CaptureRun): void {
    clearCountdown(run)
    if (pending === run && !run.canceled) { pending = undefined; setBusy(false) }
  }

  async function cancelCountdown(): Promise<void> {
    const run = pending
    if (!run || run.canceled) return
    run.canceled = true; clearCountdown(run); run.finishCountdown()
    await restore().catch(report)
    try { await cancelPrepared(run) }
    catch (cause) { setError(String(cause)) }
    finally {
      if (pending === run) { pending = undefined; setBusy(false) }
      await api.updateUiState({ busy: false }).catch(report)
    }
  }
  async function cancelPrepared(run: CaptureRun): Promise<void> {
    await run.preparing
    await run.operation?.catch(() => undefined)
    await api.cancel()
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
  async function reset(): Promise<void> {
    if (busy() || stage() !== 'recording') return
    setBusy(true); setError('')
    try {
      await api.updateUiState({ busy: true })
      const result = await api.reset()
      if (result.state !== 'recording' || !result.sessionId) {
        throw new Error(result.error ?? 'The recording could not be restarted.')
      }
      projectId = result.projectId ?? projectId
      setPaused(false)
      await api.updateUiState({ paused: false })
    } catch (cause) { setError(String(cause)); await restore().catch(report) }
    finally { setBusy(false); await api.updateUiState({ busy: false }).catch(report) }
  }
  async function showEditorLoading(): Promise<void> {
    await api.ensureWindow('editorLoading')
    const monitors = await api.monitors()
    const monitor = monitors.find(item => item.primary) ?? monitors[0]
    if (monitor) {
      const info = await api.windowInfo('editorLoading')
      const scale = info.capabilities.backend === 'x11' ? info.scaleFactor : 1
      await api.windowPosition(monitor.x + (monitor.width - 360 * scale) / 2,
        monitor.y + (monitor.height - 236 * scale) / 2, 'editorLoading')
    }
    await api.showWindow('editorLoading')
    await api.windowLevel('top', 'editorLoading')
  }
  async function cancelEditorOpening(): Promise<void> {
    if (!editorOpening || editorOpeningCanceled) return
    editorOpeningCanceled = true
    await api.cancelEditorOpen().catch(report)
    await api.hideWindow('editorLoading').catch(report)
    await api.showWindow().catch(report)
  }
  async function finish(discard: boolean): Promise<void> {
    if (busy() || stage() !== 'recording') return
    setBusy(true); setError('')
    editorOpening = !discard; editorOpeningCanceled = false
    try {
      await api.updateUiState({ busy: true })
      if (!discard) await showEditorLoading().catch(cause => console.error(String(cause)))
      const result = discard ? await api.cancel() : await api.stop()
      if (result.error && !discard) setError(result.error)
      const project = result.projectId ?? projectId
      if (discard) await restore()
      else {
        if (!project) throw new Error('The completed recording has no project ID.')
        await restore(editorOpeningCanceled)
        if (editorOpeningCanceled) return
        await api.openEditor(project, 'video')
      }
    } catch (cause) {
      if (!editorOpeningCanceled) setError(String(cause))
      await restore().catch(report)
    } finally {
      editorOpening = false
      if (!discard) await api.hideWindow('editorLoading').catch(report)
      setBusy(false); await api.updateUiState({ busy: false }).catch(report)
    }
  }
  return { stage, busy, error, record, cancelCountdown, cancelEditorOpening, togglePause, reset, stop: () => finish(false), discard: () => finish(true) }
}

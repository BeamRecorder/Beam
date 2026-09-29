import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { armed, captureFixture, deferred, flush, request } from '../../../test/support/captureSession'

const disposers: (() => void)[] = []
function mount(seconds = 0) { const fixture = captureFixture(seconds); disposers.push(fixture.dispose); return fixture }
beforeEach(() => { vi.useFakeTimers(); vi.spyOn(console, 'error').mockImplementation(() => undefined) })
afterEach(() => { disposers.splice(0).forEach(dispose => dispose()); vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks() })

it('centers countdown and defaults recorder to the bottom of the selected crop monitor at mixed DPI', async () => {
  const { capture, services, calls } = mount()
  services.getMonitors.mockResolvedValue([
    { name: 'left', x: -2560, y: 0, width: 2560, height: 1440, scaleFactor: 1.5, primary: false },
    { name: 'main', x: 0, y: 0, width: 1920, height: 1080, scaleFactor: 1, primary: true },
  ])
  services.getWindowInfo.mockImplementation(async window => ({ visible: true,
    x: window === 'region' ? -2560 : 0, y: 0, width: 560, height: 284, scaleFactor: 1.5,
    capabilities: { backend: 'windows', absolutePosition: true },
  }))
  const recording = capture.record({ ...request, sourceMode: 'region' })
  await flush(); await vi.advanceTimersByTimeAsync(80); await recording
  expect(services.setWindowPosition).toHaveBeenCalledWith('countdown', -1700, 507)
  expect(services.setWindowPosition).toHaveBeenCalledWith('recorder', -1460, 1329)
  expect(calls('cancel').filter(call => call[0] === 'region')).toHaveLength(0)
  await capture.stop()
  expect(calls('cancel').filter(call => call[0] === 'region')).toHaveLength(1)
})

it('reads current saved positions rather than a stale launcher preference snapshot', async () => {
  const { capture, responses, preferences, services } = mount()
  responses.set('preferences', async () => ({ ...preferences, windowPositions: { recorder: { x: 300, y: 900 } } }))
  const recording = capture.record(request)
  await flush(); await vi.advanceTimersByTimeAsync(80); await recording
  expect(services.setWindowPosition).toHaveBeenCalledWith('recorder', 300, 900)
})

it('dismisses the passive crop mask when a region countdown is canceled', async () => {
  const { capture, calls } = mount(3)
  const recording = capture.record({ ...request, sourceMode: 'region' })
  await flush(); await capture.cancelCountdown(); await recording
  expect(calls('cancel').filter(call => call[0] === 'region')).toHaveLength(1)
  expect(calls('start')).toHaveLength(0)
})

it('shows finalization progress and opens the editor after stopping', async () => {
  const { capture, calls, services } = mount()
  const recording = capture.record(request)
  await flush()
  expect(calls('start')).toHaveLength(0)
  await vi.advanceTimersByTimeAsync(80)
  await recording
  expect(capture.stage()).toBe('recording')
  expect(calls('start')).toHaveLength(1)
  expect(services.setWindowLevel).toHaveBeenCalledWith('recorder', 'top')
  services.showWindow.mockClear()
  await capture.stop()
  expect(capture.stage()).toBe('hud')
  expect(calls('openEditor')[0]?.[2]).toEqual({ projectId: 'project', mode: 'video' })
  expect(services.showWindow).toHaveBeenCalledWith('editorLoading')
  expect(calls('hide').some(call => (call[2] as { window?: string })?.window === 'editorLoading')).toBe(true)
  expect(services.showWindow).not.toHaveBeenCalledWith('main')
})
it('finishes recording and opens the editor if the loading window cannot open', async () => {
  const { capture, responses, calls } = mount()
  const recording = capture.record(request); await flush(); await vi.advanceTimersByTimeAsync(80); await recording
  responses.set('ensureAuxiliary', async () => { throw new Error('loading window unavailable') })
  await capture.stop()
  expect(calls('stop')).toHaveLength(1)
  expect(calls('openEditor')).toHaveLength(1)
  expect(capture.stage()).toBe('hud')
  expect(capture.busy()).toBe(false)
  expect(console.error).toHaveBeenCalledWith('Error: loading window unavailable')
})
it('cancels a stalled editor launch while keeping the recording available', async () => {
  const { capture, responses, calls, services } = mount()
  const recording = capture.record(request); await flush(); await vi.advanceTimersByTimeAsync(80); await recording
  const opening = deferred<void>()
  responses.set('openEditor', () => opening.promise)
  const stopping = capture.stop()
  await flush()
  expect(calls('openEditor')).toHaveLength(1)
  await capture.cancelEditorOpening()
  opening.reject(new Error('Editor opening canceled'))
  await stopping
  expect(calls('cancelEditorOpen')).toHaveLength(1)
  expect(services.showWindow).toHaveBeenCalledWith('main')
  expect(capture.error()).toBe('')
})

it('waits for portal authorization before showing the countdown', async () => {
  const { capture, responses, services } = mount()
  const preparation = deferred<typeof armed>()
  responses.set('prepare', () => preparation.promise)
  const recording = capture.record({ ...request, sourceId: 'portal:monitor' })
  await flush()
  expect(services.showWindow).not.toHaveBeenCalled()
  preparation.resolve(armed)
  await flush()
  expect(services.showWindow).toHaveBeenCalledWith('countdown')
  await vi.advanceTimersByTimeAsync(80)
  await recording
  expect(capture.stage()).toBe('recording')
})

it('counts down while preparing, but never starts before both finish', async () => {
  const { capture, responses, calls } = mount(2)
  const preparation = deferred<typeof armed>()
  responses.set('prepare', () => preparation.promise)
  const recording = capture.record(request)
  await flush()
  await vi.advanceTimersByTimeAsync(2000)
  expect(calls('start')).toHaveLength(0)
  preparation.resolve(armed)
  await flush()
  await vi.advanceTimersByTimeAsync(80)
  await recording
  expect(calls('start')).toHaveLength(1)
  expect(capture.busy()).toBe(false)
})

it('cancels a pending preparation without showing the recorder or starting', async () => {
  const { capture, responses, calls, services } = mount(3)
  const preparation = deferred<typeof armed>()
  responses.set('prepare', () => preparation.promise)
  const recording = capture.record(request)
  await flush()
  const canceled = capture.cancelCountdown()
  await flush()
  expect(capture.stage()).toBe('hud')
  expect(capture.busy()).toBe(true)
  expect(calls('cancel')).toHaveLength(0)
  preparation.resolve(armed)
  await canceled; await recording
  await vi.advanceTimersByTimeAsync(5000)
  expect(calls('cancel')).toHaveLength(1)
  expect(calls('start')).toHaveLength(0)
  expect(services.showWindow).not.toHaveBeenCalledWith('recorder')
  expect(capture.busy()).toBe(false)
})

it('ignores a second record request while preparing and after disposal', async () => {
  const { capture, responses, calls, dispose } = mount()
  const preparation = deferred<typeof armed>()
  responses.set('prepare', () => preparation.promise)
  const recording = capture.record(request)
  await capture.record(request)
  await flush(); dispose()
  await capture.record(request)
  preparation.resolve(armed)
  await recording; await flush()
  expect(calls('prepare')).toHaveLength(1)
  expect(calls('start')).toHaveLength(0)
  expect(calls('cancel')).toHaveLength(1)
})

it('stops native positioning after cancellation during monitor lookup', async () => {
  const { capture, services, calls } = mount()
  const monitors = deferred<Awaited<ReturnType<typeof services.getMonitors>>>()
  services.getMonitors.mockImplementation(() => monitors.promise)
  const recording = capture.record(request)
  await flush()
  const canceled = capture.cancelCountdown()
  await flush()
  expect(calls('cancel')).toHaveLength(0)
  monitors.resolve([])
  await recording; await canceled
  expect(services.setWindowSize).not.toHaveBeenCalled()
  expect(services.showWindow).not.toHaveBeenCalledWith('countdown')
})

it('cancels during the settle delay without calling native start', async () => {
  const { capture, calls } = mount()
  const recording = capture.record(request)
  await flush()
  const canceled = capture.cancelCountdown()
  await vi.advanceTimersByTimeAsync(80)
  await canceled; await recording
  expect(calls('start')).toHaveLength(0)
  expect(calls('cancel')).toHaveLength(1)
})

it('waits for an in-flight start before cancelling its native session', async () => {
  const { capture, responses, calls, services } = mount()
  const started = deferred<typeof armed>()
  responses.set('start', () => started.promise)
  const recording = capture.record(request)
  await flush(); await vi.advanceTimersByTimeAsync(80)
  expect(calls('start')).toHaveLength(1)
  const canceled = capture.cancelCountdown()
  await flush()
  expect(calls('cancel')).toHaveLength(0)
  started.resolve(armed)
  await canceled; await recording
  expect(calls('cancel')).toHaveLength(1)
  expect(services.showWindow).not.toHaveBeenCalledWith('recorder')
})

it.each(['prepare', 'ensureAuxiliary', 'start'])('recovers from a %s failure', async method => {
  const { capture, responses, calls, services } = mount()
  responses.set(method, async () => { throw new Error(`${method} failed`) })
  const recording = capture.record(request)
  await flush(); await vi.advanceTimersByTimeAsync(80); await recording
  expect(capture.error()).toContain(`${method} failed`)
  expect(capture.stage()).toBe('hud')
  expect(capture.busy()).toBe(false)
  expect(services.showWindow).toHaveBeenCalledWith('main')
  expect(calls('cancel')).toHaveLength(method === 'prepare' ? 0 : 1)
})

it('clears busy after a rejected cancellation', async () => {
  const { capture, responses } = mount(3)
  responses.set('cancel', async () => { throw new Error('cancel failed') })
  const recording = capture.record(request)
  await flush(); await capture.cancelCountdown(); await recording
  expect(capture.error()).toContain('cancel failed')
  expect(capture.busy()).toBe(false)
})

it('pauses, resumes, discards, and ignores controls before recording', async () => {
  const { capture, calls, services } = mount()
  await capture.togglePause(); await capture.stop(); await capture.discard(); await capture.cancelCountdown()
  expect(calls('pause')).toHaveLength(0)
  const recording = capture.record(request); await flush(); await vi.advanceTimersByTimeAsync(80); await recording
  await capture.togglePause(); await capture.togglePause()
  expect(calls('pause')).toHaveLength(1)
  expect(calls('resume')).toHaveLength(1)
  await capture.discard()
  expect(calls('cancel')).toHaveLength(1)
  expect(calls('openEditor')).toHaveLength(0)
  expect(services.showWindow).toHaveBeenLastCalledWith('main')
})
it.each(['pause', 'resume', 'stop', 'openEditor'])('restores controls after a %s failure', async method => {
  const { capture, responses } = mount()
  const recording = capture.record(request); await flush(); await vi.advanceTimersByTimeAsync(80); await recording
  if (method === 'resume') await capture.togglePause()
  responses.set(method, async () => { throw new Error(`${method} failed`) })
  if (method === 'pause' || method === 'resume') await capture.togglePause()
  else await capture.stop()
  expect(capture.error()).toContain(`${method} failed`)
  expect(capture.busy()).toBe(false)
})
it('reports a native stop warning and uses the prepared project when stop omits it', async () => {
  const { capture, responses, calls } = mount()
  const recording = capture.record(request); await flush(); await vi.advanceTimersByTimeAsync(80); await recording
  responses.set('stop', async () => ({ state: 'completed', sessionId: 'session', error: 'one track interrupted' }))
  await capture.stop()
  expect(capture.error()).toBe('one track interrupted')
  expect(calls('openEditor')[0]?.[2]).toEqual({ projectId: 'project', mode: 'video' })
})
it('rejects a completed recording without a project and restores the launcher', async () => {
  const { capture, responses, calls, services } = mount()
  responses.set('prepare', async () => ({ state: 'armed', sessionId: 'session' }))
  responses.set('stop', async () => ({ state: 'completed', sessionId: 'session' }))
  const recording = capture.record(request); await flush(); await vi.advanceTimersByTimeAsync(80); await recording
  await capture.stop()
  expect(capture.error()).toContain('no project ID')
  expect(calls('openEditor')).toHaveLength(0)
  expect(services.showWindow).toHaveBeenLastCalledWith('main')
})
it('continues without positionable monitors and preserves custom shortcuts', async () => {
  const { capture, services, preferences, calls } = mount()
  services.getMonitors.mockResolvedValue([])
  preferences.shortcuts = { 'hud.startStopRecording': 'Ctrl+R', 'hud.playPause': 'Ctrl+P' }
  const recording = capture.record(request); await flush(); await vi.advanceTimersByTimeAsync(80); await recording
  expect(capture.stage()).toBe('recording')
  expect(services.setWindowSize).not.toHaveBeenCalled()
  expect(calls('update')[0]?.[2]).toMatchObject({ shortcut: 'Ctrl+R', pauseShortcut: 'Ctrl+P', microphoneEnabled: true })
})
it('places a window capture on its monitor and restores saved physical origins', async () => {
  const { capture, services, preferences } = mount()
  preferences.windowPositions = { countdown: { x: 200, y: 100 }, recorder: { x: 300, y: 900 } }
  const recording = capture.record({ ...request, sourceMode: 'window', sourceId: 'x11:window:1' })
  await flush(); await vi.advanceTimersByTimeAsync(80); await recording
  expect(services.setWindowPosition).toHaveBeenCalledWith('countdown', 200, 100)
  expect(services.setWindowPosition).toHaveBeenCalledWith('recorder', 300, 900)
})
it('releases the prepared session even if the cancelled native operation rejects', async () => {
  const { capture, responses, calls } = mount()
  const ensure = deferred<unknown>(); responses.set('ensureAuxiliary', () => ensure.promise)
  const recording = capture.record(request); await flush()
  const canceled = capture.cancelCountdown(); await flush()
  ensure.reject(new Error('late window failure'))
  await canceled; await recording
  expect(calls('cancel')).toHaveLength(1)
  expect(capture.busy()).toBe(false)
})

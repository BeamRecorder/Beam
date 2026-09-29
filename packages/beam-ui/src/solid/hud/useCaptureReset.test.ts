import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { armed, captureFixture, deferred, flush, request } from '../../../test/support/captureSession'
import type { RecordingStatus } from '../shared/beamTypes'

const disposers: (() => void)[] = []
const restarted: RecordingStatus = { ...armed, state: 'recording', sessionId: 'new-take', manifest: { durationNs: 0 } }
function mount() {
  const fixture = captureFixture(0)
  disposers.push(fixture.dispose)
  fixture.responses.set('reset', async () => restarted)
  return fixture
}
async function start(fixture: ReturnType<typeof mount>) {
  const recording = fixture.capture.record(request)
  await flush(); await vi.advanceTimersByTimeAsync(80); await recording
}
beforeEach(() => { vi.useFakeTimers(); vi.spyOn(console, 'error').mockImplementation(() => undefined) })
afterEach(() => { disposers.splice(0).forEach(dispose => dispose()); vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks() })

it.each([false, true])('restarts the take in place, including when paused (%s)', async paused => {
  const fixture = mount(), { capture, calls, services } = fixture
  await start(fixture)
  if (paused) await capture.togglePause()
  services.showWindow.mockClear()
  await capture.reset()
  expect(calls('reset')).toHaveLength(1)
  expect(capture.stage()).toBe('recording')
  expect(capture.busy()).toBe(false)
  expect(calls('update').at(-2)?.[2]).toEqual({ paused: false })
  expect(calls('cancel')).toHaveLength(0)
  expect(calls('stop')).toHaveLength(0)
  expect(calls('openEditor')).toHaveLength(0)
  expect(services.showWindow).not.toHaveBeenCalled()
  await capture.togglePause()
  expect(calls('pause')).toHaveLength(paused ? 2 : 1)
})

it('ignores restart outside recording and blocks duplicate actions during restart', async () => {
  const fixture = mount(), { capture, calls, responses } = fixture
  await capture.reset()
  expect(calls('reset')).toHaveLength(0)
  await start(fixture)
  const pending = deferred<RecordingStatus>()
  responses.set('reset', () => pending.promise)
  const restarting = capture.reset(); await flush()
  await capture.reset(); await capture.stop(); await capture.discard(); await capture.togglePause()
  expect(calls('reset')).toHaveLength(1)
  expect(calls('stop')).toHaveLength(0)
  expect(calls('cancel')).toHaveLength(0)
  pending.resolve(restarted); await restarting
  expect(capture.busy()).toBe(false)
})

it('restores the HUD and reports a failed restart', async () => {
  const fixture = mount(), { capture, responses, services } = fixture
  await start(fixture)
  responses.set('reset', async () => { throw new Error('capture unavailable') })
  await capture.reset()
  expect(capture.stage()).toBe('hud')
  expect(capture.error()).toContain('capture unavailable')
  expect(capture.busy()).toBe(false)
  expect(services.showWindow).toHaveBeenLastCalledWith('main')
})

it('discards a restarted take and returns to the HUD without showing an interruption warning', async () => {
  const fixture = mount(), { capture, calls, services, responses } = fixture
  responses.set('cancel', async () => ({ state: 'interrupted', sessionId: 'new-take', error: 'canceled by host' }))
  await start(fixture); await capture.reset(); await capture.discard()
  expect(calls('cancel')).toHaveLength(1)
  expect(calls('openEditor')).toHaveLength(0)
  expect(capture.stage()).toBe('hud')
  expect(capture.error()).toBe('')
  expect(services.showWindow).toHaveBeenLastCalledWith('main')
})

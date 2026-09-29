import { createRoot, createSignal } from 'solid-js'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { RecordingStatus } from '../shared/beamTypes'
import { useRecordingClock } from './useRecordingClock'
import { deferred, flush } from '../../../test/support/captureSession'

const disposers: (() => void)[] = []
const status = (seconds: number, state: RecordingStatus['state'] = 'recording'): RecordingStatus => ({
  state, sessionId: 'session', manifest: { durationNs: seconds * 1_000_000_000 },
})
function mount(seconds = 5) {
  const api = { status: vi.fn(async () => status(seconds)) }
  return createRoot(dispose => {
    disposers.push(dispose)
    const [metrics, setMetrics] = createSignal({ visible: true, width: 400 })
    return { api, setMetrics, clock: useRecordingClock(api, () => metrics().visible) }
  })
}
beforeEach(() => vi.useFakeTimers())
afterEach(() => { disposers.splice(0).forEach(dispose => dispose()); vi.clearAllTimers(); vi.useRealTimers() })

it('advances beyond five seconds using the engine duration', async () => {
  const { api, clock } = mount()
  await flush()
  expect(clock.elapsed()).toBe(5000)
  api.status.mockResolvedValue(status(6.25))
  await vi.advanceTimersByTimeAsync(250)
  expect(clock.elapsed()).toBe(6250)
  expect(clock.error()).toBe('')
})

it('does not reset or restart polling when visible window geometry changes', async () => {
  const { api, clock, setMetrics } = mount()
  await flush()
  setMetrics({ visible: true, width: 500 }); await flush()
  expect(api.status).toHaveBeenCalledOnce()
  expect(clock.elapsed()).toBe(5000)
  api.status.mockResolvedValue(status(7))
  await vi.advanceTimersByTimeAsync(250)
  expect(clock.elapsed()).toBe(7000)
})

it('preserves native paused time and resumes without adding the pause duration', async () => {
  const { api, clock } = mount()
  await flush()
  api.status.mockResolvedValue(status(5, 'paused'))
  await vi.advanceTimersByTimeAsync(2000)
  expect(clock.elapsed()).toBe(5000)
  api.status.mockResolvedValue(status(5.25))
  await vi.advanceTimersByTimeAsync(250)
  expect(clock.elapsed()).toBe(5250)
})

it('suspends hidden-window polling and reads current time immediately on return', async () => {
  const { api, clock, setMetrics } = mount()
  await flush()
  setMetrics({ visible: false, width: 400 })
  await vi.advanceTimersByTimeAsync(5000)
  expect(api.status).toHaveBeenCalledOnce()
  api.status.mockResolvedValue(status(12))
  setMetrics({ visible: true, width: 400 }); await flush()
  expect(clock.elapsed()).toBe(12000)
})

it('ignores a late response after hiding the window', async () => {
  const { api, clock, setMetrics } = mount()
  await flush()
  const reply = deferred<RecordingStatus>()
  api.status.mockImplementation(() => reply.promise)
  await vi.advanceTimersByTimeAsync(250)
  setMetrics({ visible: false, width: 400 })
  reply.resolve(status(8)); await flush()
  expect(clock.elapsed()).toBe(5000)
})

it('does not queue overlapping status reads and releases its timer on disposal', async () => {
  const { api, clock } = mount()
  await flush()
  const reply = deferred<RecordingStatus>()
  api.status.mockImplementation(() => reply.promise)
  await vi.advanceTimersByTimeAsync(2000)
  expect(api.status).toHaveBeenCalledTimes(2)
  disposers.splice(0).forEach(dispose => dispose())
  reply.resolve(status(20)); await flush()
  await vi.advanceTimersByTimeAsync(1000)
  expect(api.status).toHaveBeenCalledTimes(2)
  expect(clock.elapsed()).toBe(5000)
})

it.each([undefined, -1, Number.NaN, Number.POSITIVE_INFINITY])('reports invalid native duration %s instead of fabricating time', async duration => {
  const { api, clock } = mount()
  await flush()
  api.status.mockResolvedValue({ state: 'recording', sessionId: 'session',
    manifest: duration === undefined ? null : { durationNs: duration } })
  await vi.advanceTimersByTimeAsync(250)
  expect(clock.error()).toContain('no valid session duration')
  expect(clock.elapsed()).toBe(5000)
})

it('recovers from a failed native read without clearing the last valid duration', async () => {
  const { api, clock } = mount()
  await flush()
  api.status.mockRejectedValueOnce(new Error('native service unavailable'))
  await vi.advanceTimersByTimeAsync(250)
  expect(clock.error()).toContain('native service unavailable')
  expect(clock.elapsed()).toBe(5000)
  api.status.mockResolvedValue(status(0))
  await vi.advanceTimersByTimeAsync(250)
  expect(clock.error()).toBe('')
  expect(clock.elapsed()).toBe(0)
})

import { createRoot } from 'solid-js'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { BeamApi } from './beamApi'
import type { BeamEvent } from './beamTypes'
import { useWindowMetrics } from './useWindowMetrics'
import { useRecordingClock } from '../hud/useRecordingClock'
import { deferred, flush } from '../../../test/support/captureSession'

const disposers: (() => void)[] = []
const info = (visible = false) => ({ width: 240, height: 54, visible, uiZoomFactor: 1, scaleFactor: 1 })
function mount() {
  let receive!: (event: BeamEvent) => void
  const unsubscribe = vi.fn()
  const api = {
    window: 'recorder',
    windowInfo: vi.fn(async () => info()),
    onEvent: vi.fn((listener: (event: BeamEvent) => void) => { receive = listener; return unsubscribe }),
    status: vi.fn(async () => ({ state: 'recording' as const, sessionId: 'take', manifest: { durationNs: 6_000_000_000 } })),
  }
  return createRoot(dispose => {
    disposers.push(dispose)
    const metrics = useWindowMetrics(api as unknown as BeamApi, { width: 240, height: 54 })
    const clock = useRecordingClock(api, () => metrics().visible)
    return { api, metrics, clock, receive: (event: BeamEvent) => receive(event), unsubscribe, dispose }
  })
}
beforeEach(() => vi.useFakeTimers())
afterEach(() => { disposers.splice(0).forEach(dispose => dispose()); vi.clearAllTimers(); vi.useRealTimers() })

it('starts the prewarmed recorder clock when the native window becomes visible', async () => {
  const { api, metrics, clock, receive } = mount()
  await flush()
  expect(api.status).not.toHaveBeenCalled()
  receive({ type: 'windowVisibility', window: 'recorder', visible: true })
  await flush()
  expect(metrics().visible).toBe(true)
  expect(clock.elapsed()).toBe(6000)
  api.status.mockResolvedValue({ state: 'recording', sessionId: 'take', manifest: { durationNs: 7_000_000_000 } })
  await vi.advanceTimersByTimeAsync(250)
  expect(clock.elapsed()).toBe(7000)
})

it('keeps visibility events authoritative over late and resized window info', async () => {
  const { api, metrics, receive } = mount()
  const reading = deferred<ReturnType<typeof info>>()
  api.windowInfo.mockImplementation(() => reading.promise)
  receive({ type: 'windowResized', window: 'recorder' })
  receive({ type: 'windowVisibility', window: 'recorder', visible: true })
  reading.resolve(info(false)); await flush()
  expect(metrics().visible).toBe(true)
  receive({ type: 'windowVisibility', window: 'recorder', visible: false })
  api.windowInfo.mockResolvedValue(info(true))
  receive({ type: 'windowResized', window: 'recorder' }); await flush()
  expect(metrics().visible).toBe(false)
})

it('resizes without restarting the clock and ignores other windows', async () => {
  const { api, metrics, receive, clock } = mount()
  await flush()
  receive({ type: 'windowVisibility', window: 'recorder', visible: true }); await flush()
  receive({ type: 'windowResized', window: 'recorder', physicalWidth: 480, physicalHeight: 108 })
  receive({ type: 'windowVisibility', window: 'main', visible: false })
  expect(metrics()).toMatchObject({ visible: true, width: 480, height: 108 })
  expect(clock.elapsed()).toBe(6000)
  expect(api.status).toHaveBeenCalledOnce()
})

it('stops polling while hidden and unsubscribes on disposal', async () => {
  const { api, receive, unsubscribe, dispose } = mount()
  await flush()
  receive({ type: 'windowVisibility', window: 'recorder', visible: true }); await flush()
  receive({ type: 'windowVisibility', window: 'recorder', visible: false })
  await vi.advanceTimersByTimeAsync(1000)
  expect(api.status).toHaveBeenCalledOnce()
  dispose()
  expect(unsubscribe).toHaveBeenCalledOnce()
})

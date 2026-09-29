import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { ApplicationServices } from '@argui/host'
import type { BeamEvent } from './beamTypes'
import { BeamApi } from './beamApi'

function fixture() {
  let receive!: (event: unknown) => void
  const services = {
    call: vi.fn(async (_service: string, _method: string, _payload?: unknown) => undefined),
    setWindowPosition: vi.fn(async () => undefined),
    onEvent: (listener: (event: unknown) => void) => { receive = listener; return () => {} },
  }
  const api = new BeamApi(services as unknown as ApplicationServices, 'recorder')
  api.onEvent(() => {})
  return { api, services, event: (event: BeamEvent) => receive(event),
    writes: () => services.call.mock.calls.filter(call => call[1] === 'savePreferences') }
}
beforeEach(() => vi.useFakeTimers())
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers() })

it('never saves the default position from programmatic placement', async () => {
  const { api, event, writes } = fixture()
  await api.windowPosition(760, 1006)
  event({ type: 'windowMoved', window: 'recorder', x: 760, y: 1006 })
  await vi.advanceTimersByTimeAsync(200)
  expect(writes()).toEqual([])
})

it('saves the last actual user move and flushes before hiding', async () => {
  const { api, event, writes } = fixture()
  await api.dragWindow()
  event({ type: 'windowMoved', window: 'recorder', x: -1400, y: 0 })
  event({ type: 'windowMoved', window: 'recorder', x: -1300, y: 40 })
  await api.hideWindow()
  expect(writes()).toHaveLength(1)
  expect(writes()[0][2]).toEqual({ windowPositions: { recorder: { x: -1300, y: 40 } } })
  await vi.advanceTimersByTimeAsync(200)
  expect(writes()).toHaveLength(1)
})

it('does not treat placements on a later presentation as user moves', async () => {
  const { api, event, writes } = fixture()
  await api.dragWindow()
  event({ type: 'windowMoved', window: 'recorder', x: 100, y: 200 })
  event({ type: 'windowVisibility', window: 'recorder', visible: false })
  await Promise.resolve()
  event({ type: 'windowMoved', window: 'recorder', x: 760, y: 1006 })
  event({ type: 'windowVisibility', window: 'recorder', visible: true })
  await vi.advanceTimersByTimeAsync(200)
  expect(writes()).toHaveLength(1)
  expect(writes()[0][2]).toEqual({ windowPositions: { recorder: { x: 100, y: 200 } } })
})

it('rejects failed drags without arming position persistence', async () => {
  const { api, services, event, writes } = fixture()
  services.call.mockRejectedValueOnce(new Error('native drag unavailable'))
  await expect(api.dragWindow()).rejects.toThrow('native drag unavailable')
  event({ type: 'windowMoved', window: 'recorder', x: 760, y: 1006 })
  await vi.advanceTimersByTimeAsync(200)
  expect(writes()).toEqual([])
})

import { expect, it, vi } from 'vitest'
import type { BeamEvent } from './shared/beamTypes'
import { routeApplicationEvent, routeGeometryEvent } from './appEvents'

it('routes only supported application commands and pressed shortcuts', () => {
  const handlers = { preferences: vi.fn(), scheme: vi.fn(), action: vi.fn(), shortcut: vi.fn() }
  const preferences = { theme: 'dark' } as Extract<BeamEvent, { type: 'preferencesChanged' }>['preferences']
  const events: BeamEvent[] = [
    { type: 'preferencesChanged', preferences }, { type: 'systemScheme', scheme: 'light' },
    { type: 'systemScheme', scheme: 'dark' }, { type: 'systemScheme', scheme: 'invalid' },
    { type: 'beamUi', action: 'stop' }, { type: 'shortcut', state: 'released', id: 'stop' },
    { type: 'shortcut', state: 'pressed', id: 'stop' }, { type: 'windowMoved' },
  ]
  for (const event of events) routeApplicationEvent(event, handlers)
  expect(handlers.preferences).toHaveBeenCalledExactlyOnceWith(preferences)
  expect(handlers.scheme.mock.calls).toEqual([['light'], ['dark']])
  expect(handlers.action).toHaveBeenCalledExactlyOnceWith('stop')
  expect(handlers.shortcut).toHaveBeenCalledExactlyOnceWith('stop')
})
it('routes geometry observations independently of application commands', () => {
  const handlers = { schedule: vi.fn(), observe: vi.fn() }
  for (const type of ['windowMoved', 'windowResized', 'windowVisibility', 'shortcut', 'beamUi']) routeGeometryEvent({ type }, handlers)
  expect(handlers.schedule).toHaveBeenCalledTimes(2)
  expect(handlers.observe).toHaveBeenCalledOnce()
})

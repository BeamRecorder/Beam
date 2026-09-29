import { expect, it, vi } from 'vitest'
import { warmAuxiliaryWindows } from './windowWarmup'

function api(windowLevel = true) {
  return { windowInfo: vi.fn(async () => ({ capabilities: { windowLevel } })),
    ensureWindow: vi.fn(async (_window: string) => {}) }
}

it('warms Settings first and the supported capture tools afterwards', async () => {
  const service = api(), report = vi.fn()
  await warmAuxiliaryWindows(service, () => false, report)
  expect(service.ensureWindow.mock.calls).toEqual([['settings'], ['countdown'], ['recorder']])
  expect(report).not.toHaveBeenCalled()
})

it('warms Settings on Wayland without requesting unsupported window stacking', async () => {
  const service = api(false)
  await warmAuxiliaryWindows(service, () => false, vi.fn())
  expect(service.ensureWindow).toHaveBeenCalledExactlyOnceWith('settings')
})

it('a failed scene does not prevent warming the following windows', async () => {
  const service = api(), report = vi.fn(), error = new Error('scene rejected')
  service.ensureWindow.mockRejectedValueOnce(error)
  await warmAuxiliaryWindows(service, () => false, report)
  expect(report).toHaveBeenCalledExactlyOnceWith(error)
  expect(service.ensureWindow).toHaveBeenCalledTimes(3)
})

it('does no work for a disposed app and stops after disposal during inspection', async () => {
  const service = api()
  await warmAuxiliaryWindows(service, () => true, vi.fn())
  expect(service.windowInfo).not.toHaveBeenCalled()
  let disposed = false
  service.windowInfo.mockImplementationOnce(async () => {
    disposed = true
    return { capabilities: { windowLevel: true } }
  })
  await warmAuxiliaryWindows(service, () => disposed, vi.fn())
  expect(service.ensureWindow).not.toHaveBeenCalled()
})

it('stops between scenes and suppresses an obsolete failure after disposal', async () => {
  const service = api(), report = vi.fn()
  let disposed = false
  service.ensureWindow.mockImplementationOnce(async () => {
    disposed = true
    throw new Error('closed app')
  })
  await warmAuxiliaryWindows(service, () => disposed, report)
  expect(service.ensureWindow).toHaveBeenCalledExactlyOnceWith('settings')
  expect(report).not.toHaveBeenCalled()
})

it('propagates failed backend inspection without guessing capabilities', async () => {
  const service = api(), error = new Error('window unavailable')
  service.windowInfo.mockRejectedValueOnce(error)
  await expect(warmAuxiliaryWindows(service, () => false, vi.fn())).rejects.toThrow(error)
  expect(service.ensureWindow).not.toHaveBeenCalled()
})

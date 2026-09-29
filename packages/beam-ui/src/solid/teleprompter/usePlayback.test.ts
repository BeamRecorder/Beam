import { createRoot, createSignal } from 'solid-js'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { ApplicationServices } from '@argui/host'
import { BeamApi } from '../shared/beamApi'
import type { BeamEvent } from '../shared/beamTypes'
import { usePlayback } from './usePlayback'
import { createDefaultTeleprompterDocument } from './teleprompterTypes'
import { deferred, flush } from '../../../test/support/captureSession'

const disposers: (() => void)[] = []
beforeEach(() => vi.useFakeTimers())
afterEach(() => { disposers.splice(0).forEach(dispose => dispose()); vi.clearAllTimers(); vi.useRealTimers() })
function mount() {
  let listener: (event: BeamEvent) => void = () => undefined
  const off = vi.fn()
  const measure = vi.fn(async (_service: string, _method: string, payload: { element: string }) => ({ width: 500,
    height: payload.element === 'teleprompterContent' ? 1000 : 200 }))
  const windowInfo = vi.fn(async () => ({ visible: true }))
  const api = new BeamApi({ call: measure, getWindowInfo: windowInfo, onEvent: (receive: typeof listener) => {
    listener = receive; return off
  } } as unknown as ApplicationServices, 'teleprompter')
  let dispose!: () => void
  const model = createRoot(cleanup => {
    dispose = cleanup
    const [document, update] = createSignal({ ...createDefaultTeleprompterDocument(), scrollSpeed: 100 })
    const [enabled, enable] = createSignal(true)
    return { playback: usePlayback(api, document, enabled), document, update, enable }
  })
  disposers.push(dispose)
  return { ...model, measure, windowInfo, off, dispose, event: (event: BeamEvent) => listener(event) }
}
async function start(model: ReturnType<typeof mount>) {
  const work = model.playback.start(); await vi.advanceTimersByTimeAsync(40); await work
}
it('uses a bounded native transition and preserves elapsed progress across font changes', async () => {
  const model = mount(); await start(model)
  expect(model.playback.playing()).toBe(true)
  expect(model.playback.offset()).toBe(800)
  expect(model.playback.duration()).toBe(8000)
  await vi.advanceTimersByTimeAsync(2000)
  model.measure.mockImplementation(async (_service, _method, payload) => ({ width: 500,
    height: payload.element === 'teleprompterContent' ? 1800 : 200 }))
  model.update({ ...model.document(), fontSize: 48 })
  await flush(); await vi.advanceTimersByTimeAsync(80)
  expect(model.playback.offset()).toBe(1600)
  expect(model.playback.duration()).toBe(12000)
})
it('ignores measurements from a paused preparation and keeps a later preparation active', async () => {
  const model = mount(), content = deferred<{ width: number; height: number }>()
  model.measure.mockImplementation((_service, _method, payload) => payload.element === 'teleprompterContent'
    ? content.promise : Promise.resolve({ width: 500, height: 200 }))
  const stale = model.playback.start()
  await vi.advanceTimersByTimeAsync(40)
  model.playback.pause()
  model.measure.mockImplementation(async (_service, _method, payload) => ({ width: 500,
    height: payload.element === 'teleprompterContent' ? 1000 : 200 }))
  await start(model)
  content.resolve({ width: 500, height: 20000 }); await stale
  expect(model.playback.offset()).toBe(800)
  expect(model.playback.duration()).toBe(8000)
  expect(model.playback.playing()).toBe(true)
})
it('pauses for its own hidden or resized window and ignores other windows', async () => {
  const model = mount(); await start(model)
  model.event({ type: 'windowVisibility', window: 'settings', visible: false })
  expect(model.playback.playing()).toBe(true)
  model.event({ type: 'windowVisibility', window: 'teleprompter', visible: false })
  expect(model.playback.playing()).toBe(false)
  await model.playback.start()
  expect(model.playback.playing()).toBe(false)
  model.event({ type: 'windowVisibility', window: 'teleprompter', visible: true })
  await start(model)
  model.event({ type: 'windowResized', window: 'teleprompter' })
  expect(model.playback.playing()).toBe(false)
  expect(model.playback.duration()).toBe(0)
})
it('does not animate a measured hidden window', async () => {
  const model = mount(); model.windowInfo.mockResolvedValue({ visible: false }); await start(model)
  expect(model.playback.playing()).toBe(false)
  expect(model.playback.pending()).toBe(false)
})
it('rejects invalid layout or speed without leaving a pending animation', async () => {
  const model = mount()
  model.measure.mockResolvedValue({ width: 0, height: 200 })
  await start(model)
  expect(model.playback.error()).toContain('layout bounds')
  expect(model.playback.pending()).toBe(false)
  model.measure.mockResolvedValue({ width: 500, height: 2000 })
  model.update({ ...model.document(), scrollSpeed: Infinity }); await flush()
  // Use a viewport smaller than the content so animation validates the speed.
  model.measure.mockImplementation(async (_service, _method, payload) => ({ width: 500,
    height: payload.element === 'teleprompterContent' ? 2000 : 200 }))
  await start(model)
  expect(model.playback.error()).toContain('speed')
  expect(model.playback.playing()).toBe(false)
})
it('splits long playback into valid transitions and resumes from the last segment', async () => {
  const model = mount()
  model.measure.mockImplementation(async (_service, _method, payload) => ({ width: 500,
    height: payload.element === 'teleprompterContent' ? 20000 : 200 }))
  await start(model)
  expect(model.playback.duration()).toBe(60000)
  expect(model.playback.offset()).toBe(6000)
  await vi.advanceTimersByTimeAsync(60000)
  expect(model.playback.offset()).toBe(12000)
  expect(model.playback.playing()).toBe(true)
  model.enable(false); await flush()
  expect(model.playback.playing()).toBe(false)
  expect(model.playback.offset()).toBe(6000)
})
it('unsubscribes and ignores a rejected layout response after disposal', async () => {
  const model = mount(), content = deferred<{ width: number; height: number }>()
  model.measure.mockImplementation(() => content.promise)
  const work = model.playback.start(); await vi.advanceTimersByTimeAsync(40)
  model.dispose(); content.reject(new Error('late measurement failure')); await work
  expect(model.off).toHaveBeenCalledOnce()
  expect(model.playback.error()).toBe('')
  expect(vi.getTimerCount()).toBe(0)
})
it('toggles playback, coalesces repeated pending starts, and resets elapsed progress', async () => {
  const model = mount()
  const first = model.playback.start(), second = model.playback.start()
  await vi.advanceTimersByTimeAsync(40); await first; await second
  expect(model.measure).toHaveBeenCalledTimes(2)
  await vi.advanceTimersByTimeAsync(1000)
  await model.playback.play()
  expect(model.playback.offset()).toBe(100)
  model.playback.reset()
  expect(model.playback.offset()).toBe(0)
  const play = model.playback.play(); await vi.advanceTimersByTimeAsync(40); await play
  expect(model.playback.playing()).toBe(true)
})
it('finishes at the end, replays from zero, and handles fitting text', async () => {
  const model = mount(); await start(model)
  await vi.advanceTimersByTimeAsync(8000)
  expect(model.playback.playing()).toBe(false)
  const replay = model.playback.start(); await vi.advanceTimersByTimeAsync(80); await replay
  expect(model.playback.playing()).toBe(true)
  model.playback.pause(); model.playback.reset()
  model.measure.mockResolvedValue({ width: 500, height: 200 })
  await start(model)
  expect(model.playback.playing()).toBe(false)
  expect(model.playback.pending()).toBe(false)
})
it('changes speed without remeasuring and pauses a pending start on a toggle', async () => {
  const model = mount(); await start(model); model.measure.mockClear()
  await vi.advanceTimersByTimeAsync(1000)
  model.update({ ...model.document(), scrollSpeed: 200 }); await flush(); await vi.advanceTimersByTimeAsync(40)
  expect(model.measure).not.toHaveBeenCalled()
  expect(model.playback.duration()).toBe(3500)
  model.playback.pause()
  const pending = model.playback.start(); await model.playback.play(); await pending
  expect(model.playback.pending()).toBe(false)
})
it('ignores unrelated or incomplete window events and settles a commit on disposal', async () => {
  const model = mount(); await flush()
  model.event({ type: 'shortcut', id: 'other' })
  model.event({ type: 'windowVisibility', window: 'teleprompter' })
  const pending = model.playback.start()
  model.dispose(); await pending
  expect(model.playback.playing()).toBe(false)
  expect(vi.getTimerCount()).toBe(0)
})
it('recomputes text geometry and does no work while the reader is disabled', async () => {
  const model = mount(); await start(model); model.measure.mockClear()
  for (const patch of [{ lineHeight: 1.7 }, { text: 'new script' }, { textAlign: 'center' as const }]) {
    model.update({ ...model.document(), ...patch }); await flush(); await vi.advanceTimersByTimeAsync(40)
  }
  expect(model.measure).toHaveBeenCalledTimes(6)
  model.enable(false); await flush()
  model.measure.mockClear()
  await model.playback.refresh()
  expect(model.measure).not.toHaveBeenCalled()
})

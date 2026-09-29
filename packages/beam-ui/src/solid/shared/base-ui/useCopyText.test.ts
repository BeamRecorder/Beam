import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createRoot, createSignal } from 'solid-js'
import { useCopyText } from './useCopyText'

const disposers: (() => void)[] = []
beforeEach(() => vi.useFakeTimers())
afterEach(() => { disposers.splice(0).forEach(dispose => dispose()); vi.useRealTimers() })
function mount(write: (text: string) => Promise<void>, initial = 'ServiceError: full diagnostic\nsecond line') {
  return createRoot(dispose => {
    disposers.push(dispose)
    const [value, setValue] = createSignal(initial)
    return { state: useCopyText(value, write), setValue }
  })
}

it('copies the complete original diagnostic and clears success feedback after its deadline', async () => {
  const write = vi.fn().mockResolvedValue(undefined), { state } = mount(write)
  await state.copy()
  expect(write).toHaveBeenCalledExactlyOnceWith('ServiceError: full diagnostic\nsecond line')
  expect(state.copied()).toBe(true)
  expect(state.pending()).toBe(false)
  vi.advanceTimersByTime(1599)
  expect(state.copied()).toBe(true)
  vi.advanceTimersByTime(1)
  expect(state.copied()).toBe(false)
})

it('reports clipboard failure independently of the original error and allows retry', async () => {
  const write = vi.fn().mockRejectedValueOnce(new Error('clipboard unavailable')).mockResolvedValue(undefined)
  const { state } = mount(write)
  await state.copy()
  expect(state.error()).toBe('Error: clipboard unavailable')
  expect(state.copied()).toBe(false)
  await state.copy()
  expect(state.error()).toBe('')
  expect(state.copied()).toBe(true)
  expect(write).toHaveBeenCalledTimes(2)
})

it('ignores an empty value and duplicate presses during a pending clipboard write', async () => {
  let finish!: () => void
  const write = vi.fn(() => new Promise<void>(resolve => { finish = resolve }))
  const { state, setValue } = mount(write, '')
  await state.copy()
  expect(write).not.toHaveBeenCalled()
  setValue('diagnostic')
  const request = state.copy()
  expect(state.pending()).toBe(true)
  await state.copy()
  expect(write).toHaveBeenCalledExactlyOnceWith('diagnostic')
  finish(); await request
  expect(state.pending()).toBe(false)
})

it.each([true, false])('a changed error never receives feedback from an earlier write (%s)', async success => {
  let finish!: () => void, fail!: (cause: Error) => void
  const { state, setValue } = mount(() => new Promise<void>((resolve, reject) => { finish = resolve; fail = reject }))
  const request = state.copy()
  setValue('another error')
  if (success) finish(); else fail(new Error('old clipboard failure'))
  await request
  expect(state.copied()).toBe(false)
  expect(state.error()).toBe('')
  expect(state.pending()).toBe(false)
  expect(vi.getTimerCount()).toBe(0)
})

it('changing the error clears prior success and its timer', async () => {
  const { state, setValue } = mount(async () => {})
  await state.copy()
  setValue('new error')
  expect(state.copied()).toBe(false)
  expect(vi.getTimerCount()).toBe(0)
})

it.each([true, false])('disposing prevents late clipboard feedback or new writes (%s)', async success => {
  let finish!: () => void, fail!: (cause: Error) => void
  const write = vi.fn(() => new Promise<void>((resolve, reject) => { finish = resolve; fail = reject }))
  const { state } = mount(write)
  const request = state.copy()
  disposers.pop()!()
  if (success) finish(); else fail(new Error('clipboard closed'))
  await request
  await state.copy()
  expect(write).toHaveBeenCalledTimes(1)
  expect(state.copied()).toBe(false)
  expect(state.error()).toBe('')
  expect(vi.getTimerCount()).toBe(0)
})

it('disposing cancels a scheduled feedback reset', async () => {
  const { state } = mount(async () => {})
  await state.copy()
  expect(vi.getTimerCount()).toBe(1)
  disposers.pop()!()
  expect(vi.getTimerCount()).toBe(0)
})

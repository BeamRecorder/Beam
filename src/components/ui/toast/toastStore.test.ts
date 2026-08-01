import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useToastStore } from './toastStore'

describe('toastStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
  })

  it('adds all supported toast types and removes them automatically', () => {
    const store = useToastStore()
    store.add('Info', 'info', 1000)
    store.addToast('Warning', 'warning', 0)
    store.success('Success', 0)
    store.error('Error', 0)
    expect(store.toasts).toHaveLength(4)
    const id = store.toasts[1].id
    store.remove(id)
    expect(store.toasts.some((toast) => toast.id === id)).toBe(false)
    vi.advanceTimersByTime(1000)
    expect(store.toasts).toHaveLength(2)
  })

  it('keeps action metadata and supports info without expiration', () => {
    const store = useToastStore()
    const onClick = vi.fn()
    store.info('With action', 0, { label: 'Retry', onClick })
    expect(store.toasts[0].action?.label).toBe('Retry')
    vi.advanceTimersByTime(5000)
    expect(store.toasts).toHaveLength(1)
  })
})

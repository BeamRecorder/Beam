import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { capture } = vi.hoisted(() => ({ capture: { onCountdown: vi.fn() } }))
vi.mock('../../../api/capture', () => ({ capture }))

import CountdownOverlay from './CountdownOverlay.vue'

describe('CountdownOverlay', () => {
  beforeEach(() => vi.clearAllMocks())

  it('displays countdown events and unsubscribes on unmount', async () => {
    let listener: ((value: number | null) => void) | undefined
    const unsubscribe = vi.fn()
    capture.onCountdown.mockImplementation((next: (value: number | null) => void) => {
      listener = next
      return unsubscribe
    })
    const wrapper = mount(CountdownOverlay)
    expect(wrapper.get('.countdown').text()).toBe('')
    listener?.(3)
    await wrapper.vm.$nextTick()
    expect(wrapper.get('.countdown').text()).toBe('3')
    listener?.(null)
    await wrapper.vm.$nextTick()
    expect(wrapper.get('.countdown').text()).toBe('')
    wrapper.unmount()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })
})

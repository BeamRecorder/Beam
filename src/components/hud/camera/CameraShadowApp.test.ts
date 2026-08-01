import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { capture } = vi.hoisted(() => ({ capture: { onCameraShadow: vi.fn() } }))
vi.mock('../../../api/capture', () => ({ capture }))

import CameraShadowApp from './CameraShadowApp.vue'

describe('CameraShadowApp', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(window, 'capture', { configurable: true, value: capture })
  })

  it('updates the shadow classes from native state and unsubscribes', async () => {
    let listener: ((value: { shadowSize: string; cornerRadius: string }) => void) | undefined
    const unsubscribe = vi.fn()
    capture.onCameraShadow.mockImplementation((next: typeof listener) => {
      listener = next
      return unsubscribe
    })
    const wrapper = mount(CameraShadowApp)
    expect(wrapper.get('.shadow').classes()).toEqual(expect.arrayContaining(['shadow-md', 'radius-md']))
    listener?.({ shadowSize: 'lg', cornerRadius: 'full' })
    await wrapper.vm.$nextTick()
    expect(wrapper.get('.shadow').classes()).toEqual(expect.arrayContaining(['shadow-lg', 'radius-full']))
    wrapper.unmount()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })
})

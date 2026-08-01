import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { capture } = vi.hoisted(() => ({
  capture: { onScreenRegionConfigure: vi.fn(), confirmScreenRegion: vi.fn(), cancelScreenRegion: vi.fn() },
}))
vi.mock('../../../api/capture', () => ({ capture }))
vi.mock('~/i18n/useTranslate', () => ({
  useTranslate: () => ({ t: (key: string) => key }),
}))

import ScreenRegionOverlayApp from './ScreenRegionOverlayApp.vue'

const Button = {
  props: ['disabled'],
  emits: ['click'],
  template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
}

describe('ScreenRegionOverlayApp', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1000 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 500 })
  })

  it('draws a selected region, shows its dimensions and confirms it', async () => {
    let configure!: (value: { mode: 'select'; bounds: { width: number; height: number }; region?: { x: number; y: number; width: number; height: number } }) => void
    const unsubscribe = vi.fn()
    capture.onScreenRegionConfigure.mockImplementation((next: typeof configure) => { configure = next; return unsubscribe })
    const wrapper = mount(ScreenRegionOverlayApp, { global: { stubs: { Button } } })
    configure({ mode: 'select', bounds: { width: 1000, height: 500 } })
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.region-empty-backdrop').exists()).toBe(true)
    const main = wrapper.get('.region-overlay')
    const setPointerCapture = vi.fn()
    Object.defineProperty(main.element, 'setPointerCapture', { value: setPointerCapture })
    await main.trigger('pointerdown', { clientX: 100, clientY: 100, pointerId: 7 })
    await main.trigger('pointermove', { clientX: 500, clientY: 400, pointerId: 7 })
    expect(wrapper.get('.region-frame').attributes('style')).toContain('width: 40%')
    expect(wrapper.get('.region-size').text()).toBe('400 × 300')
    await main.trigger('pointerup')
    expect(setPointerCapture).toHaveBeenCalledWith(7)

    await wrapper.findAll('.region-actions button')[2].trigger('click')
    expect(capture.confirmScreenRegion).toHaveBeenCalledWith(expect.objectContaining({ x: 0.1, y: 0.2, width: 0.4 }))
    expect(capture.confirmScreenRegion.mock.calls[0][0].height).toBeCloseTo(0.6)
    wrapper.unmount()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })

  it('moves and resizes an existing region while clamping to the viewport', async () => {
    let configure!: (value: { mode: 'select'; bounds: { width: number; height: number }; region: { x: number; y: number; width: number; height: number } }) => void
    capture.onScreenRegionConfigure.mockImplementation((next: typeof configure) => { configure = next; return vi.fn() })
    const wrapper = mount(ScreenRegionOverlayApp, { global: { stubs: { Button } } })
    configure({ mode: 'select', bounds: { width: 1000, height: 500 }, region: { x: 0.2, y: 0.2, width: 0.3, height: 0.3 } })
    await wrapper.vm.$nextTick()
    const main = wrapper.get('.region-overlay')
    Object.defineProperty(main.element, 'setPointerCapture', { value: vi.fn() })
    await wrapper.get('.region-frame').trigger('pointerdown', { clientX: 250, clientY: 150, pointerId: 8 })
    await main.trigger('pointermove', { clientX: 900, clientY: 490, pointerId: 8 })
    expect(wrapper.get('.region-frame').attributes('style')).toContain('left: 70%')
    expect(wrapper.get('.region-frame').attributes('style')).toContain('top: 70%')

    await wrapper.get('.resize-handle.se').trigger('pointerdown', { clientX: 500, clientY: 250, pointerId: 9 })
    await main.trigger('pointermove', { clientX: 1200, clientY: 700, pointerId: 9 })
    expect(wrapper.get('.region-frame').attributes('style')).toMatch(/width: 30/)
    await main.trigger('pointercancel')
    await wrapper.findAll('.region-actions button')[0].trigger('click')
    expect(wrapper.get('.region-frame').attributes('style')).toContain('width: 100%')
  })

  it('cancels selection and ignores pointer input outside select mode', async () => {
    let configure!: (value: { mode: 'select' | 'record'; bounds: { width: number; height: number } }) => void
    capture.onScreenRegionConfigure.mockImplementation((next: typeof configure) => { configure = next; return vi.fn() })
    const wrapper = mount(ScreenRegionOverlayApp, { global: { stubs: { Button } } })
    configure({ mode: 'record', bounds: { width: 100, height: 100 } })
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.region-toolbar').exists()).toBe(false)
    await wrapper.get('.region-overlay').trigger('pointerdown', { clientX: 10, clientY: 10, pointerId: 1 })
    expect(wrapper.find('.region-frame').exists()).toBe(false)

    configure({ mode: 'select', bounds: { width: 100, height: 100 } })
    await wrapper.vm.$nextTick()
    await wrapper.findAll('.region-actions button')[1].trigger('click')
    expect(capture.cancelScreenRegion).toHaveBeenCalledOnce()
  })
})

import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import ResizeHandle from './ResizeHandle.vue'

describe('ResizeHandle', () => {
  it('renders all default corners and emits the complete pointer lifecycle', async () => {
    const wrapper = mount(ResizeHandle)
    const handles = wrapper.findAll('.resize-handle')
    expect(handles).toHaveLength(8)
    expect(handles[0].attributes('aria-label')).toBe('Resize from top-left')

    const setPointerCapture = vi.fn()
    Object.defineProperty(handles[0].element, 'setPointerCapture', { value: setPointerCapture })
    await handles[0].trigger('pointerdown', { pointerId: 11 })
    await handles[0].trigger('pointermove', { pointerId: 11 })
    await handles[0].trigger('pointerup', { pointerId: 11 })
    await handles[0].trigger('pointercancel', { pointerId: 11 })

    expect(setPointerCapture).toHaveBeenCalledWith(11)
    expect(wrapper.emitted('resize-start')?.[0]?.[0]).toBe('top-left')
    expect(wrapper.emitted('resize-move')?.[0]?.[0]).toBe('top-left')
    expect(wrapper.emitted('resize-end')).toHaveLength(2)
  })

  it('supports a restricted corner list and disabled handles', () => {
    const wrapper = mount(ResizeHandle, { props: { corners: ['left', 'right'], disabled: true } })
    expect(wrapper.findAll('.resize-handle')).toHaveLength(2)
    expect(wrapper.findAll('.resize-handle').every((handle) => handle.attributes('disabled') !== undefined)).toBe(true)
  })
})

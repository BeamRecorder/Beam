import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import AudioIconMeter from './AudioIconMeter.vue'

describe('AudioIconMeter', () => {
  it('renders disabled state correctly', () => {
    const wrapper = mount(AudioIconMeter, {
      props: { enabled: false, level: 0, kind: 'mic' },
    })
    expect(wrapper.classes()).not.toContain('enabled')
    expect(wrapper.find('.level-bar-fill').exists()).toBe(false)
  })

  it('renders active level visualization when enabled', () => {
    const wrapper = mount(AudioIconMeter, {
      props: { enabled: true, level: 0.5, kind: 'mic' },
    })
    expect(wrapper.classes()).toContain('enabled')
    expect(wrapper.find('.level-bar-fill').exists()).toBe(true)
  })

  it('renders system audio variant when requested', () => {
    const wrapper = mount(AudioIconMeter, {
      props: { enabled: true, level: 0.8, kind: 'system' },
    })
    expect(wrapper.classes()).toContain('enabled')
    expect(wrapper.find('.level-bar-fill').attributes('style')).toContain('height')
  })
})

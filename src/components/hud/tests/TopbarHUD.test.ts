import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TopbarHUD from '../TopbarHUD.vue'

describe('TopbarHUD', () => {
  it('renders the default brand identity', () => { const wrapper = mount(TopbarHUD); expect(wrapper.get('img').attributes('alt')).toBe('DemoRecorder'); expect(wrapper.text()).toContain('DemoRecorder'); expect(wrapper.find('.rec-badge').exists()).toBe(false) })
  it('renders back, recording and preferences states', async () => { const wrapper = mount(TopbarHUD, { props: { title: 'Edit', showBack: true, showSettings: true, isRecording: true } }); expect(wrapper.find('img').exists()).toBe(false); expect(wrapper.text()).toContain('REC'); await wrapper.get('[aria-label="Back"]').trigger('click'); await wrapper.get('[aria-label="Preferences"]').trigger('click'); expect(wrapper.emitted('back')).toHaveLength(1); expect(wrapper.emitted('open-settings')).toHaveLength(1) })
  it('emits native window actions', async () => { const wrapper = mount(TopbarHUD); await wrapper.get('[aria-label="Minimize"]').trigger('click'); await wrapper.get('[aria-label="Close"]').trigger('click'); expect(wrapper.emitted('minimize')).toHaveLength(1); expect(wrapper.emitted('close')).toHaveLength(1) })
})

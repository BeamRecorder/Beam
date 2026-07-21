import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import HudPreferences from '../HudPreferences.vue'

const Switch = { template: '<button class="quality" @click="$emit(\'update:modelValue\', false)" />' }
const Select = { template: '<button class="countdown" @click="$emit(\'update:modelValue\', 10)" />' }
describe('HudPreferences', () => {
  beforeEach(() => { setActivePinia(createPinia()); window.matchMedia ??= () => ({ matches: false, addEventListener: () => undefined }) as unknown as MediaQueryList })
  it('relays recording preferences and closes', async () => { const wrapper = mount(HudPreferences, { props: { recordHighQuality: true, countdownSeconds: 3 }, global: { stubs: { Switch, Select } } }); await wrapper.get('.quality').trigger('click'); await wrapper.findAll('.countdown')[1].trigger('click'); const returnToHud = wrapper.findAll('button').find((button) => button.text().includes('Return to HUD')); await returnToHud?.trigger('click'); expect(wrapper.emitted('update:recordHighQuality')).toContainEqual([false]); expect(wrapper.emitted('update:countdownSeconds')).toContainEqual([10]); expect(wrapper.emitted('close')).toHaveLength(1) })
  it('persists user theme selections', async () => { const wrapper = mount(HudPreferences, { props: { recordHighQuality: false, countdownSeconds: 0 }, global: { stubs: { Switch, Select } } }); const buttons = wrapper.findAll('.theme-controls button'); await buttons[0].trigger('click'); expect(localStorage.getItem('theme')).toBe('light'); await buttons[1].trigger('click'); expect(localStorage.getItem('theme')).toBe('dark'); await buttons[2].trigger('click'); expect(localStorage.getItem('theme')).toBe('system') })
})

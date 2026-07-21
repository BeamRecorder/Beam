import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { computed } from 'vue'
import { vi } from 'vitest'
vi.mock('@vueuse/core', () => ({ useVirtualList: (items: { value: unknown[] }) => ({ list: computed(() => items.value.map((data, index) => ({ data, index }))), containerProps: {}, wrapperProps: {} }) }))
import WindowSelect from './WindowSelect.vue'

const Popover = { emits: ['toggle'], template: '<div><slot name="trigger" :isOpen="false" /><slot :close="() => {}" /></div>' }
const options = [{ id: 'window-1', name: 'Editor', thumbnail: 'thumb', appIcon: 'icon' }]
describe('WindowSelect', () => {
  it('renders selected window media and emits an option id', async () => { const wrapper = mount(WindowSelect, { props: { modelValue: 'window-1', options }, global: { stubs: { Popover } } }); expect(wrapper.get('.trigger-thumbnail-img').attributes('src')).toBe('thumb'); await wrapper.get('.select-option').trigger('click'); expect(wrapper.emitted('update:modelValue')).toEqual([['window-1']]) })
  it('shows empty and placeholder states', () => { const wrapper = mount(WindowSelect, { props: { modelValue: null, options: [], placeholder: 'None' }, global: { stubs: { Popover } } }); expect(wrapper.text()).toContain('No windows detected'); expect(wrapper.get('.select-label').text()).toBe('None') })
  it('does not emit selections while disabled', async () => { const wrapper = mount(WindowSelect, { props: { modelValue: 'window-1', options, disabled: true }, global: { stubs: { Popover } } }); await wrapper.get('.select-option').trigger('click'); expect(wrapper.emitted('update:modelValue')).toBeUndefined() })
})

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { computed } from 'vue'
import { vi } from 'vitest'
vi.mock('@vueuse/core', () => ({ useVirtualList: (items: { value: unknown[] }) => ({ list: computed(() => items.value.map((data, index) => ({ data, index }))), containerProps: {}, wrapperProps: {} }) }))
import Select from './Select.vue'

const Popover = { emits: ['toggle'], template: '<div><slot name="trigger" :isOpen="true" /><slot :close="() => {}" /></div>' }
const options = [{ value: 'one', label: 'One' }, { value: 'two', label: 'A very long option name that needs a smaller label' }]
describe('Select', () => {
  it('renders a selected option and emits a user selection', async () => { const wrapper = mount(Select, { props: { modelValue: 'one', options }, global: { stubs: { Popover } } }); expect(wrapper.get('.select-label').text()).toBe('One'); await wrapper.get('.select-option').trigger('click'); expect(wrapper.emitted('update:modelValue')).toEqual([['one']]) })
  it('shows a placeholder and contracts long labels', () => { const wrapper = mount(Select, { props: { modelValue: 'two', options, placeholder: 'Choose' }, global: { stubs: { Popover } } }); expect(wrapper.get('.select-label').attributes('style')).toContain('font-size: 0.75rem'); const empty = mount(Select, { props: { modelValue: null, options: [], placeholder: 'Choose' }, global: { stubs: { Popover } } }); expect(empty.get('.select-label').text()).toBe('Choose') })
  it('does not select an option while disabled', async () => { const wrapper = mount(Select, { props: { modelValue: 'one', options, disabled: true }, global: { stubs: { Popover } } }); await wrapper.get('.select-option').trigger('click'); expect(wrapper.emitted('update:modelValue')).toBeUndefined() })
})

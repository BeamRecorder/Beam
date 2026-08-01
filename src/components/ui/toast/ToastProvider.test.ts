import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useToastStore } from './toastStore'
import ToastProvider from './ToastProvider.vue'

describe('ToastProvider', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('renders icons for each type and handles action and dismissal', async () => {
    const store = useToastStore()
    const onClick = vi.fn()
    store.add('Success message', 'success', 0)
    store.add('Error message', 'error', 0)
    store.add('Warning message', 'warning', 0)
    store.add('Action message', 'info', 0, { label: 'Retry', onClick })
    const wrapper = mount(ToastProvider)
    expect(wrapper.findAll('.toast-item')).toHaveLength(4)
    expect(wrapper.find('.toast-icon.success').exists()).toBe(true)
    expect(wrapper.find('.toast-icon.error').exists()).toBe(true)
    expect(wrapper.find('.toast-icon.info').exists()).toBe(true)
    await wrapper.find('.toast-action-btn').trigger('click')
    expect(onClick).toHaveBeenCalledOnce()
    expect(store.toasts).toHaveLength(3)
    await wrapper.find('.toast-close').trigger('click')
    expect(store.toasts).toHaveLength(2)
  })
})

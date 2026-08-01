import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import UpdateAvailableBadge from './UpdateAvailableBadge.vue'
import type { AppUpdateState } from '~/api/types/capture-api'

const captureMock = vi.hoisted(() => ({
  getUpdateState: vi.fn(),
  onUpdateState: vi.fn(),
  listener: undefined as ((state: AppUpdateState) => void) | undefined,
  stopListening: vi.fn(),
}))

vi.mock('~/api/capture', () => ({ capture: captureMock }))

const update = (status: AppUpdateState['status']): AppUpdateState => ({
  status, currentVersion: '1.0.0', availableVersion: '1.1.0', percent: 50, message: null,
})

beforeEach(() => {
  vi.clearAllMocks()
  captureMock.listener = undefined
  captureMock.onUpdateState.mockImplementation((listener: (next: AppUpdateState) => void) => {
    captureMock.listener = listener
    return captureMock.stopListening
  })
})

describe('UpdateAvailableBadge', () => {
  it('shows only actionable update statuses and unregisters its listener', async () => {
    captureMock.getUpdateState.mockResolvedValue(update('idle'))
    const wrapper = mount(UpdateAvailableBadge)
    await flushPromises()
    expect(wrapper.find('.update-badge').exists()).toBe(false)

    for (const status of ['available', 'downloading', 'downloaded'] as const) {
      captureMock.listener?.(update(status))
      await wrapper.vm.$nextTick()
      expect(wrapper.find('.update-badge').exists()).toBe(true)
    }
    captureMock.listener?.(update('error'))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.update-badge').exists()).toBe(false)
    wrapper.unmount()
    expect(captureMock.stopListening).toHaveBeenCalledOnce()
  })
})

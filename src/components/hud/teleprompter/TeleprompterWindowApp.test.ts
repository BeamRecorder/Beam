import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { capture } = vi.hoisted(() => ({
  capture: { onTeleprompterSession: vi.fn(), onTeleprompterShortcut: vi.fn(), notifyTeleprompterReady: vi.fn() },
}))
vi.mock('~/api/capture', () => ({ capture }))

import TeleprompterWindowApp from './TeleprompterWindowApp.vue'

const Teleprompter = { template: '<div class="teleprompter-stub">Teleprompter</div>' }

describe('TeleprompterWindowApp', () => {
  beforeEach(() => vi.clearAllMocks())

  it('forwards native teleprompter events to window events and cleans up', async () => {
    let sessionListener: ((value: unknown) => void) | undefined
    let shortcutListener: ((value: string) => void) | undefined
    const stopSession = vi.fn()
    const stopShortcut = vi.fn()
    capture.onTeleprompterSession.mockImplementation((next: typeof sessionListener) => { sessionListener = next; return stopSession })
    capture.onTeleprompterShortcut.mockImplementation((next: typeof shortcutListener) => { shortcutListener = next; return stopShortcut })
    const sessionEvent = vi.fn()
    const shortcutEvent = vi.fn()
    window.addEventListener('teleprompter-session', sessionEvent)
    window.addEventListener('teleprompter-shortcut', shortcutEvent)
    const wrapper = mount(TeleprompterWindowApp, { global: { stubs: { Teleprompter } } })
    expect(wrapper.find('.teleprompter-stub').exists()).toBe(true)

    sessionListener?.({ projectId: 'project-1', sessionId: 'session-1' })
    shortcutListener?.('toggleVisibility')
    expect(sessionEvent).toHaveBeenCalledOnce()
    expect((sessionEvent.mock.calls[0][0] as CustomEvent).detail).toEqual({ projectId: 'project-1', sessionId: 'session-1' })
    expect(shortcutEvent).toHaveBeenCalledOnce()
    expect((shortcutEvent.mock.calls[0][0] as CustomEvent).detail).toBe('toggleVisibility')
    expect(capture.notifyTeleprompterReady).toHaveBeenCalledOnce()
    wrapper.unmount()
    expect(stopSession).toHaveBeenCalledOnce()
    expect(stopShortcut).toHaveBeenCalledOnce()
    window.removeEventListener('teleprompter-session', sessionEvent)
    window.removeEventListener('teleprompter-shortcut', shortcutEvent)
  })
})

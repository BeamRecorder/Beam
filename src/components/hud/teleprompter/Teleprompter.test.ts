import { createI18n } from 'vue-i18n'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import en from '~/i18n/en/Teleprompter.json'
import fr from '~/i18n/fr/Teleprompter.json'

const capture = vi.hoisted(() => ({
  hideTeleprompter: vi.fn(),
  saveSessionTeleprompter: vi.fn().mockResolvedValue(null),
  getSessionTeleprompter: vi.fn().mockResolvedValue(null),
  onTeleprompterSession: vi.fn().mockReturnValue(() => undefined),
  onTeleprompterShortcut: vi.fn().mockReturnValue(() => undefined),
}))

vi.mock('~/api/capture', () => ({ capture }))

import Teleprompter from './Teleprompter.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: { en: { Teleprompter: en }, fr: { Teleprompter: fr } },
})

describe('Teleprompter', () => {
  it('keeps Hide, Edit, Settings and the script editor available', () => {
    const wrapper = mount(Teleprompter, { global: { plugins: [i18n] } })
    expect(wrapper.find('[aria-label="Hide"]').exists()).toBe(true)
    expect(wrapper.find('[aria-label="Settings"]').exists()).toBe(true)
    expect(wrapper.find('[aria-label="Teleprompter script"]').exists()).toBe(true)
    expect(wrapper.find('[aria-label="Preview"]').exists()).toBe(true)
  })

  it('hides the native window and renders edited lines', async () => {
    const wrapper = mount(Teleprompter, { global: { plugins: [i18n] } })
    await wrapper.get('[aria-label="Hide"]').trigger('click')
    await wrapper.get('textarea').setValue('First line\nSecond line')
    expect(capture.hideTeleprompter).toHaveBeenCalledOnce()
    expect(wrapper.findAll('.teleprompter-line').map((line) => line.text())).toEqual(['First line', 'Second line'])
  })

  it('switches from editing to preview when recording starts', async () => {
    const wrapper = mount(Teleprompter, { global: { plugins: [i18n] } })
    window.dispatchEvent(
      new CustomEvent('teleprompter-session', { detail: { projectId: 'project-1', sessionId: 'session-1' } }),
    )
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[aria-label="Teleprompter script"]').exists()).toBe(false)
    expect(wrapper.find('[aria-label="Edit"]').exists()).toBe(true)
  })

  it('opens settings as a dedicated view and returns to the reader', async () => {
    const wrapper = mount(Teleprompter, { global: { plugins: [i18n] } })
    await wrapper.get('[aria-label="Settings"]').trigger('click')
    expect(wrapper.find('.settings-view').exists()).toBe(true)
    await wrapper.get('[aria-label="Back"]').trigger('click')
    expect(wrapper.find('.settings-view').exists()).toBe(false)
    expect(wrapper.find('[aria-label="Teleprompter script"]').exists()).toBe(true)
  })

  it('uses the French translation namespace when the locale changes', () => {
    i18n.global.locale.value = 'fr'
    const wrapper = mount(Teleprompter, { global: { plugins: [i18n] } })
    expect(wrapper.find('[aria-label="Masquer"]').exists()).toBe(true)
    i18n.global.locale.value = 'en'
  })
})

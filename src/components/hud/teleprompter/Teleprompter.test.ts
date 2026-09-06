import { createI18n } from 'vue-i18n';
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import enEditor from '~/i18n/en/editor.json';
import frEditor from '~/i18n/fr/editor.json';

const capture = vi.hoisted(() => ({
  hideTeleprompter: vi.fn(),
  saveSessionTeleprompter: vi.fn().mockResolvedValue(null),
  getSessionTeleprompter: vi.fn().mockResolvedValue(null),
  onTeleprompterSession: vi.fn().mockReturnValue(() => undefined),
  onTeleprompterShortcut: vi.fn().mockReturnValue(() => undefined),
}));

vi.mock('~/api/capture', () => ({ capture }));

import Teleprompter from './Teleprompter.vue';

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: {
    en: { Teleprompter: enEditor.Teleprompter },
    fr: { Teleprompter: frEditor.Teleprompter },
  },
});

describe('Teleprompter', () => {
  it('keeps Hide, Edit, Settings and the script editor available', () => {
    const wrapper = mount(Teleprompter, { global: { plugins: [i18n] } });
    expect(wrapper.find('[aria-label="Hide"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="Settings"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="Teleprompter script"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="Preview"]').exists()).toBe(true);
  });

  it('hides the native window and renders edited lines', async () => {
    const wrapper = mount(Teleprompter, { global: { plugins: [i18n] } });
    await wrapper.get('[aria-label="Hide"]').trigger('click');
    await wrapper.get('textarea').setValue('First line\nSecond line');
    expect(capture.hideTeleprompter).toHaveBeenCalledOnce();
    expect(wrapper.findAll('.teleprompter-line').map((line) => line.text())).toEqual(['First line', 'Second line']);
  });

  it('switches from editing to preview when recording starts', async () => {
    const wrapper = mount(Teleprompter, { global: { plugins: [i18n] } });
    window.dispatchEvent(
      new CustomEvent('teleprompter-session', { detail: { projectId: 'project-1', sessionId: 'session-1' } }),
    );
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[aria-label="Teleprompter script"]').exists()).toBe(false);
    expect(wrapper.find('[aria-label="Edit"]').exists()).toBe(true);
  });

  it('opens settings as a dedicated view and returns to the reader', async () => {
    const wrapper = mount(Teleprompter, { global: { plugins: [i18n] } });
    await wrapper.get('[aria-label="Settings"]').trigger('click');
    expect(wrapper.find('.settings-view').exists()).toBe(true);
    await wrapper.get('[aria-label="Back"]').trigger('click');
    expect(wrapper.find('.settings-view').exists()).toBe(false);
    expect(wrapper.find('[aria-label="Teleprompter script"]').exists()).toBe(true);
  });

  it.each([
    ['Russian', 'После создания копируем ключ.\nПример кода MCP'],
    ['Ukrainian', 'Привіт світе!\nУкраїнська мова: ї, є, ґ.'],
    ['Bulgarian', 'Здравейте, свят!\nБългарски текст.'],
    ['Greek', 'Καλημέρα κόσμε!\nΕλληνικό κείμενο.'],
    ['Arabic', 'مرحبا بالعالم\nهذا نص عربي'],
    ['Hindi', 'नमस्ते दुनिया\nयह हिन्दी पाठ है'],
    ['CJK', '你好世界\n日本語の文章\n한국어 문장'],
    ['mixed', 'Hello — Привет всем!\nMCP: пример кода'],
  ])('preserves %s script text in the editor and reader with English menus', async (_language, text) => {
    i18n.global.locale.value = 'en';
    const wrapper = mount(Teleprompter, { global: { plugins: [i18n] } });
    try {
      await wrapper.get('textarea').setValue(text);
      expect(wrapper.get('textarea').element.value).toBe(text);
      expect(wrapper.findAll('.teleprompter-line').map((line) => line.text())).toEqual(text.split('\n'));
      await wrapper.get('[aria-label="Preview"]').trigger('click');
      expect(wrapper.find('textarea').exists()).toBe(false);
      expect(wrapper.findAll('.teleprompter-line').map((line) => line.text())).toEqual(text.split('\n'));
    } finally {
      wrapper.unmount();
    }
  });

  it('uses the French translation namespace when the locale changes', () => {
    i18n.global.locale.value = 'fr';
    const wrapper = mount(Teleprompter, { global: { plugins: [i18n] } });
    expect(wrapper.find('[aria-label="Masquer"]').exists()).toBe(true);
    i18n.global.locale.value = 'en';
  });
});

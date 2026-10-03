import { createI18n } from 'vue-i18n';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Slider from '~/ui/slider/Slider.vue';
import TeleprompterToolbar from './TeleprompterToolbar.vue';
import enEditor from '~/i18n/en/editor.json';
import frEditor from '~/i18n/fr/editor.json';

enableAutoUnmount(afterEach);

const capture = vi.hoisted(() => ({
  hideTeleprompter: vi.fn(),
  onPreferencesChanged: vi.fn().mockReturnValue(() => undefined),
  resizeTeleprompter: vi.fn().mockResolvedValue(undefined),
  saveSessionTeleprompter: vi.fn().mockResolvedValue(null),
  getSessionTeleprompter: vi.fn().mockResolvedValue(null),
  onTeleprompterSession: vi.fn().mockReturnValue(() => undefined),
  onTeleprompterShortcut: vi.fn().mockReturnValue(() => undefined),
  getPreferences: vi.fn().mockResolvedValue({ extras: {} }),
  updatePreferences: vi.fn().mockResolvedValue({}),
  getTeleprompterResumeState: vi.fn().mockResolvedValue(null),
  onTeleprompterSuspend: vi.fn().mockReturnValue(() => undefined),
  onTeleprompterVisibility: vi.fn().mockReturnValue(() => undefined),
  acknowledgeTeleprompterSuspend: vi.fn(),
  notifyTeleprompterReady: vi.fn(),
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
  beforeEach(() => {
    vi.clearAllMocks();
    i18n.global.locale.value = 'en';
    capture.getSessionTeleprompter.mockResolvedValue(null);
    capture.saveSessionTeleprompter.mockResolvedValue(null);
    capture.getPreferences.mockResolvedValue({ extras: {} });
    capture.updatePreferences.mockResolvedValue({});
    capture.getTeleprompterResumeState.mockResolvedValue(null);
    capture.onTeleprompterSession.mockReturnValue(() => undefined);
    capture.onTeleprompterShortcut.mockReturnValue(() => undefined);
    capture.onTeleprompterSuspend.mockReturnValue(() => undefined);
    capture.onTeleprompterVisibility.mockReturnValue(() => undefined);
  });

  it('keeps a title, Close and one compact toolbar with no Settings view', async () => {
    const wrapper = mount(Teleprompter, {
      global: { plugins: [createPinia(), i18n] },
    });
    await flushPromises();
    expect(wrapper.find('[aria-label="Close"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="Settings"]').exists()).toBe(false);
    expect(wrapper.get('h1').text()).toBe('Teleprompter');
    expect(wrapper.findAll('nav')).toHaveLength(1);
    expect(wrapper.find('[aria-label="Teleprompter script"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="Preview"]').exists()).toBe(false);
    expect(wrapper.find('[aria-label="Play"]').exists()).toBe(true);
  });

  it('hides the native window and renders edited lines', async () => {
    const wrapper = mount(Teleprompter, {
      global: { plugins: [createPinia(), i18n] },
    });
    await flushPromises();
    await wrapper.get('[aria-label="Close"]').trigger('click');
    await wrapper.get('textarea').setValue('First line\nSecond line');
    expect(capture.hideTeleprompter).toHaveBeenCalledOnce();
    expect(wrapper.findAll('.teleprompter-line').map((line) => line.text())).toEqual(['First line', 'Second line']);
  });

  it('switches from editing to preview when recording starts', async () => {
    const wrapper = mount(Teleprompter, {
      global: { plugins: [createPinia(), i18n] },
    });
    await flushPromises();
    window.dispatchEvent(
      new CustomEvent('teleprompter-session', {
        detail: { projectId: 'project-1', sessionId: 'session-1' },
      }),
    );
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[aria-label="Teleprompter script"]').exists()).toBe(false);
    expect(wrapper.find('[aria-label="Edit"]').exists()).toBe(true);
  });

  it('opens a speed popover and starts reading with a single Play button', async () => {
    const wrapper = mount(Teleprompter, {
      global: { plugins: [createPinia(), i18n] },
    });
    await flushPromises();
    await wrapper.get('[aria-label="Speed"]').trigger('click');
    await flushPromises();
    const slider = wrapper.findComponent(Slider);
    slider.vm.$emit('update:modelValue', 83);
    await wrapper.vm.$nextTick();
    expect(slider.props('modelValue')).toBe(83);
    await wrapper.get('[aria-label="Play"]').trigger('click');
    expect(wrapper.find('[aria-label="Pause"]').exists()).toBe(true);
    await wrapper.get('[aria-label="Pause"]').trigger('click');
    await wrapper.get('[aria-label="Edit"]').trigger('click');
    expect(wrapper.find('textarea').exists()).toBe(true);
    expect(wrapper.find('[aria-label="Play"]').exists()).toBe(true);
  });
  it('applies text color and whole window transparency, then resets settings without losing the script', async () => {
    const wrapper = mount(Teleprompter, {
      global: { plugins: [createPinia(), i18n] },
    });
    await flushPromises();
    await wrapper.get('textarea').setValue('Keep my script');
    const toolbar = wrapper.findComponent(TeleprompterToolbar);
    toolbar.vm.$emit('update', {
      scrollSpeed: 120,
      fontSize: 20,
      textColor: '#0088aa',
      windowOpacity: 0.45,
    });
    await wrapper.vm.$nextTick();
    expect(document.body.style.opacity).toBe('0.45');
    expect(wrapper.get('main').attributes('style')).toContain('#0088aa');
    await wrapper.get('[aria-label="Reset"]').trigger('click');
    expect(wrapper.get('textarea').element.value).toBe('Keep my script');
    expect(document.body.style.opacity).toBe('1');
    expect(wrapper.find('.toast-message').text()).toBe('Settings reset');
    expect(toolbar.props('document')).toMatchObject({
      scrollSpeed: 42,
      fontSize: 36,
      textColor: null,
      windowOpacity: 1,
    });
  });
  it('routes native session and shortcut events without a settings page or extra playback bar', async () => {
    const wrapper = mount(Teleprompter, {
      global: { plugins: [createPinia(), i18n] },
    });
    await flushPromises();
    await wrapper.get('textarea').setValue('First line\nSecond line');
    wrapper.findComponent(TeleprompterToolbar).vm.$emit('update', { mode: 'line-by-line' });
    window.dispatchEvent(
      new CustomEvent('teleprompter-session', {
        detail: { projectId: 'project-1', sessionId: 'session-1' },
      }),
    );
    await flushPromises();
    window.dispatchEvent(
      new CustomEvent('teleprompter-shortcut', {
        detail: 'teleprompter.nextLine',
      }),
    );
    window.dispatchEvent(new CustomEvent('teleprompter-shortcut', { detail: null }));
    await wrapper.vm.$nextTick();
    expect(wrapper.get('.teleprompter-line.active').text()).toBe('Second line');
    window.dispatchEvent(new CustomEvent('teleprompter-session', { detail: null }));
    await flushPromises();
    await wrapper.get('[aria-label="Close"]').trigger('click');
    expect(capture.hideTeleprompter).toHaveBeenCalledOnce();
  });

  it('restores a checkpoint before announcing readiness and acknowledges the next suspend request', async () => {
    const context = {
      projectId: '11111111-1111-4111-8111-111111111111',
      sessionId: '22222222-2222-4222-8222-222222222222',
    };
    const checkpoint = {
      document: {
        schemaVersion: 1,
        text: 'Saved speaker notes\nNext line',
        mode: 'line-by-line',
        autoscroll: true,
        scrollSpeed: 70,
        fontSize: 32,
        lineHeight: 1.5,
        textAlign: 'center',
        theme: 'dark',
        updatedAtUtc: '2026-01-01T00:00:00.000Z',
      },
      session: context,
      activeLine: 1,
      scrollTop: 320,
      isEditing: false,
      isPaused: true,
      error: '',
    };
    let suspendListener: ((id: string) => void | Promise<void>) | undefined;
    capture.getTeleprompterResumeState.mockResolvedValueOnce(checkpoint);
    capture.onTeleprompterSuspend.mockImplementationOnce((listener) => {
      suspendListener = listener as (id: string) => void | Promise<void>;
      return vi.fn();
    });

    const wrapper = mount(Teleprompter, {
      global: { plugins: [createPinia(), i18n] },
    });
    await flushPromises();

    expect(wrapper.find('[aria-label="Teleprompter script"]').exists()).toBe(false);
    expect(wrapper.find('[aria-label="Play"]').exists()).toBe(true);
    expect(capture.notifyTeleprompterReady).toHaveBeenCalledOnce();
    expect(capture.getTeleprompterResumeState).toHaveBeenCalledOnce();
    expect(capture.getTeleprompterResumeState.mock.invocationCallOrder[0]).toBeLessThan(
      capture.notifyTeleprompterReady.mock.invocationCallOrder[0],
    );

    await suspendListener?.('checkpoint-request');
    expect(capture.saveSessionTeleprompter).toHaveBeenCalledWith(
      context.projectId,
      context.sessionId,
      expect.objectContaining({ text: checkpoint.document.text }),
    );
    expect(capture.updatePreferences).toHaveBeenCalledWith({
      extras: {
        teleprompterSettings: expect.objectContaining({
          mode: 'line-by-line',
          textAlign: 'center',
        }),
      },
    });
    expect(capture.acknowledgeTeleprompterSuspend).toHaveBeenCalledWith(
      'checkpoint-request',
      expect.objectContaining({
        session: context,
        activeLine: 1,
        scrollTop: 320,
        isEditing: false,
        isPaused: true,
      }),
    );
    wrapper.unmount();
  });

  it('restores the saved reader position without smooth scrolling', async () => {
    const resume = {
      document: {
        schemaVersion: 1,
        text: 'First line\nSecond line',
        mode: 'continuous',
        autoscroll: false,
        scrollSpeed: 70,
        fontSize: 32,
        lineHeight: 1.5,
        textAlign: 'left',
        theme: 'dark',
        updatedAtUtc: '2026-01-01T00:00:00.000Z',
      },
      session: null,
      activeLine: 0,
      scrollTop: 123,
      isEditing: false,
      isPaused: true,
      error: '',
    };
    let resolveResume!: (value: typeof resume) => void;
    capture.getTeleprompterResumeState.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveResume = resolve;
      }),
    );
    const wrapper = mount(Teleprompter, {
      global: { plugins: [createPinia(), i18n] },
    });
    const display = wrapper.get('.teleprompter-display').element as HTMLElement;
    const scrollTo = vi.fn();
    Object.defineProperty(display, 'scrollTo', {
      configurable: true,
      value: scrollTo,
    });

    resolveResume(resume);
    await flushPromises();

    expect(scrollTo).toHaveBeenCalledWith({ top: 123, behavior: 'instant' });
    wrapper.unmount();
  });

  it('does not announce readiness when unmounted before the resume snapshot arrives', async () => {
    let resolveResume!: (value: null) => void;
    capture.getTeleprompterResumeState.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveResume = resolve;
      }),
    );
    const wrapper = mount(Teleprompter, {
      global: { plugins: [createPinia(), i18n] },
    });
    await wrapper.vm.$nextTick();
    expect(capture.notifyTeleprompterReady).not.toHaveBeenCalled();

    wrapper.unmount();
    resolveResume(null);
    await flushPromises();
    expect(capture.notifyTeleprompterReady).not.toHaveBeenCalled();
  });

  it('keeps autoscroll stopped for a natively hidden window while the document remains visible', async () => {
    const hiddenDescriptor = Object.getOwnPropertyDescriptor(document, 'hidden');
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      value: false,
    });
    const pendingFrames = new Set<number>();
    let nextFrameId = 0;
    const requestFrame = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => {
      const id = ++nextFrameId;
      pendingFrames.add(id);
      return id;
    });
    const cancelFrame = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      pendingFrames.delete(id);
    });
    const unsubscribeVisibility = vi.fn();
    let visibilityListener: ((visible: boolean) => void) | undefined;
    capture.onTeleprompterVisibility.mockImplementationOnce((listener) => {
      visibilityListener = listener as (visible: boolean) => void;
      return unsubscribeVisibility;
    });
    const wrapper = mount(Teleprompter, {
      global: { plugins: [createPinia(), i18n] },
    });

    try {
      await flushPromises();
      expect(document.hidden).toBe(false);
      expect(pendingFrames.size).toBe(0);

      visibilityListener?.(false);
      expect(pendingFrames.size).toBe(0);

      await wrapper.get('[aria-label="Play"]').trigger('click');
      visibilityListener?.(true);
      expect(pendingFrames.size).toBe(1);
      visibilityListener?.(false);
      expect(cancelFrame).toHaveBeenCalled();
      expect(pendingFrames.size).toBe(0);
    } finally {
      wrapper.unmount();
      expect(unsubscribeVisibility).toHaveBeenCalledOnce();
      requestFrame.mockRestore();
      cancelFrame.mockRestore();
      if (hiddenDescriptor) Object.defineProperty(document, 'hidden', hiddenDescriptor);
      else Reflect.deleteProperty(document, 'hidden');
    }
  });

  it.each([
    [new Error('checkpoint unavailable'), 'checkpoint unavailable'],
    ['checkpoint unavailable as text', 'checkpoint unavailable as text'],
  ])('shows a resume-state error and still announces readiness for %s', async (reason, message) => {
    capture.getTeleprompterResumeState.mockRejectedValueOnce(reason);
    const wrapper = mount(Teleprompter, {
      global: { plugins: [createPinia(), i18n] },
    });
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toBe(message);
    expect(capture.notifyTeleprompterReady).toHaveBeenCalledOnce();
    wrapper.unmount();
  });

  it('announces readiness when the optional native ready notification is unavailable', async () => {
    const original = capture.notifyTeleprompterReady;
    Object.defineProperty(capture, 'notifyTeleprompterReady', {
      configurable: true,
      value: undefined,
    });
    try {
      const wrapper = mount(Teleprompter, {
        global: { plugins: [createPinia(), i18n] },
      });
      await flushPromises();
      expect(wrapper.find('[aria-label="Teleprompter script"]').exists()).toBe(true);
      wrapper.unmount();
    } finally {
      Object.defineProperty(capture, 'notifyTeleprompterReady', {
        configurable: true,
        writable: true,
        value: original,
      });
    }
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
    const wrapper = mount(Teleprompter, {
      global: { plugins: [createPinia(), i18n] },
    });
    try {
      await wrapper.get('textarea').setValue(text);
      expect(wrapper.get('textarea').element.value).toBe(text);
      expect(wrapper.findAll('.teleprompter-line').map((line) => line.text())).toEqual(text.split('\n'));
      await wrapper.get('[aria-label="Play"]').trigger('click');
      expect(wrapper.find('textarea').exists()).toBe(false);
      expect(wrapper.findAll('.teleprompter-line').map((line) => line.text())).toEqual(text.split('\n'));
    } finally {
      wrapper.unmount();
    }
  });

  it('uses the French translation namespace when the locale changes', async () => {
    i18n.global.locale.value = 'fr';
    const wrapper = mount(Teleprompter, {
      global: { plugins: [createPinia(), i18n] },
    });
    await flushPromises();
    expect(wrapper.find('[aria-label="Fermer"]').exists()).toBe(true);
    i18n.global.locale.value = 'en';
  });
});

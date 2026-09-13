import { createI18n } from 'vue-i18n';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BigSlider from '~/ui/slider/BigSlider.vue';
import Select from '~/ui/select/Select.vue';
import Switch from '~/ui/switch/Switch.vue';
import enEditor from '~/i18n/en/editor.json';
import frEditor from '~/i18n/fr/editor.json';

const capture = vi.hoisted(() => ({
  hideTeleprompter: vi.fn(),
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

  it('keeps Hide, Edit, Settings and the script editor available', async () => {
    const wrapper = mount(Teleprompter, { global: { plugins: [i18n] } });
    await flushPromises();
    expect(wrapper.find('[aria-label="Hide"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="Settings"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="Teleprompter script"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="Preview"]').exists()).toBe(true);
  });

  it('hides the native window and renders edited lines', async () => {
    const wrapper = mount(Teleprompter, { global: { plugins: [i18n] } });
    await flushPromises();
    await wrapper.get('[aria-label="Hide"]').trigger('click');
    await wrapper.get('textarea').setValue('First line\nSecond line');
    expect(capture.hideTeleprompter).toHaveBeenCalledOnce();
    expect(wrapper.findAll('.teleprompter-line').map((line) => line.text())).toEqual(['First line', 'Second line']);
  });

  it('switches from editing to preview when recording starts', async () => {
    const wrapper = mount(Teleprompter, { global: { plugins: [i18n] } });
    await flushPromises();
    window.dispatchEvent(
      new CustomEvent('teleprompter-session', { detail: { projectId: 'project-1', sessionId: 'session-1' } }),
    );
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[aria-label="Teleprompter script"]').exists()).toBe(false);
    expect(wrapper.find('[aria-label="Edit"]').exists()).toBe(true);
  });

  it('opens settings as a dedicated view and returns to the reader', async () => {
    const wrapper = mount(Teleprompter, { global: { plugins: [i18n] } });
    await flushPromises();
    await wrapper.get('[aria-label="Settings"]').trigger('click');
    expect(wrapper.find('.settings-view').exists()).toBe(true);
    await wrapper.get('[aria-label="Back"]').trigger('click');
    expect(wrapper.find('.settings-view').exists()).toBe(false);
    expect(wrapper.find('[aria-label="Teleprompter script"]').exists()).toBe(true);
  });

  it('routes settings, reader controls, session events and shortcuts to the teleprompter state', async () => {
    const wrapper = mount(Teleprompter, { global: { plugins: [i18n] } });
    await flushPromises();
    await wrapper.get('[aria-label="Settings"]').trigger('click');
    const mode = wrapper.findComponent(Select);
    mode.vm.$emit('update:modelValue', 7);
    mode.vm.$emit('update:modelValue', 'line-by-line');

    const autoscroll = wrapper.findComponent(Switch);
    autoscroll.vm.$emit('update:modelValue', false);
    await wrapper.vm.$nextTick();
    expect(autoscroll.props('label')).toBe('Off');
    autoscroll.vm.$emit('update:modelValue', true);
    await wrapper.vm.$nextTick();
    expect(autoscroll.props('label')).toBe('On');

    const sliders = wrapper.findAllComponents(BigSlider);
    expect(sliders).toHaveLength(3);
    sliders[0].vm.$emit('update:modelValue', 83);
    sliders[1].vm.$emit('update:modelValue', 90);
    sliders[2].vm.$emit('update:modelValue', 2.1);
    await wrapper.vm.$nextTick();
    expect(sliders.map((slider) => slider.props('modelValue'))).toEqual([83, 36, 2.1]);
    await wrapper.get('[aria-label="Align left"]').trigger('click');
    await wrapper.get('[aria-label="Center text"]').trigger('click');
    await wrapper.get('[aria-label="Back"]').trigger('click');
    await flushPromises();

    await wrapper.get('textarea').setValue('First line\nSecond line');
    await wrapper.get('[aria-label="Preview"]').trigger('click');
    expect(wrapper.find('[aria-label="Teleprompter script"]').exists()).toBe(false);
    await wrapper.get('[aria-label="Edit"]').trigger('click');
    expect(wrapper.find('[aria-label="Teleprompter script"]').exists()).toBe(true);

    window.dispatchEvent(
      new CustomEvent('teleprompter-session', { detail: { projectId: 'project-1', sessionId: 'session-1' } }),
    );
    await flushPromises();
    expect(wrapper.find('[aria-label="Teleprompter script"]').exists()).toBe(false);
    window.dispatchEvent(new CustomEvent('teleprompter-shortcut', { detail: 'teleprompter.nextLine' }));
    window.dispatchEvent(new CustomEvent('teleprompter-shortcut', { detail: null }));
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.line-progress').text()).toContain('2 / 2');
    await wrapper.get('[aria-label="Previous line"]').trigger('click');
    expect(wrapper.find('.line-progress').text()).toContain('1 / 2');
    await wrapper.get('[aria-label="Next line"]').trigger('click');
    expect(wrapper.find('.line-progress').text()).toContain('2 / 2');
    await wrapper.get('[aria-label="Pause"]').trigger('click');
    await wrapper.get('[aria-label="Resume"]').trigger('click');

    window.dispatchEvent(new CustomEvent('teleprompter-session', { detail: null }));
    await flushPromises();
    expect(wrapper.find('.teleprompter-line').exists()).toBe(true);
    await wrapper.get('[aria-label="Hide"]').trigger('click');
    expect(capture.hideTeleprompter).toHaveBeenCalledOnce();
    wrapper.unmount();
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

    const wrapper = mount(Teleprompter, { global: { plugins: [i18n] } });
    await flushPromises();

    expect(wrapper.find('[aria-label="Teleprompter script"]').exists()).toBe(false);
    expect(wrapper.find('[aria-label="Resume"]').exists()).toBe(true);
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
        teleprompterSettings: expect.objectContaining({ mode: 'line-by-line', textAlign: 'center' }),
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

  it('does not announce readiness when unmounted before the resume snapshot arrives', async () => {
    let resolveResume!: (value: null) => void;
    capture.getTeleprompterResumeState.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveResume = resolve;
      }),
    );
    const wrapper = mount(Teleprompter, { global: { plugins: [i18n] } });
    await wrapper.vm.$nextTick();
    expect(capture.notifyTeleprompterReady).not.toHaveBeenCalled();

    wrapper.unmount();
    resolveResume(null);
    await flushPromises();
    expect(capture.notifyTeleprompterReady).not.toHaveBeenCalled();
  });

  it('keeps autoscroll stopped for a natively hidden window while the document remains visible', async () => {
    const hiddenDescriptor = Object.getOwnPropertyDescriptor(document, 'hidden');
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
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
    const wrapper = mount(Teleprompter, { global: { plugins: [i18n] } });

    try {
      await flushPromises();
      expect(document.hidden).toBe(false);
      expect(pendingFrames.size).toBe(0);

      visibilityListener?.(false);
      expect(pendingFrames.size).toBe(0);

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
    const wrapper = mount(Teleprompter, { global: { plugins: [i18n] } });
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toBe(message);
    expect(capture.notifyTeleprompterReady).toHaveBeenCalledOnce();
    wrapper.unmount();
  });

  it('announces readiness when the optional native ready notification is unavailable', async () => {
    const original = capture.notifyTeleprompterReady;
    Object.defineProperty(capture, 'notifyTeleprompterReady', { configurable: true, value: undefined });
    try {
      const wrapper = mount(Teleprompter, { global: { plugins: [i18n] } });
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

  it('uses the French translation namespace when the locale changes', async () => {
    i18n.global.locale.value = 'fr';
    const wrapper = mount(Teleprompter, { global: { plugins: [i18n] } });
    await flushPromises();
    expect(wrapper.find('[aria-label="Masquer"]').exists()).toBe(true);
    i18n.global.locale.value = 'en';
  });
});

import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../api/capture', () => ({
  capture: {
    getUpdateState: vi.fn().mockResolvedValue({
      status: 'unsupported',
      currentVersion: '0.1.0',
      availableVersion: null,
      percent: null,
      message: null,
    }),
    onUpdateState: vi.fn().mockReturnValue(() => undefined),
  },
}));
import TopbarHUD from '../TopbarHUD.vue';

describe('TopbarHUD', () => {
  it('keeps Beam branding and places expanded capture modes between the logo and window actions', () => {
    const wrapper = mount(TopbarHUD);
    const identity = wrapper.get('.topbar-identity');
    const logo = identity.get('img');
    const group = wrapper.get('[role="group"]');
    const actions = wrapper.get('.window-actions');

    expect(logo.attributes('alt')).toBe('Beam');
    expect(logo.attributes('src')).toContain('BeamIcon.webp');
    expect(identity.element.contains(group.element)).toBe(true);
    expect(identity.element.contains(logo.element)).toBe(true);
    expect(logo.element.compareDocumentPosition(group.element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(group.element.compareDocumentPosition(actions.element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(group.classes()).toContain('full-width');
    expect(group.classes()).toContain('column-layout');
    expect(group.attributes('style')).toContain('--button-group-columns: 3');
    expect(group.attributes('aria-label')).toBe('Mode');
    expect(wrapper.get('[aria-label="Studio"]').attributes('aria-pressed')).toBe('true');
    expect(wrapper.get('[aria-label="Screenshot"]').attributes('aria-pressed')).toBe('false');
    expect(wrapper.get('[aria-label="Instant"]').attributes('aria-pressed')).toBe('false');
    expect(wrapper.find('.rec-badge').exists()).toBe(false);
  });

  it('emits mode changes and disables the group while busy or recording', async () => {
    const wrapper = mount(TopbarHUD, { props: { modeDisabled: true } });

    for (const label of ['Studio', 'Screenshot', 'Instant']) {
      expect(wrapper.get(`[aria-label="${label}"]`).element).toHaveProperty('disabled', true);
    }

    await wrapper.setProps({ modeDisabled: false, isRecording: true });
    for (const label of ['Studio', 'Screenshot', 'Instant']) {
      expect(wrapper.get(`[aria-label="${label}"]`).element).toHaveProperty('disabled', true);
    }
    expect(wrapper.text()).toContain('REC');

    await wrapper.setProps({ isRecording: false });
    await wrapper.get('[aria-label="Screenshot"]').trigger('click');
    expect(wrapper.emitted('update:mode')).toEqual([['screenshot']]);
  });

  it('renders back, title, and preferences states', async () => {
    const wrapper = mount(TopbarHUD, {
      props: { title: 'Edit', showBack: true, showSettings: true },
    });

    expect(wrapper.find('[role="group"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('Edit');
    await wrapper.get('[aria-label="Back"]').trigger('click');
    await wrapper.get('[aria-label="Preferences"]').trigger('click');
    expect(wrapper.emitted('back')).toHaveLength(1);
    expect(wrapper.emitted('open-settings')).toHaveLength(1);
  });

  it('emits native window actions', async () => {
    const wrapper = mount(TopbarHUD);
    await wrapper.get('[aria-label="Minimize"]').trigger('click');
    await wrapper.get('[aria-label="Close"]').trigger('click');
    expect(wrapper.emitted('minimize')).toHaveLength(1);
    expect(wrapper.emitted('close')).toHaveLength(1);
  });

  it('does not start a native drag when clicking a window action', async () => {
    const previousCapture = window.capture;
    const dragStart = vi.fn();
    window.capture = { dragStart, drag: vi.fn(), dragEnd: vi.fn() } as unknown as NonNullable<typeof window.capture>;
    const wrapper = mount(TopbarHUD, { props: { showSettings: true } });

    await wrapper
      .get('[aria-label="Preferences"] svg')
      .trigger('pointerdown', { button: 0, pointerId: 1, clientX: 10, clientY: 10 });
    expect(dragStart).not.toHaveBeenCalled();

    wrapper.unmount();
    window.capture = previousCapture;
  });
});

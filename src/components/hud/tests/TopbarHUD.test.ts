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
  it('renders the default brand identity', () => {
    const wrapper = mount(TopbarHUD);
    expect(wrapper.get('img').attributes('alt')).toBe('Beam');
    expect(wrapper.text()).toContain('Beam');
    expect(wrapper.find('.rec-badge').exists()).toBe(false);
  });
  it('renders back, recording and preferences states', async () => {
    const wrapper = mount(TopbarHUD, {
      props: { title: 'Edit', showBack: true, showSettings: true, isRecording: true },
    });
    expect(wrapper.find('img').exists()).toBe(false);
    expect(wrapper.text()).toContain('REC');
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
  it('does not start a native drag when clicking an icon button', async () => {
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

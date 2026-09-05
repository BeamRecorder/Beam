import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { capture } = vi.hoisted(() => ({
  capture: {
    onCountdown: vi.fn(),
    onPreferencesChanged: vi.fn(),
    getPreferences: vi.fn(),
  },
}));
vi.mock('../../../api/capture', () => ({ capture }));

import CountdownOverlay from '../recorder/CountdownOverlay.vue';

const preferences = (shortcuts: Record<string, string> = {}) => ({
  shortcuts: Object.fromEntries(
    Object.entries(shortcuts).map(([id, keys]) => [id, { keys, scope: 'global', category: 'recording' }]),
  ),
});

describe('CountdownOverlay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capture.onCountdown.mockReturnValue(vi.fn());
    capture.onPreferencesChanged.mockReturnValue(vi.fn());
    capture.getPreferences.mockResolvedValue(preferences());
  });

  it('displays countdown events and unsubscribes on unmount', async () => {
    let listener: ((value: number | null) => void) | undefined;
    let preferenceListener: ((value: ReturnType<typeof preferences>) => void) | undefined;
    const unsubscribeCountdown = vi.fn();
    const unsubscribePreferences = vi.fn();
    capture.onCountdown.mockImplementation((next: (value: number | null) => void) => {
      listener = next;
      return unsubscribeCountdown;
    });
    capture.onPreferencesChanged.mockImplementation((next: (value: ReturnType<typeof preferences>) => void) => {
      preferenceListener = next;
      return unsubscribePreferences;
    });
    const wrapper = mount(CountdownOverlay);
    expect(wrapper.get('.countdown').text()).toBe('');
    listener?.(3);
    await wrapper.vm.$nextTick();
    expect(wrapper.get('.countdown').text()).toBe('3');
    listener?.(null);
    await wrapper.vm.$nextTick();
    expect(wrapper.get('.countdown').text()).toBe('');
    wrapper.unmount();
    expect(unsubscribeCountdown).toHaveBeenCalledOnce();
    expect(unsubscribePreferences).toHaveBeenCalledOnce();
    expect(preferenceListener).toBeDefined();
  });

  it('loads user shortcuts and updates both hints when preferences change live', async () => {
    let preferenceListener: ((value: ReturnType<typeof preferences>) => void) | undefined;
    capture.getPreferences.mockResolvedValueOnce(
      preferences({ 'hud.startStopRecording': 'Ctrl+Shift+R', 'hud.playPause': 'Ctrl+P' }),
    );
    capture.onPreferencesChanged.mockImplementation((next: (value: ReturnType<typeof preferences>) => void) => {
      preferenceListener = next;
      return vi.fn();
    });

    const wrapper = mount(CountdownOverlay);
    await flushPromises();
    await wrapper.vm.$nextTick();

    expect(capture.getPreferences).toHaveBeenCalledOnce();
    expect(wrapper.findAll('.shortcut-hint')).toHaveLength(2);
    expect(wrapper.find('.shortcut-hints').text()).toContain('Stop recording');
    expect(wrapper.find('.shortcut-hints').text()).toContain('Pause recording');
    expect(wrapper.findAll('kbd').map((chip) => chip.text())).toEqual(['Ctrl', 'Shift', 'R', 'Ctrl', 'P']);

    preferenceListener?.(preferences({ 'hud.startStopRecording': 'Alt+S' }));
    await wrapper.vm.$nextTick();

    expect(wrapper.findAll('.shortcut-hint')).toHaveLength(1);
    expect(wrapper.find('.shortcut-hint').text()).toContain('Stop recording');
    expect(wrapper.find('.shortcut-hint').text()).not.toContain('Pause recording');
    expect(wrapper.findAll('kbd').map((chip) => chip.text())).toEqual(['Alt', 'S']);
    expect(wrapper.find('.shortcut-separator').exists()).toBe(false);
    wrapper.unmount();
  });

  it('omits missing shortcut entries without rendering empty hint containers', async () => {
    capture.getPreferences.mockResolvedValueOnce(preferences({ 'hud.playPause': 'Ctrl+P' }));
    const wrapper = mount(CountdownOverlay);

    await flushPromises();
    await wrapper.vm.$nextTick();

    expect(wrapper.findAll('.shortcut-hint')).toHaveLength(1);
    expect(wrapper.find('.shortcut-hint').text()).toContain('Pause recording');
    expect(wrapper.find('.shortcut-separator').exists()).toBe(false);
    expect(wrapper.findAll('kbd').map((chip) => chip.text())).toEqual(['Ctrl', 'P']);
    wrapper.unmount();
  });

  it('ignores application-scoped shortcuts while keeping global translated labels', async () => {
    capture.getPreferences.mockResolvedValueOnce({
      shortcuts: {
        'hud.startStopRecording': { keys: 'Ctrl+Shift+R', scope: 'application', category: 'recording' },
        'hud.playPause': { keys: 'Ctrl+P', scope: 'global', category: 'recording' },
      },
    });
    const wrapper = mount(CountdownOverlay);

    await flushPromises();
    await wrapper.vm.$nextTick();

    expect(wrapper.findAll('.shortcut-hint')).toHaveLength(1);
    expect(wrapper.find('.shortcut-hint').text()).toContain('Pause recording');
    expect(wrapper.find('.shortcut-hint').text()).not.toContain('Stop recording');
    expect(wrapper.findAll('kbd').map((chip) => chip.text())).toEqual(['Ctrl', 'P']);
    wrapper.unmount();
  });

  it('keeps the countdown usable when loading preferences fails', async () => {
    let countdownListener: ((value: number | null) => void) | undefined;
    capture.getPreferences.mockRejectedValueOnce(new Error('preferences unavailable'));
    capture.onCountdown.mockImplementation((next: (value: number | null) => void) => {
      countdownListener = next;
      return vi.fn();
    });
    const wrapper = mount(CountdownOverlay);

    await flushPromises();
    expect(capture.getPreferences).toHaveBeenCalledOnce();
    expect(wrapper.find('.shortcut-hints').exists()).toBe(false);

    countdownListener?.(3);
    await wrapper.vm.$nextTick();
    expect(wrapper.get('.countdown').text()).toBe('3');
    wrapper.unmount();
  });
});

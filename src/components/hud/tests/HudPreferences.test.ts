import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import HudPreferences from '../settings/HudPreferences.vue';
import { captureMock as capture } from './capture.mock';

vi.mock('../../../api/capture', async () => ({ capture: (await import('./capture.mock')).captureMock }));

const Select = { template: '<button class="countdown" @click="$emit(\'update:modelValue\', 10)" />' };
describe('HudPreferences', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    capture.getPreferences.mockResolvedValue({
      schemaVersion: 2,
      theme: 'light',
      recordingBar: { visibility: 'always' },
      devices: {},
      shortcuts: {},
      backgroundPresets: { colors: [], gradients: [] },
      extras: {},
    });
    capture.updatePreferences.mockResolvedValue({});
    window.matchMedia ??= () => ({ matches: false, addEventListener: () => undefined }) as unknown as MediaQueryList;
  });
  it('relays recording preferences', async () => {
    const wrapper = mount(HudPreferences, { props: { countdownSeconds: 3 }, global: { stubs: { Select } } });
    await wrapper.findAll('.countdown')[1].trigger('click');
    expect(wrapper.emitted('update:countdownSeconds')).toContainEqual([10]);
  });
  it('persists user theme selections through the capture preferences API', async () => {
    const wrapper = mount(HudPreferences, { props: { countdownSeconds: 0 }, global: { stubs: { Select } } });
    const buttons = wrapper.findAll('.theme-controls button');
    await buttons[0].trigger('click');
    await buttons[1].trigger('click');
    await buttons[2].trigger('click');
    expect(capture.updatePreferences).toHaveBeenLastCalledWith({ theme: 'system' });
  });
});

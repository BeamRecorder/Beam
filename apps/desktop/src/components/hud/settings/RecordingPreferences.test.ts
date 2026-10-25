import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { setCurrentLocale } from '~/i18n';
import RecordingPreferences from './RecordingPreferences.vue';
import Select from '~/ui/select/Select.vue';
import RealCursorPreference from './RealCursorPreference.vue';
import RecordingDesktopPreferences from './RecordingDesktopPreferences.vue';
vi.mock('~/api/capture', () => ({ capture: { platform: 'win32' } }));
vi.mock('~/components/settings/StoragePreferences.vue', () => ({ default: { template: '<div />' } }));

describe('recording settings controls', () => {
  it('uses and relays the same real-cursor and desktop controls as the region menu', () => {
    const wrapper = mount(RecordingPreferences, {
      props: {
        countdownSeconds: 3,
        hideTaskbar: true,
        hideDesktopIcons: true,
        showRealCursor: true,
      },
    });
    const desktop = wrapper.getComponent(RecordingDesktopPreferences);
    expect(desktop.props()).toEqual({
      hideTaskbar: true,
      hideDesktopIcons: true,
    });
    desktop.vm.$emit('update:hideTaskbar', false);
    desktop.vm.$emit('update:hideDesktopIcons', false);
    wrapper.getComponent(RealCursorPreference).vm.$emit('update:modelValue', false);
    expect(wrapper.emitted('update:hideTaskbar')).toEqual([[false]]);
    expect(wrapper.emitted('update:hideDesktopIcons')).toEqual([[false]]);
    expect(wrapper.emitted('update:showRealCursor')).toEqual([[false]]);
    wrapper.unmount();
  });
  it('relays only valid bar visibility choices and countdown boundaries', () => {
    const wrapper = mount(RecordingPreferences, {
      props: { countdownSeconds: 3 },
    });
    const [bar, , countdown] = wrapper.findAllComponents(Select);
    for (const value of ['always', 'auto-fade', 'hover-only', 'invalid', 42]) bar!.vm.$emit('update:modelValue', value);
    expect(wrapper.emitted('update:recordingBarVisibility')).toEqual([['always'], ['auto-fade'], ['hover-only']]);
    for (const value of [0, 10, 3, -1, 11, 2.5, '3', NaN]) countdown!.vm.$emit('update:modelValue', value);
    expect(wrapper.emitted('update:countdownSeconds')).toEqual([[0], [10], [3]]);
    wrapper.unmount();
  });
  it('uses live translated options after switching languages', async () => {
    const wrapper = mount(RecordingPreferences, {
      props: { countdownSeconds: 0 },
    });
    const [bar, , countdown] = wrapper.findAllComponents(Select);
    expect(countdown!.props('options')).toEqual(expect.arrayContaining([expect.objectContaining({ label: 'Off' })]));
    await setCurrentLocale('fr');
    expect(countdown!.props('options')).toEqual(
      expect.arrayContaining([expect.objectContaining({ label: 'Désactivé' })]),
    );
    expect(bar!.props('options')).toEqual(
      expect.arrayContaining([expect.objectContaining({ label: 'Toujours visible' })]),
    );
    wrapper.unmount();
  });
  it('toggles always-on-top without making the thumbnails interactive', async () => {
    const wrapper = mount(RecordingPreferences, {
      props: { countdownSeconds: 3, alwaysOnTop: false },
    });
    await wrapper.get('[data-setting="always-on-top"] [role="switch"]').trigger('click');
    expect(wrapper.emitted('update:alwaysOnTop')).toEqual([[true]]);
    expect(wrapper.findAll('[inert]')).toHaveLength(2);
    wrapper.unmount();
  });
  it.each([true, false])('renders the saved start choice independently of countdown: %s', (startAutomatically) => {
    const wrapper = mount(RecordingPreferences, { props: { countdownSeconds: 3, startAutomatically } });
    const control = wrapper
      .findAllComponents(Select)
      .find((item) => item.attributes('aria-label') === 'Recording start')!;
    expect(control.props('modelValue')).toBe(startAutomatically ? 'automatic' : 'manual');
    expect(wrapper.findAllComponents(Select).at(-1)!.props('modelValue')).toBe(3);
    for (const value of ['manual', 'automatic', 'unexpected', 0]) control.vm.$emit('update:modelValue', value);
    expect(wrapper.emitted('update:startAutomatically')).toEqual([[false], [true]]);
    wrapper.unmount();
  });
});
it('explains both start choices and the preparation controls in French', async () => {
  await setCurrentLocale('fr');
  const wrapper = mount(RecordingPreferences, { props: { countdownSeconds: 3 } });
  const description = wrapper.get('[data-setting="recording-start"] .preference-description').text();
  expect(description).toContain('Automatiquement :');
  expect(description).toContain('Quand je suis prêt :');
  expect(description).toContain('caméra, le micro et l’audio système');
  expect(description).toContain('Enregistrer pour lancer le compte à rebours');
  wrapper.unmount();
});

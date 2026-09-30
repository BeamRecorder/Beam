import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { setCurrentLocale } from '~/i18n';
import RecordingPreferences from './RecordingPreferences.vue';
import Select from '~/ui/select/Select.vue';

describe('recording settings controls', () => {
  it('relays only valid bar visibility choices and countdown boundaries', () => {
    const wrapper = mount(RecordingPreferences, { props: { countdownSeconds: 3 } });
    const [bar, countdown] = wrapper.findAllComponents(Select);
    for (const value of ['always', 'auto-fade', 'hover-only', 'invalid', 42]) bar!.vm.$emit('update:modelValue', value);
    expect(wrapper.emitted('update:recordingBarVisibility')).toEqual([['always'], ['auto-fade'], ['hover-only']]);
    for (const value of [0, 10, 3, -1, 11, 2.5, '3', NaN]) countdown!.vm.$emit('update:modelValue', value);
    expect(wrapper.emitted('update:countdownSeconds')).toEqual([[0], [10], [3]]);
    wrapper.unmount();
  });
  it('uses live translated options after switching languages', async () => {
    const wrapper = mount(RecordingPreferences, { props: { countdownSeconds: 0 } });
    const [bar, countdown] = wrapper.findAllComponents(Select);
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
    const wrapper = mount(RecordingPreferences, { props: { countdownSeconds: 3, alwaysOnTop: false } });
    await wrapper.get('[role="switch"]').trigger('click');
    expect(wrapper.emitted('update:alwaysOnTop')).toEqual([[true]]);
    expect(wrapper.findAll('[inert]')).toHaveLength(2);
    wrapper.unmount();
  });
});

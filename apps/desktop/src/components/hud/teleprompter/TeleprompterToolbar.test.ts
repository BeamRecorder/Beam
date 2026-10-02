import { createPinia } from 'pinia';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Button from '~/ui/button/Button.vue';
import Slider from '~/ui/slider/Slider.vue';
import ColorPicker from '~/ui/ColorPicker/ColorPicker.vue';
import TeleprompterControl from './TeleprompterControl.vue';
import TeleprompterToolbar from './TeleprompterToolbar.vue';
import { createDefaultTeleprompterDocument } from './teleprompter-types';
vi.mock('~/api/capture', () => ({
  capture: {
    getPreferences: vi.fn().mockResolvedValue({ theme: 'light', extras: {} }),
    onPreferencesChanged: () => () => {},
  },
}));
enableAutoUnmount(afterEach);
beforeEach(() => vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null));
afterEach(() => vi.restoreAllMocks());
const mountToolbar = (editing = true, playing = false) =>
  mount(TeleprompterToolbar, {
    props: { document: createDefaultTeleprompterDocument(), editing, playing },
    global: { plugins: [createPinia()] },
  });

describe('TeleprompterToolbar', () => {
  it('offers one Play action in editing and Edit/Pause only while reading', async () => {
    const wrapper = mountToolbar();
    expect(wrapper.find('[aria-label="Preview"]').exists()).toBe(false);
    expect(wrapper.find('[aria-label="Edit"]').exists()).toBe(false);
    await wrapper.get('[aria-label="Play"]').trigger('click');
    expect(wrapper.emitted('play')).toEqual([[]]);
    await wrapper.setProps({ editing: false, playing: true });
    await wrapper.get('[aria-label="Pause"]').trigger('click');
    await wrapper.get('[aria-label="Edit"]').trigger('click');
    expect(wrapper.emitted('play')).toHaveLength(2);
    expect(wrapper.emitted('edit')).toEqual([[]]);
  });
  it('relays speed, font, transparency and reset without text buttons', async () => {
    const wrapper = mountToolbar();
    for (const label of ['Speed', 'Text size', 'Transparency']) {
      await wrapper.get(`[aria-label="${label}"]`).trigger('click');
      await flushPromises();
      const sliders = wrapper.findAllComponents(Slider);
      sliders.at(-1)!.vm.$emit('update:modelValue', label === 'Transparency' ? 80 : 24);
      await wrapper.vm.$nextTick();
    }
    await wrapper.get('[aria-label="Reset"]').trigger('click');
    expect(wrapper.emitted('update')).toEqual([[{ scrollSpeed: 24 }], [{ fontSize: 24 }], [{ windowOpacity: 0.2 }]]);
    expect(wrapper.emitted('reset')).toEqual([[]]);
    expect(wrapper.get('nav').text()).toBe('');
  });
  it('opens the existing chromatic picker for the initial theme color without initialization errors', async () => {
    const wrapper = mountToolbar();
    await wrapper.get('[aria-label="Text color"]').trigger('click');
    await flushPromises();
    const picker = wrapper.getComponent(ColorPicker);
    expect(picker.props()).toMatchObject({
      inline: true,
      hideHeader: true,
      type: 'triangle',
      modelValue: '#1e1e1e',
    });
    expect(wrapper.find('.picker-top-bar').exists()).toBe(false);
    picker.vm.$emit('update:modelValue', '#aabbcc');
    expect(wrapper.emitted('update')).toEqual([[{ textColor: '#aabbcc' }]]);
    await wrapper.setProps({
      document: {
        ...createDefaultTeleprompterDocument(),
        textColor: '#abcdef',
      },
    });
    expect(picker.props('modelValue')).toBe('#abcdef');
  });
  it('disables all toolbar tooltips while any control popover is open, then restores them', async () => {
    const wrapper = mountToolbar();
    const controls = wrapper.findAllComponents(TeleprompterControl);
    controls[0].vm.$emit('toggle', true);
    controls[1].vm.$emit('toggle', true);
    await wrapper.vm.$nextTick();
    expect(wrapper.findAllComponents(Button).every((button) => button.props('tooltipDisabled'))).toBe(true);
    controls[0].vm.$emit('toggle', false);
    await wrapper.vm.$nextTick();
    expect(controls[1].props('tooltipDisabled')).toBe(true);
    controls[1].vm.$emit('toggle', false);
    await wrapper.vm.$nextTick();
    expect(controls[0].props('tooltipDisabled')).toBe(false);
  });
});

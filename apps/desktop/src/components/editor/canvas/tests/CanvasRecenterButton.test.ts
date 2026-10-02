import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { setCurrentLocale } from '~/i18n';
import CanvasRecenterButton from '../CanvasRecenterButton.vue';

describe('CanvasRecenterButton', () => {
  it('applies compact geometry and the quiet shadow to the native button', () => {
    const wrapper = mount(CanvasRecenterButton);
    const button = wrapper.get('button').element;
    expect(button.style.boxShadow).toBe('var(--shadow-sm)');
    expect(button.style.height).toBe('26px');
    expect(button.style.borderRadius).toBe('var(--radius-full)');
    wrapper.unmount();
  });

  it('emits the recenter intent once when clicked', async () => {
    const wrapper = mount(CanvasRecenterButton);
    await wrapper.get('button').trigger('click');
    expect(wrapper.emitted('click')).toEqual([[]]);
    wrapper.unmount();
  });

  it('updates the recenter label with the interface language', async () => {
    const wrapper = mount(CanvasRecenterButton);
    expect(wrapper.get('button').text()).toBe('Recenter view');
    await setCurrentLocale('fr');
    expect(wrapper.get('button').text()).toBe('Recentrer la vue');
    wrapper.unmount();
  });
});

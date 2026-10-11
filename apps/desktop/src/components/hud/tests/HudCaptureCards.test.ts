import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import HudCaptureCards from '../HudCaptureCards.vue';
describe('HUD capture choices', () => {
  it('uses bundled artwork and emits the three capture targets', async () => {
    const wrapper = mount(HudCaptureCards, {
      props: { selected: 'screen', disabled: false },
    });
    for (const button of wrapper.findAll('button')) await button.trigger('click');
    expect(wrapper.emitted('choose')).toEqual([['screen'], ['region'], ['window']]);
    expect(wrapper.findAll('img').every((image) => image.attributes('src')?.includes('/wallpapers/image/'))).toBe(true);
    expect(new Set(wrapper.findAll('img').map((image) => image.attributes('src'))).size).toBe(1);
    expect(wrapper.findAll('img')[0]!.attributes('src')).toContain('/wallpapers/image/sequoia-blue.webp');
    expect(wrapper.get('.is-selected').attributes('aria-label')).toBe('Full screen');
  });
  it('leaves busy cards disabled and retains their accessible names', async () => {
    const wrapper = mount(HudCaptureCards, {
      props: { selected: 'region', disabled: true },
    });
    await wrapper.get('[aria-label="Region"]').trigger('click');
    expect(wrapper.emitted('choose')).toBeUndefined();
    expect(wrapper.findAll('button').every((button) => button.attributes('disabled') !== undefined)).toBe(true);
  });
  it.each(['screen', 'region', 'window'] as const)('keeps labelled %s cards free of hover hints', async (selected) => {
    const wrapper = mount(HudCaptureCards, { props: { selected, disabled: false } });
    for (const button of wrapper.findAll('button')) {
      expect(button.attributes('title')).toBeUndefined();
      expect(button.get('.capture-label').text()).toBe(button.attributes('aria-label'));
      expect(button.find('.capture-label svg').exists()).toBe(true);
      await button.trigger('mouseenter');
    }
    expect(wrapper.find('.tooltip-wrapper').exists()).toBe(false);
    await wrapper.setProps({ disabled: true });
    expect(wrapper.find('[title]').exists()).toBe(false);
    wrapper.unmount();
  });
});

import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, expect, it } from 'vitest';
import ShadowDirectionGroup from '../ShadowDirectionGroup.vue';
import { setCurrentLocale } from '~/i18n';
import { SUPPORTED_LOCALES } from '~/i18n/locales';
enableAutoUnmount(afterEach);
it('uses the shared full-width neutral preset appearance', () => {
  const wrapper = mount(ShadowDirectionGroup, { props: { modelValue: 'all' } });
  expect(wrapper.get('[role="group"]').classes()).toEqual(
    expect.arrayContaining(['btn-group', 'full-width', 'variant-neutral', 'size-xs']),
  );
  expect(wrapper.findAll('button')).toHaveLength(4);
  expect(wrapper.findAll('[aria-pressed="true"]')).toHaveLength(1);
});
it.each(['all', 'bottom', 'bottom-right', 'top-left'] as const)(
  'selects %s and reflects a restored direction',
  async (direction) => {
    const wrapper = mount(ShadowDirectionGroup, { props: { modelValue: 'all' } });
    const index = ['all', 'bottom', 'bottom-right', 'top-left'].indexOf(direction);
    await wrapper.findAll('button')[index]!.trigger('click');
    expect(wrapper.emitted('update:modelValue')).toEqual([[direction]]);
    await wrapper.setProps({ modelValue: direction });
    expect(wrapper.findAll('button')[index]!.attributes('aria-pressed')).toBe('true');
  },
);
it.each(SUPPORTED_LOCALES)('labels every direction in %s', async (locale) => {
  await setCurrentLocale(locale);
  const wrapper = mount(ShadowDirectionGroup, { props: { modelValue: 'bottom' } });
  expect(
    wrapper
      .findAll('button')
      .every(
        (button) =>
          button.attributes('aria-label') && !button.attributes('aria-label')!.includes('ShadowDirectionGroup.'),
      ),
  ).toBe(true);
});

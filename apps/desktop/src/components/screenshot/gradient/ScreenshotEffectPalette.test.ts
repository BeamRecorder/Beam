import { afterEach, expect, it, vi } from 'vitest';
import { enableAutoUnmount, mount } from '@vue/test-utils';
import Gradient from '~/ui/Gradient/Gradient.vue';
import ScreenshotEffectPalette from './ScreenshotEffectPalette.vue';

vi.mock('~/i18n/useTranslate', () => ({ useTranslate: () => ({ t: (key: string) => key }) }));
enableAutoUnmount(afterEach);
const colors = ['#000000', '#ffffff'];
const panel = () => mount(ScreenshotEffectPalette, { props: { colors: [...colors] } });

it('uses the shared picker to add, edit, reverse and remove palette colors within its bounds', async () => {
  const wrapper = panel();
  expect(wrapper.getComponent(Gradient).props()).toMatchObject({ palette: true, minStops: 2, maxStops: 8 });
  expect(
    wrapper.findAll('[aria-label="removeStop"]').every((button) => button.attributes('disabled') !== undefined),
  ).toBe(true);
  await wrapper.get('[aria-label="addStop"]').trigger('click');
  expect(wrapper.emitted('update')?.[0]?.[0]).toEqual(['#000000', '#808080', '#ffffff']);
  await wrapper.get('[aria-label="reverse"]').trigger('click');
  expect(wrapper.emitted('update')?.[1]?.[0]).toEqual(['#ffffff', '#808080', '#000000']);
  await wrapper.get('[aria-label="removeStop"]').trigger('click');
  expect(wrapper.emitted('update')?.[2]?.[0]).toEqual(['#808080', '#000000']);
  expect(wrapper.props('colors')).toEqual(colors);
  await wrapper.setProps({ colors: Array(8).fill('#112233') });
  expect(wrapper.get('[aria-label="addStop"]').attributes('disabled')).toBeDefined();
});

it('retains selected stop identities after an acknowledged edit and refreshes external palettes', async () => {
  const wrapper = panel();
  const gradient = wrapper.getComponent(Gradient);
  const value = {
    stops: [
      { id: 'stable-a', position: 0, color: '#123456' },
      { id: 'stable-b', position: 1, color: '#abcdef' },
    ],
  };
  gradient.vm.$emit('update:modelValue', value);
  await wrapper.setProps({ colors: ['#123456', '#abcdef'] });
  expect(gradient.props('modelValue')).toEqual(value);
  await wrapper.setProps({ colors: [...colors] });
  expect(gradient.props('modelValue')?.stops.map((stop) => stop.color)).toEqual(colors);
});

it('rejects incomplete, oversized and invalid palettes and ignores stale events while disabled', async () => {
  const wrapper = panel();
  const gradient = wrapper.getComponent(Gradient);
  for (const stops of [
    [],
    [{ id: 'a', position: 0, color: '#112233' }],
    Array(9).fill({ id: 'a', position: 0, color: '#112233' }),
    [
      { id: 'a', position: 0, color: 'invalid' },
      { id: 'b', position: 1, color: '#ffffff' },
    ],
  ])
    gradient.vm.$emit('update:modelValue', { stops });
  expect(wrapper.emitted('update')).toBeUndefined();
  await wrapper.setProps({ disabled: true });
  gradient.vm.$emit('update:modelValue', {
    stops: colors.map((color, index) => ({ id: String(index), position: index, color })),
  });
  expect(wrapper.emitted('update')).toBeUndefined();
  expect(gradient.props('disabled')).toBe(true);
});

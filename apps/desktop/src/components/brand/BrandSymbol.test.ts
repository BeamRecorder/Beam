import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import BrandSymbol from './BrandSymbol.vue';

enableAutoUnmount(afterEach);
describe('static Beam identity icons', () => {
  it('uses the existing Beam asset as a decorative, non-draggable recorder logo', () => {
    const wrapper = mount(BrandSymbol, { props: { symbol: 'beam', size: 24 } });
    const image = wrapper.get('img');
    expect(image.attributes('src')).toContain('/brand/BeamIcon.webp');
    expect(image.attributes('alt')).toBe('');
    expect(image.attributes('draggable')).toBe('false');
    expect(image.attributes('width')).toBe('24');
    expect(wrapper.attributes('aria-hidden')).toBe('true');
    expect(wrapper.find('.beam-mascot').exists()).toBe(false);
  });
  it.each([
    ['folder', 'folder-open'],
    ['settings', 'settings'],
  ] as const)('reuses the Lucide %s icon without mounting a mascot or another invisible icon', (symbol, icon) => {
    const wrapper = mount(BrandSymbol, { props: { symbol, size: 24 } });
    expect(wrapper.get('svg').classes()).toContain(`lucide-${icon}`);
    expect(wrapper.get('svg').attributes('width')).toBe('24');
    expect(wrapper.findAll('svg')).toHaveLength(1);
    expect(wrapper.find('img').exists()).toBe(false);
    expect(wrapper.find('.beam-mascot').exists()).toBe(false);
  });
  it('updates the icon and size directly without a morph or a loading surface', async () => {
    const wrapper = mount(BrandSymbol, { props: { symbol: 'beam', size: 24 } });
    await wrapper.setProps({ symbol: 'folder', size: 32 });
    expect(wrapper.get('svg').classes()).toContain('lucide-folder-open');
    expect(wrapper.get('svg').attributes('width')).toBe('32');
    await wrapper.setProps({ symbol: 'settings' });
    expect(wrapper.get('svg').classes()).toContain('lucide-settings');
    expect(wrapper.find('.beam-mascot').exists()).toBe(false);
    await wrapper.setProps({ symbol: 'beam' });
    expect(wrapper.get('img').attributes('width')).toBe('32');
  });
});

import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import HudCaptureCards from '../HudCaptureCards.vue';
import HudSourcePicker from '../HudSourcePicker.vue';
describe('HUD capture choices', () => {
  it('uses bundled artwork and emits the three capture targets', async () => {
    const wrapper = mount(HudCaptureCards, { props: { selected: 'screen', disabled: false } });
    for (const button of wrapper.findAll('button')) await button.trigger('click');
    expect(wrapper.emitted('choose')).toEqual([['screen'], ['region'], ['window']]);
    expect(wrapper.findAll('img').every((image) => image.attributes('src')?.includes('/wallpapers/image/'))).toBe(true);
    expect(new Set(wrapper.findAll('img').map((image) => image.attributes('src'))).size).toBe(1);
    expect(wrapper.findAll('img')[0]!.attributes('src')).toContain('/wallpapers/image/sequoia-blue.webp');
    expect(wrapper.get('.is-selected').attributes('aria-label')).toBe('Full screen');
  });
  it('leaves busy cards disabled and retains their accessible names', async () => {
    const wrapper = mount(HudCaptureCards, { props: { selected: 'region', disabled: true } });
    await wrapper.get('[aria-label="Region"]').trigger('click');
    expect(wrapper.emitted('choose')).toBeUndefined();
    expect(wrapper.findAll('button').every((button) => button.attributes('disabled') !== undefined)).toBe(true);
  });
  it('shows explicit loading, empty and thumbnail-unavailable source states', async () => {
    const wrapper = mount(HudSourcePicker, { props: { kind: 'screen', previews: [], loading: true, disabled: false } });
    expect(wrapper.find('.source-loading').exists()).toBe(true);
    await wrapper.setProps({ loading: false });
    expect(wrapper.find('.source-empty').exists()).toBe(true);
    await wrapper.setProps({
      kind: 'window',
      previews: [{ id: 'window:7', name: 'Window', thumbnail: '', appIcon: null }],
    });
    expect(wrapper.find('.source-unavailable').exists()).toBe(true);
    await wrapper.get('.source-card').trigger('click');
    expect(wrapper.emitted('select')).toEqual([['window:7']]);
    await wrapper.get('[aria-label="Back"]').trigger('click');
    expect(wrapper.emitted('back')).toEqual([[]]);
    await wrapper.setProps({
      kind: 'screen',
      previews: [{ id: 'display:1', name: 'Display', thumbnail: 'data:image/png;base64,abc', appIcon: null }],
    });
    expect(wrapper.find('.source-thumbnail').exists()).toBe(true);
  });
});

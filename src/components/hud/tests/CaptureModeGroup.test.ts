import { mount } from '@vue/test-utils';
import { setCurrentLocale } from '~/i18n';
import { nextTick } from 'vue';
import { describe, expect, it } from 'vitest';
import CaptureModeGroup from '../CaptureModeGroup.vue';

describe('CaptureModeGroup', () => {
  it('exposes all capture modes as accessible toggle buttons', () => {
    const wrapper = mount(CaptureModeGroup, { props: { modelValue: 'studio' } });
    const group = wrapper.get('[role="group"]');

    expect(group.attributes('aria-label')).toBe('Mode');
    expect(group.findAll('button').map((button) => button.attributes('aria-label'))).toEqual([
      'Studio',
      'Screenshot',
      'Instant',
    ]);
    expect(wrapper.get('[aria-label="Studio"]').attributes('aria-pressed')).toBe('true');
    expect(wrapper.get('[aria-label="Screenshot"]').attributes('aria-pressed')).toBe('false');
    expect(wrapper.get('[aria-label="Instant"]').attributes('aria-pressed')).toBe('false');
    expect(wrapper.findAll('button').every((button) => button.classes().includes('btn-tab'))).toBe(true);
    expect(wrapper.get('[aria-label="Studio"]').classes()).toContain('active');
    expect(wrapper.get('[aria-label="Screenshot"]').classes()).not.toContain('active');
    expect(wrapper.get('[aria-label="Instant"]').classes()).not.toContain('active');
  });

  it('updates accessible mode labels when the language changes', async () => {
    const wrapper = mount(CaptureModeGroup, { props: { modelValue: 'screenshot' } });
    setCurrentLocale('fr');
    await nextTick();
    expect(wrapper.get('[aria-label="Capture d’écran"]').attributes('aria-pressed')).toBe('true');
    await wrapper.get('[aria-label="Instantané"]').trigger('click');
    expect(wrapper.emitted('update:modelValue')).toEqual([['instant']]);
    wrapper.unmount();
  });

  it('emits the selected mode when a mode button is activated', async () => {
    const wrapper = mount(CaptureModeGroup, { props: { modelValue: 'studio' } });

    await wrapper.get('[aria-label="Instant"]').trigger('click');

    expect(wrapper.emitted('update:modelValue')).toEqual([['instant']]);
  });

  it('disables every mode button without emitting a selection', async () => {
    const wrapper = mount(CaptureModeGroup, { props: { modelValue: 'screenshot', disabled: true } });

    expect(wrapper.get('[aria-label="Screenshot"]').classes()).toEqual(expect.arrayContaining(['btn-tab', 'active']));
    expect(wrapper.get('[aria-label="Screenshot"]').attributes('aria-pressed')).toBe('true');
    expect(wrapper.get('[aria-label="Studio"]').classes()).not.toContain('active');

    for (const button of wrapper.findAll('button')) {
      expect(button.element).toHaveProperty('disabled', true);
      await button.trigger('click');
    }

    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  });

  it('keeps the compact default and expands into three equal columns on request', async () => {
    const wrapper = mount(CaptureModeGroup, { props: { modelValue: 'studio' } });
    let group = wrapper.get('[role="group"]');

    expect(group.classes()).not.toContain('full-width');
    expect(group.classes()).not.toContain('column-layout');

    await wrapper.setProps({ full: true });
    group = wrapper.get('[role="group"]');
    expect(group.classes()).toContain('full-width');
    expect(group.classes()).toContain('column-layout');
    expect(group.attributes('style')).toContain('--button-group-columns: 3');
    expect(group.findAll('button')).toHaveLength(3);
  });
  it('shows two labelled and equally sized choices when used by Quick Snip', async () => {
    const wrapper = mount(CaptureModeGroup, {
      props: { modelValue: 'studio', modes: ['studio', 'screenshot'], full: true, labels: true },
    });
    expect(wrapper.get('[role="group"]').attributes('style')).toContain('--button-group-columns: 2');
    expect(wrapper.findAll('button').map((button) => button.text())).toEqual(['Studio', 'Screenshot']);
    expect(wrapper.find('[aria-label="Instant"]').exists()).toBe(false);
    await wrapper.get('[aria-label="Screenshot"]').trigger('click');
    expect(wrapper.emitted('update:modelValue')).toEqual([['screenshot']]);
    wrapper.unmount();
  });
});

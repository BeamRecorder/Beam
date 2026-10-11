import { mount } from '@vue/test-utils';
import { setCurrentLocale } from '~/i18n';
import { nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CaptureModeGroup from '../CaptureModeGroup.vue';

describe('CaptureModeGroup', () => {
  beforeEach(async () => await setCurrentLocale('en'));
  afterEach(async () => {
    vi.useRealTimers();
    await setCurrentLocale('en');
  });

  it('exposes all capture modes as accessible toggle buttons', () => {
    const wrapper = mount(CaptureModeGroup, {
      props: { modelValue: 'studio' },
    });
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

  it.each([false, true])('uses the original Beam assets with stacked=%s', (stacked) => {
    const wrapper = mount(CaptureModeGroup, {
      props: { modelValue: 'studio', stacked },
    });
    const icons = wrapper.findAll('.capture-mode-icon');
    expect(icons.map((icon) => icon.attributes('data-mode'))).toEqual(['studio', 'screenshot', 'instant']);
    expect(icons.every((icon) => icon.attributes('aria-hidden') === 'true')).toBe(true);
    expect(icons.map((icon) => icon.attributes('style'))).toEqual([
      expect.stringContaining('beam-recorder.svg'),
      expect.stringContaining('beam-screenshot.svg'),
      expect.stringContaining('beam-instant.svg'),
    ]);
    wrapper.unmount();
  });

  it('updates accessible mode labels when the language changes', async () => {
    const wrapper = mount(CaptureModeGroup, {
      props: { modelValue: 'screenshot' },
    });
    await setCurrentLocale('fr');
    await nextTick();
    expect(wrapper.get('[aria-label="Capture d’écran"]').attributes('aria-pressed')).toBe('true');
    await wrapper.get('[aria-label="Instantané"]').trigger('click');
    expect(wrapper.emitted('update:modelValue')).toEqual([['instant']]);
    wrapper.unmount();
  });

  it.each([
    {
      locale: 'en',
      labels: ['Studio', 'Screenshot', 'Instant'],
      descriptions: [
        'Record a video, then open it in the editor.',
        'Take a screenshot, then open it in the editor.',
        'Record and export a styled video automatically.',
      ],
    },
    {
      locale: 'fr',
      labels: ['Studio', 'Capture d’écran', 'Instantané'],
      descriptions: [
        'Enregistre une vidéo, puis l’ouvre dans l’éditeur.',
        'Prend une capture d’écran, puis l’ouvre dans l’éditeur.',
        'Enregistre et exporte automatiquement une vidéo stylisée.',
      ],
    },
  ] as const)('shows each icon mode description on hover in $locale', async ({ locale, labels, descriptions }) => {
    vi.useFakeTimers();
    await setCurrentLocale(locale);
    const wrapper = mount(CaptureModeGroup, {
      props: { modelValue: 'studio' },
    });

    try {
      const buttons = wrapper.findAll('button');
      const tooltipTriggers = wrapper.findAll('.btn-container');
      expect(buttons.map((button) => button.attributes('aria-label'))).toEqual(labels);

      for (const [index, description] of descriptions.entries()) {
        expect(buttons[index]!.attributes('aria-label')).not.toBe(description);
        await tooltipTriggers[index]!.trigger('mouseenter');
        await vi.advanceTimersByTimeAsync(100);
        await nextTick();
        expect(
          Array.from(document.body.querySelectorAll<HTMLElement>('[role="tooltip"]')).some((tooltip) =>
            tooltip.textContent?.includes(description),
          ),
        ).toBe(true);
      }
    } finally {
      wrapper.unmount();
    }
  });

  it('emits the selected mode when a mode button is activated', async () => {
    const wrapper = mount(CaptureModeGroup, {
      props: { modelValue: 'studio' },
    });

    await wrapper.get('[aria-label="Instant"]').trigger('click');

    expect(wrapper.emitted('update:modelValue')).toEqual([['instant']]);
  });

  it.each([false, true])('does not show native or custom hints for labelled modes with stacked=%s', async (stacked) => {
    vi.useFakeTimers();
    const wrapper = mount(CaptureModeGroup, { props: { modelValue: 'studio', labels: true, stacked } });
    try {
      expect(wrapper.findAll('button').every((button) => button.text() && !button.attributes('title'))).toBe(true);
      for (const trigger of wrapper.findAll('.btn-container')) await trigger.trigger('mouseenter');
      await vi.advanceTimersByTimeAsync(200);
      expect(wrapper.find('.tooltip-wrapper').exists()).toBe(false);
      expect(document.body.querySelector('[role="tooltip"]')).toBeNull();
      await wrapper.get('[aria-label="Screenshot"]').trigger('click');
      expect(wrapper.emitted('update:modelValue')).toEqual([['screenshot']]);
    } finally {
      wrapper.unmount();
    }
  });

  it('shares one sliding indicator across mode changes without replacing the buttons', async () => {
    const wrapper = mount(CaptureModeGroup, {
      props: { modelValue: 'studio', full: true, labels: true },
    });
    const buttons = wrapper.findAll('button').map((button) => button.element);
    expect(wrapper.get('[role="group"]').classes()).toContain('has-indicator');
    for (const [index, mode] of ['instant', 'screenshot', 'studio'].entries()) {
      await wrapper.setProps({
        modelValue: mode as 'studio' | 'screenshot' | 'instant',
      });
      expect(wrapper.get('[role="group"]').attributes('style')).toContain(`--button-group-index: ${2 - index}`);
      expect(wrapper.findAll('button').map((button) => button.element)).toEqual(buttons);
    }
    wrapper.unmount();
  });

  it('hides the indicator if the selected mode is no longer available', async () => {
    const wrapper = mount(CaptureModeGroup, {
      props: { modelValue: 'instant', full: true },
    });
    await wrapper.setProps({ modes: ['studio', 'screenshot'] });
    expect(wrapper.find('.selection-indicator').exists()).toBe(false);
    await wrapper.setProps({ modelValue: 'screenshot' });
    expect(wrapper.get('[role="group"]').attributes('style')).toContain('--button-group-index: 1');
    expect(wrapper.get('[role="group"]').attributes('style')).toContain('--button-group-count: 2');
    await wrapper.setProps({ modes: ['screenshot'] });
    expect(wrapper.get('[role="group"]').attributes('style')).toContain('--button-group-count: 1');
    wrapper.unmount();
  });

  it('disables every mode button without emitting a selection', async () => {
    const wrapper = mount(CaptureModeGroup, {
      props: { modelValue: 'screenshot', disabled: true },
    });

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
    const wrapper = mount(CaptureModeGroup, {
      props: { modelValue: 'studio' },
    });
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
      props: {
        modelValue: 'studio',
        modes: ['studio', 'screenshot'],
        full: true,
        labels: true,
      },
    });
    expect(wrapper.get('[role="group"]').attributes('style')).toContain('--button-group-columns: 2');
    expect(wrapper.findAll('button').map((button) => button.text())).toEqual(['Studio', 'Screenshot']);
    expect(wrapper.find('[aria-label="Instant"]').exists()).toBe(false);
    await wrapper.get('[aria-label="Screenshot"]').trigger('click');
    expect(wrapper.emitted('update:modelValue')).toEqual([['screenshot']]);
    wrapper.unmount();
  });
});

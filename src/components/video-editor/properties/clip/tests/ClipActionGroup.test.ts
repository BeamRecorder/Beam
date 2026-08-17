import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ClipActionGroup from '../ClipActionGroup.vue';

const mountActions = (overrides: Record<string, unknown> = {}) =>
  mount(ClipActionGroup, {
    props: {
      enabled: true,
      enabledLabel: 'Enabled',
      disabledLabel: 'Disabled',
      deleteLabel: 'Delete clip',
      transitionable: true,
      transitionLabel: 'Clip transitions',
      ...overrides,
    },
  });

const actionButtons = (wrapper: ReturnType<typeof mountActions>) =>
  wrapper.findAll('button').filter((button) => button.find('svg').exists());

describe('ClipActionGroup', () => {
  it('keeps Eye, Transition and Trash in the documented order', () => {
    const wrapper = mountActions();
    const buttons = actionButtons(wrapper);

    expect(buttons).toHaveLength(3);
    expect(buttons.map((button) => button.find('svg').classes())).toEqual([
      expect.arrayContaining(['lucide-eye']),
      expect.arrayContaining(['lucide-blend']),
      expect.arrayContaining(['lucide-trash-2']),
    ]);
    expect(buttons.map((button) => button.attributes('aria-label'))).toEqual([
      'Enabled',
      'Clip transitions',
      'Delete clip',
    ]);
  });

  it('emits transition independently and exposes its active state', async () => {
    const wrapper = mountActions({ transitionActive: true });
    const transitionButton = actionButtons(wrapper)[1]!;

    expect(transitionButton.classes()).toContain('is-active');
    await transitionButton.trigger('click');
    expect(wrapper.emitted('transition')).toHaveLength(1);
  });

  it('preserves the existing two-button mode when transitions are unavailable', () => {
    const wrapper = mountActions({ transitionable: false });
    expect(actionButtons(wrapper)).toHaveLength(2);
    expect(wrapper.find('.lucide-blend').exists()).toBe(false);
  });
});

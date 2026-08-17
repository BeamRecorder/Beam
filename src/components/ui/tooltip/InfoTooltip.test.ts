import { defineComponent } from 'vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import InfoTooltip from './InfoTooltip.vue';

const ButtonStub = defineComponent({
  name: 'Button',
  inheritAttrs: false,
  props: {
    icon: { type: [Object, Function], required: false },
    iconOnly: { type: Boolean, default: false },
    tooltip: { type: String, default: '' },
    tooltipPosition: { type: String, default: 'top' },
    tooltipDelay: { type: Number, default: 100 },
  },
  template:
    '<button v-bind="$attrs" :data-icon-only="iconOnly ? \'true\' : \'false\'" :data-tooltip="tooltip" :data-tooltip-position="tooltipPosition" :data-tooltip-delay="tooltipDelay" />',
});

describe('InfoTooltip', () => {
  const mountInfoTooltip = (props: Record<string, unknown> = {}) =>
    mount(InfoTooltip, {
      props: { content: 'Helpful export context', ...props },
      global: { stubs: { Button: ButtonStub } },
    });

  it('renders an accessible icon-only trigger', () => {
    const wrapper = mountInfoTooltip({ label: 'Explain resolution' });
    const trigger = wrapper.get('button');

    expect(trigger.attributes('data-icon-only')).toBe('true');
    expect(trigger.attributes('aria-label')).toBe('Explain resolution');
  });

  it('falls back to the tooltip content for the accessible label', () => {
    const wrapper = mountInfoTooltip();

    expect(wrapper.get('button').attributes('aria-label')).toBe('Helpful export context');
  });

  it('passes tooltip content, position and delay through Button', () => {
    const wrapper = mountInfoTooltip({ content: '60 fps guidance', position: 'left', delay: 240 });
    const trigger = wrapper.get('button');

    expect(trigger.attributes('data-tooltip')).toBe('60 fps guidance');
    expect(trigger.attributes('data-tooltip-position')).toBe('left');
    expect(trigger.attributes('data-tooltip-delay')).toBe('240');
  });
});

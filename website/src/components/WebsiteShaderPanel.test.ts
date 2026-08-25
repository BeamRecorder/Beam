import { mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import { describe, expect, it } from 'vitest';
import WebsiteShaderPanel from './WebsiteShaderPanel.vue';

const shaderStub = defineComponent({
  setup(_, { attrs }) {
    return () => h('canvas', { ...attrs, 'aria-hidden': 'true' });
  },
});

const mountPanel = (as: 'section' | 'aside' | 'div' = 'section') =>
  mount(WebsiteShaderPanel, {
    props: { as },
    global: {
      stubs: { WebsiteCommunityShader: shaderStub },
    },
    slots: {
      default: '<span data-testid="panel-content">Open source Beam</span>',
    },
  });

describe('WebsiteShaderPanel', () => {
  it('renders the shared shader layer behind its slotted content', () => {
    const wrapper = mountPanel();

    expect(wrapper.element.tagName).toBe('SECTION');
    expect(wrapper.classes()).toContain('shader-panel');
    expect(wrapper.get('canvas').classes()).toContain('shader-panel__canvas');
    expect(wrapper.get('[data-testid="panel-content"]').text()).toBe('Open source Beam');
  });

  it.each(['aside', 'div'] as const)('supports an %s semantic wrapper', (as) => {
    const wrapper = mountPanel(as);

    expect(wrapper.element.tagName).toBe(as.toUpperCase());
    expect(wrapper.classes()).toContain('shader-panel');
  });
});

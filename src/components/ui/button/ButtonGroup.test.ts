import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ButtonGroup from './ButtonGroup.vue';

describe('ButtonGroup', () => {
  it('keeps grouped controls in its slot', () => {
    const wrapper = mount(ButtonGroup, { slots: { default: '<button>One</button><button>Two</button>' } });
    expect(wrapper.classes()).toContain('btn-group');
    expect(wrapper.findAll('button')).toHaveLength(2);
  });
});

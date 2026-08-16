import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ButtonGroup from './ButtonGroup.vue';

describe('ButtonGroup', () => {
  it('keeps grouped controls in its slot', () => {
    const wrapper = mount(ButtonGroup, { slots: { default: '<button>One</button><button>Two</button>' } });
    expect(wrapper.classes()).toContain('btn-group');
    expect(wrapper.findAll('button')).toHaveLength(2);
  });

  it('lays controls out with the requested number of columns', () => {
    const wrapper = mount(ButtonGroup, {
      props: { full: true, columns: 2 },
      slots: { default: '<button>One</button><button>Two</button><button>Three</button>' },
    });
    expect(wrapper.classes()).toEqual(expect.arrayContaining(['btn-group', 'full-width', 'column-layout']));
    expect(wrapper.attributes('style')).toContain('--button-group-columns: 2');
  });
});

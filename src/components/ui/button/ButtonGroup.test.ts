import { mount } from '@vue/test-utils';
import { h, nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Button from './Button.vue';
import ButtonGroup from './ButtonGroup.vue';

const resizeCallbacks: ResizeObserverCallback[] = [];

class ResizeObserverMock {
  observe = vi.fn();
  disconnect = vi.fn();
  unobserve = vi.fn();

  constructor(callback: ResizeObserverCallback) {
    resizeCallbacks.push(callback);
  }
}

const triggerResize = async () => {
  for (const callback of resizeCallbacks) callback([], {} as ResizeObserver);
  await nextTick();
};

const TestIcon = { render: () => h('span', { class: 'test-icon' }) };

const setButtonMetrics = (wrapper: ReturnType<typeof mount>, labelWidth: number, viewportWidth: number) => {
  const content = wrapper.get('.btn-content').element;
  const label = wrapper.get('.btn-content-label').element;

  Object.defineProperty(content, 'clientWidth', { configurable: true, value: viewportWidth });
  Object.defineProperty(label, 'scrollWidth', { configurable: true, value: labelWidth });
};

describe('ButtonGroup', () => {
  beforeEach(() => {
    resizeCallbacks.length = 0;
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

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

  it('keeps slotted button corners inside the group radius', () => {
    const wrapper = mount(ButtonGroup, {
      slots: { default: '<button class="btn">One</button><button class="btn">Two</button>' },
    });

    expect(wrapper.attributes('style')).toContain('--button-group-inner-radius: calc(var(--radius-lg) - 3px)');
    expect(wrapper.findAll('.btn')).toHaveLength(2);
    expect(wrapper.findAll('.btn').every((button) => button.classes().includes('btn'))).toBe(true);
  });

  it('does not render marquee content for an icon-only button without a text slot', () => {
    const wrapper = mount(ButtonGroup, {
      slots: { default: () => h(Button, { icon: TestIcon, iconOnly: true }) },
    });

    expect(wrapper.get('button.btn-icon-only').find('.btn-icon-wrapper').exists()).toBe(true);
    expect(wrapper.find('.btn-content').exists()).toBe(false);
  });

  it('keeps icon-and-label controls in compact centered marquee wrappers', () => {
    const wrapper = mount(ButtonGroup, {
      props: { full: true, columns: 2 },
      slots: {
        default: () => [
          h(Button, { icon: TestIcon }, { default: () => 'Horizontal' }),
          h(Button, { icon: TestIcon }, { default: () => 'Vertical' }),
        ],
      },
    });

    const buttons = wrapper.findAll('button');
    expect(buttons).toHaveLength(2);
    expect(buttons.map((button) => button.find('.btn-content-label').text())).toEqual(['Horizontal', 'Vertical']);
    expect(buttons.every((button) => button.find('.btn-icon-wrapper').exists())).toBe(true);
    expect(buttons.every((button) => button.find('.btn-content').exists())).toBe(true);
  });

  it('marks an overflowing button and exposes the measured marquee distance', async () => {
    const wrapper = mount(ButtonGroup, {
      props: { full: true },
      slots: {
        default: () => h(Button, { 'aria-label': 'A long action' }, { default: () => 'A long action' }),
      },
    });

    setButtonMetrics(wrapper, 260, 100);
    await triggerResize();

    const content = wrapper.get('.btn-content');
    expect(content.classes()).toContain('is-overflowing');
    expect(content.attributes('style')).toContain('--button-marquee-distance: 160px');
  });

  it('does not activate the marquee for text that fits its button', async () => {
    const wrapper = mount(ButtonGroup, {
      props: { full: true },
      slots: {
        default: () => h(Button, { 'aria-label': 'Save' }, { default: () => 'Save' }),
      },
    });

    setButtonMetrics(wrapper, 40, 100);
    await triggerResize();

    const content = wrapper.get('.btn-content');
    expect(content.classes()).not.toContain('is-overflowing');
    expect(content.attributes('style')).toContain('--button-marquee-distance: 0px');
  });

  it('recalculates the marquee distance when ResizeObserver reports a resize', async () => {
    const wrapper = mount(ButtonGroup, {
      props: { full: true },
      slots: {
        default: () => h(Button, { 'aria-label': 'Resizable action' }, { default: () => 'Resizable action' }),
      },
    });

    setButtonMetrics(wrapper, 120, 100);
    await triggerResize();
    expect(wrapper.get('.btn-content').attributes('style')).toContain('--button-marquee-distance: 20px');

    setButtonMetrics(wrapper, 280, 100);
    await triggerResize();
    expect(wrapper.get('.btn-content').attributes('style')).toContain('--button-marquee-distance: 180px');

    setButtonMetrics(wrapper, 80, 100);
    await triggerResize();
    expect(wrapper.get('.btn-content').classes()).not.toContain('is-overflowing');
    expect(wrapper.get('.btn-content').attributes('style')).toContain('--button-marquee-distance: 0px');
  });

  it('keeps the native accessible button structure inside the marquee wrappers', () => {
    const wrapper = mount(ButtonGroup, {
      slots: {
        default: () => h(Button, { 'aria-label': 'Accessible action' }, { default: () => 'Accessible action' }),
      },
    });

    const button = wrapper.get('button');
    expect(wrapper.findAll('button')).toHaveLength(1);
    expect(button.attributes('type')).toBe('button');
    expect(button.attributes('aria-label')).toBe('Accessible action');
    expect(button.attributes('role')).toBeUndefined();
    expect(button.get('.btn-content').text()).toBe('Accessible action');
  });
});

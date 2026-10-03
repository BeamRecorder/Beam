import { flushPromises, mount, enableAutoUnmount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import Popover from './Popover.vue';
enableAutoUnmount(afterEach);

const create = (props = {}) =>
  mount(Popover, {
    attachTo: document.body,
    props: { triggerOn: 'pointerdown' as const, ...props },
    slots: { trigger: '<button>Projects</button>', default: '<p>Projects</p>' },
  });
const press = (target: Element, options: MouseEventInit = {}) =>
  target.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, ...options }));

describe('immediate popover activation', () => {
  it('opens on the primary press and does not toggle again on its release click', async () => {
    const wrapper = create();
    const button = wrapper.get('button').element;
    expect(press(button)).toBe(false);
    await flushPromises();
    expect(wrapper.vm.isOpen).toBe(true);
    button.dispatchEvent(new MouseEvent('click', { detail: 1, bubbles: true }));
    await flushPromises();
    expect(wrapper.vm.isOpen).toBe(true);
    press(button);
    await flushPromises();
    expect(wrapper.vm.isOpen).toBe(false);
  });
  it.each([{ button: 1 }, { button: 2 }, { button: 0, ctrlKey: true }])(
    'ignores non-primary/context presses %o',
    async (options) => {
      const wrapper = create();
      expect(press(wrapper.get('button').element, options)).toBe(true);
      await flushPromises();
      expect(wrapper.vm.isOpen).toBe(false);
    },
  );
  it('preserves keyboard activation and disabled controls', async () => {
    const wrapper = create();
    wrapper.get('button').element.dispatchEvent(new MouseEvent('click', { detail: 0, bubbles: true }));
    await flushPromises();
    expect(wrapper.vm.isOpen).toBe(true);
    await wrapper.setProps({ disabled: true });
    press(wrapper.get('button').element);
    wrapper.get('button').element.dispatchEvent(new MouseEvent('click', { detail: 0, bubbles: true }));
    await flushPromises();
    expect(wrapper.vm.isOpen).toBe(false);
  });
  it('leaves ordinary popover triggers on release-click behavior', async () => {
    const wrapper = create({ triggerOn: 'click' });
    expect(press(wrapper.get('button').element)).toBe(true);
    await flushPromises();
    expect(wrapper.vm.isOpen).toBe(false);
    wrapper.get('button').element.dispatchEvent(new MouseEvent('click', { detail: 1, bubbles: true }));
    await flushPromises();
    expect(wrapper.vm.isOpen).toBe(true);
  });
});

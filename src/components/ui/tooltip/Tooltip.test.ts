import { nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import Tooltip from './Tooltip.vue';

describe('Tooltip', () => {
  it('positions a tooltip for every direction and applies variant and max width', async () => {
    const wrapper = mount(Tooltip, {
      attachTo: document.body,
      props: { content: 'Helpful text', position: 'top', variant: 'error', maxWidth: 180 },
      slots: { default: '<button>Focus me</button>' },
    });
    vi.spyOn(wrapper.get('.tooltip-wrapper').element as HTMLElement, 'getBoundingClientRect').mockReturnValue({
      top: 10,
      left: 20,
      right: 120,
      bottom: 60,
      width: 100,
      height: 50,
    } as DOMRect);

    for (const position of ['top', 'bottom', 'left', 'right'] as const) {
      await wrapper.setProps({ position });
      await wrapper.get('.tooltip-wrapper').trigger('mouseenter');
      await nextTick();
      const tooltip = document.body.querySelector<HTMLElement>('.tooltip-content');
      expect(tooltip).not.toBeNull();
      expect(tooltip?.classList).toContain(position);
      expect(tooltip?.classList).toContain('tooltip-error');
      expect(tooltip?.style.maxWidth).toBe('180px');
      expect(tooltip?.textContent).toContain('Helpful text');
      expect(tooltip?.style.top).toMatch(/px$/);
      await wrapper.get('.tooltip-wrapper').trigger('mouseleave');
    }
    wrapper.unmount();
  });

  it('supports named content, focus events, resize updates and disabled state', async () => {
    const wrapper = mount(Tooltip, {
      attachTo: document.body,
      props: { disabled: true },
      slots: { default: '<button>Trigger</button>', content: '<strong>Custom content</strong>' },
    });
    const host = wrapper.get('.tooltip-wrapper');
    await host.trigger('mouseenter');
    expect(document.body.querySelector('.tooltip-content')).toBeNull();

    await wrapper.setProps({ disabled: false });
    await host.trigger('focusin');
    await nextTick();
    expect(document.body.querySelector('.tooltip-content')?.textContent).toContain('Custom content');
    window.dispatchEvent(new Event('resize'));
    window.dispatchEvent(new Event('scroll'));
    await host.trigger('focusout');
    expect(document.body.querySelector('.tooltip-content')).toBeNull();

    await wrapper.setProps({ disabled: true });
    wrapper.unmount();
  });

  it('repositions an already visible tooltip when its direction changes', async () => {
    const wrapper = mount(Tooltip, {
      attachTo: document.body,
      props: { content: 'Dynamic position', position: 'left' },
      slots: { default: '<button>Trigger</button>' },
    });
    vi.spyOn(wrapper.get('.tooltip-wrapper').element as HTMLElement, 'getBoundingClientRect').mockReturnValue({
      top: 10,
      left: 20,
      right: 120,
      bottom: 60,
      width: 100,
      height: 50,
    } as DOMRect);

    await wrapper.get('.tooltip-wrapper').trigger('mouseenter');
    await nextTick();
    const tooltip = document.body.querySelector<HTMLElement>('.tooltip-content');
    expect(tooltip?.style.left).toBe('12px');

    await wrapper.setProps({ position: 'right' });
    await nextTick();
    expect(tooltip?.classList).toContain('right');
    expect(tooltip?.style.left).toBe('128px');
    wrapper.unmount();
  });

  it('falls back to the opposite side when the preferred side collides with the viewport', async () => {
    const wrapper = mount(Tooltip, {
      attachTo: document.body,
      props: { content: 'Collision-safe tooltip', position: 'right', delay: 0 },
      slots: { default: '<button>Trigger</button>' },
    });
    vi.spyOn(wrapper.get('.tooltip-wrapper').element as HTMLElement, 'getBoundingClientRect').mockReturnValue({
      top: 100,
      left: 900,
      right: 940,
      bottom: 140,
      width: 40,
      height: 40,
    } as DOMRect);

    await wrapper.get('.tooltip-wrapper').trigger('mouseenter');
    await nextTick();
    await nextTick();
    const tooltip = document.body.querySelector<HTMLElement>('.tooltip-content');
    expect(tooltip).not.toBeNull();
    vi.spyOn(tooltip!, 'getBoundingClientRect').mockReturnValue({
      top: 0,
      left: 0,
      right: 100,
      bottom: 20,
      width: 100,
      height: 20,
    } as DOMRect);

    window.dispatchEvent(new Event('resize'));
    await nextTick();
    expect(tooltip?.classList).toContain('left');
    expect(tooltip?.style.left).toBe('792px');
    wrapper.unmount();
  });
});

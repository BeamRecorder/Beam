import { readFileSync } from 'node:fs';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Popover from './Popover.vue';

enableAutoUnmount(afterEach);
afterEach(() => vi.restoreAllMocks());

const style = readFileSync('apps/desktop/src/components/ui/popover/popover.css', 'utf8');

describe('project popover presentation', () => {
  it('starts a short fade and lift on presentation, without a delayed transition phase', () => {
    expect(style).toMatch(/\.pop-lift-enter-active\s*\{[^}]*animation: pop-lift-in 160ms[^;]*both;/);
    expect(style).toMatch(
      /@keyframes pop-lift-in\s*\{\s*from\s*\{\s*opacity: var\(--popover-lift-opacity, 0\.16\);\s*transform: var\(--popover-lift-transform, translate3d\(0, 6px, 0\)\);/,
    );
    expect(style).toMatch(/to\s*\{\s*opacity: 1;\s*transform: translate3d\(0, 0, 0\);/);
    expect(style).not.toContain('.pop-lift-enter-from');
    expect(style).not.toContain('animation-delay');
  });

  it('fades out with a shorter, smaller downward movement instead of removing an opaque surface', () => {
    expect(style).toMatch(/\.pop-lift-leave-active\s*\{\s*animation: pop-lift-out 100ms ease-in both;/);
    expect(style).toMatch(
      /@keyframes pop-lift-out\s*\{[^}]*\}[^}]*to\s*\{\s*opacity: 0;\s*transform: translate3d\(0, 4px, 0\);/,
    );
  });

  it('disables both animation directions for reduced motion, preserving the ordinary popover transition', () => {
    expect(style).toMatch(
      /@media \(prefers-reduced-motion: reduce\)\s*\{[^}]*\.pop-lift-enter-active,[^}]*\.pop-lift-leave-active\s*\{\s*transition: none;\s*animation: none;/,
    );
    expect(style).toMatch(/\.pop-enter-active,\s*\.pop-leave-active\s*\{\s*transition:\s*opacity 0\.15s/);
  });

  it('is already faintly visible on the opening frame and closes from full opacity once settled', async () => {
    const wrapper = mount(Popover, {
      props: { motion: 'lift', keepMounted: true },
      slots: { trigger: '<button>Open</button>', default: '<p>Projects</p>' },
      global: { stubs: { teleport: true } },
    });
    await wrapper.get('button').trigger('click');
    await flushPromises();
    const content = wrapper.get('.popover-content').element as HTMLElement;
    expect(content.style.getPropertyValue('--popover-lift-opacity')).toBe('0.16');
    expect(content.style.getPropertyValue('--popover-lift-transform')).toBe('translate3d(0, 6px, 0)');
    wrapper.vm.close();
    await flushPromises();
    expect(wrapper.get('.popover-content').attributes('style')).toContain('--popover-lift-opacity: 1');
  });

  it.each(['pop-lift-enter-active', 'pop-lift-leave-active'])(
    'preserves the displayed pose when reversing %s, including after repositioning',
    async (phase) => {
      const wrapper = mount(Popover, {
        props: { motion: 'lift', keepMounted: true },
        slots: { trigger: '<button>Open</button>', default: '<p>Projects</p>' },
        global: { stubs: { teleport: true } },
      });
      await wrapper.get('button').trigger('click');
      await flushPromises();
      if (phase === 'pop-lift-leave-active') {
        wrapper.vm.close();
        await flushPromises();
      }
      const content = wrapper.get('.popover-content').element as HTMLElement;
      content.classList.add(phase);
      const displayedStyle = document.createElement('div').style;
      displayedStyle.opacity = '0.6';
      displayedStyle.transform = 'matrix(1, 0, 0, 1, 0, 2)';
      const computedStyle = vi.spyOn(window, 'getComputedStyle').mockReturnValue(displayedStyle);
      wrapper.vm.toggle();
      await flushPromises();
      expect(computedStyle).toHaveBeenCalledWith(content);
      window.dispatchEvent(new Event('resize'));
      await flushPromises();
      const nextContent = wrapper.get('.popover-content').element as HTMLElement;
      expect(nextContent.style.getPropertyValue('--popover-lift-opacity')).toBe('0.6');
      expect(nextContent.style.getPropertyValue('--popover-lift-transform')).toBe(displayedStyle.transform);
    },
  );
});

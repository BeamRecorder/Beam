import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('~/api/capture', () => ({ capture: {} }));

import SidebarPanel from '../sidebar/SidebarPanel.vue';
import { getCurrentLocale, setCurrentLocale } from '~/i18n';

const UpdateAvailableBadge = { template: '<span class="update-badge-stub" />' };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SidebarPanel', () => {
  it('hides labels below the size thresholds and shows tooltips for icon-only navigation', async () => {
    const resizeCallbacks: Array<() => void> = [];
    class ResizeObserverStub {
      constructor(callback: () => void) {
        resizeCallbacks.push(callback);
      }
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);

    const wrapper = mount(SidebarPanel, {
      props: { activeTab: 'canvas' },
      global: { stubs: { UpdateAvailableBadge } },
    });
    const sidebar = wrapper.get('.sidebar-island').element as HTMLElement;
    Object.defineProperties(sidebar, {
      clientWidth: { configurable: true, value: 81 },
      clientHeight: { configurable: true, value: 600 },
    });
    await nextTick();
    resizeCallbacks.forEach((callback) => callback());
    await nextTick();

    expect(wrapper.get('.sidebar-island').classes()).toContain('labels-hidden');
    expect(wrapper.findAll('.nav-label')).toHaveLength(0);
    expect(wrapper.findAllComponents({ name: 'Tooltip' }).every((tooltip) => tooltip.props('disabled') === false)).toBe(
      true,
    );

    Object.defineProperty(sidebar, 'clientWidth', { configurable: true, value: 82 });
    Object.defineProperty(sidebar, 'clientHeight', { configurable: true, value: 430 });
    resizeCallbacks.forEach((callback) => callback());
    await nextTick();

    expect(wrapper.get('.sidebar-island').classes()).not.toContain('labels-hidden');
    expect(wrapper.findAll('.nav-label')).toHaveLength(7);
    expect(wrapper.findAllComponents({ name: 'Tooltip' }).every((tooltip) => tooltip.props('disabled') === true)).toBe(
      true,
    );
  });

  it('keeps the footer after the scroll wrapper and scales label thresholds with CSS scale', async () => {
    const resizeCallbacks: Array<() => void> = [];
    class ResizeObserverStub {
      constructor(callback: () => void) {
        resizeCallbacks.push(callback);
      }
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
    const root = document.documentElement;
    const previousScale = root.style.getPropertyValue('--ui-scale-sidebar');
    root.style.setProperty('--ui-scale-sidebar', '1.25');

    try {
      const wrapper = mount(SidebarPanel, {
        props: { activeTab: 'canvas' },
        global: { stubs: { UpdateAvailableBadge } },
      });
      const sidebar = wrapper.get('.sidebar-island').element as HTMLElement;
      Object.defineProperties(sidebar, {
        clientWidth: { configurable: true, value: 102 },
        clientHeight: { configurable: true, value: 538 },
      });
      await nextTick();
      resizeCallbacks.forEach((callback) => callback());
      await nextTick();

      expect(wrapper.get('.sidebar-island').classes()).toContain('labels-hidden');
      expect(wrapper.findAll('.nav-label')).toHaveLength(0);

      Object.defineProperty(sidebar, 'clientWidth', { configurable: true, value: 103 });
      resizeCallbacks.forEach((callback) => callback());
      await nextTick();
      expect(wrapper.get('.sidebar-island').classes()).not.toContain('labels-hidden');
      expect(wrapper.findAll('.nav-label')).toHaveLength(7);

      const scrollWrapper = wrapper.get('.sidebar-scroll-wrapper');
      const footer = wrapper.get('.sidebar-footer');
      expect(sidebar.lastElementChild).toBe(footer.element);
      expect(scrollWrapper.element.nextElementSibling).toBe(footer.element);
      expect(scrollWrapper.element.parentElement).toBe(sidebar);
      expect(footer.element.parentElement).toBe(sidebar);
    } finally {
      if (previousScale) root.style.setProperty('--ui-scale-sidebar', previousScale);
      else root.style.removeProperty('--ui-scale-sidebar');
    }
  });

  it('renders all navigation entries, marks the active tab and emits selections', async () => {
    const wrapper = mount(SidebarPanel, { props: { activeTab: 'zoom' }, global: { stubs: { UpdateAvailableBadge } } });
    const viewport = wrapper.get('.sidebar-viewport');
    const navMenu = wrapper.get('.nav-menu');
    const footer = wrapper.get('.sidebar-footer');
    const scrollWrapper = wrapper.get('.sidebar-scroll-wrapper');
    expect(viewport.find('.nav-menu').element).toBe(navMenu.element);
    expect(viewport.find('.sidebar-footer').exists()).toBe(false);
    expect(scrollWrapper.element.parentElement).toBe(footer.element.parentElement);
    expect(scrollWrapper.element.nextElementSibling).toBe(footer.element);
    expect(navMenu.findAll('.nav-btn')).toHaveLength(6);
    expect(wrapper.findAll('.nav-btn')).toHaveLength(7);
    expect(wrapper.findAll('.nav-btn.active')).toHaveLength(1);
    expect(wrapper.find('.nav-btn.active').attributes('title')).toBe('Zoom');
    expect(wrapper.findComponent({ name: 'ScrollShadow' }).exists()).toBe(true);
    expect(wrapper.find('.sidebar-viewport').exists()).toBe(true);
    await navMenu.findAll('.nav-btn')[0].trigger('click');
    await wrapper.find('.footer-btn').trigger('click');
    expect(wrapper.emitted('select-tab')).toEqual([['canvas'], ['settings']]);
  });

  it('preserves Vietnamese diacritics in every sidebar label', () => {
    const previousLocale = getCurrentLocale();
    setCurrentLocale('vi');
    try {
      const wrapper = mount(SidebarPanel, {
        props: { activeTab: 'canvas' },
        global: { stubs: { UpdateAvailableBadge } },
      });
      expect(wrapper.findAll('.nav-label').map((label) => label.text())).toEqual([
        'Khung nền',
        'Đoạn clip',
        'Thu phóng',
        'Con trỏ',
        'Phụ đề',
        'Âm thanh',
        'Cài đặt',
      ]);
    } finally {
      setCurrentLocale(previousLocale as Parameters<typeof setCurrentLocale>[0]);
    }
  });
});

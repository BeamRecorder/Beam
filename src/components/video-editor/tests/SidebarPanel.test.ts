import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';

vi.mock('~/api/capture', () => ({ capture: {} }));

import SidebarPanel from '../sidebar/SidebarPanel.vue';
import { getCurrentLocale, setCurrentLocale } from '~/i18n';

const UpdateAvailableBadge = { template: '<span class="update-badge-stub" />' };

describe('SidebarPanel', () => {
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
        'Khung vẽ',
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

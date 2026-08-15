import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';

vi.mock('~/api/capture', () => ({ capture: {} }));

import SidebarPanel from '../sidebar/SidebarPanel.vue';

const UpdateAvailableBadge = { template: '<span class="update-badge-stub" />' };

describe('SidebarPanel', () => {
  it('renders all navigation entries, marks the active tab and emits selections', async () => {
    const wrapper = mount(SidebarPanel, { props: { activeTab: 'zoom' }, global: { stubs: { UpdateAvailableBadge } } });
    expect(wrapper.findAll('.nav-btn')).toHaveLength(7);
    expect(wrapper.findAll('.nav-btn.active')).toHaveLength(1);
    expect(wrapper.find('.nav-btn.active').attributes('title')).toBe('Zoom');
    await wrapper.findAll('.nav-btn')[0].trigger('click');
    await wrapper.find('.footer-btn').trigger('click');
    expect(wrapper.emitted('select-tab')).toEqual([['canvas'], ['settings']]);
  });
});

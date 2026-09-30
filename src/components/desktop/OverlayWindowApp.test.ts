import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
vi.mock('~/components/ui/toast/ToastProvider.vue', () => ({ default: { template: '<div class="toast-provider" />' } }));
import OverlayWindowApp from './OverlayWindowApp.vue';

describe('overlay window root', () => {
  it.each(['camera', 'crop', 'replacement'])('renders the supplied %s component with its toast host', (role) => {
    const wrapper = mount(OverlayWindowApp, { props: { content: { template: `<main>${role}</main>` } } });
    expect(wrapper.get('main').text()).toBe(role);
    expect(wrapper.find('.toast-provider').exists()).toBe(true);
    expect(wrapper.find('.app-container').exists()).toBe(false);
    wrapper.unmount();
  });
});

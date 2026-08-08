import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Topbar from '../Topbar.vue';

const capture = vi.hoisted(() => ({
  openDiscordInvite: vi.fn(),
}));

vi.mock('../../../api/capture', () => ({ capture }));
vi.mock('../../export/ExportPopover.vue', () => ({ default: { template: '<div />' } }));
vi.mock('../VideoProjectEdition.vue', () => ({ default: { template: '<div />' } }));

describe('VideoEditor Topbar', () => {
  beforeEach(() => vi.clearAllMocks());

  it('opens the Discord invite through the capture bridge', async () => {
    const wrapper = mount(Topbar);

    await wrapper.get('[aria-label="Open Beam Discord"]').trigger('click');

    expect(capture.openDiscordInvite).toHaveBeenCalledOnce();
    expect(wrapper.get('.discord-icon').attributes('src')).toContain('discord_svg.svg');
  });

  it('emits navigation back to the HUD', async () => {
    const wrapper = mount(Topbar);

    await wrapper.get('.exit-btn').trigger('click');

    expect(wrapper.emitted('back-to-hud')).toHaveLength(1);
  });

  it('keeps an explicit native drag region between the Beam actions', () => {
    const wrapper = mount(Topbar);

    expect(wrapper.get('.titlebar-drag-region').attributes('aria-hidden')).toBe('true');
  });

  it('leaves minimize, maximize, Snap Layout and close to the native overlay', () => {
    const wrapper = mount(Topbar);

    expect(wrapper.find('.window-controls').exists()).toBe(false);
    expect(wrapper.find('[aria-label="Maximize"]').exists()).toBe(false);
  });
});

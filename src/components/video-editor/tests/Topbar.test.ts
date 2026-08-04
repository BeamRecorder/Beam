import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import Topbar from '../Topbar.vue';

const capture = vi.hoisted(() => ({
  close: vi.fn(),
  drag: vi.fn(),
  dragStart: vi.fn(),
  minimize: vi.fn(),
  openDiscordInvite: vi.fn(),
  toggleMaximize: vi.fn(),
}));

vi.mock('../../../api/capture', () => ({ capture }));
vi.mock('../../export/ExportPopover.vue', () => ({ default: { template: '<div />' } }));
vi.mock('../VideoProjectEdition.vue', () => ({ default: { template: '<div />' } }));

describe('VideoEditor Topbar', () => {
  it('opens the Discord invite through the capture bridge', async () => {
    const wrapper = mount(Topbar);

    await wrapper.get('[aria-label="Open Beam Discord"]').trigger('click');

    expect(capture.openDiscordInvite).toHaveBeenCalledOnce();
    expect(wrapper.get('.discord-icon').attributes('src')).toContain('discord_svg.svg');
  });
});

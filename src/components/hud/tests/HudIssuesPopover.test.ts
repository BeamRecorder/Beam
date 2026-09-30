import { flushPromises, mount } from '@vue/test-utils';
import { h } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import HudIssuesPopover from '../HudIssuesPopover.vue';
import HudIssue from '../HudIssue.vue';
const writeText = vi.fn().mockResolvedValue(undefined);
const issues = [
  {
    id: 'capture',
    title: 'Capture failed',
    details: ['Engine missing'],
    tone: 'error' as const,
    copyText: 'Native engine details',
  },
  {
    id: 'permission',
    title: 'Permission required',
    details: ['Authorize capture'],
    tone: 'warning' as const,
    actionLabel: 'Authorize',
  },
  { id: 'audio', title: 'Audio unavailable', details: ['No device'], tone: 'info' as const },
];
let wrapper: ReturnType<typeof mount> | undefined;
afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  vi.useRealTimers();
});
const create = (count = 3) => {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  writeText.mockClear();
  wrapper = mount(HudIssuesPopover, {
    attachTo: document.body,
    props: { count },
    slots: { default: () => issues.map((issue) => h(HudIssue, { issue })) },
  });
  return wrapper;
};
describe('toolbar issue panel', () => {
  it('shows the actual issue count and opens its themed scrollable list on hover', async () => {
    const panel = create();
    expect(panel.get('button').attributes('aria-label')).toBe('Issues (3)');
    expect(document.body.querySelector('.issues-list')).toBeNull();
    await panel.get('.popover-trigger').trigger('mouseenter');
    await flushPromises();
    expect(document.body.querySelectorAll('.hud-issue')).toHaveLength(3);
    expect(document.body.querySelector('.issues-list')).not.toBeNull();
    expect(panel.emitted('toggle')).toEqual([[true]]);
  });
  it('copies each issue independently, including issues with a permission action', async () => {
    const panel = create();
    await panel.get('.popover-trigger').trigger('mouseenter');
    await flushPromises();
    const buttons = document.body.querySelectorAll<HTMLButtonElement>('.hud-issue button[aria-label="Copy error"]');
    expect(buttons).toHaveLength(3);
    for (const button of buttons) {
      button.click();
      await flushPromises();
    }
    expect(writeText.mock.calls).toEqual([
      ['Native engine details'],
      ['Permission required\nAuthorize capture'],
      ['Audio unavailable\nNo device'],
    ]);
  });
  it('closes on blur and releases the interaction lease when the last issue disappears', async () => {
    const panel = create();
    await panel.get('.popover-trigger').trigger('mouseenter');
    window.dispatchEvent(new Event('blur'));
    await flushPromises();
    expect(panel.emitted('toggle')).toEqual([[true], [false]]);
    await panel.get('.popover-trigger').trigger('mouseenter');
    await panel.setProps({ count: 0 });
    expect(panel.emitted('toggle')?.at(-1)).toEqual([false]);
    expect(panel.find('button').exists()).toBe(false);
  });
});

import { mount, enableAutoUnmount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DrawingToolbar from '../DrawingToolbar.vue';
enableAutoUnmount(afterEach);
describe('canvas drawing confirmation', () => {
  it('shows the actual tool instructions, an Enter hint and a confirmation button', async () => {
    const wrapper = mount(DrawingToolbar, { props: { hint: 'Click to place anchors' } });
    expect(wrapper.text()).toContain('Click to place anchors');
    expect(wrapper.get('kbd').text()).toBe('↵');
    await wrapper.findAll('button')[0]!.trigger('click');
    expect(wrapper.emitted('confirm')).toHaveLength(1);
  });
  it('disables confirmation for an incomplete path', async () => {
    const wrapper = mount(DrawingToolbar, { props: { hint: '', disabled: true } });
    await wrapper.findAll('button')[0]!.trigger('click');
    expect(wrapper.emitted('confirm')).toBeUndefined();
  });
  it('allows cancellation and keeps toolbar input out of canvas raycasting', async () => {
    const wrapper = mount(DrawingToolbar, { props: { hint: 'Draw' } });
    await wrapper.get('[aria-label="Cancel · Escape"]').trigger('click');
    expect(wrapper.emitted('cancel')).toHaveLength(1);
    const event = new Event('pointerdown', { bubbles: true });
    const parent = document.createElement('div'),
      onPointer = vi.fn();
    parent.addEventListener('pointerdown', onPointer);
    parent.appendChild(wrapper.element);
    wrapper.get('[role="toolbar"]').element.dispatchEvent(event);
    expect(onPointer).not.toHaveBeenCalled();
    const onKey = vi.fn(),
      onDoubleClick = vi.fn();
    parent.addEventListener('keydown', onKey);
    parent.addEventListener('dblclick', onDoubleClick);
    await wrapper.get('[role="toolbar"]').trigger('keydown', { key: 'Enter' });
    await wrapper.get('[role="toolbar"]').trigger('dblclick');
    expect(onKey).not.toHaveBeenCalled();
    expect(onDoubleClick).not.toHaveBeenCalled();
  });
});

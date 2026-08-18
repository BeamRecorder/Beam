import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import CursorCanvasSelection from './CursorCanvasSelection.vue';

describe('CursorCanvasSelection', () => {
  it('forwards the real ResizeHandle pointer lifecycle to the canvas interaction', async () => {
    const wrapper = mount(CursorCanvasSelection, {
      props: {
        bounds: { x: 120, y: 80, width: 42, height: 24, hotspot: { x: 132, y: 94 } },
        resizing: false,
        isAtLimit: false,
      },
    });
    const handle = wrapper.get('.is-top-left');

    // The selection shell and its actual resize target must remain hit-testable.
    expect(getComputedStyle(handle.element).pointerEvents).toBe('auto');

    await handle.trigger('pointerdown', { pointerId: 7, clientX: 120, clientY: 80 });
    await handle.trigger('pointermove', { pointerId: 7, clientX: 100, clientY: 60 });
    await handle.trigger('pointerup', { pointerId: 7, clientX: 100, clientY: 60 });

    expect(wrapper.emitted('resize-start')).toHaveLength(1);
    expect(wrapper.emitted('resize-start')?.[0]?.[0]).toBe('top-left');
    expect(wrapper.emitted('resize-start')?.[0]?.[1]).toMatchObject({ clientX: 120, clientY: 80 });
    expect(wrapper.emitted('resize-move')).toHaveLength(1);
    expect(wrapper.emitted('resize-move')?.[0]?.[0]).toMatchObject({ clientX: 100, clientY: 60 });
    expect(wrapper.emitted('resize-end')).toHaveLength(1);
  });

  it('renders the exact cursor bounds and marks the selection as resizing', () => {
    const wrapper = mount(CursorCanvasSelection, {
      props: {
        bounds: { x: 12, y: 34, width: 56, height: 78, hotspot: { x: 20, y: 50 } },
        resizing: true,
        isAtLimit: true,
      },
    });

    expect(wrapper.get('.cursor-canvas-selection').attributes('style')).toContain('left: 12px');
    expect(wrapper.get('.cursor-canvas-selection').attributes('style')).toContain('top: 34px');
    expect(wrapper.get('.cursor-canvas-selection').attributes('style')).toContain('width: 56px');
    expect(wrapper.get('.cursor-canvas-selection').attributes('style')).toContain('height: 78px');
    expect(wrapper.get('.cursor-canvas-selection').classes()).toContain('is-resizing');
    expect(wrapper.get('.is-top-left').classes()).toContain('is-at-limit');
  });

  it('shows a blocked drag state only while dragging the selection body', async () => {
    const wrapper = mount(CursorCanvasSelection, {
      props: {
        bounds: { x: 12, y: 34, width: 56, height: 78, hotspot: { x: 20, y: 50 } },
        resizing: false,
        isAtLimit: false,
      },
    });

    const selection = wrapper.get('.cursor-canvas-selection');
    const handle = wrapper.get('.is-top-left');
    Object.defineProperty(selection.element, 'setPointerCapture', { value: () => undefined });

    expect(selection.classes()).not.toContain('is-blocked-drag');
    await selection.trigger('pointerdown', { button: 0, pointerId: 9 });
    expect(selection.classes()).toContain('is-blocked-drag');
    await selection.trigger('pointerup', { pointerId: 9 });
    expect(selection.classes()).not.toContain('is-blocked-drag');

    await handle.trigger('pointerdown', { button: 0, pointerId: 10 });
    expect(selection.classes()).not.toContain('is-blocked-drag');
  });
});

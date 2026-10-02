import { defineComponent } from 'vue';
import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const capture = vi.hoisted(() => ({ setInteractive: vi.fn() }));
vi.mock('~/api/capture', () => ({ capture }));
import { useHudInteractivity } from '../useHudInteractivity';
let wrapper: ReturnType<typeof mount> | undefined;
let target: Element | null = null;
const move = () => window.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 40 }));
const create = (enabled: () => boolean = () => true) => {
  let controls!: ReturnType<typeof useHudInteractivity>;
  wrapper = mount(
    defineComponent({
      setup() {
        controls = useHudInteractivity(enabled);
        return () => null;
      },
    }),
  );
  return controls;
};
beforeEach(() => {
  vi.clearAllMocks();
  target = document.body;
  Object.defineProperty(document, 'elementFromPoint', {
    configurable: true,
    value: () => target,
  });
});
afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
});
describe('HUD native input policy', () => {
  it('classifies controls and transparent pixels without repeating native calls', () => {
    create();
    target = document.createElement('button');
    move();
    move();
    expect(capture.setInteractive.mock.calls).toEqual([[true]]);
    for (const empty of [document.body, document.documentElement, document.createElement('div'), null]) {
      target = empty;
      move();
    }
    expect(capture.setInteractive.mock.calls).toEqual([[true], [false]]);
    window.dispatchEvent(new Event('mouseleave'));
    expect(capture.setInteractive).toHaveBeenCalledTimes(2);
  });
  it('keeps the menu clickable while releasing transparent pixels and native mouseleave', () => {
    const controls = create();
    controls.togglePopover(true);
    target = document.createElement('div');
    target.className = 'popover-content';
    move();
    expect(capture.setInteractive.mock.calls).toEqual([[true]]);
    target = document.body;
    move();
    window.dispatchEvent(new Event('mouseleave'));
    controls.togglePopover(false);
    expect(capture.setInteractive.mock.calls).toEqual([[true], [false]]);
  });
  it('resumes pointer hit testing after the menu closes and supports keyboard-opened menus', () => {
    const controls = create();
    controls.togglePopover(true);
    controls.togglePopover(false);
    expect(capture.setInteractive).toHaveBeenLastCalledWith(false);
    target = document.createElement('button');
    move();
    controls.togglePopover(true);
    controls.togglePopover(false);
    expect(capture.setInteractive).toHaveBeenLastCalledWith(true);
    controls.togglePopover(true);
    target = document.body;
    move();
    controls.togglePopover(false);
    expect(capture.setInteractive).toHaveBeenLastCalledWith(false);
  });
  it('reclassifies after returning to the HUD and releases native listeners on teardown', () => {
    let enabled = false;
    const controls = create(() => enabled);
    move();
    expect(capture.setInteractive).not.toHaveBeenCalled();
    enabled = true;
    move();
    expect(capture.setInteractive).toHaveBeenCalledOnce();
    controls.reset();
    move();
    expect(capture.setInteractive).toHaveBeenCalledTimes(2);
    wrapper?.unmount();
    wrapper = undefined;
    target = document.createElement('button');
    move();
    window.dispatchEvent(new Event('mouseleave'));
    expect(capture.setInteractive).toHaveBeenCalledTimes(2);
  });
});

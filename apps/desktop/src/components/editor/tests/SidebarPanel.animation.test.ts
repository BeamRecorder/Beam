import { enableAutoUnmount, mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SidebarPanel from '../sidebar/SidebarPanel.vue';
import SelectionIndicator from '~/ui/transitions/SelectionIndicator.vue';
import ButtonGroup from '~/ui/button/ButtonGroup.vue';

vi.mock('~/api/capture', () => ({ capture: {} }));
enableAutoUnmount(afterEach);
const callbacks: ResizeObserverCallback[] = [];
const disconnect = vi.fn();
const UpdateAvailableBadge = { template: '<span />' };
const rect = (left: number, top: number, width: number, height: number): DOMRect => ({
  x: left,
  y: top,
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
  toJSON: () => ({}),
});

beforeEach(() => {
  callbacks.length = 0;
  disconnect.mockClear();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: ResizeObserverCallback) {
        callbacks.push(callback);
      }
      observe() {}
      disconnect = disconnect;
    },
  );
});
afterEach(() => vi.unstubAllGlobals());

const fixture = async (activeTab = 'canvas') => {
  const wrapper = mount(SidebarPanel, {
    props: { activeTab },
    global: { stubs: { UpdateAvailableBadge } },
  });
  const sidebar = wrapper.get('.sidebar-island').element as HTMLElement;
  let sidebarBounds = rect(100, 50, 92, 500);
  let viewportBounds = rect(106, 50, 80, 440);
  const positions = new Map<string, DOMRect>();
  let menuTop = 50;
  for (const button of wrapper.findAll<HTMLButtonElement>('.nav-btn')) {
    const name = button.attributes('aria-label')!;
    if (name === 'Zoom') menuTop += 13;
    positions.set(name, rect(106, name === 'Settings' ? 502 : menuTop, 80, 48));
    menuTop += 52;
    vi.spyOn(button.element, 'getBoundingClientRect').mockImplementation(() => positions.get(name)!);
  }
  vi.spyOn(sidebar, 'getBoundingClientRect').mockImplementation(() => sidebarBounds);
  vi.spyOn(wrapper.get('.sidebar-viewport').element, 'getBoundingClientRect').mockImplementation(() => viewportBounds);
  Object.defineProperties(sidebar, {
    offsetWidth: { configurable: true, value: 92 },
    offsetHeight: { configurable: true, value: 500 },
    clientWidth: { configurable: true, value: 92 },
    clientHeight: { configurable: true, value: 500 },
  });
  await nextTick();
  await nextTick();
  const resize = async () => {
    callbacks.forEach((callback) => callback([], {} as ResizeObserver));
    await nextTick();
  };
  return {
    wrapper,
    sidebar,
    positions,
    resize,
    setSidebar: (value: DOMRect) => {
      sidebarBounds = value;
    },
    setViewport: (value: DOMRect) => {
      viewportBounds = value;
    },
  };
};

describe('sidebar sliding selection', () => {
  it('positions its first selection without a startup slide and shares button-group motion', async () => {
    const f = await fixture();
    const indicator = f.wrapper.get('.sidebar-selection');
    expect(indicator.attributes('aria-hidden')).toBe('true');
    expect(indicator.classes()).toContain('is-instant');
    expect(indicator.attributes('style')).toContain('translate3d(6px, 0px, 0)');
    expect(indicator.attributes('style')).toContain('width: 80px');
    expect(indicator.attributes('style')).toContain('height: 48px');
    expect(f.wrapper.findComponent(SelectionIndicator).exists()).toBe(true);
    const group = mount(ButtonGroup, {
      props: { selection: { index: 0, count: 2 } },
    });
    expect(group.findComponent(SelectionIndicator).exists()).toBe(true);
  });

  it('moves one persistent indicator across rapid selections and the Settings footer', async () => {
    const f = await fixture();
    const indicator = f.wrapper.get('.sidebar-selection').element;
    for (const [tab, label, y] of [
      ['zoom', 'Zoom', 117],
      ['audio', 'Audio', 273],
      ['settings', 'Settings', 452],
      ['canvas', 'Canvas', 0],
    ] as const) {
      await f.wrapper.setProps({ activeTab: tab });
      expect(f.wrapper.get('.sidebar-selection').element).toBe(indicator);
      expect(f.wrapper.get('.sidebar-selection').attributes('style')).toContain(`translate3d(6px, ${y}px, 0)`);
      expect(f.wrapper.get('.sidebar-selection').classes()).not.toContain('is-instant');
      expect(f.wrapper.get('.nav-btn.active').attributes('aria-label')).toBe(label);
    }
    await f.wrapper.get('.footer-btn').trigger('click');
    expect(f.wrapper.emitted('select-tab')).toEqual([['settings']]);
  });

  it('keeps the selected background while closing the properties panel', async () => {
    const f = await fixture('zoom');
    const indicator = f.wrapper.get('.sidebar-selection').element;
    await f.wrapper.setProps({ panelOpen: false });
    expect(f.wrapper.get('.sidebar-selection').element).toBe(indicator);
    expect(f.wrapper.get('.nav-btn.active').attributes('aria-expanded')).toBe('false');
  });

  it('snaps during scroll, clips partial selections and hides selections outside the viewport', async () => {
    const f = await fixture('zoom');
    f.positions.set('Zoom', rect(106, 30, 80, 48));
    await f.wrapper.get('.sidebar-viewport').trigger('scroll');
    expect(f.wrapper.get('.sidebar-selection').classes()).toContain('is-instant');
    expect(f.wrapper.get('.sidebar-selection').attributes('style')).toContain('inset(20px 0px 0px 0px)');
    f.positions.set('Zoom', rect(106, 470, 80, 48));
    await f.wrapper.get('.sidebar-viewport').trigger('scroll');
    expect(f.wrapper.get('.sidebar-selection').attributes('style')).toContain('inset(0px 0px 28px 0px)');
    f.positions.set('Zoom', rect(106, 500, 80, 48));
    await f.wrapper.get('.sidebar-viewport').trigger('scroll');
    expect(f.wrapper.find('.sidebar-selection').exists()).toBe(false);
    f.positions.set('Zoom', rect(106, 100, 80, 48));
    await f.wrapper.get('.sidebar-viewport').trigger('scroll');
    expect(f.wrapper.get('.sidebar-selection').classes()).toContain('is-instant');
  });

  it('converts rendered bounds back to sidebar coordinates when an ancestor is scaled', async () => {
    const f = await fixture();
    f.setSidebar(rect(100, 50, 184, 1000));
    f.setViewport(rect(112, 50, 160, 880));
    f.positions.set('Canvas', rect(112, 70, 160, 96));
    await f.resize();
    const style = f.wrapper.get('.sidebar-selection').attributes('style');
    expect(style).toContain('translate3d(6px, 10px, 0)');
    expect(style).toContain('width: 80px');
    expect(style).toContain('height: 48px');
    expect(f.wrapper.get('.sidebar-selection').classes()).toContain('is-instant');
    f.wrapper.unmount();
    expect(disconnect).toHaveBeenCalled();
  });

  it.each(['unknown', 'empty-items'])('omits an indicator when there is no selected menu item: %s', async (state) => {
    const f = await fixture();
    await f.wrapper.setProps(state === 'unknown' ? { activeTab: 'unknown' } : { items: [] });
    expect(f.wrapper.find('.sidebar-selection').exists()).toBe(false);
    await f.wrapper.setProps({ activeTab: 'settings' });
    expect(f.wrapper.get('.sidebar-selection').classes()).toContain('is-instant');
  });

  it.each(['root-width', 'root-height', 'bounds-width', 'bounds-height', 'button-width', 'button-height'])(
    'waits for measurable layout: %s',
    async (dimension) => {
      const f = await fixture();
      if (dimension === 'root-width') Object.defineProperty(f.sidebar, 'offsetWidth', { value: 0 });
      if (dimension === 'root-height') Object.defineProperty(f.sidebar, 'offsetHeight', { value: 0 });
      if (dimension === 'bounds-width') f.setSidebar(rect(100, 50, 0, 500));
      if (dimension === 'bounds-height') f.setSidebar(rect(100, 50, 92, 0));
      if (dimension === 'button-width') f.positions.set('Canvas', rect(106, 50, 0, 48));
      if (dimension === 'button-height') f.positions.set('Canvas', rect(106, 50, 80, 0));
      await f.resize();
      expect(f.wrapper.find('.sidebar-selection').exists()).toBe(false);
    },
  );

  it('measures supplied screenshot items after their order changes', async () => {
    const f = await fixture();
    const item = {
      id: 'image',
      label: 'Image',
      icon: { template: '<span />' },
    };
    await f.wrapper.setProps({ items: [item], activeTab: 'image' });
    const image = f.wrapper.get<HTMLButtonElement>('[aria-label="Image"]');
    vi.spyOn(image.element, 'getBoundingClientRect').mockReturnValue(rect(106, 120, 80, 48));
    await f.wrapper.setProps({
      items: [{ id: 'canvas', label: 'Canvas', icon: item.icon }, item],
    });
    expect(f.wrapper.get('.sidebar-selection').attributes('style')).toContain('translate3d(6px, 70px, 0)');
    expect(f.wrapper.get('.sidebar-selection').classes()).toContain('is-instant');
  });
});

import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PopoverMenuList from './PopoverMenuList.vue';
import { Mic } from '@lucide/vue';
import type { PopoverMenuItem } from './popover-menu-types';

interface MenuGeometry {
  viewportHeight: number;
  viewportWidth?: number;
  anchorLeft: number;
  anchorTop: number;
  anchorWidth: number;
  anchorHeight: number;
  anchorOffsetHeight: number;
  panelTop: number;
  panelHeight: number;
}

const items: readonly PopoverMenuItem[] = [
  {
    id: 'elements',
    label: 'Elements',
    children: [
      { id: 'shape', label: 'Shape' },
      { id: 'arrow', label: 'Arrow' },
      { id: 'text', label: 'Text' },
    ],
  },
];
const wrappers: VueWrapper[] = [];

const mountMenu = () => {
  const wrapper = mount(PopoverMenuList, {
    attachTo: document.body,
    props: { items },
  });
  wrappers.push(wrapper);
  return wrapper;
};

const setGeometry = (anchor: HTMLElement, geometry: MenuGeometry) => {
  vi.stubGlobal('innerHeight', geometry.viewportHeight);
  vi.stubGlobal('innerWidth', geometry.viewportWidth ?? 1_024);
  Object.defineProperty(anchor, 'offsetHeight', {
    configurable: true,
    value: geometry.anchorOffsetHeight,
  });
  const anchorRect = new DOMRect(geometry.anchorLeft, geometry.anchorTop, geometry.anchorWidth, geometry.anchorHeight);
  const panelRect = new DOMRect(0, geometry.panelTop, 180, geometry.panelHeight);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.classList.contains('submenu-panel')) return panelRect;
    if (this.classList.contains('menu-item')) return anchorRect;
    return new DOMRect();
  });
};

const parentItem = (wrapper: VueWrapper) => wrapper.get('.menu-content > .menu-entry > .menu-item');

const openByHover = async (wrapper: VueWrapper, geometry: MenuGeometry) => {
  const parent = parentItem(wrapper);
  setGeometry(parent.element as HTMLButtonElement, geometry);
  await parent.trigger('mouseenter');
  await flushPromises();
  return wrapper.get('.submenu-panel').element as HTMLElement;
};

beforeEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) {
    wrapper.unmount();
    wrapper.element.remove();
  }
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('PopoverMenuList choices', () => {
  it.each([true, false, undefined])(
    'renders checked=%s with a separate selection slot and preserves action icons',
    (checked) => {
      const wrapper = mount(PopoverMenuList, {
        props: { items: [{ id: 'mic', label: 'Microphone', icon: Mic, checked }] },
      });
      wrappers.push(wrapper);
      const button = wrapper.get('button');
      expect(button.attributes('role')).toBe(checked === undefined ? 'menuitem' : 'menuitemradio');
      expect(button.attributes('aria-checked')).toBe(checked === undefined ? undefined : String(checked));
      expect(button.find('.item-icon-wrapper .lucide-mic').exists()).toBe(true);
      expect(button.find('.item-check-wrapper').exists()).toBe(checked !== undefined);
      expect(button.find('.item-check-wrapper .lucide-check').exists()).toBe(checked === true);
    },
  );
  it('skips disabled choices during keyboard navigation and cannot activate them', async () => {
    const wrapper = mount(PopoverMenuList, {
      attachTo: document.body,
      props: {
        items: [
          { id: 'off', label: 'Off', checked: false },
          { id: 'unavailable', label: 'Unavailable', checked: false, disabled: true },
          { id: 'mic', label: 'Microphone', checked: true },
        ],
      },
    });
    wrappers.push(wrapper);
    const buttons = wrapper.findAll('button');
    await buttons[0].trigger('keydown', { key: 'ArrowDown' });
    expect(document.activeElement).toBe(buttons[2].element);
    await buttons[2].trigger('keydown', { key: 'ArrowDown' });
    expect(document.activeElement).toBe(buttons[0].element);
    buttons[1].element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(wrapper.emitted('select')).toBeUndefined();
    await buttons[0].trigger('click');
    expect(wrapper.emitted('select')).toEqual([['off']]);
  });
  it('toggles nested choices and dismisses the whole menu from a child', async () => {
    const wrapper = mountMenu();
    const parent = parentItem(wrapper);
    await parent.trigger('click');
    await flushPromises();
    expect(wrapper.find('.submenu-panel').exists()).toBe(true);
    await parent.trigger('click');
    expect(wrapper.find('.submenu-panel').exists()).toBe(false);
    await parent.trigger('click');
    await flushPromises();
    await wrapper.get('.submenu-panel button').trigger('keydown', { key: 'Escape' });
    expect(wrapper.emitted('dismiss')).toHaveLength(1);
  });
});

describe('PopoverMenuList submenu placement', () => {
  it('keeps the default offset when the submenu fits inside the viewport', async () => {
    const wrapper = mountMenu();
    const panel = await openByHover(wrapper, {
      viewportHeight: 600,
      anchorLeft: 20,
      anchorTop: 120,
      anchorWidth: 170,
      anchorHeight: 28,
      anchorOffsetHeight: 28,
      panelTop: 116,
      panelHeight: 120,
    });

    expect(panel.style.top).toBe('-4px');
    expect(panel.style.maxHeight).toBe('584px');
    expect(panel.style.overflowY).toBe('visible');
  });

  it('moves a submenu above a bottom overflow while preserving its horizontal side', async () => {
    const wrapper = mountMenu();
    const panel = await openByHover(wrapper, {
      viewportHeight: 700,
      viewportWidth: 200,
      anchorLeft: 20,
      anchorTop: 650,
      anchorWidth: 170,
      anchorHeight: 30,
      anchorOffsetHeight: 30,
      panelTop: 646,
      panelHeight: 120,
    });

    expect(panel.style.top).toBe('-78px');
    expect(panel.style.maxHeight).toBe('684px');
    expect(panel.style.overflowY).toBe('visible');
    expect(panel.classList).toContain('opens-left');
  });

  it('moves a submenu down when it would cross the top viewport margin', async () => {
    const wrapper = mountMenu();
    const panel = await openByHover(wrapper, {
      viewportHeight: 500,
      anchorLeft: 20,
      anchorTop: 4,
      anchorWidth: 170,
      anchorHeight: 28,
      anchorOffsetHeight: 28,
      panelTop: 0,
      panelHeight: 120,
    });

    expect(panel.style.top).toBe('4px');
    expect(panel.style.maxHeight).toBe('484px');
    expect(panel.style.overflowY).toBe('visible');
  });

  it('scales the shift and enables scrolling for a submenu taller than the viewport', async () => {
    const wrapper = mountMenu();
    const parent = parentItem(wrapper);
    setGeometry(parent.element as HTMLButtonElement, {
      viewportHeight: 200,
      anchorLeft: 20,
      anchorTop: 100,
      anchorWidth: 170,
      anchorHeight: 28,
      anchorOffsetHeight: 14,
      panelTop: 96,
      panelHeight: 300,
    });

    await parent.trigger('keydown', { key: 'ArrowRight' });
    await flushPromises();

    const panel = wrapper.get('.submenu-panel').element as HTMLElement;
    const firstChild = panel.querySelector<HTMLButtonElement>(':scope > .menu-entry > .menu-item');
    expect(panel.style.top).toBe('-48px');
    expect(panel.style.maxHeight).toBe('92px');
    expect(panel.style.overflowY).toBe('auto');
    expect(document.activeElement).toBe(firstChild);
  });
});

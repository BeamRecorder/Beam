import { flushPromises, mount, enableAutoUnmount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setCurrentLocale } from '~/i18n';
import VideoProjectEdition from '../VideoProjectEdition.vue';

vi.mock('~/api/capture', () => ({ capture: {} }));
vi.mock('../../projects/ProjectPicker.vue', () => ({
  __esModule: true,
  default: {
    name: 'ProjectPicker',
    props: { compact: Boolean, currentProjectId: String, active: Boolean },
    emits: ['select-project', 'open-project', 'rename-project', 'delete-project'],
    template: '<div class="project-picker-stub" />',
  },
}));
enableAutoUnmount(afterEach);
afterEach(() => vi.unstubAllGlobals());

const ProjectPicker = {
  name: 'ProjectPicker',
  props: { compact: Boolean, currentProjectId: String, active: Boolean },
  emits: ['select-project', 'open-project', 'rename-project', 'delete-project'],
  template: '<div class="project-picker-stub" />',
};
const current = {
  id: 'current',
  name: 'Current project',
  mode: 'studio' as const,
};
const next = { id: 'next', name: 'Next project' };
const mountSwitcher = (props = {}, teleport = true) =>
  mount(VideoProjectEdition, {
    attachTo: document.body,
    props: { project: current, ...props },
    global: { stubs: { teleport } },
  });

describe('VideoProjectEdition', () => {
  it('opens a centered attached picker and forwards a different project selection', async () => {
    const wrapper = mountSwitcher({ isSaving: true });
    const trigger = wrapper.get('.project-name-button');
    expect(wrapper.get('.project-title').text()).toBe('Current project');
    expect(wrapper.find('.save-spinner').exists()).toBe(true);
    expect(trigger.attributes('aria-haspopup')).toBe('dialog');
    expect(trigger.attributes('style')).toContain('border: 0px');
    await trigger.trigger('click');
    await flushPromises();
    expect(trigger.attributes('aria-expanded')).toBe('true');
    expect(wrapper.get('.popover-content').classes()).toContain('popover-attached');
    const panel = wrapper.get('.project-menu-panel');
    expect(panel.attributes('id')).toBe(trigger.attributes('aria-controls'));
    expect(panel.attributes('role')).toBe('dialog');
    expect(wrapper.findComponent(ProjectPicker).props()).toMatchObject({
      compact: true,
      currentProjectId: 'current',
    });
    wrapper.findComponent(ProjectPicker).vm.$emit('select-project', next);
    await flushPromises();
    expect(wrapper.emitted('open-project')).toEqual([[next]]);
    expect(wrapper.get('.project-menu-panel').isVisible()).toBe(false);
  });

  it.each(['select-project', 'open-project'])(
    'closes %s of the current project without reopening it',
    async (event) => {
      const wrapper = mountSwitcher();
      await wrapper.get('.project-name-button').trigger('click');
      await flushPromises();
      wrapper.findComponent(ProjectPicker).vm.$emit(event, current);
      await flushPromises();
      expect(wrapper.emitted('open-project')).toBeUndefined();
      expect(wrapper.get('.project-name-button').attributes('aria-expanded')).toBe('false');
    },
  );

  it('forwards open, rename and delete while updating the current title', async () => {
    const wrapper = mountSwitcher();
    await wrapper.get('.project-name-button').trigger('click');
    await flushPromises();
    const child = wrapper.findComponent(ProjectPicker);
    child.vm.$emit('rename-project', { ...current, name: 'Renamed' });
    await flushPromises();
    expect(wrapper.get('.project-title').text()).toBe('Renamed');
    wrapper.findComponent(ProjectPicker).vm.$emit('rename-project', { ...next, name: 'Other' });
    await flushPromises();
    expect(wrapper.get('.project-title').text()).toBe('Renamed');
    expect(wrapper.emitted('rename-project')).toHaveLength(2);
    wrapper.findComponent(ProjectPicker).vm.$emit('delete-project', next);
    expect(wrapper.emitted('delete-project')).toEqual([[next]]);
    wrapper.findComponent(ProjectPicker).vm.$emit('open-project', next);
    await flushPromises();
    expect(wrapper.emitted('open-project')).toEqual([[next]]);
    await wrapper.setProps({
      project: { ...current, name: 'Updated externally' },
      isSaving: false,
    });
    expect(wrapper.get('.project-title').text()).toBe('Updated externally');
    expect(wrapper.find('.save-spinner').exists()).toBe(false);
  });

  it('focuses the panel after keyboard activation and returns focus on Escape', async () => {
    const wrapper = mountSwitcher();
    wrapper.get('.project-name-button').element.dispatchEvent(new MouseEvent('click', { detail: 0, bubbles: true }));
    await flushPromises();
    expect(document.activeElement).toBe(wrapper.get('.project-menu-panel').element);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await flushPromises();
    expect(wrapper.find('.project-menu-panel').exists()).toBe(true);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
    await flushPromises();
    expect(wrapper.get('.project-menu-panel').isVisible()).toBe(false);
    expect(document.activeElement).toBe(wrapper.get('.project-name-button').element);
  });

  it('keeps pointer activation in place and closes on an outside pointer', async () => {
    const wrapper = mountSwitcher();
    const trigger = wrapper.get('.project-name-button').element as HTMLButtonElement;
    trigger.focus();
    trigger.dispatchEvent(new MouseEvent('pointerdown', { button: 0, bubbles: true }));
    trigger.dispatchEvent(new MouseEvent('click', { detail: 1, bubbles: true }));
    await flushPromises();
    expect(document.activeElement).toBe(trigger);
    window.dispatchEvent(new Event('blur'));
    await flushPromises();
    expect(wrapper.find('.project-menu-panel').exists()).toBe(true);
    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    await flushPromises();
    expect(wrapper.get('.project-menu-panel').isVisible()).toBe(false);
  });

  it('keeps owned dialogs and popovers open without swallowing their Escape', async () => {
    const wrapper = mountSwitcher();
    await wrapper.get('.project-name-button').trigger('click');
    const owner = wrapper.get('.popover-content').attributes('data-popover-id');
    for (const className of ['popover-content', 'dialog-overlay']) {
      const child = document.createElement('div');
      child.className = className;
      child.setAttribute('data-popover-owner', owner!);
      document.body.appendChild(child);
      child.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
      child.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await flushPromises();
      expect(wrapper.find('.project-menu-panel').exists()).toBe(true);
      child.remove();
    }
    const handled = new KeyboardEvent('keydown', {
      key: 'Escape',
      cancelable: true,
    });
    handled.preventDefault();
    window.dispatchEvent(handled);
    await flushPromises();
    expect(wrapper.find('.project-menu-panel').exists()).toBe(true);
  });

  it('does not open while disabled and closes when disabled during browsing', async () => {
    const wrapper = mountSwitcher({ disabled: true });
    await wrapper.get('.project-name-button').trigger('click');
    expect(wrapper.find('.project-menu-panel').exists()).toBe(false);
    await wrapper.setProps({ disabled: false });
    await wrapper.get('.project-name-button').trigger('click');
    expect(wrapper.find('.project-menu-panel').exists()).toBe(true);
    await wrapper.setProps({ disabled: true });
    await flushPromises();
    expect(wrapper.get('.project-menu-panel').isVisible()).toBe(false);
  });

  it.each([
    { headerBottom: 40, triggerBottom: 28, gap: 12 },
    { headerBottom: 50, triggerBottom: 44, gap: 6 },
    { headerBottom: 40, triggerBottom: 44, gap: 0 },
  ])('attaches the panel to the titlebar with gap $gap', async ({ headerBottom, triggerBottom, gap }) => {
    const header = document.createElement('header');
    document.body.appendChild(header);
    const bounds = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      return new DOMRect(0, 0, 240, this.tagName === 'HEADER' ? headerBottom : triggerBottom);
    });
    const wrapper = mount(VideoProjectEdition, {
      attachTo: header,
      global: { stubs: { teleport: true } },
    });
    try {
      await wrapper.get('.project-name-button').trigger('click');
      await flushPromises();
      expect(wrapper.findComponent({ name: 'Popover' }).props('gap')).toBe(gap);
    } finally {
      wrapper.unmount();
      bounds.mockRestore();
      header.remove();
    }
  });

  it('uses the translated untitled fallback', async () => {
    const wrapper = mountSwitcher({ project: null });
    expect(wrapper.get('.project-title').text()).toBe('Untitled project');
    await setCurrentLocale('fr');
    expect(wrapper.get('.project-title').text()).toBe('Projet sans titre');
    await setCurrentLocale('en');
  });

  it.each([true, false])('observes titlebar geometry when a header exists: %s', async (inHeader) => {
    const observe = vi.fn();
    const disconnect = vi.fn();
    const registrations: Array<{ target: Element; callback: () => void }> = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        private callback: () => void;
        constructor(callback: () => void) {
          this.callback = callback;
        }
        observe = (target: Element) => {
          observe(target);
          registrations.push({ target, callback: this.callback });
        };
        disconnect = disconnect;
      },
    );
    const host = document.createElement(inHeader ? 'header' : 'div');
    document.body.append(host);
    const wrapper = mount(VideoProjectEdition, { attachTo: host, global: { stubs: { teleport: true } } });
    if (inHeader) expect(observe).toHaveBeenCalledWith(host);
    expect(observe).toHaveBeenCalledWith(wrapper.element.parentElement);
    const titlebarCallback = registrations.find(({ target }) => target === wrapper.element.parentElement)!.callback;
    const bounds = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      return new DOMRect(0, 0, 200, this.tagName === 'HEADER' ? 50 : 30);
    });
    titlebarCallback();
    await flushPromises();
    expect(wrapper.getComponent({ name: 'Popover' }).props('gap')).toBe(inHeader ? 20 : 4);
    wrapper.unmount();
    expect(disconnect).toHaveBeenCalled();
    bounds.mockRestore();
    host.remove();
  });

  it('preloads picker code on pointer hover without mounting or opening the menu', async () => {
    const wrapper = mountSwitcher();
    await wrapper.get('.project-switcher').trigger('pointerenter');
    await flushPromises();
    expect(wrapper.findComponent(ProjectPicker).exists()).toBe(false);
    expect(wrapper.get('.project-name-button').attributes('aria-expanded')).toBe('false');
  });

  it('mounts lazily and retains the same picker, suspending it between openings', async () => {
    const wrapper = mountSwitcher({}, false);
    expect(wrapper.findComponent(ProjectPicker).exists()).toBe(false);
    await wrapper.get('.project-name-button').trigger('click');
    await flushPromises();
    const child = wrapper.getComponent(ProjectPicker);
    expect(child.props('active')).toBe(true);
    expect(wrapper.getComponent({ name: 'Popover' }).props('motion')).toBe('lift');
    await wrapper.get('.project-name-button').trigger('click');
    await flushPromises();
    expect(child.props('active')).toBe(false);
    expect(document.querySelector<HTMLElement>('.project-menu-panel')?.parentElement?.style.display).toBe('none');
    await wrapper.get('.project-name-button').trigger('click');
    await flushPromises();
    expect(wrapper.getComponent(ProjectPicker).vm).toBe(child.vm);
    expect(child.props('active')).toBe(true);
  });
});

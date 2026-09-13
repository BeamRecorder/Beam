import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { Check } from '@lucide/vue';
import PopoverMenuButton from './PopoverMenuButton.vue';

describe('PopoverMenuButton', () => {
  it('opens, renders item states and emits the selected item', async () => {
    const wrapper = mount(PopoverMenuButton, {
      attachTo: document.body,
      props: {
        label: 'Quality',
        ariaLabel: 'Select quality',
        icon: Check,
        transparent: true,
        items: [
          { id: 'high', label: 'High', active: true, icon: Check },
          { id: 'low', label: 'Low', disabled: true },
        ],
      },
    });
    await wrapper.get('.menu-button').trigger('click');
    expect(wrapper.get('.menu-button').classes()).toContain('is-open');
    expect(wrapper.get('.menu-button').classes()).toContain('transparent');
    expect(wrapper.get('.menu-button').attributes('aria-label')).toBe('Select quality');
    expect(document.body.querySelectorAll('.menu-item')).toHaveLength(2);
    expect(document.body.querySelector('.menu-item.active')).not.toBeNull();
    await document.body.querySelector<HTMLButtonElement>('.menu-item:not(:disabled)')?.click();
    expect(wrapper.emitted('select')).toEqual([['high']]);
    wrapper.unmount();
  });

  it('supports nested parents, hover/click opening, chevrons, and leaf selection', async () => {
    const wrapper = mount(PopoverMenuButton, {
      attachTo: document.body,
      props: {
        label: 'Add',
        items: [
          {
            id: 'media',
            label: 'Media',
            children: [
              { id: 'video', label: 'Video' },
              { id: 'image', label: 'Image' },
            ],
          },
          {
            id: 'audio',
            label: 'Audio',
            children: [{ id: 'voiceover', label: 'Voice-over' }],
          },
        ],
      },
    });

    await wrapper.get('.menu-button').trigger('click');
    const parents = document.body.querySelectorAll<HTMLButtonElement>('.menu-content > .menu-entry > .menu-item');
    expect(parents).toHaveLength(2);
    expect(parents[0]?.getAttribute('aria-haspopup')).toBe('menu');
    expect(parents[0]?.getAttribute('aria-expanded')).toBe('false');
    expect(parents[0]?.querySelector('.submenu-chevron')).not.toBeNull();

    parents[0]?.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    await wrapper.vm.$nextTick();
    expect(parents[0]?.getAttribute('aria-expanded')).toBe('true');
    expect(document.body.querySelector('.submenu-panel')).not.toBeNull();

    parents[1]?.click();
    await wrapper.vm.$nextTick();
    const voiceover = document.body.querySelector<HTMLButtonElement>('.submenu-panel .menu-item');
    voiceover?.click();
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('select')).toEqual([['voiceover']]);
    expect(document.body.querySelector('.menu-content')).toBeNull();
    wrapper.unmount();
  });

  it('supports arrow navigation, Home/End, parent traversal, and Escape', async () => {
    const wrapper = mount(PopoverMenuButton, {
      attachTo: document.body,
      props: {
        label: 'Add',
        items: [
          {
            id: 'media',
            label: 'Media',
            children: [
              { id: 'video', label: 'Video' },
              { id: 'image', label: 'Image' },
            ],
          },
          { id: 'caption', label: 'Text' },
          { id: 'audio', label: 'Audio', children: [{ id: 'sound', label: 'Sound' }] },
        ],
      },
    });

    await wrapper.get('.menu-button').trigger('click');
    const topLevel = () =>
      document.body.querySelectorAll<HTMLButtonElement>('.menu-content:not(.submenu-panel) > .menu-entry > .menu-item');
    const media = topLevel()[0]!;
    const text = topLevel()[1]!;
    const audio = topLevel()[2]!;
    media.focus();

    media.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(text);
    text.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(document.activeElement).toBe(media);
    media.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(document.activeElement).toBe(audio);
    audio.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    expect(document.activeElement).toBe(media);

    media.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await wrapper.vm.$nextTick();
    const submenuItems = document.body.querySelectorAll<HTMLButtonElement>('.submenu-panel .menu-item');
    expect(submenuItems).toHaveLength(2);
    expect(document.activeElement).toBe(submenuItems[0]);

    submenuItems[0]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(submenuItems[1]);
    submenuItems[1]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(document.activeElement).toBe(submenuItems[0]);
    submenuItems[0]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    await wrapper.vm.$nextTick();
    expect(document.body.querySelector('.submenu-panel')).toBeNull();
    expect(document.activeElement).toBe(media);

    media.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await wrapper.vm.$nextTick();
    expect(document.body.querySelector('.menu-content')).toBeNull();
    expect(document.activeElement).toBe(wrapper.get('.menu-button').element);
    wrapper.unmount();
  });

  it('supports disabled trigger and label fallback', () => {
    const wrapper = mount(PopoverMenuButton, { props: { label: 'Mode', items: [], disabled: true } });
    expect(wrapper.get('.menu-button').attributes('disabled')).toBeDefined();
    expect(wrapper.get('.menu-button').attributes('aria-label')).toBe('Mode');
  });

  it('supports a flat block trigger with an upward chevron', () => {
    const wrapper = mount(PopoverMenuButton, {
      props: { label: 'Add', items: [], bare: true, block: true, direction: 'up' },
    });

    expect(wrapper.get('.menu-button').classes()).toEqual(expect.arrayContaining(['bare', 'block']));
    expect(wrapper.get('.menu-button-chevron').classes()).toContain('lucide-chevron-up');
  });
});

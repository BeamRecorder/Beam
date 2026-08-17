import { TextEncoder as NodeTextEncoder } from 'node:util';
import { mount } from '@vue/test-utils';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

class JsdomTextEncoder {
  encode(input = ''): Uint8Array {
    return Uint8Array.from(new NodeTextEncoder().encode(input));
  }
}

vi.stubGlobal('TextEncoder', JsdomTextEncoder);
vi.mock('vitepress', () => ({
  withBase: (path: string) => `/docs${path}`,
}));

let DocsScreenshot: typeof import('./DocsScreenshot.vue').default;

const mountScreenshot = (props: { path: string; alt: string; caption?: string; aspectRatio?: string }) =>
  mount(DocsScreenshot, { props });

beforeAll(async () => {
  DocsScreenshot = (await import('./DocsScreenshot.vue')).default;
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('DocsScreenshot', () => {
  it('renders an accessible pending state until the screenshot loads', () => {
    const wrapper = mountScreenshot({ path: 'recorder/hud.webp', alt: 'Beam recorder HUD' });
    const image = wrapper.get('img');

    expect(image.attributes('src')).toMatch(/\/screenshots\/recorder\/hud\.webp$/);
    expect(image.attributes('alt')).toBe('Beam recorder HUD');
    expect(wrapper.get('[role="status"]').text()).toContain('Screenshot pending');
    expect(wrapper.get('code').text()).toBe('website/docs/public/screenshots/recorder/hud.webp');
    expect(wrapper.find('figcaption').exists()).toBe(false);
  });

  it('reveals the image and caption after a successful load', async () => {
    const wrapper = mountScreenshot({
      path: 'editor/timeline.webp',
      alt: 'Beam editor timeline',
      caption: 'The timeline keeps every track aligned.',
      aspectRatio: '4 / 3',
    });

    await wrapper.get('img').trigger('load');

    expect(wrapper.get('img').classes()).toContain('is-loaded');
    expect(wrapper.find('[role="status"]').exists()).toBe(false);
    expect(wrapper.get('figcaption').text()).toBe('The timeline keeps every track aligned.');
    expect(wrapper.get('.docs-screenshot__frame').attributes('style')).toContain('aspect-ratio: 4 / 3');
  });

  it('returns to the explicit missing-image state after a load error', async () => {
    const wrapper = mountScreenshot({ path: 'editor/missing.webp', alt: 'Missing editor screenshot' });

    await wrapper.get('img').trigger('load');
    expect(wrapper.find('[role="status"]').exists()).toBe(false);

    await wrapper.get('img').trigger('error');

    expect(wrapper.get('[role="status"]').text()).toContain('Screenshot pending');
    expect(wrapper.get('code').text()).toBe('website/docs/public/screenshots/editor/missing.webp');
    expect(wrapper.get('img').classes()).not.toContain('is-loaded');
  });

  it('resets loading state and expected path when the route changes screenshots', async () => {
    const wrapper = mountScreenshot({ path: 'recorder/old.webp', alt: 'Old screenshot' });
    await wrapper.get('img').trigger('load');
    expect(wrapper.get('img').classes()).toContain('is-loaded');

    await wrapper.setProps({ path: 'editor/new.webp', alt: 'New screenshot' });

    expect(wrapper.get('img').attributes('src')).toMatch(/\/screenshots\/editor\/new\.webp$/);
    expect(wrapper.get('img').attributes('alt')).toBe('New screenshot');
    expect(wrapper.get('img').classes()).not.toContain('is-loaded');
    expect(wrapper.get('code').text()).toBe('website/docs/public/screenshots/editor/new.webp');
  });
});

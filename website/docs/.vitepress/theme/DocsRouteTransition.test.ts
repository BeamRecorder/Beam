import { mount, type VueWrapper } from '@vue/test-utils';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { nextTick, reactive } from 'vue';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const websiteRoot = path.basename(process.cwd()) === 'website' ? process.cwd() : path.join(process.cwd(), 'website');
const themeStylesheet = readFileSync(path.join(websiteRoot, 'docs/.vitepress/theme/theme.css'), 'utf8');

const mocked = vi.hoisted(() => ({ route: null as { path: string } | null }));
vi.mock('vitepress', () => ({
  useRoute: () => mocked.route,
}));

const route = reactive({ path: '/docs/getting-started' });
mocked.route = route;

let DocsRouteTransition: typeof import('./DocsRouteTransition.vue').default;
const mountedWrappers: VueWrapper[] = [];

const mountTransition = () => {
  const wrapper = mount(DocsRouteTransition, { attachTo: document.body });
  mountedWrappers.push(wrapper);
  return wrapper;
};

const flushRouteTransition = async () => {
  await nextTick();
  await nextTick();
};

beforeAll(async () => {
  DocsRouteTransition = (await import('./DocsRouteTransition.vue')).default;
});

beforeEach(() => {
  document.body.innerHTML = '<div class="VPDoc"><div class="container"></div></div>';
  route.path = '/docs/getting-started';
});

afterEach(() => {
  for (const wrapper of mountedWrappers) wrapper.unmount();
  mountedWrappers.length = 0;
  document.body.innerHTML = '';
});

describe('DocsRouteTransition', () => {
  it('replays the page entrance when the VitePress route changes', async () => {
    mountTransition();
    await flushRouteTransition();

    const page = document.querySelector<HTMLElement>('.VPDoc .container');
    expect(page?.classList.contains('beam-doc-page-enter')).toBe(true);

    const remove = vi.spyOn(page!.classList, 'remove');
    const add = vi.spyOn(page!.classList, 'add');
    route.path = '/docs/recording';
    await flushRouteTransition();

    expect(remove).toHaveBeenCalledWith('beam-doc-page-enter');
    expect(add).toHaveBeenCalledWith('beam-doc-page-enter');
    expect(page?.classList.contains('beam-doc-page-enter')).toBe(true);
  });

  it('replays against the newly rendered home page after navigation replaces the target node', async () => {
    mountTransition();
    await flushRouteTransition();

    document.body.innerHTML = '<div class="VPHome"></div>';
    route.path = '/docs/';
    await flushRouteTransition();

    expect(document.querySelector('.VPHome')?.classList.contains('beam-doc-page-enter')).toBe(true);
  });

  it('keeps the reduced-motion contract explicit in the theme stylesheet', () => {
    expect(themeStylesheet).toMatch(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{\s*\.beam-doc-page-enter\s*\{\s*animation:\s*none;\s*\}\s*\}/,
    );
  });

  it('defines the Beam scrollbar treatment for Firefox, WebKit, dark mode, and hover accent', () => {
    expect(themeStylesheet).toMatch(
      /html,\s*\.VPSidebar\s*\{[\s\S]*scrollbar-color:[^;]+;[\s\S]*scrollbar-width:\s*thin;/,
    );
    expect(themeStylesheet).toMatch(/::-webkit-scrollbar\s*\{[\s\S]*width:\s*6px;[\s\S]*height:\s*6px;/);
    expect(themeStylesheet).toMatch(/::-webkit-scrollbar-track\s*\{[\s\S]*background:\s*transparent;/);
    expect(themeStylesheet).toMatch(/::-webkit-scrollbar-thumb\s*\{[\s\S]*background:\s*rgba\(0,\s*0,\s*0,\s*0\.15\)/);
    expect(themeStylesheet).toMatch(
      /html\.dark,\s*html\.dark \.VPSidebar\s*\{[\s\S]*scrollbar-color:\s*rgba\(255,\s*255,\s*255,\s*0\.16\)/,
    );
    expect(themeStylesheet).toMatch(
      /html\.dark\s+::-webkit-scrollbar-thumb\s*\{[\s\S]*background:\s*rgba\(255,\s*255,\s*255,\s*0\.16\)/,
    );
    expect(themeStylesheet).toMatch(/::-webkit-scrollbar-thumb:hover\s*\{[\s\S]*background:\s*var\(--color-primary\)/);
  });
});

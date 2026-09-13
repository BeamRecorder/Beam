import { createMemoryHistory, createRouter } from 'vue-router';
import { describe, expect, it } from 'vitest';
import { routes } from './router';

describe('marketing routes', () => {
  it('contains only the marketing SSG paths', () => {
    expect(routes.map((route) => route.path)).toEqual(['/', '/faq', '/install']);
  });

  it('resolves the homepage', () => {
    const router = createRouter({ history: createMemoryHistory(), routes });
    expect(router.resolve('/').name).toBe('home');
  });

  it('resolves the FAQ with a clean URL', () => {
    const router = createRouter({ history: createMemoryHistory(), routes });
    expect(router.resolve('/faq')).toMatchObject({ name: 'faq', path: '/faq' });
  });

  it('does not claim VitePress documentation routes', () => {
    const router = createRouter({ history: createMemoryHistory(), routes });
    expect(router.resolve('/docs/').matched).toHaveLength(0);
  });

  it('resolves the install page and its platform query', () => {
    const router = createRouter({ history: createMemoryHistory(), routes });
    expect(router.resolve('/install?os=linux')).toMatchObject({
      name: 'install',
      path: '/install',
      query: { os: 'linux' },
    });
  });

  it.each([
    ['/faq', 'FaqPage'],
    ['/install', 'InstallPage'],
  ])('loads the lazy page component for %s', async (path, componentName) => {
    const route = routes.find((candidate) => candidate.path === path);
    expect(typeof route?.component).toBe('function');

    const module = await (route!.component as () => Promise<{ default: { __name?: string } }>)();

    expect(module.default.__name).toBe(componentName);
  });
});

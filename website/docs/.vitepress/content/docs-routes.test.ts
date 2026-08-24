import { describe, expect, it } from 'vitest';
import { WEBSITE_LOCALES } from '../../../src/i18n';
import type { DocsSidebarItem } from './docs-content-types';
import { createDocsRoutes, docsRoutePaths, enabledDocsLocales, getDocsCatalogs } from './docs-routes';

interface FlattenedSidebarItem {
  path: string;
  item: DocsSidebarItem;
}

const flattenSidebar = (items: readonly DocsSidebarItem[], parents: readonly string[] = []): FlattenedSidebarItem[] =>
  items.flatMap((item) => {
    const path = [...parents, item.text];
    return [{ path: path.join(' > '), item }, ...(item.items ? flattenSidebar(item.items, path) : [])];
  });

const stripLocalePrefix = (path: string, locale: string) =>
  normalizeDocsPath(locale === 'en' ? path : path.startsWith(`${locale}/`) ? path.slice(locale.length + 1) : path);

const normalizeDocsPath = (path: string) => {
  if (!path || path === '/') return '/';
  return path.replace(/\/$/, '');
};

const stripHashAndLeadingSlash = (link: string) => {
  const path = link.split('#', 1)[0]?.replace(/^\/+/, '') ?? '';
  return normalizeDocsPath(path);
};

const recorderCapabilitySlugs = [
  'recorder/capabilities/capture-sources',
  'recorder/capabilities/audio-camera',
  'recorder/capabilities/teleprompter',
  'recorder/capabilities/live-controls',
  'recorder/capabilities/preferences',
  'recorder/capabilities/project-manager',
  'recorder/capabilities/permissions-privacy',
];

const editorCapabilitySlugs = [
  'editor/capabilities/timeline',
  'editor/capabilities/canvas',
  'editor/capabilities/clips',
  'editor/capabilities/zooms',
  'editor/capabilities/cursor',
  'editor/capabilities/captions',
  'editor/capabilities/audio',
  'editor/capabilities/settings',
];

describe('documentation locale routes', () => {
  it('provides a complete docs catalogue for every website locale', () => {
    expect([...enabledDocsLocales].sort()).toEqual([...WEBSITE_LOCALES].sort());

    const englishRoutes = createDocsRoutes('en');
    const englishPaths = docsRoutePaths('en');
    const englishCanonicalPaths = new Set(englishPaths.map(normalizeDocsPath));
    for (const locale of WEBSITE_LOCALES) {
      const catalogs = getDocsCatalogs(locale);
      expect(catalogs.common.locale, `${locale} locale tag`).toMatch(/^[a-z]{2}(?:-[A-Z]{2})?$/);
      expect(catalogs.common.label.trim(), `${locale} language label`).not.toBe('');
      expect(createDocsRoutes(locale), `${locale} route count`).toHaveLength(englishRoutes.length);
      expect(docsRoutePaths(locale), `${locale} route paths`).toHaveLength(englishPaths.length);
      expect(new Set(docsRoutePaths(locale)).size, `${locale} route uniqueness`).toBe(englishPaths.length);

      const localizedPaths = docsRoutePaths(locale).map((path) => stripLocalePrefix(path, locale));
      expect(new Set(localizedPaths), `${locale} route paths`).toEqual(englishCanonicalPaths);

      if (locale !== 'en') {
        const localePages = catalogs.catalogs.flatMap((catalog) => catalog.pages);
        const englishPages = getDocsCatalogs('en').catalogs.flatMap((catalog) => catalog.pages);
        for (const slug of [...recorderCapabilitySlugs, ...editorCapabilitySlugs]) {
          const localizedPage = localePages.find((page) => page.slug === slug);
          const englishPage = englishPages.find((page) => page.slug === slug);
          expect(localizedPage, `${locale} fallback page ${slug}`).toEqual(englishPage);
        }
      }
    }
  });

  it('prefixes localized internal markdown links and route paths', () => {
    const routes = createDocsRoutes('fr');
    const gettingStarted = routes.find((route) => route.params.page === 'fr/getting-started');

    expect(gettingStarted).toBeDefined();
    expect(gettingStarted?.content).toContain('](/fr/platforms)');
    expect(gettingStarted?.content).toContain('](/fr/recorder/interface)');
    expect(gettingStarted?.content).not.toContain('](/platforms)');
    expect(docsRoutePaths('fr')).toContain('fr/recorder/interface');
  });

  it('preserves recursive nested sidebar links for the English docs navigation', () => {
    const { common } = getDocsCatalogs('en');
    const entries = common.sidebar.flatMap((group) => flattenSidebar(group.items, [group.text]));
    const routePaths = new Set(docsRoutePaths('en').map(normalizeDocsPath));

    expect(entries).not.toHaveLength(0);
    expect(entries.every(({ item }) => item.text.trim() !== '' && (item.link || item.items?.length))).toBe(true);
    const recorderCapabilityEntries = entries.filter(({ path }) => path.startsWith('Recorder app > Capabilities'));
    expect(recorderCapabilityEntries.every(({ item }) => !item.link?.includes('#'))).toBe(true);
    expect(recorderCapabilityEntries.map(({ item }) => item.link)).toEqual(
      expect.arrayContaining(['/recorder/capabilities/', ...recorderCapabilitySlugs.map((slug) => `/${slug}`)]),
    );
    const editorCapabilityEntries = entries.filter(({ path }) => path.startsWith('Video editor > Capabilities'));
    expect(editorCapabilityEntries.every(({ item }) => !item.link?.includes('#'))).toBe(true);
    expect(editorCapabilityEntries.map(({ item }) => item.link)).toEqual(
      expect.arrayContaining(['/editor/capabilities', ...editorCapabilitySlugs.map((slug) => `/${slug}`)]),
    );

    for (const { path, item } of entries) {
      if (!item.link?.startsWith('/')) continue;
      expect(routePaths, `${path} -> ${item.link}`).toContain(stripHashAndLeadingSlash(item.link));
    }

    expect(entries.find(({ path }) => path === 'Video editor > Capabilities > Export')?.item.link).toBe('/export');
  });
});

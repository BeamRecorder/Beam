import { describe, expect, it } from 'vitest';
import { WEBSITE_LOCALES } from '../../../src/i18n';
import { createDocsRoutes, docsRoutePaths, enabledDocsLocales, getDocsCatalogs } from './docs-routes';

describe('documentation locale routes', () => {
  it('provides a complete docs catalogue for every website locale', () => {
    expect([...enabledDocsLocales].sort()).toEqual([...WEBSITE_LOCALES].sort());

    const englishRoutes = createDocsRoutes('en');
    const englishPaths = docsRoutePaths('en');
    for (const locale of WEBSITE_LOCALES) {
      const catalogs = getDocsCatalogs(locale);
      expect(catalogs.common.locale, `${locale} locale tag`).toMatch(/^[a-z]{2}(?:-[A-Z]{2})?$/);
      expect(catalogs.common.label.trim(), `${locale} language label`).not.toBe('');
      expect(createDocsRoutes(locale), `${locale} route count`).toHaveLength(englishRoutes.length);
      expect(docsRoutePaths(locale), `${locale} route paths`).toHaveLength(englishPaths.length);
      expect(new Set(docsRoutePaths(locale)).size, `${locale} route uniqueness`).toBe(englishPaths.length);
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
});

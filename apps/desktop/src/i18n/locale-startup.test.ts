import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppLocale } from './types';

beforeEach(() => {
  vi.resetModules();
  localStorage.setItem('locale', 'en');
});

describe('locale initialization', () => {
  it('loads the stored language before returning the renderer plugin', async () => {
    localStorage.setItem('locale', 'fr');
    const locale = await import('./index');
    const plugin = await locale.initI18n();
    expect(plugin).toBe(locale.i18n);
    expect(locale.getCurrentLocale()).toBe('fr');
    expect(plugin.global.t('HUD.screenshot')).toBe('Capture d’écran');
    expect(document.documentElement.lang).toBe('fr');
  });

  it('keeps the latest language when two unloaded languages are selected together', async () => {
    const locale = await import('./index');
    await locale.initI18n();
    const french = locale.setCurrentLocale('fr');
    const german = locale.setCurrentLocale('de');
    expect(await french).toBe(false);
    expect(await german).toBe(true);
    expect(locale.getCurrentLocale()).toBe('de');
    expect(document.documentElement.lang).toBe('de');
    expect(localStorage.getItem('locale')).toBe('de');
    expect(locale.i18n.global.availableLocales).toContain('fr');
  });

  it('rejects an unsupported language without changing the active language', async () => {
    const locale = await import('./index');
    await locale.initI18n();
    await expect(locale.setCurrentLocale('invalid' as AppLocale)).rejects.toThrow('Unsupported locale');
    expect(locale.getCurrentLocale()).toBe('en');
    expect(document.documentElement.lang).toBe('en');
    expect(localStorage.getItem('locale')).toBe('en');
  });
});

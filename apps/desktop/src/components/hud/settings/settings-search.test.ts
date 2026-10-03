import { describe, expect, it } from 'vitest';
import { i18n, setCurrentLocale } from '~/i18n';
import { createSettingsSearch, normalizeSettingsSearch } from './settings-search';
import { settingsCategories, settingsSearchEntries } from './settings-catalog';
import type { SettingsSearchEntry } from './settings-types';

const entries: SettingsSearchEntry[] = [
  {
    id: 'theme',
    view: 'general',
    title: 'Thème',
    description: 'Choisir l’apparence',
    terms: ['Theme', 'Choose appearance'],
  },
  {
    id: 'countdown',
    view: 'recording',
    title: 'Compte à rebours',
    description: 'Délai avant le départ',
    terms: ['Countdown', 'Select delay before start'],
  },
  {
    id: 'mouse',
    view: 'accessibility',
    title: 'Mouse clicks',
    description: 'Captions and keyboard events',
    terms: [],
  },
];

describe('indexed bilingual settings search', () => {
  it.each([
    [' THÈME  ', 'theme'],
    ['déLAI\n\t avant', 'delai avant'],
    ['', ''],
    ['中文', '中文'],
  ])('normalizes %s', (input, expected) => {
    expect(normalizeSettingsSearch(input)).toBe(expected);
  });
  it('matches names and descriptions in either language without accents', () => {
    const index = createSettingsSearch(entries);
    for (const query of ['theme', 'ThÈme', 'apparence', 'appearance'])
      expect(index.search(query).map(({ id }) => id)).toEqual(['theme']);
    for (const query of ['countdown', 'rebours', 'delai', 'delay before'])
      expect(index.search(query).map(({ id }) => id)).toEqual(['countdown']);
    expect(index.search('keyboard').map(({ id }) => id)).toEqual(['mouse']);
  });
  it('requires all query words in any order and supports partial one- and two-character queries', () => {
    const index = createSettingsSearch(entries);
    expect(index.search('before delay delay')).toEqual([entries[1]]);
    expect(index.search('ey')).toEqual([entries[2]]);
    expect(index.search('à')).toEqual(entries);
    expect(index.search('theme keyboard')).toEqual([]);
  });
  it('handles empty catalogues, whitespace and missing postings', () => {
    expect(createSettingsSearch([]).search('theme')).toEqual([]);
    const index = createSettingsSearch(entries);
    expect(index.search(' \n ')).toEqual([]);
    expect(index.search('missing')).toEqual([]);
    expect(index.search('🎉')).toEqual([]);
  });
  it('rejects noncontiguous matches assembled from different trigrams', () => {
    const index = createSettingsSearch([{ ...entries[0]!, title: 'abc bcd cde', description: '', terms: [] }]);
    expect(index.search('abcde')).toEqual([]);
  });
  it('keeps stable order and finds rare matches in a large catalogue', () => {
    const many = Array.from({ length: 10000 }, (_, index) => ({
      ...entries[0]!,
      id: String(index),
      title: `Setting ${index}`,
      description: index === 9999 ? 'rare-description' : 'shared description',
    }));
    const index = createSettingsSearch(many);
    expect(index.search('rare-description').map(({ id }) => id)).toEqual(['9999']);
    expect(index.search('shared').map(({ id }) => id)).toEqual(many.slice(0, -1).map(({ id }) => id));
  });
  it('indexes every visible catalogue entry, advanced option and shortcut using actual translations', async () => {
    await setCurrentLocale('fr');
    const localized = settingsSearchEntries(
      (key) => i18n.global.t(key, { version: '' }),
      (key) => i18n.global.t(key, { version: '' }, { locale: 'en' }),
    );
    expect(new Set(localized.map(({ id }) => id)).size).toBe(localized.length);
    for (const entry of localized) {
      expect(entry.title).not.toMatch(
        /^(HudPreferences|AppearanceSettings|ShortcutPreferences|SettingsPanel|Socials|Updates)\./,
      );
      expect(entry.description).not.toMatch(
        /^(HudPreferences|AppearanceSettings|ShortcutPreferences|SettingsPanel|Socials|Updates)\./,
      );
    }
    const index = createSettingsSearch(localized);
    expect(index.search('automatic scrolling').some(({ id }) => id === 'teleprompter.toggleAutoscroll')).toBe(true);
    expect(index.search('surface tone').some(({ id }) => id === 'surface-tone')).toBe(true);
    expect(index.search('neutral').some(({ id }) => id === 'surface-tone')).toBe(true);
    expect(index.search('misspelled').some(({ id }) => id === 'spell-check')).toBe(true);
  });
  it('exposes developer navigation and search only in development builds', () => {
    const translate = (key: string) => key;
    for (const development of [true, false]) {
      expect(settingsCategories(development).some(({ id }) => id === 'developer')).toBe(development);
      const catalogue = settingsSearchEntries(translate, translate, development);
      expect(catalogue.some(({ id }) => id === 'devtools')).toBe(development);
      expect(catalogue.some(({ id }) => id === 'mascot-lab')).toBe(development);
      expect(catalogue.some(({ id }) => id === 'always-on-top')).toBe(true);
    }
  });
  it.each(['linux', 'win32', 'darwin', 'unknown'])(
    'indexes the video backend only where it is available (%s)',
    (platform) => {
      const translate = (key: string) => key;
      const catalogue = settingsSearchEntries(translate, translate, false, platform);
      expect(catalogue.some(({ id }) => id === 'video-export-backend')).toBe(platform === 'linux');
      expect(catalogue.some(({ id }) => id === 'language')).toBe(true);
    },
  );
});

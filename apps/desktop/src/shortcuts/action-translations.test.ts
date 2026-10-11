import { describe, expect, it } from 'vitest';
import { configurableActions, ACTION_GROUPS } from './action-catalog';
import { actionSectionLabel } from './action-sections';
import {
  settingsSearchEntries,
  SETTINGS_CATEGORIES,
  SETTINGS_NAVIGATION_GROUPS,
} from '~/components/hud/settings/settings-catalog';

const localeFiles = import.meta.glob('../i18n/*/*.json', { eager: true, import: 'default' }) as Record<
  string,
  Record<string, unknown>
>;
const locales = [...new Set(Object.keys(localeFiles).map((path) => path.split('/')[2]!))];
const messagesFor = (locale: string) =>
  Object.assign(
    {},
    ...Object.entries(localeFiles)
      .filter(([path]) => path.includes(`/${locale}/`))
      .map(([, value]) => value),
  );
const lookup = (messages: Record<string, unknown>, key: string): unknown =>
  key
    .split('.')
    .reduce<unknown>(
      (value, part) => (value && typeof value === 'object' ? (value as Record<string, unknown>)[part] : undefined),
      messages,
    );
const placeholders = (value: string) => [...value.matchAll(/\{([^{}]+)\}/g)].map((match) => match[1]).sort();

describe('all fifteen settings languages', () => {
  it('contains fifteen complete locale catalogs', () => expect(locales).toHaveLength(15));
  it.each(locales)('translates every action, category, search entry and shortcut instruction in %s', (locale) => {
    const messages = messagesFor(locale);
    const english = messagesFor('en');
    const keys = [
      ...configurableActions().map((action) => action.label),
      ...configurableActions().map(actionSectionLabel),
      ...ACTION_GROUPS.map((group) => group.label),
      ...SETTINGS_NAVIGATION_GROUPS.flatMap((group) => (group.label ? [`HudPreferences.${group.label}`] : [])),
      ...Object.keys(english.ShortcutPreferences as object).map((key) => `ShortcutPreferences.${key}`),
      ...SETTINGS_CATEGORIES.flatMap((category) => [
        `HudPreferences.${category.label}`,
        `HudPreferences.${category.description}`,
      ]),
      ...Object.keys(english.ActionShortcuts as object).map((key) => `ActionShortcuts.${key}`),
    ];
    settingsSearchEntries(
      (key) => {
        keys.push(key);
        return key;
      },
      (key) => key,
      true,
      'linux',
    );
    const missing = [...new Set(keys)].filter((key) => {
      const value = lookup(messages, key);
      return typeof value !== 'string' || !value.trim();
    });
    expect(missing).toEqual([]);
    expect(Object.keys(messages.ActionShortcuts as object)).toEqual(Object.keys(english.ActionShortcuts as object));

    for (const key of new Set(keys)) {
      const translated = lookup(messages, key);
      const source = lookup(english, key);
      if (typeof translated === 'string' && typeof source === 'string') {
        expect(placeholders(translated), `${locale} ${key} placeholders`).toEqual(placeholders(source));
      }
    }
  });
});

import { afterEach, describe, expect, it } from 'vitest';
import { i18n, setCurrentLocale } from './index';
import { SUPPORTED_LOCALES } from './locales';

afterEach(() => setCurrentLocale('en'));

describe('history feedback translations', () => {
  it.each(SUPPORTED_LOCALES)('translates every action and item in %s', async (locale) => {
    await setCurrentLocale(locale);
    const english = i18n.global.getLocaleMessage('en')!.UndoRedoToast;
    for (const group of ['operations', 'targets'] as const) {
      for (const key of Object.keys(english[group])) {
        const path = `UndoRedoToast.${group}.${key}`;
        expect(i18n.global.te(path, locale), path).toBe(true);
        expect(i18n.global.t(path).trim(), path).not.toBe('');
        expect(i18n.global.t(path), path).not.toBe(path);
      }
    }
  });

  it.each(SUPPORTED_LOCALES)('keeps action and item interpolation in %s', async (locale) => {
    await setCurrentLocale(locale);
    const item = i18n.global.t('UndoRedoToast.namedItem', {
      kind: 'Image',
      name: 'example.png',
    });
    expect(item).toContain('example.png');
    const action = i18n.global.t('UndoRedoToast.action', {
      operation: 'Move',
      item,
    });
    for (const key of ['undoAction', 'redoAction']) {
      expect(i18n.global.te(`UndoRedoToast.${key}`, locale)).toBe(true);
      const message = i18n.global.t(`UndoRedoToast.${key}`, { action });
      expect(message).toContain('Move');
      expect(message).toContain('example.png');
      expect(message).not.toMatch(/\{\w+\}/);
    }
    expect(i18n.global.t('UndoRedoToast.items', { count: 3 })).toContain('3');
  });
});

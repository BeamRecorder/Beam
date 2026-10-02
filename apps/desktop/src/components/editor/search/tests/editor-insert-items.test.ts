import { describe, expect, it } from 'vitest';
import { i18n, setCurrentLocale } from '~/i18n';
import { SUPPORTED_LOCALES } from '~/i18n/locales';
import { editorInsertItems } from '../editor-insert-items';
describe('shared editor insertion catalog', () => {
  it('exposes video tools flat and includes voiceover once', () => {
    const items = editorInsertItems('video', (key) => key);
    expect(items).toHaveLength(11);
    expect(new Set(items.map((item) => item.id)).size).toBe(11);
    expect(items.some((item) => item.children)).toBe(false);
    expect(items.some((item) => item.id === 'cursor')).toBe(false);
  });
  it('only exposes supported screenshot tools', () => {
    expect(editorInsertItems('screenshot', (key) => key).map((item) => item.id)).toEqual([
      'text',
      'shape',
      'arrow',
      'drawing',
      'image',
      'highlight',
      'blur',
      'cursor',
    ]);
  });
  it('has translated palette and insertion labels in all 15 languages', async () => {
    for (const value of SUPPORTED_LOCALES) {
      await setCurrentLocale(value);
      for (const mode of ['video', 'screenshot'] as const)
        for (const item of editorInsertItems(mode, (key) => i18n.global.t(key))) expect(item.label).not.toContain('.');
      for (const key of [
        'title',
        'placeholder',
        'noResults',
        'insert',
        'navigation',
        'clips',
        'selection',
        'setting',
        'action',
        'unavailable',
      ])
        expect(i18n.global.t(`EditorSearch.${key}`)).not.toBe(`EditorSearch.${key}`);
    }
  });
});

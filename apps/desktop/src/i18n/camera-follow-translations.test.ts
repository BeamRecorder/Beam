import { describe, expect, it } from 'vitest';

const locales = import.meta.glob('./*/editor.json', { eager: true, import: 'default' }) as Record<
  string,
  { ZoomPanel: Record<string, string> }
>;

describe('progressive camera follow translations', () => {
  it.each(['cameraFollowDesc', 'straightPaths', 'straightPathsDesc'])(
    'describes %s in all fifteen languages',
    (key) => {
      expect(Object.keys(locales)).toHaveLength(15);
      const translations = Object.values(locales).map((locale) => locale.ZoomPanel[key]!);
      expect(translations.every((value) => value.trim().length > 0)).toBe(true);
      expect(new Set(translations).size).toBe(15);
    },
  );
});

import { describe, expect, it } from 'vitest';
const bundles = import.meta.glob('./*/core.json', { eager: true, import: 'default' }) as Record<
  string,
  { CursorPanel: Record<string, string | Record<string, string>> }
>;
const source = bundles['./en/core.json']!.CursorPanel;
describe('complete cursor inspector translations', () => {
  it('covers all fifteen languages', () => expect(Object.keys(bundles)).toHaveLength(15));
  it.each(Object.entries(bundles))('contains every label, cursor role and interpolation in %s', (file, bundle) => {
    for (const [key, value] of Object.entries(source)) {
      const check = (label: string, original: string, translated: unknown) => {
        expect(translated, `${file}: ${label}`).toBeTypeOf('string');
        expect((translated as string).trim()).toBeTruthy();
        const parameters = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
        expect(parameters(translated as string)).toEqual(parameters(original));
      };
      if (typeof value === 'string') check(key, value, bundle.CursorPanel[key]);
      else
        for (const [role, text] of Object.entries(value))
          check(`${key}.${role}`, text, (bundle.CursorPanel[key] as Record<string, string>)?.[role]);
    }
    if (file !== './en/core.json')
      for (const key of [
        'rippleOpacity',
        'rippleDuration',
        'rippleWidth',
        'waterRippleIntensity',
        'waterRippleSoftness',
        'waterRippleHint',
      ])
        expect(bundle.CursorPanel[key], `${file}: ${key}`).not.toBe(source[key]);
  });
});

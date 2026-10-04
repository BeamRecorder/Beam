import { describe, it, expect } from 'vitest';
import { GRADIENT_CONTROL_GROUPS } from './gradient-controls';
const locales = import.meta.glob<{ GradientEffect: Record<string, string> }>('../../../i18n/*/editor.json', {
  eager: true,
  import: 'default',
});
describe('Gradient inspector translations', () => {
  it('has identical nonempty keys in all fifteen supported languages', () => {
    const messages = Object.values(locales);
    expect(messages).toHaveLength(15);
    const keys = Object.keys(messages[0]!.GradientEffect).sort();
    for (const locale of messages) {
      expect(Object.keys(locale.GradientEffect).sort()).toEqual(keys);
      expect(Object.values(locale.GradientEffect).every((value) => value.trim().length > 0)).toBe(true);
    }
  });
  it('localizes every control group and real GPU parameter', () => {
    for (const locale of Object.values(locales))
      for (const group of GRADIENT_CONTROL_GROUPS)
        for (const key of [group.id, ...group.keys]) expect(locale.GradientEffect[key]).toBeTruthy();
  });
  it('retains palette index interpolation in every language', () => {
    for (const locale of Object.values(locales))
      for (const key of ['color', 'removeColor']) expect(locale.GradientEffect[key]).toContain('{index}');
  });
});

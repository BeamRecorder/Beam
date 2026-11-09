import { describe, expect, it } from 'vitest';

const catalogs = import.meta.glob('./*/core.json', { eager: true, import: 'default' }) as Record<
  string,
  { HUD: Record<string, string> }
>;

describe('macOS click access translations', () => {
  it('provides specific mouse permission guidance in all fifteen languages', () => {
    expect(Object.keys(catalogs)).toHaveLength(15);
    for (const key of ['interactionAccessNoticeTitleMac', 'interactionAccessNoticeDescriptionMac']) {
      const values = Object.values(catalogs).map((catalog) => catalog.HUD[key]);
      expect(values.every((value) => typeof value === 'string' && value.trim().length > 0)).toBe(true);
      expect(new Set(values).size).toBe(15);
    }
  });
});

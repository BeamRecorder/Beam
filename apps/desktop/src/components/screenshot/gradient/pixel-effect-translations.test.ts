import { it, expect } from 'vitest';
const locales = import.meta.glob<Record<string, Record<string, string>>>('../../../i18n/*/editor.json', {
  eager: true,
  import: 'default',
});
it('provides all grouping instructions and effect settings in fifteen languages without missing keys', () => {
  const messages = Object.values(locales);
  expect(messages).toHaveLength(15);
  for (const namespace of ['DitheringEffect', 'ArtisticEffect']) {
    const keys = Object.keys(messages[0]![namespace]!).sort();
    for (const message of messages) {
      expect(Object.keys(message[namespace]!).sort()).toEqual(keys);
      expect(Object.values(message[namespace]!).every((value) => value.trim().length > 0)).toBe(true);
    }
  }
  for (const message of messages)
    for (const key of ['selectTwoToGroup', 'selectOneMoreToGroup', 'alreadyGrouped', 'selectGroupToUngroup'])
      expect(message.LayerEffects![key]?.trim().length).toBeGreaterThan(0);
});

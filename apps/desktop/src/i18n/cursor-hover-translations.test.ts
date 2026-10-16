import { describe, expect, it } from 'vitest';

const locales = import.meta.glob('./*/core.json', { eager: true, import: 'default' }) as Record<
  string,
  { CursorRecording: Record<string, string> }
>;
describe('hover synchronization translations', () => {
  it('provides failure messages in all fifteen languages without a routine progress message', () => {
    expect(Object.keys(locales)).toHaveLength(15);
    for (const catalog of Object.values(locales)) {
      expect(catalog.CursorRecording.hoverSyncAnalyzing).toBeUndefined();
      expect(catalog.CursorRecording.hoverSyncFailed.length).toBeGreaterThan(10);
    }
    expect(new Set(Object.values(locales).map((locale) => locale.CursorRecording.hoverSyncFailed)).size).toBe(15);
  });
});

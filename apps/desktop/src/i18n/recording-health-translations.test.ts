import { describe, expect, it } from 'vitest';
import { SUPPORTED_LOCALES } from './locales';
const messages = import.meta.glob<{ default: { RecordingHealth: Record<string, string> } }>('./*/core.json', {
  eager: true,
});
describe.each(SUPPORTED_LOCALES)('%s recording failure translations', (locale) => {
  it('translates stop and pause/resume errors without losing native details', () => {
    const text = messages[`./${locale}/core.json`].default.RecordingHealth;
    expect(text.captureStopped).toBeTruthy();
    expect(text.transitionFailed).toContain('{reason}');
    if (locale !== 'en') {
      expect(text.captureStopped).not.toBe(messages['./en/core.json'].default.RecordingHealth.captureStopped);
      expect(text.transitionFailed).not.toBe(messages['./en/core.json'].default.RecordingHealth.transitionFailed);
    }
  });
});

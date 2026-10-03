import { describe, expect, it } from 'vitest';
import { SUPPORTED_LOCALES } from './locales';
const messages = import.meta.glob<{
  default: Record<string, Record<string, string>>;
}>('./*/{core,editor}.json', {
  eager: true,
});
const teleprompterKeys = [
  'title',
  'close',
  'speed',
  'fontSize',
  'textColor',
  'transparency',
  'reset',
  'settingsReset',
  'play',
  'pause',
  'edit',
  'resize',
  'eyedropper',
  'colorFormat',
];
const regionKeys = [
  'preset',
  'fullScreen',
  'settings',
  'countdown',
  'off',
  'hideDock',
  'hideTaskbar',
  'hideDesktopIcons',
  'desktopUnavailable',
  'captureOnly',
];
describe.each(SUPPORTED_LOCALES)('%s recorder translations', (locale) => {
  it('translates the countdown Cancel button', () => {
    const text = messages[`./${locale}/core.json`].default.RecorderBar;
    expect(text.cancelCountdown).toBeTruthy();
    if (locale !== 'en') expect(text.cancelCountdown).not.toBe('Cancel');
  });
  it('translates editor preparation, the final encouragement and cancellation', () => {
    const text = messages[`./${locale}/core.json`].default.EditorPreparingHud;
    for (const key of ['title', 'openingWindow', 'loadingProject', 'loadingTimeline', 'almostThere', 'cancel'])
      expect(text[key], key).toBeTruthy();
    if (locale !== 'en') {
      expect(text.almostThere).not.toBe('Almost there!');
      expect(text.cancel).not.toBe('Cancel');
    }
  });
  it('translates the teleprompter toolbar and reset confirmation', () => {
    const text = messages[`./${locale}/editor.json`].default.Teleprompter;
    for (const key of teleprompterKeys) expect(text[key], key).toBeTruthy();
    if (locale !== 'en') expect(text.settingsReset).not.toBe('Settings reset');
  });
  it('translates region presets and quick settings', () => {
    const text = messages[`./${locale}/core.json`].default.ScreenRegionOverlay;
    for (const key of regionKeys) expect(text[key], key).toBeTruthy();
  });
  it('translates Beamy actions and eight concise, distinct loading tips', () => {
    const text = messages[`./${locale}/core.json`].default.Brand;
    for (const key of ['animateBeamy', 'loading', 'reload', 'tipLabel']) expect(text[key], key).toBeTruthy();
    const tips = Object.entries(text).filter(([key]) => key.startsWith('tip') && key !== 'tipLabel');
    expect(tips).toHaveLength(8);
    expect(new Set(tips.map(([, value]) => value)).size).toBe(8);
    if (locale !== 'en') expect(text.loading).not.toBe('Loading Beam');
  });
});

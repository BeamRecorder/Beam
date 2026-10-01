import { afterEach, expect, it } from 'vitest';
import { i18n, setCurrentLocale } from './index';
import { SUPPORTED_LOCALES } from './locales';
afterEach(() => setCurrentLocale('en'));
const keys = [
  'Updates.check',
  'Updates.changelog',
  'EditorAccessibility.title',
  'EditorAccessibility.doubleClick',
  'EditorAccessibility.doubleClickDescription',
  'CursorRecording.showRealCursor',
  'CursorRecording.description',
  'CursorRecording.customCursor',
  'CursorRecording.overlayDescription',
  'AppearanceSettings.themeMode',
  'AppearanceSettings.uiScaleGlobal',
  'AppearanceSettings.scalingCategory',
  'AppearanceSettings.advanced',
  'AppearanceSettings.light',
  'AppearanceSettings.dark',
  'AppearanceSettings.system',
  'AppearanceSettings.systemDescription',
  'ScreenRegionOverlay.hideTaskbar',
  'ScreenRegionOverlay.hideDock',
  'ScreenRegionOverlay.hideDesktopIcons',
  'ScreenRegionOverlay.desktopUnavailable',
  'ScreenRegionOverlay.captureOnly',
  'HudPreferences.categoryGeneral',
  'HudPreferences.categoryAccessibility',
  'HudPreferences.categoryUpdates',
  'HudPreferences.categoryAbout',
  'HudPreferences.categoryDeveloper',
];
it.each(SUPPORTED_LOCALES)('localizes every recording and editor settings label and help in %s', async (locale) => {
  await setCurrentLocale(locale);
  for (const key of keys) {
    expect(i18n.global.te(key, locale), key).toBe(true);
    expect(i18n.global.t(key).trim(), key).not.toBe('');
    expect(i18n.global.t(key), key).not.toBe(key);
  }
});

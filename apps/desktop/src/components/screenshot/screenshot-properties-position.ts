import type { ScreenshotPropertiesPosition } from './screenshot-properties-types';

export const SCREENSHOT_PROPERTIES_POSITION_KEY = 'screenshotPropertiesPosition';
export const readScreenshotPropertiesPosition = (value: unknown): ScreenshotPropertiesPosition =>
  value === 'right' || value === 'floating' ? value : 'left';

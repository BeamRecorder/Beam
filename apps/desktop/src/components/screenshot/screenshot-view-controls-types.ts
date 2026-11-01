import type { ScreenshotDocument } from '~/api/types/screenshot';
import type { ScreenshotViewMode } from './screenshot-view-types';

export interface ScreenshotViewControlsProps {
  document: ScreenshotDocument;
  disabled: boolean;
  canFullscreen: boolean;
  zoomPercent: number;
  viewMode: ScreenshotViewMode;
}

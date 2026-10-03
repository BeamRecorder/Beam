import type { ScreenshotDocument } from '~/api/types/screenshot';

export interface ScreenshotViewControlsProps {
  document: ScreenshotDocument;
  disabled: boolean;
  canFullscreen: boolean;
  zoomPercent: number;
}

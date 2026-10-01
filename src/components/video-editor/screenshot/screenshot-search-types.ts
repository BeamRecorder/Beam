export interface ScreenshotSearchProps {
  navigate: (tab: string) => void;
  disabled: boolean;
  canCrop: boolean;
  canFullscreen: boolean;
}

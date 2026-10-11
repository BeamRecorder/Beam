export interface ScreenshotCpuPreviewCallbacks {
  ready(): void;
  error(reason: unknown): void;
}

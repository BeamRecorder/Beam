export interface ScreenshotPublishResult {
  status: 'copied' | 'saved' | 'cancelled';
  path: string | null;
  timings: Record<string, number>;
}

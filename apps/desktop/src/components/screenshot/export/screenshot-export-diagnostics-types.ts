export interface ScreenshotExportReport {
  operation: 'copy' | 'export';
  status: 'success' | 'error' | 'cancelled';
  projectId: string;
  width: number;
  height: number;
  format: 'png' | 'webp';
  bytes: number;
  cacheHit: boolean;
  totalMs: number;
  timings: Record<string, number>;
  error?: string;
}

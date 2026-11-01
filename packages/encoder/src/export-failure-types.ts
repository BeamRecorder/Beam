export const EXPORT_FAILURE_OPERATIONS = [
  'validate-assets',
  'load-assets',
  'configure-output',
  'prepare-video',
  'decode-frame',
  'prepare-frame',
  'render-frame',
  'submit-video-frame',
  'close-video',
  'encode-audio',
  'finalize-output',
] as const;

export interface ExportFailureContext {
  operation: (typeof EXPORT_FAILURE_OPERATIONS)[number];
  errorName: string;
  errorMessage: string;
  /** The operation where the error surfaced; an asynchronous codec may have rejected an earlier submission. */
  frame?: { index: number; timeMs: number; width: number; height: number; clipIds: string[] };
}

export type ExportOperationContext = Omit<ExportFailureContext, 'errorName' | 'errorMessage'>;
